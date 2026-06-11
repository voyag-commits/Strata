import fs from "node:fs";
import path from "node:path";
import { ensureDir, exists, fileStamp, iso, layoutFor, readJson, runCommand, safePart, spawnTerminalTab, writeJson, writeText } from "./common.js";
import { readLauncherDelegateConfig, resolveLauncherCommand } from "./provider.js";
export function sessionNameFor(role, assignmentId) {
    return `STRATA-${safePart(role).toUpperCase()}-${safePart(assignmentId).toUpperCase()}`;
}
function recordPath(ctx, sessionName) {
    return path.join(layoutFor(ctx.workspaceRoot).sessions, `${safePart(sessionName)}.json`);
}
function requireTmuxAvailable() {
    const tmux = runCommand("tmux", ["-V"]);
    if (!tmux.ok)
        throw new Error(`tmux unavailable: ${tmux.stderr || tmux.stdout || "not_found"}`);
}
function applyTmuxCosmetics(sessionName) {
    runCommand("tmux", ["set-option", "-t", sessionName, "status", "on"]);
    runCommand("tmux", ["set-option", "-t", sessionName, "status-position", "top"]);
    runCommand("tmux", ["set-option", "-t", sessionName, "status-left-length", "100"]);
    runCommand("tmux", ["set-option", "-t", sessionName, "status-left", "#[fg=black,bg=green,bold] WSL/TMUX #[fg=white,bg=blue] session: #S #[default] "]);
    runCommand("tmux", ["set-option", "-t", sessionName, "status-right", "#[fg=white,bg=red] Strata Fleet BYOR DeepSeek #[default] %H:%M"]);
    runCommand("tmux", ["rename-window", "-t", `${sessionName}:0`, "Codex-TUI"]);
}
export function launchSession(ctx, input) {
    requireTmuxAvailable();
    const layout = layoutFor(ctx.workspaceRoot);
    const { config, path: providerConfigPath } = readLauncherDelegateConfig(ctx, input.configPath);
    const resolved = resolveLauncherCommand(ctx, config, input.extraArgs ?? []);
    const sessionName = input.sessionName?.trim() || sessionNameFor(input.role, input.assignmentId);
    const evidenceDir = ensureDir(path.join(layout.sessionLaunch, safePart(sessionName), fileStamp(ctx.now)));
    const existsResult = runCommand("tmux", ["has-session", "-t", sessionName]);
    if (existsResult.ok && input.replace)
        runCommand("tmux", ["kill-session", "-t", sessionName]);
    if (existsResult.ok && !input.replace)
        throw new Error(`tmux session already exists: ${sessionName}. Use --replace.`);
    const shellCommand = [resolved.command, ...resolved.args.map((arg) => JSON.stringify(arg))].join(" ");
    const tmuxArgs = ["new-session", "-d", "-s", sessionName, "-c", resolved.cwd ?? ctx.workspaceRoot];
    tmuxArgs.push("bash", "-lc", shellCommand);
    const tmux = runCommand("tmux", tmuxArgs, { cwd: resolved.cwd ?? ctx.workspaceRoot, encoding: "utf8" });
    if (tmux.ok)
        applyTmuxCosmetics(sessionName);
    const terminalTab = tmux.ok ? spawnTerminalTab(sessionName) : null;
    const record = {
        contract_id: "strata.runtime_edge.session_record.v1",
        session_name: sessionName,
        assignment_id: input.assignmentId,
        role: input.role,
        worker_id: input.workerId ?? null,
        provider_config_path: providerConfigPath,
        launcher_provider_name: config.provider_name,
        launcher_delegate_mode: config.mode,
        launcher_human_readable_command: resolved.human_readable_command,
        cwd: resolved.cwd ?? null,
        created_at: iso(ctx.now),
        updated_at: iso(ctx.now),
        status: tmux.ok ? "created" : "launch_failed",
        launch_evidence_dir: evidenceDir,
    };
    const recPath = writeJson(recordPath(ctx, sessionName), record);
    const result = { contract_id: "strata.runtime_edge.launch_result.v1", ok: tmux.ok, session_name: sessionName, record_path: recPath, evidence_dir: evidenceDir, tmux, terminal_tab: terminalTab, record };
    writeJson(path.join(evidenceDir, "launch_result.json"), result);
    return result;
}
export function listSessionRecords(ctx) {
    const layout = layoutFor(ctx.workspaceRoot);
    return fs.readdirSync(layout.sessions)
        .filter((name) => name.endsWith(".json"))
        .map((name) => {
        try {
            return readJson(path.join(layout.sessions, name));
        }
        catch {
            return null;
        }
    })
        .filter((r) => r !== null && r.contract_id === 'strata.runtime_edge.session_record.v1' && typeof r.session_name === 'string')
        .sort((a, b) => a.session_name.localeCompare(b.session_name));
}
export function captureSession(ctx, sessionName) {
    requireTmuxAvailable();
    const layout = layoutFor(ctx.workspaceRoot);
    const evidenceDir = ensureDir(path.join(layout.sessionCapture, safePart(sessionName), fileStamp(ctx.now)));
    const has = runCommand("tmux", ["has-session", "-t", sessionName]);
    const capture = has.ok ? runCommand("tmux", ["capture-pane", "-p", "-t", sessionName, "-S", "-200"]) : has;
    const capturePath = capture.ok ? writeText(path.join(evidenceDir, "pane_capture.txt"), capture.stdout) : null;
    const recPath = exists(recordPath(ctx, sessionName)) ? recordPath(ctx, sessionName) : null;
    if (recPath) {
        const prior = readJson(recPath);
        writeJson(recPath, { ...prior, updated_at: iso(ctx.now), status: has.ok ? "observed_alive" : "not_found" });
    }
    const result = { contract_id: "strata.runtime_edge.capture_result.v1", ok: has.ok, session_name: sessionName, evidence_dir: evidenceDir, capture_path: capturePath, tmux: capture, record_path: recPath };
    writeJson(path.join(evidenceDir, "capture_result.json"), result);
    return result;
}
export function terminateSession(ctx, sessionName) {
    requireTmuxAvailable();
    const tmux = runCommand("tmux", ["kill-session", "-t", sessionName]);
    const recPath = recordPath(ctx, sessionName);
    if (exists(recPath)) {
        const prior = readJson(recPath);
        writeJson(recPath, { ...prior, updated_at: iso(ctx.now), status: tmux.ok ? "terminated" : prior.status });
    }
    return { contract_id: "strata.runtime_edge.terminate_result.v1", ok: tmux.ok, session_name: sessionName, tmux, record_path: exists(recPath) ? recPath : null };
}
