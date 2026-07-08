import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Readable } from "node:stream";
import { appendFileSync } from "node:fs";
import type { BridgeConfig, DeepSeekChatResponse, ResponsesRequest, ResponseObject } from "./types.js";
import { buildDeepSeekRequest, deepSeekChatToResponses, deepSeekErrorToOpenAI } from "./mapper.js";
import { redact, safeLog } from "./log.js";
import { makeTraceBase, writeDebugJson, writeRawDebugJson, writeResponseTextTrace } from "./debugTrace.js";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface CreateAppOptions {
  config: BridgeConfig;
  fetchFn?: FetchLike;
  enableRequestLogs?: boolean;
}

class UpstreamTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`DeepSeek upstream timeout after ${timeoutMs} ms`);
    this.name = "UpstreamTimeoutError";
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function doneSse(): string {
  return "data: [DONE]\n\n";
}

function authOk(header: string | undefined, expected: string): boolean {
  if (!header) return false;
  const trimmed = header.trim();
  return trimmed === expected || trimmed === `Bearer ${expected}`;
}

function responseSkeleton(request: ResponsesRequest, model: string): ResponseObject {
  return {
    id: makeId("resp"),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: request.model ?? model,
    status: "in_progress",
    output: [],
    metadata: request.metadata ?? {},
  };
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function callDeepSeek(fetchFn: FetchLike, config: BridgeConfig, payload: unknown): Promise<Response> {
  if (!config.deepSeekApiKey) {
    throw new Error("DEEPSEEK_API_KEY is required");
  }

  const url = `${config.deepSeekBaseUrl}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    return await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.deepSeekApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new UpstreamTimeoutError(config.upstreamTimeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractDataLines(block: string): string[] {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
}

async function* readUpstreamSse(response: Response): AsyncGenerator<unknown> {
  if (!response.body) return;
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    while (true) {
      const boundary = buffer.search(/\r?\n\r?\n/);
      if (boundary < 0) break;
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(buffer[boundary] === "\r" ? boundary + 4 : boundary + 2);
      for (const data of extractDataLines(block)) {
        if (data === "[DONE]") return;
        if (!data) continue;
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          yield { malformed_chunk: data };
        }
      }
    }
  }

  const finalText = buffer.trim();
  if (finalText) {
    for (const data of extractDataLines(finalText)) {
      if (data && data !== "[DONE]") {
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          yield { malformed_chunk: data };
        }
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface ToolStreamState {
  outputIndex: number;
  itemId: string;
  callId: string;
  name: string;
  arguments: string;
  added: boolean;
}

export async function* streamDeepSeekAsResponses(
  upstream: Response,
  request: ResponsesRequest,
  model: string,
): AsyncGenerator<string> {
  const response = responseSkeleton(request, model);
  const finalOutput: unknown[] = [];
  let nextOutputIndex = 0;

  let messageIndex: number | null = null;
  let messageItemId = makeId("msg");
  let text = "";
  let textStarted = false;
  const toolStates = new Map<number, ToolStreamState>();

  yield sse("response.created", { type: "response.created", response });

  const ensureMessage = function* (): Generator<string> {
    if (messageIndex !== null) return;
    messageIndex = nextOutputIndex++;
    yield sse("response.output_item.added", {
      type: "response.output_item.added",
      output_index: messageIndex,
      item: { id: messageItemId, type: "message", status: "in_progress", role: "assistant", content: [] },
    });
    yield sse("response.content_part.added", {
      type: "response.content_part.added",
      item_id: messageItemId,
      output_index: messageIndex,
      content_index: 0,
      part: { type: "output_text", text: "" },
    });
    textStarted = true;
  };

  const ensureTool = function* (index: number): Generator<string> {
    const state = toolStates.get(index);
    if (!state || state.added) return;
    state.added = true;
    yield sse("response.output_item.added", {
      type: "response.output_item.added",
      output_index: state.outputIndex,
      item: {
        id: state.itemId,
        type: "function_call",
        status: "in_progress",
        call_id: state.callId,
        name: state.name,
        arguments: "",
      },
    });
  };

  for await (const chunk of readUpstreamSse(upstream)) {
    if (!isRecord(chunk)) continue;
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    const firstChoice = choices[0];
    if (!isRecord(firstChoice)) continue;
    const delta = isRecord(firstChoice.delta) ? firstChoice.delta : {};

    if (typeof delta.content === "string" && delta.content.length > 0) {
      for (const event of ensureMessage()) yield event;
      text += delta.content;
      yield sse("response.output_text.delta", {
        type: "response.output_text.delta",
        item_id: messageItemId,
        output_index: messageIndex,
        content_index: 0,
        delta: delta.content,
      });
    }

    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
      response.metadata = { ...(response.metadata ?? {}), deepseek_reasoning_discarded: true };
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const rawTool of delta.tool_calls) {
        if (!isRecord(rawTool)) continue;
        const toolIndex = typeof rawTool.index === "number" ? rawTool.index : 0;
        let state = toolStates.get(toolIndex);
        if (!state) {
          state = {
            outputIndex: nextOutputIndex++,
            itemId: makeId("fc"),
            callId: String(rawTool.id ?? makeId("call")),
            name: "tool",
            arguments: "",
            added: false,
          };
          toolStates.set(toolIndex, state);
        }
        if (typeof rawTool.id === "string") state.callId = rawTool.id;
        const fn = isRecord(rawTool.function) ? rawTool.function : {};
        if (typeof fn.name === "string" && fn.name) state.name = fn.name;
        for (const event of ensureTool(toolIndex)) yield event;
        if (typeof fn.arguments === "string" && fn.arguments.length > 0) {
          state.arguments += fn.arguments;
          yield sse("response.function_call_arguments.delta", {
            type: "response.function_call_arguments.delta",
            item_id: state.itemId,
            output_index: state.outputIndex,
            delta: fn.arguments,
          });
        }
      }
    }
  }

  if (textStarted && messageIndex !== null) {
    yield sse("response.output_text.done", {
      type: "response.output_text.done",
      item_id: messageItemId,
      output_index: messageIndex,
      content_index: 0,
      text,
    });
    yield sse("response.content_part.done", {
      type: "response.content_part.done",
      item_id: messageItemId,
      output_index: messageIndex,
      content_index: 0,
      part: { type: "output_text", text },
    });
    const item = {
      id: messageItemId,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text }],
    };
    finalOutput[messageIndex] = item;
    yield sse("response.output_item.done", {
      type: "response.output_item.done",
      output_index: messageIndex,
      item,
    });
  }

  for (const [, state] of [...toolStates].sort((a, b) => a[1].outputIndex - b[1].outputIndex)) {
    if (!state.added) {
      state.added = true;
      yield sse("response.output_item.added", {
        type: "response.output_item.added",
        output_index: state.outputIndex,
        item: {
          id: state.itemId,
          type: "function_call",
          status: "in_progress",
          call_id: state.callId,
          name: state.name,
          arguments: "",
        },
      });
    }
    yield sse("response.function_call_arguments.done", {
      type: "response.function_call_arguments.done",
      item_id: state.itemId,
      output_index: state.outputIndex,
      arguments: state.arguments,
    });
    const item = {
      id: state.itemId,
      type: "function_call",
      status: "completed",
      call_id: state.callId,
      name: state.name,
      arguments: state.arguments,
    };
    finalOutput[state.outputIndex] = item;
    yield sse("response.output_item.done", {
      type: "response.output_item.done",
      output_index: state.outputIndex,
      item,
    });
  }

  response.status = "completed";
  response.output = finalOutput.filter((item) => item !== undefined);
  yield sse("response.completed", { type: "response.completed", response });
  yield doneSse();
}

// DeepSeek's gateway occasionally returns a transient 5xx/429 (more likely on
// the large tool-laden requests Codex sends). Retry those a few times so a
// momentary blip never reaches the user.
const RETRYABLE_UPSTREAM_STATUS = new Set([429, 502, 503, 504]);
const MAX_UPSTREAM_ATTEMPTS = 3;

function upstreamRetryDelayMs(attempt: number): number {
  const base = Math.min(1500, 300 * 2 ** (attempt - 1));
  return base + Math.floor(Math.random() * 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Always-on, lightweight upstream error log (one JSON line per failure) so a
// 502 from DeepSeek is self-explaining instead of a mystery. Enabled by setting
// BRIDGE_ERROR_LOG. Real key/token are stripped; no request bodies are written.
function appendErrorLog(config: BridgeConfig, record: Record<string, unknown>): void {
  if (!config.errorLog) return;
  try {
    let line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    for (const secret of [config.deepSeekApiKey, config.bridgeAuthKey]) {
      if (secret) line = line.split(secret).join("[REDACTED]");
    }
    appendFileSync(config.errorLog, line + "\n");
  } catch {
    /* never let logging break a request */
  }
}

async function handleResponses(
  request: FastifyRequest<{ Body: ResponsesRequest }>,
  reply: FastifyReply,
  config: BridgeConfig,
  fetchFn: FetchLike,
  enableRequestLogs: boolean,
) {
  const body = request.body ?? {};
  const upstreamPayload = buildDeepSeekRequest(body, config);
  const traceBase = makeTraceBase(config, request.id);
  writeDebugJson(config, traceBase ? `${traceBase}.request.json` : null, {
    bridge: {
      route: request.url,
      requestId: request.id,
      upstreamUrl: `${config.deepSeekBaseUrl}/chat/completions`,
      compatibilityProfile: config.enableThinking ? "deepseek-thinking-explicit" : "tool-compatible-thinking-disabled",
    },
    responsesRequest: body,
    deepseekRequest: upstreamPayload,
  });
  writeRawDebugJson(config, traceBase ? `${traceBase}.raw_request.json` : null, { deepseekRequest: upstreamPayload });

  if (enableRequestLogs) {
    safeLog("request.converted", {
      model: upstreamPayload.model,
      stream: upstreamPayload.stream,
      message_count: upstreamPayload.messages.length,
      tool_count: upstreamPayload.tools?.length ?? 0,
    });
  }

  let upstream: Response | undefined;
  for (let attempt = 1; attempt <= MAX_UPSTREAM_ATTEMPTS; attempt += 1) {
    try {
      upstream = await callDeepSeek(fetchFn, config, upstreamPayload);
    } catch (error) {
      if (error instanceof UpstreamTimeoutError) {
        writeDebugJson(config, traceBase ? `${traceBase}.error.json` : null, {
          error: { name: error.name, message: error.message },
        });
        return reply.code(504).send({
          error: { message: error.message, type: "upstream_request_error", code: "upstream_timeout", param: null },
        });
      }
      // Transient network failure reaching DeepSeek: retry before giving up.
      if (attempt < MAX_UPSTREAM_ATTEMPTS) {
        if (enableRequestLogs) safeLog("upstream.retry", { attempt, reason: "network_error" });
        await sleep(upstreamRetryDelayMs(attempt));
        continue;
      }
      writeDebugJson(config, traceBase ? `${traceBase}.error.json` : null, {
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      });
      const message = error instanceof Error ? error.message : "Bridge failed before upstream request";
      appendErrorLog(config, { kind: "network", attempts: attempt, message });
      return reply.code(502).send({ error: { message, type: "upstream_request_error", code: "upstream_unreachable", param: null } });
    }

    if (!upstream.ok && RETRYABLE_UPSTREAM_STATUS.has(upstream.status) && attempt < MAX_UPSTREAM_ATTEMPTS) {
      if (enableRequestLogs) safeLog("upstream.retry", { attempt, status: upstream.status });
      await upstream.text().catch(() => undefined); // drain the body so the connection can be reused
      await sleep(upstreamRetryDelayMs(attempt));
      continue;
    }
    break;
  }

  if (!upstream) {
    return reply.code(502).send({
      error: { message: "No response from DeepSeek upstream", type: "upstream_request_error", code: "no_upstream_response", param: null },
    });
  }

  if (traceBase) {
    void writeResponseTextTrace(config, `${traceBase}.response.json`, upstream.clone());
  }

  if (!upstream.ok) {
    const rawErrorText = await upstream.text().catch(() => "");
    writeRawDebugJson(config, traceBase ? `${traceBase}.raw_upstream_error.json` : null, {
      status: upstream.status,
      body: rawErrorText,
    });
    let errorBody: unknown;
    try {
      errorBody = rawErrorText ? (JSON.parse(rawErrorText) as unknown) : undefined;
    } catch {
      errorBody = rawErrorText || undefined;
    }
    writeDebugJson(config, traceBase ? `${traceBase}.upstream_error.json` : null, {
      status: upstream.status,
      body: errorBody,
      requestProfile: config.enableThinking ? "deepseek-thinking-explicit" : "tool-compatible-thinking-disabled",
    });
    const mapped = deepSeekErrorToOpenAI(upstream.status, errorBody);
    appendErrorLog(config, {
      kind: "upstream",
      status: upstream.status,
      code: mapped.error.code,
      message: mapped.error.message,
      tool_count: upstreamPayload.tools?.length ?? 0,
    });
    return reply.code(upstream.status).send(mapped);
  }

  if (body.stream) {
    reply.header("content-type", "text/event-stream; charset=utf-8");
    reply.header("cache-control", "no-cache, no-transform");
    reply.header("connection", "keep-alive");
    return reply.send(Readable.from(streamDeepSeekAsResponses(upstream, body, upstreamPayload.model)));
  }

  const chat = (await upstream.json()) as DeepSeekChatResponse;
  const converted = deepSeekChatToResponses(chat, body);
  return reply.send(converted);
}

export function createApp(options: CreateAppOptions): FastifyInstance {
  const config = options.config;
  const fetchFn = options.fetchFn ?? fetch;
  const app = Fastify({ logger: false });

  app.addHook("onResponse", async (request, reply) => {
    safeLog("access", {
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.url,
      status: reply.statusCode,
      request_id: request.id,
    });
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!config.bridgeAuthKey) return;
    if (request.url === "/health") return;
    const header = request.headers.authorization;
    if (!authOk(header, config.bridgeAuthKey)) {
      return reply.code(401).send({
        error: { message: "Unauthorized", type: "authentication_error", code: "unauthorized", param: null },
      });
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    object: "health",
    upstream: config.deepSeekBaseUrl,
    model: config.deepSeekModel,
    thinking: config.enableThinking,
    reasoning_effort: config.reasoningEffort ?? null,
    thinking_budget: config.thinkingBudget ?? null,
  }));

  const modelRecord = (id: string) => ({
    id,
    object: "model",
    owned_by: "deepseek",
    context_window: id === "deepseek-v4-pro" ? 128000 : 64000,
    max_context_window: id === "deepseek-v4-pro" ? 128000 : 64000,
    max_output_tokens: 8192,
    supports_streaming: true,
    supports_tools: true,
    default_reasoning_effort: "low",
  });
  // `data` is the OpenAI-style model list used by generic clients (and the
  // bridge's own checks). `models` is the field Codex's model-catalog refresh
  // (codex_models_manager) deserializes; it expects the full OpenAI catalog
  // schema, which a provider bridge cannot meaningfully supply. Returning an
  // empty array lets that refresh succeed with no entries instead of logging a
  // decode error on every startup. The active model is pinned by the Codex
  // profile (deepseek_bridge.config.toml), so an empty catalog is harmless.
  const modelsHandler = async () => ({
    object: "list",
    data: config.advertisedModels.map((id) => modelRecord(id)),
    models: [] as unknown[],
  });
  app.get("/v1/models", modelsHandler);
  app.get("/models", modelsHandler);

  app.post<{ Body: ResponsesRequest }>("/v1/responses", async (request, reply) =>
    handleResponses(request, reply, config, fetchFn, Boolean(options.enableRequestLogs)),
  );
  app.post<{ Body: ResponsesRequest }>("/responses", async (request, reply) =>
    handleResponses(request, reply, config, fetchFn, Boolean(options.enableRequestLogs)),
  );

  app.setErrorHandler((error: unknown, _request, reply) => {
    const err = error instanceof Error ? error : new Error(String(error));
    const safeError = redact({ message: err.message, stack: err.stack });
    safeLog("request.failed", { error: safeError });
    reply.code(500).send({
      error: { message: "Bridge internal error", type: "bridge_error", code: "internal_error", param: null },
    });
  });

  return app;
}
