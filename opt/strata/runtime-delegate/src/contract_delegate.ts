import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  exists,
  fileStamp,
  iso,
  layoutFor,
  readText,
  safePart,
  sha256Text,
  type RuntimeContext,
  writeJson,
  writeText,
} from "./common.js";
import { launchSession, type LaunchSessionInput } from "./runtime.js";
import {
  ContractError,
  type DispatchDeliveryResult,
  type RetirePolicy,
  type ReturnDirResult,
  type ReturnDropResult,
  type RuntimeKind,
  type SessionBindingRecord,
  type SessionCaptureResult,
  type SessionCreateResult,
  type SessionListResult,
  type SessionMode,
  type SessionRegisterResult,
  type SessionTerminateResult,
} from "./contract_shapes.js";
import { listBindings, readBinding, updateBindingStatus, writeBinding } from "./session_registry.js";
import { tmuxCapture, tmuxDisplayTarget, tmuxLoadAndPaste, tmuxTerminate } from "./tmux_adapter.js";

function rel(ctx: RuntimeContext, candidate: string): string {
  return path.isAbsolute(candidate) ? path.relative(ctx.workspaceRoot, candidate) || "." : candidate;
}

function resolveInWorkspace(ctx: RuntimeContext, candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(ctx.workspaceRoot, candidate);
}

function returnDirRel(assignmentId: string, sessionId: string): string {
  return `.strata/returns/${safePart(assignmentId)}/${safePart(sessionId)}`;
}

function returnDirAbs(ctx: RuntimeContext, assignmentId: string, sessionId: string): string {
  return path.resolve(ctx.workspaceRoot, returnDirRel(assignmentId, sessionId));
}

function runtimeEvidenceDir(ctx: RuntimeContext, operation: string, sessionId: string): string {
  return ensureDir(path.join(layoutFor(ctx.workspaceRoot).evidence, "delegate_control", operation, safePart(sessionId), fileStamp(ctx.now)));
}

function resultToRegister(record: SessionBindingRecord): SessionRegisterResult {
  return {
    ok: true,
    runtime: record.runtime,
    operation: "session_register",
    assignment_id: record.assignment_id,
    cycle_id: record.cycle_id,
    session_id: record.session_id,
    role: record.role,
    session_mode: record.session_mode,
    return_dir: record.return_dir,
    evidence_path: record.evidence_path,
    created_at: record.created_at,
    tmux_target: record.tmux_target,
    tmux_session_name: record.tmux_session_name,
    tmux_window_index: record.tmux_window_index,
    tmux_pane_index: record.tmux_pane_index,
    tmux_pane_id: record.tmux_pane_id,
  };
}

export interface SessionRegisterInput {
  assignmentId: string;
  cycleId?: string | null;
  role: string;
  sessionId: string;
  tmuxTarget: string;
  sessionMode?: SessionMode;
  runtime?: RuntimeKind;
  retirePolicy?: RetirePolicy;
}

export function registerSession(ctx: RuntimeContext, input: SessionRegisterInput): SessionRegisterResult {
  const metadata = tmuxDisplayTarget(input.tmuxTarget);
  const rdRel = returnDirRel(input.assignmentId, input.sessionId);
  ensureDir(path.resolve(ctx.workspaceRoot, rdRel));
  const evidenceDir = runtimeEvidenceDir(ctx, "session_register", input.sessionId);
  const evidencePathAbs = path.join(evidenceDir, "session_register_result.json");
  const record: SessionBindingRecord = {
    contract_id: "strata.runtime_delegate.session_binding.v1",
    runtime: input.runtime ?? "tmux_codex_cli",
    assignment_id: input.assignmentId,
    cycle_id: input.cycleId ?? null,
    session_id: input.sessionId,
    role: input.role,
    session_mode: input.sessionMode ?? "existing_wsl_tmux",
    retire_policy: input.retirePolicy ?? "kill-session",
    tmux_target: metadata.tmux_target,
    tmux_session_name: metadata.tmux_session_name,
    tmux_window_index: metadata.tmux_window_index,
    tmux_pane_index: metadata.tmux_pane_index,
    tmux_pane_id: metadata.tmux_pane_id,
    pane_current_command: metadata.pane_current_command,
    pane_current_path: metadata.pane_current_path,
    pane_title: metadata.pane_title,
    workspace_root: ctx.workspaceRoot,
    return_dir: rdRel,
    evidence_path: rel(ctx, evidencePathAbs),
    created_at: iso(ctx.now),
    updated_at: iso(ctx.now),
    status: "registered",
  };
  writeBinding(ctx, record);
  const result = resultToRegister(record);
  writeJson(evidencePathAbs, { ...result, binding: record });
  return result;
}

export interface CreateSessionInput {
  assignmentId: string;
  cycleId?: string | null;
  role: string;
  sessionId: string;
  sessionMode?: SessionMode;
  configPath?: string | null;
  replace?: boolean;
  extraArgs?: string[];
  runtime?: RuntimeKind;
  retirePolicy?: RetirePolicy;
}

export function createSession(ctx: RuntimeContext, input: CreateSessionInput): SessionCreateResult {
  const launchInput: LaunchSessionInput = {
    role: input.role,
    assignmentId: input.assignmentId,
    sessionId: input.sessionId,
    configPath: input.configPath,
    replace: input.replace,
    extraArgs: input.extraArgs,
  };
  const launched = launchSession(ctx, launchInput);
  if (!launched.ok) {
    throw new ContractError(
      "SESSION_CREATE_FAILED",
      `tmux session create failed: ${launched.tmux.stderr || launched.tmux.stdout || "unknown"}`,
      true,
      launched.evidence_dir,
    );
  }
  const registered = registerSession(ctx, {
    assignmentId: input.assignmentId,
    cycleId: input.cycleId ?? null,
    role: input.role,
    sessionId: input.sessionId,
    tmuxTarget: launched.session_name,
    sessionMode: input.sessionMode ?? "live_tmux",
    runtime: input.runtime ?? "tmux_codex_cli",
    retirePolicy: input.retirePolicy ?? "kill-session",
  });
  return {
    ...registered,
    operation: "session_create",
    session_mode: input.sessionMode ?? "live_tmux",
  };
}

export interface DeliverDispatchInput {
  packetPath: string;
  sessionId: string;
  dispatchLogPath?: string | null;
  submit?: boolean;
}

export function deliverDispatchPacket(ctx: RuntimeContext, input: DeliverDispatchInput): DispatchDeliveryResult {
  const binding = readBinding(ctx, input.sessionId);
  const packetAbs = resolveInWorkspace(ctx, input.packetPath);
  if (!exists(packetAbs)) {
    throw new ContractError("PACKET_NOT_FOUND", `dispatch packet not found: ${packetAbs}`, true);
  }
  const packetContent = readText(packetAbs);
  const packetSha256 = sha256Text(packetContent);
  const evidenceDir = runtimeEvidenceDir(ctx, "dispatch_delivery", input.sessionId);
  const evidenceEnvelopeAbs = writeText(path.join(evidenceDir, "dispatch_packet.md"), packetContent);
  const evidenceSha256 = sha256Text(readText(evidenceEnvelopeAbs));
  if (evidenceSha256 !== packetSha256) {
    throw new ContractError("EVIDENCE_MISMATCH", "dispatch evidence SHA256 does not match packet SHA256", false, rel(ctx, evidenceDir));
  }
  tmuxDisplayTarget(binding.tmux_target);
  const tmpPacketPath = writeText(path.join(evidenceDir, "_dispatch_packet_tmp.md"), packetContent);
  const bufferName = `strata_${safePart(input.sessionId)}_${process.pid}`;
  const tmux = tmuxLoadAndPaste(binding.tmux_target, bufferName, tmpPacketPath, input.submit !== false);
  try { fs.unlinkSync(tmpPacketPath); } catch { /* best effort */ }
  const evidenceResultAbs = path.join(evidenceDir, "dispatch_delivery_result.json");
  const result: DispatchDeliveryResult = {
    ok: true,
    runtime: binding.runtime,
    operation: "dispatch_delivery",
    session_id: input.sessionId,
    runtime_session_name: binding.tmux_session_name,
    tmux_target: binding.tmux_target,
    packet_path: rel(ctx, packetAbs),
    packet_sha256: packetSha256,
    evidence_path: rel(ctx, evidenceResultAbs),
    timestamp: iso(ctx.now),
    error: null,
  };
  writeJson(evidenceResultAbs, { ...result, source_packet_sha256: packetSha256, delivered_envelope_path: evidenceEnvelopeAbs, tmux });
  if (input.dispatchLogPath) {
    writeJson(resolveInWorkspace(ctx, input.dispatchLogPath), result);
  }
  updateBindingStatus(ctx, input.sessionId, "observed_alive", iso(ctx.now));
  return result;
}

export interface DropReturnFileInput { sourcePath: string; name?: string | null }

export interface DropReturnInput {
  assignmentId: string;
  sessionId: string;
  files: Array<string | DropReturnFileInput>;
}

export function dropReturnFiles(ctx: RuntimeContext, input: DropReturnInput): ReturnDropResult {
  if (!input.files.length) throw new ContractError("NO_RETURN_FILES", "return-drop requires at least one --file", true);
  const rdRel = returnDirRel(input.assignmentId, input.sessionId);
  const rdAbs = ensureDir(path.resolve(ctx.workspaceRoot, rdRel));
  const copied: string[] = [];
  for (const file of input.files) {
    const sourcePath = typeof file === "string" ? file : file.sourcePath;
    const explicitName = typeof file === "string" ? null : file.name;
    const sourceAbs = resolveInWorkspace(ctx, sourcePath);
    if (!exists(sourceAbs)) throw new ContractError("SOURCE_NOT_FOUND", `return source not found: ${sourceAbs}`, true);
    const destAbs = path.join(rdAbs, explicitName?.trim() || path.basename(sourceAbs));
    writeText(destAbs, readText(sourceAbs));
    copied.push(rel(ctx, destAbs));
  }
  const evidencePathAbs = path.join(rdAbs, "return_drop_result.json");
  const result: ReturnDropResult = {
    ok: true,
    runtime: "tmux_codex_cli",
    operation: "return_drop",
    assignment_id: input.assignmentId,
    session_id: input.sessionId,
    copied_files: copied,
    return_dir: rdRel,
    evidence_path: rel(ctx, evidencePathAbs),
    timestamp: iso(ctx.now),
    error: null,
  };
  writeJson(evidencePathAbs, result);
  return result;
}

export interface ReturnDirInput {
  assignmentId: string;
  sessionId: string;
}

export function reportReturnDir(ctx: RuntimeContext, input: ReturnDirInput): ReturnDirResult {
  return {
    ok: true,
    runtime: "tmux_codex_cli",
    operation: "return_dir",
    assignment_id: input.assignmentId,
    session_id: input.sessionId,
    return_dir: returnDirRel(input.assignmentId, input.sessionId),
    timestamp: iso(ctx.now),
  };
}

export interface SessionCaptureInput {
  sessionId: string;
  lines?: number;
}

export function captureRegisteredSession(ctx: RuntimeContext, input: SessionCaptureInput): SessionCaptureResult {
  const binding = readBinding(ctx, input.sessionId);
  const evidenceDir = runtimeEvidenceDir(ctx, "session_capture", input.sessionId);
  const capture = tmuxCapture(binding.tmux_target, input.lines ?? 200);
  const capturePathAbs = writeText(path.join(evidenceDir, "pane_capture.txt"), capture);
  const evidencePathAbs = path.join(evidenceDir, "session_capture_result.json");
  const result: SessionCaptureResult = {
    ok: true,
    runtime: binding.runtime,
    operation: "session_capture",
    session_id: input.sessionId,
    tmux_target: binding.tmux_target,
    capture_path: rel(ctx, capturePathAbs),
    evidence_path: rel(ctx, evidencePathAbs),
    timestamp: iso(ctx.now),
  };
  writeJson(evidencePathAbs, result);
  updateBindingStatus(ctx, input.sessionId, "observed_alive", iso(ctx.now));
  return result;
}

export interface SessionTerminateInput {
  sessionId: string;
  retirePolicy?: RetirePolicy | null;
}

export function terminateRegisteredSession(ctx: RuntimeContext, input: SessionTerminateInput): SessionTerminateResult {
  const binding = readBinding(ctx, input.sessionId);
  const policy = input.retirePolicy ?? binding.retire_policy ?? "kill-session";
  const evidenceDir = runtimeEvidenceDir(ctx, "session_terminate", input.sessionId);
  const tmux = tmuxTerminate(binding.tmux_session_name, binding.tmux_target, policy);
  const evidencePathAbs = path.join(evidenceDir, "session_terminate_result.json");
  const result: SessionTerminateResult = {
    ok: true,
    runtime: binding.runtime,
    operation: "session_terminate",
    session_id: input.sessionId,
    tmux_session_name: binding.tmux_session_name,
    retire_policy: policy,
    evidence_path: rel(ctx, evidencePathAbs),
    timestamp: iso(ctx.now),
  };
  writeJson(evidencePathAbs, { ...result, tmux });
  updateBindingStatus(ctx, input.sessionId, "terminated", iso(ctx.now));
  return result;
}

export function listRegisteredSessions(ctx: RuntimeContext): SessionListResult {
  return {
    ok: true,
    runtime: "tmux_codex_cli",
    operation: "session_list",
    sessions: listBindings(ctx),
    timestamp: iso(ctx.now),
  };
}
