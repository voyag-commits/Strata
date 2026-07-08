import path from "node:path";
import { ensureLayout } from "./layout.js";
import { appendJsonl, isoNow } from "./common.js";

export function telemetryPath(root) {
  return path.join(ensureLayout(root).telemetry, "workflow_telemetry.jsonl");
}

export function recordTelemetry(root, event, fields = {}) {
  const p = telemetryPath(root);
  const record = { ts: isoNow(), event, ...fields };
  appendJsonl(p, record);
  return { path: p, record };
}
