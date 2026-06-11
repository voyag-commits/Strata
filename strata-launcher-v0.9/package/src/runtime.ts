import fs from "node:fs";
import path from "node:path";
import { ensureDir, exists, fileStamp, iso, layoutFor, readJson, runCommand, safePart, spawnTerminalTab, type CommandResult, type RuntimeContext, type SpawnTerminalResult, writeJson, writeText } from "./common.js";
import { readLauncherDelegateConfig, resolveLauncherCommand } from "./provider.js";

export type RuntimeSessionStatus = "created" | "observed_alive" | "not_found" | "launch_failed" | "terminated";

export interface RuntimeSessionRecord {
  contract_id: "strata.runtime_edge.session_record.v1";
  session_name: string;
  assignment_id: string;
  role: string;
  worker_id: string | null;
  provider_config_path: string;
  launcher_provider_name: string;
  launcher_delegate_mode: string;
  launcher_human_readable_command: string;
  cwd: string | null;
  created_at: string;
  updated_at: string;
  status: RuntimeSessionStatus;
  launch_evidence_dir: string;
}

export interface LaunchSessionInput {
  role: string;
  assignmentId: string;
  workerId?: string | null;
  sessionName?: string | null;
  configPath?: string | null;
  replace?: boolean;
  extraArgs?: string[];
}

export interface LaunchSessionResult {
  contract_id: "strata.runtime_edge.launch_result.v1";
  ok: boolean;
  session_name: string;
  record_path: string;
  evidence_dir: string;
  tmux: CommandResult;
  terminal_tab: SpawnTerminalResult | null;
  record: RuntimeSessionRecord;
}

export interface CaptureSessionResult {
  contract_id: "strata.runtime_edge.capture_result.v1";
  ok: boolean;
  session_name: string;
  evidence_dir: string;
  capture_path: string | null;
  tmux: CommandResult;
  record_path: string | null;
}

export function sessionNameFor(role: string, assignmentId: string): string {
  return `STRATA-${safePart(role).toUpperCase()}-${safePart(assignmentId).toUpperCase()}`;
}

function recordPath(ctx: RuntimeContext, sessionName: string): string {
  return path.join(layoutFor(ctx.workspaceRoot).sessions, `${safePart(sessionName)}.json`);
}

function requireTmuxAvailable(): void {
  const tmux = runCommand("tmux", ["-V"]);
  if (!tmux.ok) throw new Error(`tmux unavailable: ${tmux.stderr || tmux.stdout || "not_found"}`);
}

function applyTmuxCosmetics(sessionName: string): void {
  runCommand("tmux", ["set-option", "-t", sessionName, "status", "on"]);
  runCommand("tmux", ["set-option", "-t", sessionName, "status-position", "top"]);
  runCommand("tmux", ["set-option", "-t", sessionName, "status-left-length", "100"]);
  runCommand("tmux", ["set-option", "-t", sessionName, "status-left", "#[fg=black,bg=green,bold] WSL/TMUX #[fg=white,bg=blue] session: #S #[default] "]);
  runCommand("tmux", ["set-option", "-t", sessionName, "status-right", "#[fg=white,bg=red] Strata Fleet BYOR DeepSeek #[default] %H:%M"]);
  runCommand("tmux", ["rename-window", "-t", `${sessionName}:0`, "Codex-TUI"]);
}

export function launchSession(ctx: RuntimeContext, input: LaunchSessionInput): LaunchSessionResult {
  requireTmuxAvailable();
  const layout = layoutFor(ctx.workspaceRoot);
  const { config, path: providerConfigPath } = readLauncherDelegateConfig(ctx, input.configPath);
  const resolved = resolveLauncherCommand(ctx, config, input.extraArgs ?? []);
  const sessionName = input.sessionName?.trim() || sessionNameFor(input.role, input.assignmentId);
  const evidenceDir = ensureDir(path.join(layout.sessionLaunch, safePart(sessionName), fileStamp(ctx.now)));
  const existsResult = runCommand("tmux", ["has-session", "-t", sessionName]);
  if (existsResult.ok && input.replace) runCommand("tmux", ["kill-session", "-t", sessionName]);
  if (existsResult.ok && !input.replace) throw new Error(`tmux session already exists: ${sessionName}. Use --replace.`);
  const shellCommand = [resolved.command, ...resolved.args.map((arg) => JSON.stringify(arg))].join(" ");
  const tmuxArgs = ["new-session", "-d", "-s", sessionName, "-c", resolved.cwd ?? ctx.workspaceRoot];
  tmuxArgs.push("bash", "-lc", shellCommand);
  const tmux = runCommand("tmux", tmuxArgs, { cwd: resolved.cwd ?? ctx.workspaceRoot, encoding: "utf8" });
  if (tmux.ok) applyTmuxCosmetics(sessionName);
  const terminalTab = tmux.ok ? spawnTerminalTab(sessionName) : null;
  const record: RuntimeSessionRecord = {
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
  const result: LaunchSessionResult = { contract_id: "strata.runtime_edge.launch_result.v1", ok: tmux.ok, session_name: sessionName, record_path: recPath, evidence_dir: evidenceDir, tmux, terminal_tab: terminalTab, record };
  writeJson(path.join(evidenceDir, "launch_result.json"), result);
  return result;
}

export function listSessionRecords(ctx: RuntimeContext): RuntimeSessionRecord[] {
  const layout = layoutFor(ctx.workspaceRoot);
  return fs.readdirSync(layout.sessions)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try { return readJson<RuntimeSessionRecord>(path.join(layout.sessions, name)); }
      catch { return null; }
    })
    .filter((r): r is RuntimeSessionRecord => 
      r !== null && (r as any).contract_id === 'strata.runtime_edge.session_record.v1' && typeof (r as any).session_name === 'string'
    )
    .sort((a, b) => a.session_name.localeCompare(b.session_name));
}

export function captureSession(ctx: RuntimeContext, sessionName: string): CaptureSessionResult {
  requireTmuxAvailable();
  const layout = layoutFor(ctx.workspaceRoot);
  const evidenceDir = ensureDir(path.join(layout.sessionCapture, safePart(sessionName), fileStamp(ctx.now)));
  const has = runCommand("tmux", ["has-session", "-t", sessionName]);
  const capture = has.ok ? runCommand("tmux", ["capture-pane", "-p", "-t", sessionName, "-S", "-200"]) : has;
  const capturePath = capture.ok ? writeText(path.join(evidenceDir, "pane_capture.txt"), capture.stdout) : null;
  const recPath = exists(recordPath(ctx, sessionName)) ? recordPath(ctx, sessionName) : null;
  if (recPath) {
    const prior = readJson<RuntimeSessionRecord>(recPath);
    writeJson(recPath, { ...prior, updated_at: iso(ctx.now), status: has.ok ? "observed_alive" : "not_found" });
  }
  const result: CaptureSessionResult = { contract_id: "strata.runtime_edge.capture_result.v1", ok: has.ok, session_name: sessionName, evidence_dir: evidenceDir, capture_path: capturePath, tmux: capture, record_path: recPath };
  writeJson(path.join(evidenceDir, "capture_result.json"), result);
  return result;
}

export function terminateSession(ctx: RuntimeContext, sessionName: string): Record<string, unknown> {
  requireTmuxAvailable();
  const tmux = runCommand("tmux", ["kill-session", "-t", sessionName]);
  const recPath = recordPath(ctx, sessionName);
  if (exists(recPath)) {
    const prior = readJson<RuntimeSessionRecord>(recPath);
    writeJson(recPath, { ...prior, updated_at: iso(ctx.now), status: tmux.ok ? "terminated" : prior.status });
  }
  return { contract_id: "strata.runtime_edge.terminate_result.v1", ok: tmux.ok, session_name: sessionName, tmux, record_path: exists(recPath) ? recPath : null };
}
