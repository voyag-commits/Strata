import fs from "node:fs";
import path from "node:path";
import { redact } from "./log.js";
let sequence = 0;
function safeStamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}
function redactConfiguredSecrets(value, config) {
    const firstPass = redact(value);
    const secrets = [config.deepSeekApiKey, config.bridgeAuthKey].filter((secret) => typeof secret === "string" && secret.length > 0);
    if (secrets.length === 0)
        return firstPass;
    let text = JSON.stringify(firstPass, null, 2);
    for (const secret of secrets) {
        text = text.split(secret).join("[REDACTED]");
    }
    return JSON.parse(text);
}
export function bridgeDebugEnabled(config) {
    return Boolean(config.debugTraceDir);
}
export function makeTraceBase(config, label) {
    if (!config.debugTraceDir)
        return null;
    fs.mkdirSync(config.debugTraceDir, { recursive: true });
    sequence += 1;
    const safeLabel = label.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "trace";
    return path.join(config.debugTraceDir, `${safeStamp()}_${String(sequence).padStart(4, "0")}_${safeLabel}`);
}
export function writeDebugJson(config, filePath, payload) {
    if (!filePath)
        return;
    const safePayload = redactConfiguredSecrets(payload, config);
    fs.writeFileSync(filePath, `${JSON.stringify(safePayload, null, 2)}\n`, "utf8");
}
// Diagnostic-only: writes the payload with ONLY the real API key / proxy token
// stripped (not the over-eager key-name redaction that mangles fields like
// "token_budget"). Gated behind BRIDGE_RAW_CAPTURE=1 so it is never on by default.
function stripConfiguredSecrets(value, config) {
    const secrets = [config.deepSeekApiKey, config.bridgeAuthKey].filter((secret) => typeof secret === "string" && secret.length > 0);
    if (secrets.length === 0)
        return value;
    let text = JSON.stringify(value, null, 2);
    for (const secret of secrets)
        text = text.split(secret).join("[REDACTED]");
    return JSON.parse(text);
}
export function writeRawDebugJson(config, filePath, payload) {
    if (!filePath)
        return;
    if (process.env.BRIDGE_RAW_CAPTURE !== "1")
        return;
    fs.writeFileSync(filePath, `${JSON.stringify(stripConfiguredSecrets(payload, config), null, 2)}\n`, "utf8");
}
export async function writeResponseTextTrace(config, filePath, response) {
    if (!filePath)
        return;
    try {
        const text = await response.text();
        const safePayload = redactConfiguredSecrets({
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: text,
        }, config);
        fs.writeFileSync(filePath, `${JSON.stringify(safePayload, null, 2)}\n`, "utf8");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeDebugJson(config, filePath, { trace_error: message });
    }
}
