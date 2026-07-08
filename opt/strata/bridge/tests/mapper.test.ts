import assert from "node:assert/strict";
import test from "node:test";
import { buildDeepSeekRequest, deepSeekChatToResponses, deepSeekErrorToOpenAI, responsesInputToMessages, responsesToolsToChatTools } from "../src/mapper.js";
import { redact } from "../src/log.js";
import type { BridgeConfig, DeepSeekChatResponse } from "../src/types.js";

const config: BridgeConfig = {
  deepSeekApiKey: "unit-redacted-deepseek-key",
  deepSeekBaseUrl: "https://api.deepseek.com",
  deepSeekModel: "deepseek-v4-pro",
  advertisedModels: ["deepseek-v4-pro"],
  forceModel: false,
  enableThinking: false,
  upstreamTimeoutMs: 120000,
  port: 38441,
};

test("input string -> messages[]", () => {
  const messages = responsesInputToMessages({ input: "Say hello." });
  assert.deepEqual(messages, [{ role: "user", content: "Say hello." }]);
});

test("input array -> messages[] with function call and tool output", () => {
  const messages = responsesInputToMessages({
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Run tool" }] },
      { type: "function_call", call_id: "call_1", name: "apply_patch", arguments: "{\"input\":\"x\"}" },
      { type: "function_call_output", call_id: "call_1", output: "ok" },
    ],
  });
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, "Run tool");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].tool_calls?.[0].function.name, "apply_patch");
  assert.equal(messages[2].role, "tool");
  assert.equal(messages[2].tool_call_id, "call_1");
});

test("instructions -> system message", () => {
  const messages = responsesInputToMessages({ instructions: "You are a coding assistant.", input: "Hi" });
  assert.deepEqual(messages[0], { role: "system", content: "You are a coding assistant." });
  assert.deepEqual(messages[1], { role: "user", content: "Hi" });
});

test("Responses request -> DeepSeek request maps max_output_tokens and sampling params", () => {
  const request = buildDeepSeekRequest(
    { model: "deepseek-v4-flash", input: "Hi", max_output_tokens: 1000, temperature: 0.2, top_p: 0.9, stream: false },
    config,
  );
  assert.equal(request.model, "deepseek-v4-flash");
  assert.equal(request.max_tokens, 1000);
  assert.equal(request.temperature, 0.2);
  assert.equal(request.top_p, 0.9);
  assert.equal(request.stream, false);
  assert.deepEqual(request.thinking, { type: "disabled" });
});

test("medium reasoning defaults to tool-compatible disabled DeepSeek thinking", () => {
  const request = buildDeepSeekRequest({ input: "Use tools.", reasoning: { effort: "medium" } }, config);
  assert.deepEqual(request.thinking, { type: "disabled" });
});

test("explicit thinking only enables high/max profiles", () => {
  const request = buildDeepSeekRequest(
    { input: "Think deeply.", reasoning: { effort: "high" } },
    { ...config, enableThinking: true },
  );
  assert.deepEqual(request.thinking, { type: "enabled", reasoning_effort: "high" });
});

test("reasoning input item is preserved on assistant replay when present", () => {
  const messages = responsesInputToMessages({
    input: [
      { type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" },
      { type: "reasoning", summary: [{ type: "summary_text", text: "prior tool rationale" }] },
      { type: "function_call_output", call_id: "call_1", output: "ok" },
    ],
  });
  assert.equal(messages[0].role, "assistant");
  assert.equal(messages[0].reasoning_content, "prior tool rationale");
});

test("parallel Responses function calls replay as one assistant tool_calls message", () => {
  const messages = responsesInputToMessages({
    input: [
      { type: "function_call", call_id: "call_1", name: "read_a", arguments: "{}" },
      { type: "function_call", call_id: "call_2", name: "read_b", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", output: "a" },
      { type: "function_call_output", call_id: "call_2", output: "b" },
    ],
  });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].role, "assistant");
  assert.equal(messages[0].tool_calls?.length, 2);
  assert.equal(messages[1].tool_call_id, "call_1");
  assert.equal(messages[2].tool_call_id, "call_2");
});

test("function and custom tools are converted for Chat Completions", () => {
  const tools = responsesToolsToChatTools([
    { type: "function", name: "read_file", description: "Read", parameters: { type: "object", properties: {} } },
    { type: "custom", name: "apply_patch", description: "Patch" },
  ]);
  assert.equal(tools?.length, 2);
  assert.equal(tools?.[0].function.name, "read_file");
  assert.deepEqual(tools?.[1].function.parameters, {
    type: "object",
    properties: { input: { type: "string", description: "Raw tool input from the model." } },
    required: ["input"],
  });
});

test("namespace tool conversion uses separator to avoid collisions", () => {
  const tools = responsesToolsToChatTools([
    {
      type: "namespace",
      name: "shell",
      description: "Shell namespace",
      tools: [{ type: "function", name: "command", parameters: { type: "object", properties: {} } }],
    },
  ]);
  assert.equal(tools?.[0].function.name, "shell_command");
});

test("non-streaming DeepSeek response -> Responses output", () => {
  const chat: DeepSeekChatResponse = {
    id: "chatcmpl_1",
    created: 123,
    model: "deepseek-v4-pro",
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: "Hello.", reasoning_content: "hidden" },
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  };
  const response = deepSeekChatToResponses(chat, { input: "Say hello." });
  assert.equal(response.object, "response");
  assert.equal(response.status, "completed");
  assert.equal((response.output[0] as any).content[0].text, "Hello.");
  assert.equal(response.metadata?.deepseek_reasoning_discarded, true);
  assert.deepEqual(response.usage, { input_tokens: 5, output_tokens: 2, total_tokens: 7, output_tokens_details: undefined });
});

test("tool-call DeepSeek response -> Responses function_call output", () => {
  const chat: DeepSeekChatResponse = {
    id: "chatcmpl_2",
    model: "deepseek-v4-pro",
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{\"path\":\"a.ts\"}" } }],
        },
      },
    ],
  };
  const response = deepSeekChatToResponses(chat, { input: "Read" });
  assert.equal((response.output[0] as any).type, "function_call");
  assert.equal((response.output[0] as any).call_id, "call_1");
});

test("DeepSeek error -> OpenAI-style error JSON", () => {
  const error = deepSeekErrorToOpenAI(401, { error: { message: "bad key", code: "invalid_api_key" } });
  assert.deepEqual(error, {
    error: { message: "bad key", type: "upstream_request_error", code: "invalid_api_key", param: null },
  });
});

test("Authorization redaction removes keys from strings and objects", () => {
  const fakeApiKey = `${"s"}k-REDACTEDTESTONLY`;
  const nestedApiKey = `${"s"}k-OTHERREDACTEDTEST`;
  const authorization = `${"Bearer"} ${fakeApiKey}`;
  const redacted = redact({ Authorization: authorization, nested: { api_key: nestedApiKey } });
  assert.deepEqual(redacted, { Authorization: "[REDACTED]", nested: { api_key: "[REDACTED]" } });
  assert.equal(redact(`Authorization: ${authorization}`), "Authorization: [REDACTED]");
});
