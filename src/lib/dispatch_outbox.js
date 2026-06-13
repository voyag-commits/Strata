import fs from "node:fs";
import path from "node:path";
import { gitCommitContext, readContextState } from "./context.js";
import { exportMarkdown } from "./export.js";
import { ensureLayout } from "./layout.js";
import { exists, fileSlug, isoNow, readText, resultEnvelope, safeSegment, sha256File, sha256Text, timestamp, unique, workspacePath, writeJson, writeText } from "./common.js";
import { recordTelemetry } from "./telemetry.js";

const DEFAULT_TARGET_ROLE = "Tech Lead / Coordination Owner";
const DEFAULT_FROM_ROLE = "Tooling / Dispatch Operator";

function targetRoleSegment(role) {
  return safeSegment(role).toUpperCase();
}

function rel(root, file) { return path.relative(root, file); }
function contextRel(root, file) { return path.relative(ensureLayout(root).context, file); }

function readOptionalWorkspaceFile(root, inputPath) {
  if (!inputPath) return null;
  const file = workspacePath(root, inputPath);
  if (!exists(file)) return null;
  return { path: rel(root, file), absolute_path: file, content: readText(file), sha256: sha256File(file) };
}

function inlineClassCMessage(input, targetRole, targetId, assignmentId) {
  const summary = input.summary || "SCTL dispatch";
  const requiredAction = input.requiredAction || input.required_action || "Use the team message as the task guide. Use the exported context below as the system picture.";
  return [
    "# Class C Team Message",
    "",
    `assignment_id: ${assignmentId}`,
    `to_role: ${targetRole}`,
    `to_id: ${targetId}`,
    "message_source: inline_dispatch_summary",
    "",
    "## Message",
    "",
    summary,
    "",
    "## Requested Handling",
    "",
    requiredAction,
    "",
  ].join("\n");
}

function runtimeInputSection(root, assignmentId, targetId, declaredFiles) {
  const returnDropDir = path.join(root, ".strata", "returns", assignmentId, safeSegment(targetId));
  const reportPath = `.strata/returns/${assignmentId}/${safeSegment(targetId)}/operational_report.md`;
  const lines = [
    "# Runtime Inputs And Return Contract",
    "",
    "Use these values as authoritative workflow inputs. If they conflict with the shell current working directory, these values win.",
    "",
    `sctl_workspace: ${root}`,
    `return_drop_dir: ${returnDropDir}`,
    `return_packet_path: ${path.join(returnDropDir, "packet.json")}`,
    `return_report_path: ${path.join(returnDropDir, "operational_report.md")}`,
    "",
    "## Declared Inputs",
    "",
  ];
  if (declaredFiles.length) {
    for (const item of declaredFiles) lines.push(`- ${item}`);
  } else {
    lines.push("- none");
  }
  lines.push(
    "",
    "If CODEBASE_REPO is declared, change to that exact repository path before inspecting or modifying implementation files.",
    "Do not infer the implementation repository from the terminal session current directory.",
    "",
    "## Worker Return Packet Requirements",
    "",
    "When work is complete, write a valid JSON Worker Return Packet at return_packet_path and an operational report at return_report_path.",
    "The packet must use this current SCTL schema:",
    "",
    "```json",
    JSON.stringify({
      contract_id: "worker_return_packet.v1",
      return_id: `ret_${assignmentId}_${safeSegment(targetId)}_001`,
      assignment_id: assignmentId,
      agent_id: safeSegment(targetId),
      role: "use assigned role",
      return_kind: "OPERATIONAL_REPORT_READY",
      status: "report_ready_not_class_b_intake",
      summary: "short outcome summary",
      nonce: "use dispatch nonce",
      report_scope: "actionable_report",
      implementation_repository: "CODEBASE_REPO value or null",
      implementation_commit: "implementation commit SHA or null",
      trunk_branch: "TRUNK_BRANCH value or null",
      short_lived_branch: "CHANGE_BRANCH value or null",
      integration_mode: "short_lived_change_branch",
      supersedes_entry_id: null,
      message_path: "Class C message path or null",
      question_path: null,
      report_path: reportPath,
      diagnostic_path: null,
      created_at: "ISO-8601 timestamp",
    }, null, 2),
    "```",
    "",
    "Do not use retired return contracts such as strata.class_c.worker_return_packet.v1.",
    "",
    "## Operational Report Requirements",
    "",
    "The operational report at return_report_path must be valid Class B-ready Markdown.",
    "It must start with YAML frontmatter containing:",
    "",
    "```yaml",
    "contract_id: strata.class_b.file.v1",
    "class: B",
    `id: B_${assignmentId}_${safeSegment(targetId).toUpperCase()}_READY`,
    "title: short report title",
    "scope: actionable_report",
    `assignment_id: ${assignmentId}`,
    `agent_id: ${safeSegment(targetId)}`,
    "role: use assigned role",
    "status: ready",
    "evidence: included",
    "loaded_context_epoch: 0",
    "created_at: ISO-8601 timestamp",
    "```",
    "",
    "It must include these non-empty Markdown sections:",
    "",
    "- ## Operational Summary",
    "- ## Progress Delta",
    "- ## Trunk Integration",
    "- ## Verification",
    "- ## Evidence",
    "- ## Risks / Blockers",
    "- ## Next Action",
    ""
  );
  return lines.join("\n");
}

export function renderDispatchPacket(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const nonce = safeSegment(input.nonce || `N_${timestamp()}`);
  const targetRole = input.targetRole || input.target_role || DEFAULT_TARGET_ROLE;
  const targetId = input.targetId || input.target_id || targetRoleSegment(targetRole).toLowerCase();
  const fromRole = input.fromRole || input.from_role || DEFAULT_FROM_ROLE;
  const fromId = input.fromId || input.from_id || "tooling_operator";
  const summary = input.summary || "SCTL dispatch";
  const dispatchKind = input.dispatchKind || input.dispatch_kind || "DETERMINISTIC_CLASS_C_CONTEXT";
  const relatedClassB = unique(input.relatedClassB || input.related_class_b || []).map((p) => rel(root, workspacePath(root, p)));
  const declaredFiles = unique(input.declaredFiles || input.declared_files || []);
  const messageSection = readOptionalWorkspaceFile(root, input.messageFile || input.message_file);
  const snapshotDir = input.snapshotDir || input.snapshot_dir || path.join(l.dispatchPackets, assignmentId, safeSegment(targetId), nonce);
  const contextExportDir = path.join(snapshotDir, "context_export");
  const sinceClassBRevision = input.sinceClassBRevision ?? input.since_class_b_revision;
  const contextExport = exportMarkdown(root, { out: contextExportDir, includeClasses: input.includeClasses || input.include_classes || "A,B", sinceClassBRevision });
  const contextMarkdown = readText(contextExport.result.markdown_path);
  const classCMarkdown = messageSection ? [
    "# Class C Team Message",
    "",
    `message_file: ${messageSection.path}`,
    `message_sha256: ${messageSection.sha256}`,
    "",
    messageSection.content.trim(),
    "",
  ].join("\n") : inlineClassCMessage(input, targetRole, targetId, assignmentId);
  const markdown = [
    "# SCTL Dispatch Envelope",
    "",
    "dispatch_format: deterministic_class_c_plus_context_export_v1",
    `assignment_id: ${assignmentId}`,
    `nonce: ${nonce}`,
    `from_role: ${fromRole}`,
    `from_id: ${fromId}`,
    `to_role: ${targetRole}`,
    `to_id: ${targetId}`,
    "delivery: paste-only; no chatbox inspection required",
    "empty_context_valid: true",
    "session_policy: disposable_by_default",
    "",
    runtimeInputSection(root, assignmentId, targetId, declaredFiles),
    "",
    classCMarkdown.trim(),
    "",
    "# Below is system level full context picture.",
    "",
    contextMarkdown.trim(),
    "",
  ].join("\n");
  const packet = {
    contract_id: "strata.dispatch.packet.v2_deterministic_context_export",
    dispatch_format: "deterministic_class_c_plus_context_export_v1",
    dispatch_kind: dispatchKind,
    assignment_id: assignmentId,
    nonce,
    from: { role: fromRole, id: fromId },
    to: { role: targetRole, id: targetId },
    summary,
    related_class_b: relatedClassB,
    declared_files: declaredFiles,
    class_c_message_path: messageSection?.path || null,
    context_export: {
      markdown_path: contextExport.result.markdown_path,
      source_index_path: contextExport.result.source_index_path,
      manifest_path: contextExport.result.manifest_path,
      source_count: contextExport.result.source_count,
      include_classes: contextExport.result.include_classes,
      since_class_b_revision: contextExport.result.since_class_b_revision,
      empty_context_valid: true,
    },
    runtime_delivery: "paste_only_deterministic_envelope_ready",
    dispatch_to_git_is_primary_evidence: true,
    chatbox_inspection_required: false,
    session_policy: "disposable_by_default",
    created_at: isoNow(),
  };
  packet.markdown_sha256 = sha256Text(markdown);
  packet.context_state = readContextState(root);
  return { packet, markdown, contextExport };
}

export function recordDispatch(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const nonce = safeSegment(input.nonce || `N_${timestamp()}`);
  const targetRole = input.targetRole || input.target_role || DEFAULT_TARGET_ROLE;
  const targetId = input.targetId || input.target_id || targetRoleSegment(targetRole).toLowerCase();
  const snapshotDir = path.join(l.dispatchPackets, assignmentId, safeSegment(targetId), nonce);
  const rendered = renderDispatchPacket(root, { ...input, assignmentId, nonce, targetRole, targetId, snapshotDir });

  const outboxDir = path.join(l.dispatchOutbox, assignmentId, safeSegment(targetId), nonce);
  const packetJsonPath = writeJson(path.join(outboxDir, "dispatch_packet.json"), rendered.packet);
  const packetMdPath = writeText(path.join(outboxDir, "dispatch_packet.md"), rendered.markdown);
  const manifestPath = writeJson(path.join(outboxDir, "manifest.json"), {
    contract_id: "strata.dispatch_outbox_manifest.v2_deterministic_context_export",
    assignment_id: assignmentId,
    nonce,
    target_role: targetRole,
    target_id: targetId,
    packet_json: packetJsonPath,
    packet_markdown: packetMdPath,
    context_git_snapshot_dir: snapshotDir,
    runtime_delivery: "paste_only_deterministic_envelope_ready",
    created_at: isoNow(),
  });

  const gitPacketJsonPath = writeJson(path.join(snapshotDir, "dispatch_packet.json"), rendered.packet);
  const gitPacketMdPath = writeText(path.join(snapshotDir, "dispatch_packet.md"), rendered.markdown);
  const gitManifestPath = writeJson(path.join(snapshotDir, "manifest.json"), {
    contract_id: "strata.dispatch_git_packet_snapshot.v1",
    assignment_id: assignmentId,
    nonce,
    target_role: targetRole,
    target_id: targetId,
    packet_json: gitPacketJsonPath,
    packet_markdown: gitPacketMdPath,
    outbox_manifest: manifestPath,
    context_export_manifest: rendered.contextExport.result.manifest_path,
    markdown_sha256: rendered.packet.markdown_sha256,
    created_at: isoNow(),
  });
  const logPath = writeJson(path.join(l.dispatchLog, `${fileSlug(`${assignmentId}_${nonce}_${targetId}`)}.json`), {
    contract_id: "strata.dispatch_log.v2_deterministic_context_export",
    packet: rendered.packet,
    outbox_manifest: manifestPath,
    git_packet_manifest: gitManifestPath,
    created_at: isoNow(),
  });
  const telemetry = recordTelemetry(root, "dispatch.record.completed", { result: "ok", assignment_id: assignmentId, nonce, target_id: targetId, dispatch_format: rendered.packet.dispatch_format, context_source_count: rendered.contextExport.result.source_count });
  const paths = [
    logPath,
    gitPacketJsonPath,
    gitPacketMdPath,
    gitManifestPath,
    rendered.contextExport.result.markdown_path,
    rendered.contextExport.result.source_index_path,
    rendered.contextExport.result.manifest_path,
    telemetry.path,
  ].map((p) => contextRel(root, p));
  const git = gitCommitContext(l.context, `dispatch record ${assignmentId} ${nonce}`, { paths });
  return resultEnvelope("sctl.dispatch.record.v2", true, { outbox: { dir: outboxDir, packetJsonPath, packetMdPath, manifestPath }, git_snapshot: { dir: snapshotDir, packetJsonPath: gitPacketJsonPath, packetMdPath: gitPacketMdPath, manifestPath: gitManifestPath }, dispatch_log_path: logPath, notice_count: 0, git, packet: rendered.packet }, [], [packetJsonPath, packetMdPath, manifestPath, gitPacketJsonPath, gitPacketMdPath, gitManifestPath, rendered.contextExport.result.markdown_path, rendered.contextExport.result.source_index_path, rendered.contextExport.result.manifest_path, logPath, telemetry.path]);
}

export function renderDispatchToFile(root, input = {}) {
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const nonce = safeSegment(input.nonce || `N_${timestamp()}`);
  const targetRole = input.targetRole || input.target_role || DEFAULT_TARGET_ROLE;
  const targetId = input.targetId || input.target_id || targetRoleSegment(targetRole).toLowerCase();
  const outDir = path.resolve(root, input.out || path.join(".strata", "dispatch_outbox", assignmentId, safeSegment(targetId), nonce, "render_only"));
  const rendered = renderDispatchPacket(root, { ...input, assignmentId, nonce, targetRole, targetId, snapshotDir: path.join(outDir, "context_snapshot") });
  const packetJsonPath = writeJson(path.join(outDir, "dispatch_packet.json"), rendered.packet);
  const packetMdPath = writeText(path.join(outDir, "dispatch_packet.md"), rendered.markdown);
  return resultEnvelope("sctl.dispatch.render.v2", true, { packetJsonPath, packetMdPath, packet: rendered.packet }, [], [packetJsonPath, packetMdPath, rendered.contextExport.result.markdown_path, rendered.contextExport.result.source_index_path, rendered.contextExport.result.manifest_path]);
}

export function recordErrorDispatch(root, input = {}) {
  return recordDispatch(root, {
    dispatchKind: "ERROR_LOG",
    assignmentId: input.assignmentId || input.assignment_id || "UNKNOWN_ASSIGNMENT",
    nonce: input.nonce || `ERR_${timestamp()}`,
    fromRole: "Tooling / Dispatch Operator",
    fromId: "sctl_backend",
    targetRole: input.targetRole || input.target_role || input.role || "Sender Session",
    targetId: input.targetId || input.target_id || input.agentId || input.agent_id || "sender_session",
    summary: input.summary || "SCTL validation failed; see diagnostic details in this dispatch packet.",
    requiredAction: input.requiredAction || input.required_action || "Review the validation errors, revise the submitted artifact, and resubmit through SCTL.",
    declaredFiles: input.declaredFiles || input.declared_files || [],
  });
}

export function renderDeltaNotice(input) {
  const notice = {
    contract_id: "strata.dispatch.delta_notice.v1_retired_compatibility",
    assignment_id: input.assignmentId || input.assignment_id,
    nonce: input.nonce,
    target_role: input.targetRole || input.target_role || DEFAULT_TARGET_ROLE,
    retired_by: "deterministic_class_c_plus_context_export_v1",
  };
  if (!notice.assignment_id) throw new Error("assignment_id required");
  if (!notice.nonce) throw new Error("nonce required");
  const text = [
    "STRATA DELTA NOTICE RETIRED",
    "SCTL now dispatches a deterministic Class C team message plus context.export_markdown output.",
    `assignment_id: ${notice.assignment_id}`,
    `nonce: ${notice.nonce}`,
    `target_role: ${notice.target_role}`,
  ].join("\n");
  return { notice, text };
}
