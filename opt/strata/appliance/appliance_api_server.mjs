#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import { spawn } from "node:child_process";

const host = process.env.STRATA_APPLIANCE_API_HOST || "127.0.0.1";
const port = Number(process.env.STRATA_APPLIANCE_API_PORT || 8765);
const bridgeEnv = process.env.STRATA_CODEX_BRIDGE_ENV || `${process.env.HOME}/.codex-deepseek/bridge.env`;

function readEnvFile(file) {
  const out = {};
  try {
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!raw || raw.trim().startsWith("#")) continue;
      const idx = raw.indexOf("=");
      if (idx < 1) continue;
      out[raw.slice(0, idx)] = raw.slice(idx + 1);
    }
  } catch {}
  return out;
}

function writeJson(res, code, payload) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function updateDeepSeekKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") throw new Error("apiKey is required");
  fs.mkdirSync(new URL(".", `file://${bridgeEnv}`).pathname, { recursive: true });
  let lines = [];
  try {
    lines = fs.readFileSync(bridgeEnv, "utf8").split(/\r?\n/).filter((line) => line.length > 0);
  } catch {}
  let found = false;
  lines = lines.map((line) => {
    if (line.startsWith("DEEPSEEK_API_KEY=")) {
      found = true;
      return `DEEPSEEK_API_KEY=${apiKey}`;
    }
    return line;
  });
  if (!found) lines.unshift(`DEEPSEEK_API_KEY=${apiKey}`);
  fs.writeFileSync(bridgeEnv, `${lines.join("\n")}\n`, { mode: 0o600 });
  fs.chmodSync(bridgeEnv, 0o600);
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 127, stdout, stderr: error.message }));
  });
}

function statusPayload() {
  const env = readEnvFile(bridgeEnv);
  return {
    ok: true,
    object: "strata_appliance_status",
    bound_host: host,
    port,
    bridge_port: env.PORT || "38441",
    key_configured: Boolean(env.DEEPSEEK_API_KEY),
    thinking: env.DEEPSEEK_ENABLE_THINKING || "true",
    thinking_budget: env.DEEPSEEK_THINKING_BUDGET || "12000",
    reasoning_effort: env.DEEPSEEK_REASONING_EFFORT || "max",
    sctl_workspace: process.env.STRATA_WORKSPACE || null,
    codebase_repo: process.env.CODEBASE_REPO || null,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return writeJson(res, 200, statusPayload());
    if (req.method === "GET" && req.url === "/v1/status") return writeJson(res, 200, statusPayload());
    if (req.method === "POST" && req.url === "/v1/config/deepseek-key") {
      const body = await readBody(req);
      updateDeepSeekKey(String(body.apiKey || body.key || body.raw || ""));
      return writeJson(res, 200, { ok: true, key_configured: true });
    }
    if (req.method === "POST" && req.url === "/v1/cycle/start") {
      const body = await readBody(req);
      const args = ["start", "--background"];
      if (body.directorEntryPath) args.push("--director-entry", String(body.directorEntryPath));
      if (body.assignmentId) args.push("--assignment-id", String(body.assignmentId));
      if (body.cycles) args.push("--cycles", String(body.cycles));
      const result = await runCommand("strata-cycle", args);
      return writeJson(res, result.code === 0 ? 200 : 500, { ok: result.code === 0, ...result });
    }
    if (req.method === "POST" && req.url === "/v1/cycle/stop") {
      const body = await readBody(req);
      const args = ["stop"];
      if (body.assignmentId) args.push("--assignment-id", String(body.assignmentId));
      const result = await runCommand("strata-cycle", args);
      return writeJson(res, result.code === 0 ? 200 : 500, { ok: result.code === 0, ...result });
    }
    return writeJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    return writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`strata appliance api listening on http://${host}:${port}`);
});
