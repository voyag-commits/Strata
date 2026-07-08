import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { type RuntimeConfig } from "../config/index.js";
import { ensureContextLayout, fileStamp, isoStamp, type CommandContext, writeJson } from "../common.js";

export interface AppServerRunInput {
  assignmentPath: string;
  assignmentId: string;
  boundedPrompt: string;
  workspacePath: string;
}

export interface AppServerRunSummary {
  ok: boolean;
  reason: string;
  runId: string;
  assignmentPath: string;
  eventsPath: string;
  stderrPath: string;
  summaryPath: string;
  threadId: string | null;
  completionStatus: string | null;
  completionPayload: Record<string, unknown> | null;
  createdAt: string;
}

function appServerSpawnCommand(codexExe: string): { command: string; argsPrefix: string[] } {
  if (/\.(?:cjs|mjs|js)$/i.test(codexExe)) {
    return { command: process.execPath, argsPrefix: [codexExe] };
  }
  return { command: codexExe, argsPrefix: [] };
}

export async function runAssignmentAppServer(
  context: CommandContext,
  runtimeConfig: RuntimeConfig,
  input: AppServerRunInput,
  timeoutMs = 180000,
): Promise<AppServerRunSummary> {
  const layout = ensureContextLayout(context.workspaceRoot);
  const runId = `run_${fileStamp(context.now)}`;
  const eventsPath = path.join(layout.appserverEvents, `${runId}.events.jsonl`);
  const stderrPath = path.join(layout.workerLogs, `${runId}.stderr.log`);
  const summaryPath = path.join(layout.workerLogs, `${runId}.summary.json`);
  const createdAt = isoStamp(context.now);
  const childEnv = {
    ...process.env,
    NO_PROXY: ["127.0.0.1", "localhost", "::1", process.env.NO_PROXY].filter(Boolean).join(","),
    no_proxy: ["127.0.0.1", "localhost", "::1", process.env.no_proxy].filter(Boolean).join(","),
  };

  return await new Promise<AppServerRunSummary>((resolve) => {
    const spawnCommand = appServerSpawnCommand(runtimeConfig.codexExe);
    const child = spawn(
      spawnCommand.command,
      [
        ...spawnCommand.argsPrefix,
        "app-server",
        "--listen",
        "stdio://",
        "--strict-config",
        "-c",
        `model_provider="${runtimeConfig.modelProvider}"`,
        "-c",
        `model="${runtimeConfig.model}"`,
        "-c",
        `model_reasoning_effort="${runtimeConfig.modelReasoningEffort}"`,
      ],
      {
        cwd: path.resolve(input.workspacePath),
        env: childEnv,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const events = fs.createWriteStream(eventsPath, { flags: "a" });
    const errors = fs.createWriteStream(stderrPath, { flags: "a" });
    let finished = false;
    let threadId: string | null = null;
    let completionStatus: string | null = null;
    let completionPayload: Record<string, unknown> | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let stdoutBuffer = "";

    const finish = (ok: boolean, reason: string) => {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      const summary: AppServerRunSummary = {
        ok,
        reason,
        runId,
        assignmentPath: path.resolve(input.assignmentPath),
        eventsPath,
        stderrPath,
        summaryPath,
        threadId,
        completionStatus,
        completionPayload,
        createdAt,
      };
      writeJson(summaryPath, summary);

      let pendingStreams = 2;
      const afterStreamClosed = () => {
        pendingStreams -= 1;
        if (pendingStreams > 0) return;
        try {
          child.kill();
        } catch {
          // Best effort.
        }
        resolve(summary);
      };

      events.end(afterStreamClosed);
      errors.end(afterStreamClosed);
    };

    const send = (payload: unknown) => {
      if (finished || child.stdin.destroyed || !child.stdin.writable) return;
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    };

    const handleStdoutLine = (line: string) => {
      if (!line.trim() || finished) return;
      let message: Record<string, any>;
      try {
        message = JSON.parse(line) as Record<string, any>;
      } catch {
        return;
      }
      if (message.id === 1 && message.result?.thread?.id) {
        threadId = String(message.result.thread.id);
        send({
          method: "turn/start",
          id: 2,
          params: {
            threadId,
            input: [{ type: "text", text: input.boundedPrompt }],
          },
        });
      }
      if (message.method === "turn/completed") {
        completionStatus = (message.params?.turn?.status as string | undefined) ?? null;
        completionPayload = (message.params?.turn as Record<string, unknown> | undefined) ?? null;
        finish(completionStatus === "completed", `turn status ${completionStatus ?? "unknown"}`);
      }
    };

    const consumeStdout = (text: string, flush = false) => {
      stdoutBuffer += text;
      while (true) {
        const lineEnd = stdoutBuffer.search(/\r?\n/);
        if (lineEnd < 0) break;
        const line = stdoutBuffer.slice(0, lineEnd);
        const offset = stdoutBuffer[lineEnd] === "\r" && stdoutBuffer[lineEnd + 1] === "\n" ? 2 : 1;
        stdoutBuffer = stdoutBuffer.slice(lineEnd + offset);
        handleStdoutLine(line);
      }
      if (flush && stdoutBuffer.trim()) {
        const finalLine = stdoutBuffer;
        stdoutBuffer = "";
        handleStdoutLine(finalLine);
      }
    };

    child.stdout.on("data", (buffer) => {
      const text = buffer.toString();
      if (!finished) events.write(text);
      consumeStdout(text);
    });

    child.stderr.on("data", (buffer) => {
      if (!finished) errors.write(buffer.toString());
    });

    child.stdin.on("error", (error) => {
      if (!finished) errors.write(`stdin error: ${error instanceof Error ? error.message : String(error)}\n`);
    });

    child.on("error", (error) => {
      if (!finished) errors.write(`process error: ${error instanceof Error ? error.message : String(error)}\n`);
      finish(false, `process error: ${error instanceof Error ? error.message : String(error)}`);
    });

    child.on("exit", (code, signal) => {
      consumeStdout("", true);
      if (!finished) finish(false, `exited early code=${code ?? "null"} signal=${signal ?? "none"}`);
    });

    send({
      method: "initialize",
      id: 0,
      params: { clientInfo: { name: "strata_cli", title: "Strata CLI", version: "0.2.0" } },
    });
    send({ method: "initialized", params: {} });
    send({ method: "thread/start", id: 1, params: { model: runtimeConfig.model, cwd: path.resolve(input.workspacePath) } });

    timeoutId = setTimeout(() => finish(false, `timeout after ${timeoutMs}ms`), timeoutMs);
  });
}
