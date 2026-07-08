import { ContractError, type RetirePolicy } from "./contract_shapes.js";
import { runCommand, type CommandResult } from "./common.js";

export interface TmuxTargetMetadata {
  tmux_target: string;
  tmux_session_name: string;
  tmux_window_index: number;
  tmux_pane_index: number;
  tmux_pane_id: string;
  pane_current_command: string | null;
  pane_current_path: string | null;
  pane_title: string | null;
}

function parseNumber(value: string, key: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ContractError("TMUX_PARSE_FAILED", `tmux ${key} was not an integer: ${value}`, false);
  }
  return parsed;
}

function splitKv(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of line.trim().split("\t")) {
    const idx = part.indexOf("=");
    if (idx > 0) result[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return result;
}

export function tmuxDisplayTarget(target: string): TmuxTargetMetadata {
  const format = [
    "session=#{session_name}",
    "window=#{window_index}",
    "pane=#{pane_index}",
    "pane_id=#{pane_id}",
    "cmd=#{pane_current_command}",
    "cwd=#{pane_current_path}",
    "title=#{pane_title}",
  ].join("\t");
  const res = runCommand("tmux", ["display-message", "-p", "-t", target, format]);
  if (!res.ok) {
    throw new ContractError("TMUX_TARGET_NOT_FOUND", `tmux target not found or not displayable: ${target}; ${res.stderr || res.stdout || "no details"}`, true);
  }
  const obj = splitKv(res.stdout);
  if (!obj.session || !obj.window || !obj.pane || !obj.pane_id) {
    throw new ContractError("TMUX_PARSE_FAILED", `tmux display-message returned incomplete metadata for ${target}: ${res.stdout}`, false);
  }
  return {
    tmux_target: target,
    tmux_session_name: obj.session,
    tmux_window_index: parseNumber(obj.window, "window_index"),
    tmux_pane_index: parseNumber(obj.pane, "pane_index"),
    tmux_pane_id: obj.pane_id,
    pane_current_command: obj.cmd || null,
    pane_current_path: obj.cwd || null,
    pane_title: obj.title || null,
  };
}

export function tmuxLoadAndPaste(target: string, bufferName: string, packetPath: string, submit: boolean): { load: CommandResult; paste: CommandResult; submit: CommandResult | null } {
  const load = runCommand("tmux", ["load-buffer", "-b", bufferName, packetPath]);
  if (!load.ok) throw new ContractError("BUFFER_LOAD_FAILED", `tmux load-buffer failed: ${load.stderr || load.stdout || "no details"}`, true);
  const paste = runCommand("tmux", ["paste-buffer", "-p", "-b", bufferName, "-t", target]);
  runCommand("tmux", ["delete-buffer", "-b", bufferName]);
  if (!paste.ok) throw new ContractError("PASTE_FAILED", `tmux paste-buffer failed: ${paste.stderr || paste.stdout || "no details"}`, true);
  const submitResult = submit ? runCommand("tmux", ["send-keys", "-t", target, "Enter"]) : null;
  if (submitResult && !submitResult.ok) {
    throw new ContractError("SUBMIT_KEY_FAILED", `tmux send-keys Enter failed: ${submitResult.stderr || submitResult.stdout || "no details"}`, true);
  }
  return { load, paste, submit: submitResult };
}

export function tmuxCapture(target: string, lines: number): string {
  const bounded = Math.max(1, Math.min(lines, 5000));
  const res = runCommand("tmux", ["capture-pane", "-t", target, "-p", "-S", `-${bounded}`]);
  if (!res.ok) throw new ContractError("CAPTURE_FAILED", `tmux capture-pane failed: ${res.stderr || res.stdout || "no details"}`, true);
  return res.stdout;
}

export function tmuxTerminate(sessionName: string, target: string, retirePolicy: RetirePolicy): CommandResult {
  let args: string[];
  if (retirePolicy === "kill-pane") args = ["kill-pane", "-t", target];
  else if (retirePolicy === "send-exit-then-kill") {
    runCommand("tmux", ["send-keys", "-t", target, "C-c"]);
    runCommand("tmux", ["send-keys", "-t", target, "exit", "Enter"]);
    args = ["kill-session", "-t", sessionName];
  } else {
    args = ["kill-session", "-t", sessionName];
  }
  const res = runCommand("tmux", args);
  if (!res.ok) throw new ContractError("SESSION_TERMINATE_FAILED", `tmux ${args[0]} failed: ${res.stderr || res.stdout || "no details"}`, true);
  return res;
}
