// ADR_06_18 Runtime Session Delegate normalized surface.
// SCTL owns validation, commits, context export, envelope rendering, metadata logs,
// return ingestion, and cycle progression. This package controls runtime endpoints only.

export class ContractError extends Error {
  errorCode: string;
  recoverable: boolean;
  evidencePath?: string;

  constructor(errorCode: string, message: string, recoverable = true, evidencePath?: string) {
    super(message);
    this.name = "ContractError";
    this.errorCode = errorCode;
    this.recoverable = recoverable;
    this.evidencePath = evidencePath;
  }
}

export interface FailureResult {
  ok: false;
  error_code: string;
  message: string;
  evidence_path: string | null;
  recoverable: boolean;
}

export function failureResult(error: ContractError): FailureResult {
  return {
    ok: false,
    error_code: error.errorCode,
    message: error.message,
    evidence_path: error.evidencePath ?? null,
    recoverable: error.recoverable,
  };
}

export type RuntimeKind = "tmux_codex_cli" | "tmux" | "mock" | "codex_cli" | string;
export type SessionMode = "existing_wsl_tmux" | "live_tmux" | "mock" | string;
export type RetirePolicy = "kill-session" | "kill-pane" | "send-exit-then-kill" | "explicit-only";
export type BindingStatus = "registered" | "created" | "observed_alive" | "terminated" | "not_found";

export interface SessionBindingRecord {
  contract_id: "strata.runtime_delegate.session_binding.v1";
  runtime: RuntimeKind;
  assignment_id: string;
  cycle_id: string | null;
  session_id: string;
  role: string;
  session_mode: SessionMode;
  retire_policy: RetirePolicy;
  tmux_target: string;
  tmux_session_name: string;
  tmux_window_index: number;
  tmux_pane_index: number;
  tmux_pane_id: string;
  pane_current_command: string | null;
  pane_current_path: string | null;
  pane_title: string | null;
  workspace_root: string;
  return_dir: string;
  evidence_path: string;
  created_at: string;
  updated_at: string;
  status: BindingStatus;
}

export interface SessionRegisterResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "session_register";
  assignment_id: string;
  cycle_id: string | null;
  session_id: string;
  role: string;
  session_mode: SessionMode;
  return_dir: string;
  evidence_path: string;
  created_at: string;
  tmux_target: string;
  tmux_session_name: string;
  tmux_window_index: number;
  tmux_pane_index: number;
  tmux_pane_id: string;
}

export interface SessionCreateResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "session_create";
  assignment_id: string;
  cycle_id: string | null;
  session_id: string;
  role: string;
  session_mode: SessionMode;
  return_dir: string;
  evidence_path: string;
  created_at: string;
  tmux_target: string;
  tmux_session_name: string;
  tmux_window_index: number;
  tmux_pane_index: number;
  tmux_pane_id: string;
}

export interface DispatchDeliveryResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "dispatch_delivery";
  session_id: string;
  runtime_session_name: string | null;
  tmux_target: string;
  packet_path: string;
  packet_sha256: string;
  evidence_path: string;
  timestamp: string;
  error: null;
}

export interface ReturnDropResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "return_drop";
  assignment_id: string;
  session_id: string;
  copied_files: string[];
  return_dir: string;
  evidence_path: string;
  timestamp: string;
  error: null;
}

export interface ReturnDirResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "return_dir";
  assignment_id: string;
  session_id: string;
  return_dir: string;
  timestamp: string;
}

export interface SessionCaptureResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "session_capture";
  session_id: string;
  tmux_target: string;
  capture_path: string;
  evidence_path: string;
  timestamp: string;
}

export interface SessionTerminateResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "session_terminate";
  session_id: string;
  tmux_session_name: string;
  retire_policy: RetirePolicy;
  evidence_path: string;
  timestamp: string;
}

export interface SessionListResult {
  ok: true;
  runtime: RuntimeKind;
  operation: "session_list";
  sessions: SessionBindingRecord[];
  timestamp: string;
}

export type ContractOperationResult =
  | SessionRegisterResult
  | SessionCreateResult
  | DispatchDeliveryResult
  | ReturnDropResult
  | ReturnDirResult
  | SessionCaptureResult
  | SessionTerminateResult
  | SessionListResult
  | FailureResult;

export const PACKET_CONTRACT_ID = "strata.dispatch.packet.v3_context_envelope";
