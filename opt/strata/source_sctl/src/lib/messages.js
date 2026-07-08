import fs from "node:fs";
import path from "node:path";
import { gitCommitContext, readContextState } from "./context.js";
import { ensureLayout } from "./layout.js";
import { exists, fileSlug, hasMarkdownHeading, isoNow, parseSimpleFrontmatter, readText, resultEnvelope, safeSegment, sha256File, timestamp, unique, workspacePath, writeText, isInsidePath } from "./common.js";
import { recordTelemetry } from "./telemetry.js";

export const MESSAGE_KINDS = new Set([
  "question",
  "answer",
  "clarification_request",
  "qc_feedback",
  "qc_review_request",
  "revision_request",
  "blocker_notice",
  "handoff_note",
  "coordination_note",
  "decision_request",
  "context_notice",
  "error_log",
]);

export const SESSION_MODES = new Set(["disposable", "long_running"]);
export const SESSION_STATUSES = new Set(["active", "released", "superseded", "closed", "retired"]);

function contextRel(root, file) { return path.relative(ensureLayout(root).context, file); }
function q(value) { return String(value ?? "").replace(/\n/g, " "); }

export function activeSessionsPath(root) {
  return path.join(ensureLayout(root).classCSessions, "active_sessions.json");
}

export function readActiveSessions(root) {
  if (!exists(activeSessionsPath(root))) return [];
  const raw = JSON.parse(fs.readFileSync(activeSessionsPath(root), "utf8"));
  return Array.isArray(raw.sessions) ? raw.sessions : [];
}

export function registerSession(root, input = {}) {
  const l = ensureLayout(root);
  const role = input.role || input.targetRole || input.target_role;
  const id = safeSegment(input.id || input.agentId || input.agent_id || input.targetId || input.target_id);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  if (!role) throw new Error("role is required");
  const state = readContextState(root);
  const mode = input.mode || input.sessionMode || input.session_mode || "disposable";
  if (!SESSION_MODES.has(mode)) throw new Error(`session mode must be one of: ${Array.from(SESSION_MODES).join(", ")}`);
  const sessions = readActiveSessions(root).filter((s) => !(s.id === id && s.assignment_id === assignmentId));
  const loadedContextEpoch = Number(input.loadedContextEpoch ?? input.loaded_context_epoch ?? state.class_b_revision ?? 0);
  const loadedClassARevision = Number(input.loadedClassARevision ?? input.loaded_class_a_revision ?? state.class_a_revision ?? 1);
  const runtimeSessionName = input.runtimeSessionName || input.runtime_session_name || input.sessionName || input.session_name || id;
  const runtimeRole = input.runtimeRole || input.runtime_role || null;
  const runtimeTmuxTarget = input.runtimeTmuxTarget || input.runtime_tmux_target || runtimeSessionName;
  const status = input.status || "active";
  if (!SESSION_STATUSES.has(status)) throw new Error(`session status must be one of: ${Array.from(SESSION_STATUSES).join(", ")}`);
  const session = {
    contract_id: "strata.class_c.active_session.v3_runtime_registry",
    role,
    id,
    logical_session_id: id,
    session_name: runtimeSessionName,
    runtime_session_name: runtimeSessionName,
    runtime_role: runtimeRole,
    runtime_tmux_target: runtimeTmuxTarget,
    runtime_binding_id: input.runtimeBindingId || input.runtime_binding_id || id,
    runtime_binding_status: input.runtimeBindingStatus || input.runtime_binding_status || null,
    assignment_id: assignmentId,
    session_mode: mode,
    runtime: input.runtime || "unspecified",
    return_dir: input.returnDir || input.return_dir || `.strata/returns/${assignmentId}/${id}`,
    evidence_dir: input.evidenceDir || input.evidence_dir || `.strata/evidence/sessions/${id}`,
    delegate_evidence_path: input.delegateEvidencePath || input.delegate_evidence_path || null,
    termination_policy: input.terminationPolicy || input.termination_policy || "explicit_only",
    loaded_context_epoch: Number.isFinite(loadedContextEpoch) ? loadedContextEpoch : 0,
    loaded_class_a_revision: Number.isFinite(loadedClassARevision) ? loadedClassARevision : state.class_a_revision,
    loaded_class_b_revision: Number.isFinite(loadedContextEpoch) ? loadedContextEpoch : 0,
    status,
    delivery_mode: "context_envelope_via_runtime_delegate_registry",
    registered_at: isoNow(),
  };
  sessions.push(session);
  const file = activeSessionsPath(root);
  writeText(file, `${JSON.stringify({ contract_id: "strata.class_c.active_sessions.v2_simplified_runtime", sessions, updated_at: isoNow() }, null, 2)}\n`);
  const telemetry = recordTelemetry(root, "session.register.completed", { result: "ok", assignment_id: assignmentId, target_id: id, role, session_mode: mode });
  const git = gitCommitContext(l.context, `session register ${assignmentId} ${id}`, { paths: [contextRel(root, file), contextRel(root, telemetry.path)] });
  return resultEnvelope("sctl.sessions.register.v1", true, { session, file, git }, [], [file, telemetry.path]);
}

export function releaseSession(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const id = safeSegment(input.id || input.agentId || input.agent_id || input.targetId || input.target_id);
  const releaseStatus = input.status || input.releaseStatus || input.release_status || "released";
  if (!SESSION_STATUSES.has(releaseStatus)) throw new Error(`session release status must be one of: ${Array.from(SESSION_STATUSES).join(", ")}`);
  const reason = input.reason || "session lifecycle logically closed; runtime session left alive for explicit cleanup";
  const sessions = readActiveSessions(root);
  const next = sessions.map((s) => (s.id === id && s.assignment_id === assignmentId ? {
    ...s,
    status: releaseStatus,
    released_at: isoNow(),
    release_reason: reason,
    termination_policy: s.termination_policy || "explicit_only",
    runtime_left_alive: true
  } : s));
  const file = activeSessionsPath(root);
  writeText(file, `${JSON.stringify({ contract_id: "strata.class_c.active_sessions.v3_runtime_registry", sessions: next, updated_at: isoNow() }, null, 2)}\n`);
  const lifecyclePath = writeText(path.join(l.sessionLifecycle, `${fileSlug(`${assignmentId}_${id}_${releaseStatus}_${timestamp()}`)}.json`), `${JSON.stringify({ contract_id: "strata.session_lifecycle_event.v2", event: releaseStatus, assignment_id: assignmentId, id, reason, runtime_left_alive: true, termination_policy: "explicit_only", created_at: isoNow() }, null, 2)}\n`);
  const telemetry = recordTelemetry(root, "session.release.completed", { result: "ok", assignment_id: assignmentId, target_id: id, status: releaseStatus, runtime_left_alive: true });
  const git = gitCommitContext(l.context, `session release ${assignmentId} ${id}`, { paths: [contextRel(root, file), contextRel(root, lifecyclePath), contextRel(root, telemetry.path)] });
  return resultEnvelope("sctl.sessions.release.v1", true, { id, assignment_id: assignmentId, status: releaseStatus, runtime_left_alive: true, file, lifecycle_path: lifecyclePath, git }, [], [file, lifecyclePath, telemetry.path]);
}

export function retireSession(root, input = {}) {
  return releaseSession(root, { ...input, status: input.status || input.releaseStatus || input.release_status || "released", reason: input.reason || "legacy retire command mapped to logical release; runtime session left alive" });
}

export function listSessions(root) {
  return resultEnvelope("sctl.sessions.list.v1", true, { sessions: readActiveSessions(root), file: activeSessionsPath(root) }, [], exists(activeSessionsPath(root)) ? [activeSessionsPath(root)] : []);
}

export function validateTeamMessageFile(root, input = {}) {
  const l = ensureLayout(root);
  const file = workspacePath(root, input.file || input.path || input.file_path);
  const errors = [];
  if (!file) errors.push("file is required");
  else {
    if (!isInsidePath(l.classCThreads, file)) errors.push("Class C team message path must be under .strata/context/C/threads");
    if (!exists(file)) errors.push("Class C team message file is missing");
    if (exists(file)) {
      const text = readText(file);
      const parsed = parseSimpleFrontmatter(text);
      const required = ["contract_id", "class", "message_id", "thread_id", "assignment_id", "from_role", "from_id", "to_role", "to_id", "message_kind", "status", "created_at"];
      if (!parsed.hasFrontmatter) errors.push("Class C team message requires frontmatter");
      for (const key of required) if (!parsed.attrs[key]) errors.push(`${key} is required`);
      if (parsed.attrs.contract_id && parsed.attrs.contract_id !== "strata.class_c.team_message.v1") errors.push("contract_id must be strata.class_c.team_message.v1");
      if (parsed.attrs.class && parsed.attrs.class !== "C") errors.push("class must be C");
      if (parsed.attrs.message_kind && !MESSAGE_KINDS.has(parsed.attrs.message_kind)) errors.push(`message_kind is outside allowed set: ${parsed.attrs.message_kind}`);
      if (!hasMarkdownHeading(parsed.body, "Message")) errors.push("section required: ## Message");
      if (!hasMarkdownHeading(parsed.body, "Requested Handling")) errors.push("section required: ## Requested Handling");
    }
  }
  return resultEnvelope("sctl.message.validate.v1", errors.length === 0, { file, sha256: file && exists(file) ? sha256File(file) : null }, errors, file && exists(file) ? [file] : []);
}

export function sendTeamMessage(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const threadId = safeSegment(input.threadId || input.thread_id || `THREAD_${assignmentId}`);
  const messageId = safeSegment(input.messageId || input.message_id || `TM_${assignmentId}_${timestamp()}`);
  const fromRole = input.fromRole || input.from_role;
  const fromId = safeSegment(input.fromId || input.from_id);
  const toRole = input.toRole || input.to_role;
  const toId = safeSegment(input.toId || input.to_id);
  const messageKind = input.messageKind || input.message_kind || "coordination_note";
  if (!fromRole || !toRole) throw new Error("from-role and to-role are required");
  if (!MESSAGE_KINDS.has(messageKind)) throw new Error(`message_kind is outside allowed set: ${messageKind}`);
  const relatedClassB = unique(input.relatedClassB || input.related_class_b || []).map((item) => path.relative(root, workspacePath(root, item)));
  const body = input.bodyFile ? readText(workspacePath(root, input.bodyFile)) : (input.body || "");
  const file = path.join(l.classCThreads, fileSlug(threadId), `${fileSlug(messageId)}.md`);
  const relatedLine = relatedClassB.join(",");
  const text = [
    "---",
    "contract_id: strata.class_c.team_message.v1",
    "class: C",
    `message_id: ${messageId}`,
    `thread_id: ${threadId}`,
    `assignment_id: ${assignmentId}`,
    `from_role: ${q(fromRole)}`,
    `from_id: ${q(fromId)}`,
    `to_role: ${q(toRole)}`,
    `to_id: ${q(toId)}`,
    `message_kind: ${messageKind}`,
    "status: open",
    "requires_response: true",
    relatedLine ? `related_class_b: ${relatedLine}` : "related_class_b: ",
    `created_at: ${isoNow()}`,
    "---",
    "",
    `# ${messageKind.replace(/_/g, " ")}`,
    "",
    "## Message",
    "",
    body || "Template message body.",
    "",
    "## Requested Handling",
    "",
    input.requestedHandling || "Use this as the task guide. Return a Worker Return Packet, and submit a Class B operational report only when there is durable progress to record.",
    "",
  ].join("\n");
  writeText(file, text);
  const validation = validateTeamMessageFile(root, { file });
  if (!validation.ok) return validation;
  const telemetry = recordTelemetry(root, "message.send.completed", { result: "ok", assignment_id: assignmentId, message_id: messageId, from_id: fromId, to_id: toId, message_kind: messageKind });
  const git = gitCommitContext(l.context, `team message ${assignmentId} ${messageKind} ${fromId} -> ${toId}`, { paths: [contextRel(root, file), contextRel(root, telemetry.path)] });
  return resultEnvelope("sctl.message.send.v1", true, { file, message_id: messageId, thread_id: threadId, assignment_id: assignmentId, related_class_b: relatedClassB, git }, [], [file, telemetry.path]);
}
