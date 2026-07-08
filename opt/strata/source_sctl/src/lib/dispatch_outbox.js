import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLASS_B_LATEST_DISPATCH_COUNT, gitCommitContext, readContextState } from "./context.js";
import { exportMarkdown } from "./export.js";
import { ensureLayout } from "./layout.js";
import { exists, fileSlug, isInsidePath, isoNow, readJson, readText, resultEnvelope, safeSegment, sha256File, sha256Text, timestamp, unique, workspacePath, writeJson, writeText } from "./common.js";
import { recordTelemetry } from "./telemetry.js";

const DEFAULT_TARGET_ROLE = "Tech Lead / Coordination Owner";
const DEFAULT_FROM_ROLE = "Tooling / Dispatch Operator";
export const DISPATCH_FORMAT = "sctl.context_dispatch_envelope.v1";
export const PACKET_CONTRACT_ID = "strata.dispatch.packet.v3_context_envelope";
export const INITIAL_ENVELOPE_TYPE = "initial_task_coordination";
export const SCTL_ENVELOPE_TYPE = "sctl_dispatch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_DISPATCH_ENVELOPE_TEMPLATE = "templates/dispatch/deterministic_dispatch_envelope.template.md";

const ROLE_HEADERS = {
  change_author: "The coordinator assigned the following tasks via team internal envelope. Follow and perform the tasks accordingly.",
  reviewer: "A codebase change has been made by Change Author. The task definitions, overall architecture, and task progress can be reviewed in the context picture. Review the most recent code changes, make merge/deny decision, and submit your work via assigned path.",
  coordinator: "The Change Author and Code Reviewer have performed one cycle, and the progress is reflected in the context picture. Review the Director's architecture assignments, project goals, and current progress together. Raise a new task order to a Change Author by submitting your work via assigned path.",
  initial_coordinator: "The director has assigned the task definition and authoritative goals, decisions via context picture. Your role is to analyze the problem and review the environment, then author a fresh Coordinator Work Order (a Class B Markdown document) that breaks the director intent into bounded change items for the Change Author. Do NOT implement code changes yourself. You will assign the role to the change author in our team by dropping the task order via submission path.",
  generic: "Use the context picture and submission template below as the complete SCTL dispatch input. Perform only the assigned role's work and submit through the assigned path."
};

const DEFAULT_TEMPLATE_PATHS = {
  change_author: [
    "templates/packets/worker_return_packet.operational_report_ready.template.json",
    "templates/reports/operational_report.template.md"
  ],
  reviewer: [
    "templates/packets/worker_return_packet.operational_report_ready.template.json",
    "templates/reports/review_outcome.template.md"
  ],
  coordinator: [
    "templates/work_products/coordinator_work_order.template.md"
  ],
  initial_coordinator: [
    "templates/work_products/coordinator_work_order.template.md"
  ],
  generic: [
    "templates/packets/worker_return_packet.operational_report_ready.template.json",
    "templates/reports/operational_report.template.md"
  ]
};

function targetRoleSegment(role) {
  return safeSegment(role).toUpperCase();
}

function rel(root, file) { return path.relative(root, file); }
function contextRel(root, file) { return path.relative(ensureLayout(root).context, file); }

function roleKey(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("change author") || normalized === "author") return "change_author";
  if (normalized.includes("review") || normalized.includes("qc")) return "reviewer";
  if (normalized.includes("coord") || normalized.includes("tech lead")) return "coordinator";
  return "generic";
}

function normalizeEnvelopeType(input, targetRole) {
  const raw = String(input.envelopeType || input.envelope_type || "").toLowerCase();
  const trigger = String(input.trigger || input.dispatchKind || input.dispatch_kind || "").toUpperCase();
  if (["initial", "initial_task_coordination", "director", "director_communication"].includes(raw)) return INITIAL_ENVELOPE_TYPE;
  if (trigger.includes("DIRECTOR_ENTRY_CONTEXT_COMMIT") || trigger.includes("CLASS_A_CONTEXT_COMMIT")) return INITIAL_ENVELOPE_TYPE;
  if (input.initialCoordinator === true || input.initial_coordinator === true) return INITIAL_ENVELOPE_TYPE;
  if (roleKey(targetRole) === "coordinator" && String(input.sourceContextClass || input.source_context_class || "").toUpperCase() === "A") return INITIAL_ENVELOPE_TYPE;
  return SCTL_ENVELOPE_TYPE;
}

function titleForEnvelope(envelopeType) {
  return envelopeType === INITIAL_ENVELOPE_TYPE ? "# Initial task coordination envelope" : "# SCTL Dispatch Envelope";
}

function headerFor(envelopeType, targetRole) {
  if (envelopeType === INITIAL_ENVELOPE_TYPE) return ROLE_HEADERS.initial_coordinator;
  return ROLE_HEADERS[roleKey(targetRole)] || ROLE_HEADERS.generic;
}

function safeReadWorkspacePath(root, inputPath) {
  if (!inputPath) return null;
  const file = workspacePath(root, inputPath);
  if (!exists(file)) return null;
  return { path: rel(root, file), absolute_path: file, content: readText(file), sha256: sha256File(file) };
}

function resolveTemplateFile(root, rawPath) {
  const requested = String(rawPath || "").trim();
  if (!requested) return null;
  const candidates = [];
  if (path.isAbsolute(requested)) candidates.push(requested);
  else {
    candidates.push(path.resolve(root, requested));
    candidates.push(path.resolve(PACKAGE_ROOT, requested));
  }
  for (const candidate of candidates) {
    if (exists(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`template not found: ${requested}`);
}

function dispatchEnvelopeTemplate(root, input = {}) {
  const raw = input.dispatchEnvelopeTemplate || input.dispatch_envelope_template || input.envelopeTemplate || input.envelope_template || DEFAULT_DISPATCH_ENVELOPE_TEMPLATE;
  const file = resolveTemplateFile(root, raw);
  const packageDispatchDir = path.join(PACKAGE_ROOT, "templates", "dispatch");
  if (!isInsidePath(packageDispatchDir, file)) throw new Error("dispatch envelope template must be under package templates/dispatch");
  return { path: raw, absolute_path: file, sha256: sha256File(file), text: readText(file) };
}

function renderDispatchEnvelope(root, input, values) {
  const template = dispatchEnvelopeTemplate(root, input);
  const markdown = replaceTemplateTokens(template.text, values);
  return { markdown: markdown.endsWith("\n") ? markdown : `${markdown}\n`, template };
}

function explicitTemplatePaths(input) {
  const values = [];
  for (const key of ["templatePath", "template_path", "templatePaths", "template_paths", "submissionTemplate", "submission_template", "submissionTemplates", "submission_templates"]) {
    const raw = input[key];
    if (!raw) continue;
    const arr = Array.isArray(raw) ? raw : String(raw).split(",");
    for (const item of arr) {
      const trimmed = String(item).trim();
      if (trimmed) values.push(trimmed);
    }
  }
  return unique(values);
}

function defaultTemplatePaths(envelopeType, targetRole) {
  if (envelopeType === INITIAL_ENVELOPE_TYPE) return DEFAULT_TEMPLATE_PATHS.initial_coordinator;
  return DEFAULT_TEMPLATE_PATHS[roleKey(targetRole)] || DEFAULT_TEMPLATE_PATHS.generic;
}

function templateLanguage(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  if (ext === ".yml" || ext === ".yaml") return "yaml";
  return "text";
}

function replaceTemplateTokens(text, values) {
  let out = text;
  for (const [key, value] of Object.entries(values)) {
    const safeValue = value === undefined || value === null || value === "" ? `<${key}>` : String(value);
    out = out.split(`<${key}>`).join(safeValue);
  }
  return out;
}

function renderSubmissionTemplates(root, input, envelopeType, targetRole, targetId, assignmentId, nonce) {
  const templatePaths = explicitTemplatePaths(input);
  const selected = templatePaths.length ? templatePaths : defaultTemplatePaths(envelopeType, targetRole);
  const safeTargetId = safeSegment(targetId);
  const cycleId = safeSegment(input.cycleId || input.cycle_id || "C01");
  const workOrderId = safeSegment(input.workOrderId || input.work_order_id || `${assignmentId}_${cycleId}_COORDINATOR_WORK_ORDER`);
  const defaultSubmissionPath = roleKey(targetRole) === "coordinator"
    ? `.strata/returns/${assignmentId}/${safeTargetId}/coordinator_work_order.md`
    : `.strata/returns/${assignmentId}/${safeTargetId}`;
  const submissionPath = input.submissionPath || input.submission_path || input.returnPath || input.return_path || defaultSubmissionPath;
  const values = {
    assignment_id: assignmentId,
    assignment: assignmentId,
    nonce,
    dispatch_nonce: nonce,
    target_id: targetId,
    target_role: targetRole,
    role: targetRole,
    role_id: safeTargetId,
    role_instance_id: safeTargetId,
    agent_id: safeTargetId,
    reviewer_id: safeTargetId,
    coordinator_id: safeTargetId,
    short_name: safeSegment(input.shortName || input.short_name || targetId || targetRole),
    cycle_id: cycleId,
    work_order_id: workOrderId,
    submission_path: submissionPath,
    return_path: submissionPath,
    codebase_repo: input.codebaseRepo || input.codebase_repo || "<codebase_repo>",
    trunk_branch: input.trunkBranch || input.trunk_branch || input.baseBranch || input.base_branch || "main",
    change_branch: input.changeBranch || input.change_branch || input.assignedBranch || input.assigned_branch || "<assigned_branch>",
    director_entry_document_path: input.directorEntryDocumentPath || input.director_entry_document_path || "<director_entry_document_path>",
    director_entry_document_sha256: input.directorEntryDocumentSha256 || input.director_entry_document_sha256 || "<director_entry_document_sha256>",
    ISO: "<ISO-8601>",
    timestamp: "<timestamp>",
    current_class_b_revision_when_worker_loaded_context: "<current_class_b_revision_when_worker_loaded_context>",
    current_class_b_revision_when_reviewer_loaded_context: "<current_class_b_revision_when_reviewer_loaded_context>"
  };
  const rendered = [];
  const metadata = [];
  for (const raw of selected) {
    const file = resolveTemplateFile(root, raw);
    const rawText = readText(file).trim();
    const text = replaceTemplateTokens(rawText, values).trim();
    const displayPath = path.isAbsolute(raw) ? raw : raw;
    metadata.push({ path: displayPath, absolute_path: file, sha256: sha256File(file) });
    rendered.push([
      `## Template: ${displayPath}`,
      "",
      `\`\`\`${templateLanguage(file)}`,
      text,
      "```",
      ""
    ].join("\n"));
  }
  return { metadata, markdown: rendered.join("\n").trim() };
}

export function renderDispatchPacket(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const nonce = safeSegment(input.nonce || `N_${timestamp()}`);
  const targetRole = input.targetRole || input.target_role || DEFAULT_TARGET_ROLE;
  const targetId = input.targetId || input.target_id || targetRoleSegment(targetRole).toLowerCase();
  const fromRole = input.fromRole || input.from_role || DEFAULT_FROM_ROLE;
  const fromId = input.fromId || input.from_id || "sctl_backend";
  const dispatchKind = input.dispatchKind || input.dispatch_kind || input.trigger || "SCTL_CONTEXT_COMMIT";
  const envelopeType = normalizeEnvelopeType(input, targetRole);
  const title = titleForEnvelope(envelopeType);
  const header = headerFor(envelopeType, targetRole);
  const relatedClassB = unique(input.relatedClassB || input.related_class_b || []).map((p) => rel(root, workspacePath(root, p)));
  const declaredFiles = unique(input.declaredFiles || input.declared_files || []);
  const messageSection = safeReadWorkspacePath(root, input.messageFile || input.message_file);
  const snapshotDir = input.snapshotDir || input.snapshot_dir || path.join(l.dispatchPackets, assignmentId, safeSegment(targetId), nonce);
  const contextExportDir = path.join(snapshotDir, "context_export");
  const sinceClassBRevision = input.sinceClassBRevision ?? input.since_class_b_revision;
  const classBLatest = input.classBLatest ?? input.class_b_latest ?? input.latestClassB ?? input.latest_class_b ?? input.latestClassBCount ?? input.latest_class_b_count ?? ((sinceClassBRevision === undefined || sinceClassBRevision === null || sinceClassBRevision === "") ? CLASS_B_LATEST_DISPATCH_COUNT : null);
  const contextExport = exportMarkdown(root, { out: contextExportDir, includeClasses: input.includeClasses || input.include_classes || "A,B", sinceClassBRevision, classBLatest });
  const contextMarkdown = readText(contextExport.result.markdown_path).trim();
  const submission = renderSubmissionTemplates(root, input, envelopeType, targetRole, targetId, assignmentId, nonce);

  const envelope = renderDispatchEnvelope(root, input, {
    fixed_header: header,
    assignment_id: assignmentId,
    context_export: contextMarkdown,
    submission_template: submission.markdown
  });
  const markdown = envelope.markdown;

  const markdownSha256 = sha256Text(markdown);
  const packet = {
    contract_id: PACKET_CONTRACT_ID,
    dispatch_format: DISPATCH_FORMAT,
    envelope_type: envelopeType,
    envelope_title: title,
    dispatch_kind: dispatchKind,
    assignment_id: assignmentId,
    nonce,
    from: { role: fromRole, id: fromId },
    to: { role: targetRole, id: targetId, session: input.targetSession || input.target_session || null },
    fixed_header: header,
    dispatch_envelope_template: { path: envelope.template.path, absolute_path: envelope.template.absolute_path, sha256: envelope.template.sha256 },
    pasted_body_metadata_policy: "assignment_id_only",
    source_context: {
      trigger: input.trigger || dispatchKind,
      class: input.sourceContextClass || input.source_context_class || null,
      path: input.sourceContextPath || input.source_context_path || null,
      sha256: input.sourceContextSha256 || input.source_context_sha256 || null,
      git_commit: input.sourceContextGitCommit || input.source_context_git_commit || null
    },
    related_class_b: relatedClassB,
    declared_files: declaredFiles,
    class_c_message_path: messageSection?.path || null,
    class_c_message_sha256: messageSection?.sha256 || null,
    submission_templates: submission.metadata,
    context_export: {
      markdown_path: contextExport.result.markdown_path,
      source_index_path: contextExport.result.source_index_path,
      manifest_path: contextExport.result.manifest_path,
      source_count: contextExport.result.source_count,
      include_classes: contextExport.result.include_classes,
      since_class_b_revision: contextExport.result.since_class_b_revision,
      class_b_latest: contextExport.result.class_b_latest,
      class_b_filter: contextExport.result.class_b_filter,
      class_b_context_policy: contextExport.result.class_b_latest === null ? "full" : `latest_${contextExport.result.class_b_latest}`,
      empty_context_valid: true
    },
    runtime_delivery: "delegate_dispatch_deliver_contract",
    dispatch_delivery_owner: "runtime_delegate_contract",
    dispatch_to_git_is_primary_evidence: false,
    runtime_operational_log_is_primary_delivery_evidence: true,
    chatbox_inspection_required: false,
    session_policy: "persistent_registry_explicit_release_no_auto_kill",
    created_at: isoNow(),
    markdown_sha256: markdownSha256,
    injection_result: input.injectionResult || input.injection_result || null,
    context_state: readContextState(root)
  };
  return { packet, markdown, contextExport };
}

function parseInjectionResult(root, input = {}) {
  if (input.injectionResult || input.injection_result) return input.injectionResult || input.injection_result;
  if (input.resultJson || input.result_json || input.injectionResultJson || input.injection_result_json) {
    return JSON.parse(input.resultJson || input.result_json || input.injectionResultJson || input.injection_result_json);
  }
  const file = input.resultFile || input.result_file || input.injectionResultFile || input.injection_result_file;
  if (file) return readJson(workspacePath(root, file));
  throw new Error("injection result is required via --result-file or --result-json");
}

export function recordInjectionResult(root, input = {}) {
  const l = ensureLayout(root);
  const logPath = workspacePath(root, input.dispatchLog || input.dispatch_log || input.log || input.file);
  if (!logPath) throw new Error("dispatch log path is required");
  if (!isInsidePath(l.dispatchLog, logPath)) throw new Error("dispatch log must be under .strata/context/D_trace/dispatch_log");
  if (!exists(logPath)) throw new Error(`dispatch log not found: ${logPath}`);
  const rawResult = parseInjectionResult(root, input);
  const injectionResult = {
    contract_id: "strata.runtime_delegate.injection_result.v1",
    recorded_at: isoNow(),
    ...rawResult
  };
  const log = readJson(logPath);
  log.metadata = { ...(log.metadata || {}), injection_result: injectionResult };
  log.injection_result = injectionResult;
  log.updated_at = isoNow();
  writeJson(logPath, log);
  const telemetry = recordTelemetry(root, "dispatch.injection_result.recorded", {
    result: injectionResult.ok === false ? "error" : "ok",
    assignment_id: log.metadata?.assignment_id || null,
    nonce: log.metadata?.nonce || null,
    target_id: log.metadata?.to?.id || null,
    runtime: injectionResult.runtime || null
  });
  const paths = [logPath, telemetry.path].map((p) => contextRel(root, p));
  const git = gitCommitContext(l.context, `dispatch injection result ${log.metadata?.assignment_id || "UNKNOWN"} ${log.metadata?.nonce || "UNKNOWN"}`, { paths });
  return resultEnvelope("sctl.dispatch.record_injection.v1", true, { dispatch_log_path: logPath, injection_result: injectionResult, git }, [], [logPath, telemetry.path]);
}

export function recordDispatch(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const nonce = safeSegment(input.nonce || `N_${timestamp()}`);
  const targetRole = input.targetRole || input.target_role || DEFAULT_TARGET_ROLE;
  const targetId = input.targetId || input.target_id || targetRoleSegment(targetRole).toLowerCase();
  const snapshotDir = path.join(l.dispatchPackets, assignmentId, safeSegment(targetId), nonce);
  if (!isInsidePath(l.dispatchPackets, snapshotDir)) throw new Error("dispatch packet snapshot path escaped D_trace/dispatch_packets");
  const rendered = renderDispatchPacket(root, { ...input, assignmentId, nonce, targetRole, targetId, snapshotDir });

  const outboxDir = path.join(l.dispatchOutbox, assignmentId, safeSegment(targetId), nonce);
  if (!isInsidePath(l.dispatchOutbox, outboxDir)) throw new Error("dispatch outbox path escaped .strata/dispatch_outbox");
  const packetJsonPath = writeJson(path.join(outboxDir, "dispatch_packet.json"), rendered.packet);
  const packetMdPath = writeText(path.join(outboxDir, "dispatch_packet.md"), rendered.markdown);
  const manifestPath = writeJson(path.join(outboxDir, "manifest.json"), {
    contract_id: "strata.dispatch_outbox_manifest.v3_context_envelope",
    assignment_id: assignmentId,
    nonce,
    target_role: targetRole,
    target_id: targetId,
    packet_json: packetJsonPath,
    packet_markdown: packetMdPath,
    context_git_snapshot_dir: snapshotDir,
    runtime_delivery: rendered.packet.runtime_delivery,
    created_at: isoNow()
  });

  const gitPacketJsonPath = writeJson(path.join(snapshotDir, "dispatch_packet.json"), rendered.packet);
  const gitPacketMdPath = writeText(path.join(snapshotDir, "dispatch_packet.md"), rendered.markdown);
  const gitManifestPath = writeJson(path.join(snapshotDir, "manifest.json"), {
    contract_id: "strata.dispatch_git_packet_snapshot.v3_context_envelope",
    assignment_id: assignmentId,
    nonce,
    target_role: targetRole,
    target_id: targetId,
    packet_json: gitPacketJsonPath,
    packet_markdown: gitPacketMdPath,
    outbox_manifest: manifestPath,
    context_export_manifest: rendered.contextExport.result.manifest_path,
    dispatch_envelope_sha256: rendered.packet.markdown_sha256,
    created_at: isoNow()
  });
  const logPath = writeJson(path.join(l.dispatchLog, `${fileSlug(`${assignmentId}_${nonce}_${targetId}`)}.json`), {
    contract_id: "strata.dispatch_log.v3_context_envelope",
    metadata: rendered.packet,
    dispatch_envelope: {
      pasted_body: rendered.markdown,
      sha256: rendered.packet.markdown_sha256,
      outbox_packet_markdown: packetMdPath,
      git_packet_markdown: gitPacketMdPath
    },
    outbox_manifest: manifestPath,
    git_packet_manifest: gitManifestPath,
    created_at: isoNow()
  });
  const telemetry = recordTelemetry(root, "dispatch.record.completed", { result: "ok", assignment_id: assignmentId, nonce, target_id: targetId, dispatch_format: rendered.packet.dispatch_format, envelope_type: rendered.packet.envelope_type, context_source_count: rendered.contextExport.result.source_count });
  const paths = [
    logPath,
    gitPacketJsonPath,
    gitPacketMdPath,
    gitManifestPath,
    rendered.contextExport.result.markdown_path,
    rendered.contextExport.result.source_index_path,
    rendered.contextExport.result.manifest_path,
    telemetry.path
  ].map((p) => contextRel(root, p));
  const git = gitCommitContext(l.context, `dispatch record ${assignmentId} ${nonce}`, { paths });
  const testerEntrypoint = {
    packet_markdown: packetMdPath,
    metadata_json: packetJsonPath,
    dispatch_log: logPath,
    suggested_delivery_command: `strata-runtime-edge delegate dispatch-deliver --session-id ${safeSegment(targetId)} --packet ${packetMdPath} --workspace ${root}`
  };
  return resultEnvelope("sctl.dispatch.record.v3", true, { outbox: { dir: outboxDir, packetJsonPath, packetMdPath, manifestPath }, git_snapshot: { dir: snapshotDir, packetJsonPath: gitPacketJsonPath, packetMdPath: gitPacketMdPath, manifestPath: gitManifestPath }, dispatch_log_path: logPath, tester_entrypoint: testerEntrypoint, notice_count: 0, git, packet: rendered.packet }, [], [packetJsonPath, packetMdPath, manifestPath, gitPacketJsonPath, gitPacketMdPath, gitManifestPath, rendered.contextExport.result.markdown_path, rendered.contextExport.result.source_index_path, rendered.contextExport.result.manifest_path, logPath, telemetry.path]);
}

export function renderDispatchToFile(root, input = {}) {
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const nonce = safeSegment(input.nonce || `N_${timestamp()}`);
  const targetRole = input.targetRole || input.target_role || DEFAULT_TARGET_ROLE;
  const targetId = input.targetId || input.target_id || targetRoleSegment(targetRole).toLowerCase();
  const outDir = path.resolve(root, input.out || path.join(".strata", "dispatch_outbox", assignmentId, safeSegment(targetId), nonce, "render_only"));
  if (!isInsidePath(root, outDir)) throw new Error("render-only dispatch path must remain inside the SCTL workspace");
  const rendered = renderDispatchPacket(root, { ...input, assignmentId, nonce, targetRole, targetId, snapshotDir: path.join(outDir, "context_snapshot") });
  const packetJsonPath = writeJson(path.join(outDir, "dispatch_packet.json"), rendered.packet);
  const packetMdPath = writeText(path.join(outDir, "dispatch_packet.md"), rendered.markdown);
  return resultEnvelope("sctl.dispatch.render.v3", true, { packetJsonPath, packetMdPath, packet: rendered.packet }, [], [packetJsonPath, packetMdPath, rendered.contextExport.result.markdown_path, rendered.contextExport.result.source_index_path, rendered.contextExport.result.manifest_path]);
}

export function recordErrorDispatch(root, input = {}) {
  return recordDispatch(root, {
    dispatchKind: "ERROR_LOG",
    envelopeType: SCTL_ENVELOPE_TYPE,
    assignmentId: input.assignmentId || input.assignment_id || "UNKNOWN_ASSIGNMENT",
    nonce: input.nonce || `ERR_${timestamp()}`,
    fromRole: "Tooling / Dispatch Operator",
    fromId: "sctl_backend",
    targetRole: input.targetRole || input.target_role || input.role || "Sender Session",
    targetId: input.targetId || input.target_id || input.agentId || input.agent_id || "sender_session",
    summary: input.summary || "SCTL validation failed; see diagnostic details in context and operational log.",
    declaredFiles: input.declaredFiles || input.declared_files || []
  });
}

export function renderDeltaNotice(input) {
  const notice = {
    contract_id: "strata.dispatch.delta_notice.v1_retired_compatibility",
    assignment_id: input.assignmentId || input.assignment_id,
    nonce: input.nonce,
    target_role: input.targetRole || input.target_role || DEFAULT_TARGET_ROLE,
    retired_by: DISPATCH_FORMAT
  };
  if (!notice.assignment_id) throw new Error("assignment_id required");
  if (!notice.nonce) throw new Error("nonce required");
  const text = [
    "STRATA DELTA NOTICE RETIRED",
    "SCTL now dispatches a fixed-header context envelope plus role-selected submission template.",
    `assignment_id: ${notice.assignment_id}`,
    `nonce: ${notice.nonce}`,
    `target_role: ${notice.target_role}`
  ].join("\n");
  return { notice, text };
}
