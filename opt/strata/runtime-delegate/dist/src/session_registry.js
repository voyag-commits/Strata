import fs from "node:fs";
import path from "node:path";
import { ContractError } from "./contract_shapes.js";
import { ensureDir, layoutFor, readJson, safePart, writeJson } from "./common.js";
export function bindingDir(ctx) {
    return ensureDir(path.join(layoutFor(ctx.workspaceRoot).root, "session_bindings"));
}
export function bindingPath(ctx, sessionId) {
    return path.join(bindingDir(ctx), `${safePart(sessionId)}.json`);
}
export function writeBinding(ctx, record) {
    return writeJson(bindingPath(ctx, record.session_id), record);
}
export function readBinding(ctx, sessionId) {
    const p = bindingPath(ctx, sessionId);
    if (!fs.existsSync(p)) {
        throw new ContractError("SESSION_BINDING_NOT_FOUND", `session binding not found for session_id: ${sessionId}`, true);
    }
    const record = readJson(p);
    if (record.contract_id !== "strata.runtime_delegate.session_binding.v1") {
        throw new ContractError("BAD_SESSION_BINDING", `session binding has unexpected contract_id: ${p}`, false);
    }
    return record;
}
export function updateBindingStatus(ctx, sessionId, status, updatedAt) {
    const prior = readBinding(ctx, sessionId);
    const next = { ...prior, status, updated_at: updatedAt };
    writeBinding(ctx, next);
    return next;
}
export function listBindings(ctx) {
    const dir = bindingDir(ctx);
    return fs.readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
        try {
            return readJson(path.join(dir, name));
        }
        catch {
            return null;
        }
    })
        .filter((record) => record !== null && record.contract_id === "strata.runtime_delegate.session_binding.v1")
        .sort((a, b) => a.session_id.localeCompare(b.session_id));
}
