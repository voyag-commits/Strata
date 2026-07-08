import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileExists, readText } from "../common.js";
function readEvidenceCodexPath(projectRoot) {
    const evidencePath = path.join(projectRoot, "m0_cli_appserver_validation_evidence", "01_codex_cli_path.txt");
    if (!fileExists(evidencePath))
        return null;
    const value = readText(evidencePath).trim();
    return value.length > 0 ? value : null;
}
function detectCodexFromPath() {
    try {
        if (process.platform === "win32") {
            return execFileSync("where.exe", ["codex"], { encoding: "utf8" }).split(/\r?\n/).find(Boolean)?.trim() ?? "codex";
        }
        return execFileSync("which", ["codex"], { encoding: "utf8" }).trim();
    }
    catch {
        return "codex";
    }
}
export function loadRuntimeConfig(projectRoot, overrides) {
    const port = Number(process.env.PORT ?? overrides?.bridgePort ?? 38441);
    const bridgeBaseUrl = overrides?.bridgeBaseUrl ?? `http://127.0.0.1:${port}/v1`;
    const codexExe = overrides?.codexExe ??
        process.env.CODEX_EXE ??
        readEvidenceCodexPath(projectRoot) ??
        detectCodexFromPath();
    return {
        codexExe,
        codexConfigPath: overrides?.codexConfigPath ??
            process.env.CODEX_CONFIG_PATH ??
            path.join(os.homedir(), ".codex", "config.toml"),
        bridgeBaseUrl,
        bridgePort: port,
        model: overrides?.model ?? process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
        modelProvider: overrides?.modelProvider ?? "deepseek_bridge",
        modelReasoningEffort: overrides?.modelReasoningEffort ?? process.env.MODEL_REASONING_EFFORT ?? "low",
    };
}
