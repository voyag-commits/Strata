import path from "node:path";
import { ensureDir, fileStamp, iso, layoutFor, readJson, readText, runCommand, safePart, sha256Text, type CommandResult, type RuntimeContext, writeJson, writeText } from "./common.js";

export interface RuntimeEdgeNotice {
  contract_id: "strata.runtime_edge_notice.v1";
  commit_sha: string;
  changed_files: string[];
  report_id: string | null;
  assignment_id: string;
  worker_id: string | null;
  nonce: string;
  suggested_command_options: string[];
  target_session?: string | null;
  created_at?: string;
}

export interface InjectNoticeResult {
  contract_id: "strata.runtime_edge.inject_notice_result.v1";
  ok: boolean;
  dry_run: boolean;
  session_name: string;
  evidence_dir: string;
  notice_path: string;
  message_path: string;
  blocked_artifact_path: string | null;
  tmux_results: Record<string, CommandResult>;
  capture_path: string | null;
}

export function validateNotice(raw: unknown): RuntimeEdgeNotice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("notice must be a JSON object");
  const obj = raw as Record<string, unknown>;
  if (obj.contract_id !== "strata.runtime_edge_notice.v1") throw new Error("contract_id must be strata.runtime_edge_notice.v1");
  const req = (key: string): string => {
    const value = obj[key];
    if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string`);
    return value;
  };
  const nullable = (key: string): string | null => {
    const value = obj[key];
    if (value == null) return null;
    if (typeof value !== "string") throw new Error(`${key} must be a string or null`);
    return value;
  };
  if (!Array.isArray(obj.changed_files) || !obj.changed_files.every((item) => typeof item === "string")) throw new Error("changed_files must be string[]");
  if (!Array.isArray(obj.suggested_command_options) || !obj.suggested_command_options.every((item) => typeof item === "string")) throw new Error("suggested_command_options must be string[]");
  return {
    contract_id: "strata.runtime_edge_notice.v1",
    commit_sha: req("commit_sha"),
    changed_files: obj.changed_files as string[],
    report_id: nullable("report_id"),
    assignment_id: req("assignment_id"),
    worker_id: nullable("worker_id"),
    nonce: req("nonce"),
    suggested_command_options: obj.suggested_command_options as string[],
    target_session: nullable("target_session"),
    created_at: typeof obj.created_at === "string" ? obj.created_at : undefined,
  };
}

export function renderBoundedNotice(notice: RuntimeEdgeNotice, maxBytes = 3900): string {
  const files = notice.changed_files.length ? notice.changed_files.map((file) => `- ${file}`).join("\n") : "- none";
  const options = notice.suggested_command_options.length ? notice.suggested_command_options.map((item) => `- ${item}`).join("\n") : "- inspect changed files manually";
  const body = [
    "STRATA DELTA NOTICE",
    `commit_sha: ${notice.commit_sha}`,
    `assignment_id: ${notice.assignment_id}`,
    `worker_id: ${notice.worker_id ?? "not_available"}`,
    `report_id: ${notice.report_id ?? "not_available"}`,
    `nonce: ${notice.nonce}`,
    "changed_files:",
    files,
    "suggested_command_options:",
    options,
    "boundary: runtime edge delivered this notice mechanically; IC owns interpretation.",
  ].join("\n");
  const encoded = Buffer.from(body, "utf8");
  if (encoded.length <= maxBytes) return body;
  return `${encoded.subarray(0, Math.max(0, maxBytes - 64)).toString("utf8")}\n[truncated_by_runtime_edge_max_bytes]`;
}

export function injectNotice(ctx: RuntimeContext, input: { noticePath: string; sessionName?: string | null; dryRun?: boolean; submit?: boolean; maxBytes?: number }): InjectNoticeResult {
  const layout = layoutFor(ctx.workspaceRoot);
  const noticePath = path.isAbsolute(input.noticePath) ? input.noticePath : path.resolve(ctx.workspaceRoot, input.noticePath);
  const notice = validateNotice(readJson<unknown>(noticePath));
  const sessionName = input.sessionName ?? notice.target_session ?? `STRATA-IC-${safePart(notice.assignment_id).toUpperCase()}`;
  const evidenceDir = ensureDir(path.join(layout.dispatchEdge, safePart(sessionName), fileStamp(ctx.now)));
  const message = renderBoundedNotice(notice, input.maxBytes ?? 3900);
  const messagePath = writeText(path.join(evidenceDir, "notice_message.txt"), `${message}\n`);
  const tmuxResults: Record<string, CommandResult> = {};
  let blockedArtifactPath: string | null = null;
  let capturePath: string | null = null;
  if (!input.dryRun) {
    tmuxResults.has_session = runCommand("tmux", ["has-session", "-t", sessionName]);
    if (!tmuxResults.has_session.ok) {
      blockedArtifactPath = writeJson(path.join(evidenceDir, "blocked_artifact.json"), { contract_id: "strata.runtime_edge.dispatch_blocked.v1", reason: `target session unavailable: ${sessionName}`, created_at: iso(ctx.now), tmux_results: tmuxResults });
    } else {
      tmuxResults.set_buffer = runCommand("tmux", ["set-buffer", "-b", "strata-runtime-edge", readText(messagePath)]);
      tmuxResults.paste_buffer = runCommand("tmux", ["paste-buffer", "-b", "strata-runtime-edge", "-t", sessionName]);
      if (input.submit !== false) {
        tmuxResults.submit_delay = runCommand("bash", ["-lc", "sleep 0.5"]);
        tmuxResults.enter = runCommand("tmux", ["send-keys", "-t", sessionName, "Enter"]);
      }
      const capture = runCommand("tmux", ["capture-pane", "-p", "-t", sessionName, "-S", "-200"]);
      if (capture.ok) capturePath = writeText(path.join(evidenceDir, "pane_capture.txt"), capture.stdout);
      tmuxResults.capture = capture;
    }
  }
  const ok = input.dryRun ? true : Object.values(tmuxResults).every((result) => result.ok) && !blockedArtifactPath;
  const result: InjectNoticeResult = { contract_id: "strata.runtime_edge.inject_notice_result.v1", ok, dry_run: Boolean(input.dryRun), session_name: sessionName, evidence_dir: evidenceDir, notice_path: noticePath, message_path: messagePath, blocked_artifact_path: blockedArtifactPath, tmux_results: tmuxResults, capture_path: capturePath };
  writeJson(path.join(evidenceDir, "inject_notice_result.json"), result);
  writeJson(path.join(evidenceDir, "notice_digest.json"), { contract_id: "strata.runtime_edge.notice_digest.v1", created_at: iso(ctx.now), notice_sha256: sha256Text(JSON.stringify(notice)), message_sha256: sha256Text(message) });
  return result;
}
