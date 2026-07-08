import path from "node:path";
import fs from "node:fs";
import { ensureLayout } from "./layout.js";
import { exists, fileSlug, isoNow, readJson, resultEnvelope, sha256File, timestamp, workspacePath, writeJson, isInsidePath } from "./common.js";
import { validateOperationalReportFile } from "./reports.js";
import { recordErrorDispatch } from "./dispatch_outbox.js";
import { recordTelemetry } from "./telemetry.js";
import { gitCommitContext } from "./context.js";

const KINDS = new Set(["ACK", "QUESTION", "OPERATIONAL_REPORT_READY", "BLOCKED", "FAILED_WITH_DIAGNOSTIC", "NEEDS_CLARIFICATION", "PARTIAL_STATUS"]);
const INVALID_ROUTINGS = new Set(["INVALID_RETURN_PACKET_TO_CLASSD", "OPERATIONAL_REPORT_READY_INVALID_TO_CLASSD", "FAILED_WITH_DIAGNOSTIC_INVALID_TO_CLASSD"]);

function firstString(...values) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value;
  return null;
}
function nativeImplementationRepository(packet) { return firstString(packet.implementation_repository, packet.implementation_repo); }
function nativeTrunkBranch(packet) { return firstString(packet.trunk_branch, packet.trunk_ref); }
function nativeShortLivedBranch(packet) { return firstString(packet.short_lived_branch, packet.implementation_branch); }
function contextRel(root, file) { return path.relative(ensureLayout(root).context, file); }
function appendJsonl(file, obj) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, "utf8"); return file; }

export function validateWorkerReturnPacket(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { packet: null, errors: ["packet must be a JSON object"] };
  const req = ["contract_id", "return_id", "assignment_id", "agent_id", "role", "return_kind", "status", "summary", "nonce", "created_at"];
  for (const key of req) if (typeof raw[key] !== "string" || !raw[key].trim()) errors.push(`${key} must be a non-empty string`);
  if (raw.contract_id && raw.contract_id !== "worker_return_packet.v1") errors.push("contract_id must be worker_return_packet.v1");
  if (raw.return_kind && !KINDS.has(raw.return_kind)) errors.push(`return_kind is retired or outside allowed set: ${raw.return_kind}`);
  for (const key of ["message_path", "question_path", "report_path", "diagnostic_path", "implementation_repository", "implementation_repo", "implementation_commit", "trunk_branch", "trunk_ref", "short_lived_branch", "implementation_branch", "supersedes_entry_id"]) {
    if (raw[key] !== undefined && raw[key] !== null && typeof raw[key] !== "string") errors.push(`${key} must be string or null`);
  }
  if (raw.evidence_path !== undefined && raw.evidence_path !== null) errors.push("evidence_path is retired; include evidence inside the operational report or Class B report");
  if (raw.integration_mode !== undefined && raw.integration_mode !== null && !["direct_to_trunk", "short_lived_change_branch"].includes(raw.integration_mode)) errors.push("integration_mode must be direct_to_trunk, short_lived_change_branch, or null");
  if (raw.report_scope !== undefined && raw.report_scope !== null && typeof raw.report_scope !== "string") errors.push("report_scope must be string or null");
  if (raw.class_b_intake !== undefined) errors.push("class_b_intake is retired; Class B changes are Git file commits");
  if (raw.return_kind === "QUESTION" && !raw.question_path && !raw.message_path) errors.push("QUESTION requires question_path or message_path");
  if (raw.return_kind === "OPERATIONAL_REPORT_READY" && !raw.report_path) errors.push("OPERATIONAL_REPORT_READY requires report_path");
  if (raw.return_kind === "FAILED_WITH_DIAGNOSTIC" && !raw.diagnostic_path) errors.push("FAILED_WITH_DIAGNOSTIC requires diagnostic_path");
  if (errors.length) return { packet: null, errors };
  return { packet: { ...raw }, errors: [] };
}

function writeClassDDiagnostic(root, packetPath, reason, packet, errors) {
  const l = ensureLayout(root);
  const id = `worker_return_diagnostic_${timestamp()}`;
  const p = path.join(l.returnDiagnostics, `${fileSlug(id)}.json`);
  writeJson(p, { contract_id: "strata.worker_return_diagnostic.v2_context_git", packet_path: packetPath, packet_sha256: packetPath && exists(packetPath) ? sha256File(packetPath) : null, reason, return_id: packet?.return_id || null, assignment_id: packet?.assignment_id || null, agent_id: packet?.agent_id || null, return_kind: packet?.return_kind || null, errors, created_at: isoNow() });
  return p;
}

function writeCoordinationThread(root, packet, packetPath) {
  const l = ensureLayout(root);
  const id = `${packet.assignment_id}_${packet.agent_id}_${packet.return_kind}`;
  const p = path.join(l.coordinationTrace, `${fileSlug(id)}.json`);
  writeJson(p, { contract_id: "strata.coordination_thread.v2_context_git", assignment_id: packet.assignment_id, agent_id: packet.agent_id, role: packet.role, state: packet.return_kind, latest_return_id: packet.return_id, latest_packet_path: packetPath, summary: packet.summary, requires_coordination_owner: true, updated_at: isoNow() });
  return p;
}

function resolvePacketFile(root, file) {
  if (!file) return null;
  return workspacePath(root, file);
}

export function classifyWorkerReturnPacket(root, packetPathInput) {
  const l0 = ensureLayout(root);
  let packetPath = null;
  let raw = null;
  let readErrors = [];
  try {
    packetPath = workspacePath(root, packetPathInput);
    if (!isInsidePath(l0.returns, packetPath)) throw new Error("Worker Return Packet must be under .strata/returns");
    raw = readJson(packetPath);
  } catch (error) { readErrors = [`failed to read JSON packet: ${error instanceof Error ? error.message : String(error)}`]; }
  const validation = readErrors.length ? { packet: null, errors: readErrors } : validateWorkerReturnPacket(raw);
  const packet = validation.packet;
  let routing = "INVALID_RETURN_PACKET_TO_CLASSD";
  let classDPath = null;
  let coordinationThreadPath = null;
  let ackPath = null;
  let reportLedgerPath = null;
  let reportPath = null;
  let errorDispatch = null;

  if (!packet) {
    classDPath = writeClassDDiagnostic(root, packetPath, "invalid Worker Return Packet", raw, validation.errors);
    errorDispatch = recordErrorDispatch(root, { assignmentId: raw?.assignment_id || "UNKNOWN_ASSIGNMENT", targetRole: raw?.role || "Sender Session", targetId: raw?.agent_id || "sender_session", summary: "Worker return packet validation failed.", declaredFiles: packetPath ? [path.relative(root, packetPath)] : [] });
  } else if (packet.return_kind === "OPERATIONAL_REPORT_READY") {
    try { reportPath = resolvePacketFile(root, packet.report_path); }
    catch (error) {
      classDPath = writeClassDDiagnostic(root, packetPath, "OPERATIONAL_REPORT_READY report_path outside workspace", packet, [error instanceof Error ? error.message : String(error)]);
      routing = "OPERATIONAL_REPORT_READY_INVALID_TO_CLASSD";
    }
    if (routing !== "OPERATIONAL_REPORT_READY_INVALID_TO_CLASSD") {
      const reportValidation = reportPath ? validateOperationalReportFile(root, { file: reportPath, requireNonEmptySections: true, requireFrontmatter: true }) : { ok: false, errors: ["report_path missing"] };
      if (!reportPath || !exists(reportPath) || !reportValidation.ok) {
        const errs = !reportPath || !exists(reportPath) ? [`report_path not found: ${packet.report_path}`] : reportValidation.errors;
        classDPath = writeClassDDiagnostic(root, packetPath, "OPERATIONAL_REPORT_READY report validation failed", packet, errs);
        routing = "OPERATIONAL_REPORT_READY_INVALID_TO_CLASSD";
        errorDispatch = recordErrorDispatch(root, { assignmentId: packet.assignment_id, targetRole: packet.role, targetId: packet.agent_id, summary: "Operational report validation failed.", declaredFiles: [(packetPath ? path.relative(root, packetPath) : "missing_packet"), packet.report_path] });
      } else {
        const l = ensureLayout(root);
        reportLedgerPath = path.join(l.returnLedgers, "operational_report_ready_index.jsonl");
        appendJsonl(reportLedgerPath, { contract_id: "strata.operational_report_ready.v2_context_git", nonce: packet.nonce, return_id: packet.return_id, assignment_id: packet.assignment_id, agent_id: packet.agent_id, report_path: reportPath, report_sha256: sha256File(reportPath), packet_path: packetPath, implementation_repository: nativeImplementationRepository(packet), implementation_commit: packet.implementation_commit || null, trunk_branch: nativeTrunkBranch(packet), short_lived_branch: nativeShortLivedBranch(packet), integration_mode: packet.integration_mode || null, created_at: isoNow() });
        routing = "OPERATIONAL_REPORT_READY_LEDGERED_NOT_CLASS_B";
      }
    }
  } else if (packet.return_kind === "ACK") {
    const l = ensureLayout(root);
    ackPath = path.join(l.returnLedgers, "dispatch_ack_index.jsonl");
    appendJsonl(ackPath, { contract_id: "strata.dispatch_ack.v2_context_git", nonce: packet.nonce, return_id: packet.return_id, assignment_id: packet.assignment_id, agent_id: packet.agent_id, packet_path: packetPath, created_at: isoNow() });
    routing = "ACK_LEDGERED";
  } else {
    coordinationThreadPath = writeCoordinationThread(root, packet, packetPath);
    if (packet.return_kind === "FAILED_WITH_DIAGNOSTIC") {
      let diagnosticPath = null;
      try { diagnosticPath = resolvePacketFile(root, packet.diagnostic_path); }
      catch (error) {
        classDPath = writeClassDDiagnostic(root, packetPath, "FAILED_WITH_DIAGNOSTIC diagnostic_path outside workspace", packet, [error instanceof Error ? error.message : String(error)]);
        routing = "FAILED_WITH_DIAGNOSTIC_INVALID_TO_CLASSD";
      }
      if (routing !== "FAILED_WITH_DIAGNOSTIC_INVALID_TO_CLASSD") {
        if (!diagnosticPath || !exists(diagnosticPath)) {
          classDPath = writeClassDDiagnostic(root, packetPath, "FAILED_WITH_DIAGNOSTIC diagnostic_path missing", packet, [`diagnostic_path not found: ${packet.diagnostic_path}`]);
          routing = "FAILED_WITH_DIAGNOSTIC_INVALID_TO_CLASSD";
        } else {
          classDPath = writeClassDDiagnostic(root, packetPath, "role failed with diagnostic", packet, []);
          routing = "ROUTED_TO_COORDINATION_THREAD";
        }
      }
    }
    if (routing !== "FAILED_WITH_DIAGNOSTIC_INVALID_TO_CLASSD") routing = "ROUTED_TO_COORDINATION_THREAD";
  }

  const l = ensureLayout(root);
  const classificationId = `wret_class_${fileSlug(path.basename(packetPath || "packet"))}_${timestamp()}`;
  const classificationPath = path.join(l.returnLedgers, `${classificationId}.json`);
  const classification = {
    contract_id: "strata.worker_return_classification.v6_context_git",
    classification_id: classificationId,
    packet_path: packetPath,
    packet_sha256: packetPath && exists(packetPath) ? sha256File(packetPath) : null,
    valid_packet: Boolean(packet),
    errors: validation.errors,
    return_id: packet?.return_id || null,
    assignment_id: packet?.assignment_id || raw?.assignment_id || null,
    agent_id: packet?.agent_id || raw?.agent_id || null,
    role: packet?.role || raw?.role || null,
    return_kind: packet?.return_kind || raw?.return_kind || null,
    report_scope: packet?.report_scope || null,
    class_b_authority: "git_tracked_files_only",
    evidence_model: "evidence_in_report_body",
    implementation_repository: packet ? nativeImplementationRepository(packet) : null,
    implementation_commit: packet?.implementation_commit || null,
    trunk_branch: packet ? nativeTrunkBranch(packet) : null,
    short_lived_branch: packet ? nativeShortLivedBranch(packet) : null,
    integration_mode: packet?.integration_mode || null,
    routing_decision: routing,
    class_b_entry_path: null,
    class_b_record_path: null,
    class_d_diagnostic_path: classDPath,
    coordination_thread_path: coordinationThreadPath,
    ack_path: ackPath,
    report_ledger_path: reportLedgerPath,
    report_path: reportPath,
    error_dispatch: errorDispatch?.result || null,
    created_at: isoNow(),
  };
  writeJson(classificationPath, classification);
  const telemetry = recordTelemetry(root, "return.classify.completed", { result: INVALID_ROUTINGS.has(routing) ? "failed" : "ok", routing_decision: routing, assignment_id: classification.assignment_id, return_kind: classification.return_kind });
  const commitPaths = [classificationPath, telemetry.path, classDPath, coordinationThreadPath, ackPath, reportLedgerPath].filter(Boolean).map((p) => contextRel(root, p));
  gitCommitContext(l.context, `return classify ${classification.assignment_id || "unknown"} ${classification.return_kind || "invalid"}`, { paths: commitPaths });
  const ok = !INVALID_ROUTINGS.has(routing);
  return resultEnvelope("sctl.returns.classify.v1", ok, { classification, classification_record_path: classificationPath }, validation.errors, [classificationPath, ...(classDPath ? [classDPath] : []), ...(coordinationThreadPath ? [coordinationThreadPath] : []), ...(ackPath ? [ackPath] : []), ...(reportLedgerPath ? [reportLedgerPath] : []), ...(errorDispatch ? errorDispatch.evidence_paths : []), telemetry.path]);
}
