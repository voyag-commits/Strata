import fs from "node:fs";
import path from "node:path";
import { ContractError, type BindingStatus, type SessionBindingRecord } from "./contract_shapes.js";
import { ensureDir, layoutFor, readJson, safePart, type RuntimeContext, writeJson } from "./common.js";

export function bindingDir(ctx: RuntimeContext): string {
  return ensureDir(path.join(layoutFor(ctx.workspaceRoot).root, "session_bindings"));
}

export function bindingPath(ctx: RuntimeContext, sessionId: string): string {
  return path.join(bindingDir(ctx), `${safePart(sessionId)}.json`);
}

export function writeBinding(ctx: RuntimeContext, record: SessionBindingRecord): string {
  return writeJson(bindingPath(ctx, record.session_id), record);
}

export function readBinding(ctx: RuntimeContext, sessionId: string): SessionBindingRecord {
  const p = bindingPath(ctx, sessionId);
  if (!fs.existsSync(p)) {
    throw new ContractError("SESSION_BINDING_NOT_FOUND", `session binding not found for session_id: ${sessionId}`, true);
  }
  const record = readJson<SessionBindingRecord>(p);
  if (record.contract_id !== "strata.runtime_delegate.session_binding.v1") {
    throw new ContractError("BAD_SESSION_BINDING", `session binding has unexpected contract_id: ${p}`, false);
  }
  return record;
}

export function updateBindingStatus(ctx: RuntimeContext, sessionId: string, status: BindingStatus, updatedAt: string): SessionBindingRecord {
  const prior = readBinding(ctx, sessionId);
  const next: SessionBindingRecord = { ...prior, status, updated_at: updatedAt };
  writeBinding(ctx, next);
  return next;
}

export function listBindings(ctx: RuntimeContext): SessionBindingRecord[] {
  const dir = bindingDir(ctx);
  return fs.readdirSync(dir)
    .filter((name: string) => name.endsWith(".json"))
    .map((name: string) => {
      try { return readJson<SessionBindingRecord>(path.join(dir, name)); }
      catch { return null; }
    })
    .filter((record: SessionBindingRecord | null): record is SessionBindingRecord => record !== null && record.contract_id === "strata.runtime_delegate.session_binding.v1")
    .sort((a: SessionBindingRecord, b: SessionBindingRecord) => a.session_id.localeCompare(b.session_id));
}
