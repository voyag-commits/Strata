import fs from "node:fs";
import path from "node:path";
import { gitCommitContext, incrementClassBState, readContextState } from "./context.js";
import { ensureLayout } from "./layout.js";
import { exists, fileSlug, hasMarkdownHeading, isoNow, isInsidePath, isIsoTimestamp, markdownSectionContent, parseSimpleFrontmatter, readText, resultEnvelope, safeSegment, sha256File, workspacePath, writeText } from "./common.js";
import { defaultOperationalReportBody, REQUIRED_REPORT_SECTIONS } from "./reports.js";
import { recordTelemetry } from "./telemetry.js";
import { recordErrorDispatch } from "./dispatch_outbox.js";

export const CLASS_B_SCOPES = new Set([
  "current_operational_state",
  "release_ledger",
  "actionable_report",
  "defect_record",
  "review_outcome",
]);

export const CLASS_B_STATUSES = new Set([
  "draft",
  "ready",
  "partial",
  "blocked",
  "accepted",
  "rejected",
  "failed",
]);

const REQUIRED_FRONTMATTER = [
  "contract_id",
  "class",
  "id",
  "title",
  "scope",
  "assignment_id",
  "agent_id",
  "role",
  "status",
  "evidence",
  "loaded_context_epoch",
  "created_at",
];

function listMarkdownFiles(dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (ent.isFile() && ent.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

function contextRel(root, file) { return path.relative(ensureLayout(root).context, file); }

export function classBFilePath(root, id) {
  return path.join(ensureLayout(root).classB, `${fileSlug(id)}.md`);
}

export function parseClassBMetadata(file) {
  if (!exists(file)) return {};
  return parseSimpleFrontmatter(readText(file)).attrs;
}

function validateNonEmptySafeSegment(value, key, errors) {
  try { safeSegment(value); }
  catch (error) { errors.push(`${key} must be a non-empty safe identifier`); }
}

function validateIntegerField(attrs, key, errors, { required = true } = {}) {
  const raw = attrs[key];
  if ((raw === undefined || raw === null || raw === "") && !required) return;
  if (raw === undefined || raw === null || raw === "") { errors.push(`${key} is required`); return; }
  if (!/^\d+$/.test(String(raw))) errors.push(`${key} must be a non-negative integer`);
}

function annotatedClassBText(text, revision) {
  const parsed = parseSimpleFrontmatter(text);
  if (!parsed.hasFrontmatter) return text;
  let fm = text.slice(4, text.indexOf("\n---", 4)).trim();
  const rest = text.slice(text.indexOf("\n---", 4));
  const fields = {
    accepted_class_b_revision: String(revision),
    accepted_at: isoNow(),
  };
  for (const [key, value] of Object.entries(fields)) {
    const line = new RegExp(`^${key}:.*$`, "m");
    if (line.test(fm)) fm = fm.replace(line, `${key}: ${value}`);
    else fm += `\n${key}: ${value}`;
  }
  return `---\n${fm}${rest}`;
}

function annotateAcceptedRevision(file, revision) {
  writeText(file, annotatedClassBText(readText(file), revision));
  return file;
}

export function validateClassBFile(root, input = {}) {
  const l = ensureLayout(root);
  let file = null;
  const errors = [];
  try { file = workspacePath(root, input.file || input.path || input.file_path); }
  catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  if (!file) errors.push("file is required");
  else {
    if (!isInsidePath(l.classB, file)) errors.push("Class B file must be under .strata/context/B");
    if (!exists(file)) errors.push("Class B file does not exist");
    if (path.extname(file) !== ".md") errors.push("Class B file must be Markdown");
    if (exists(file)) {
      const text = readText(file);
      const parsed = parseSimpleFrontmatter(text);
      if (!parsed.hasFrontmatter) errors.push("Class B file requires frontmatter");
      for (const key of REQUIRED_FRONTMATTER) if (!parsed.attrs[key]) errors.push(`${key} is required`);
      if (parsed.attrs.contract_id && parsed.attrs.contract_id !== "strata.class_b.file.v1") errors.push("contract_id must be strata.class_b.file.v1");
      if (parsed.attrs.class && parsed.attrs.class !== "B") errors.push("class must be B");
      if (parsed.attrs.scope && !CLASS_B_SCOPES.has(parsed.attrs.scope)) errors.push(`scope must be one of: ${Array.from(CLASS_B_SCOPES).join(", ")}`);
      if (parsed.attrs.status && !CLASS_B_STATUSES.has(parsed.attrs.status)) errors.push(`status must be one of: ${Array.from(CLASS_B_STATUSES).join(", ")}`);
      if (parsed.attrs.evidence && !["included", "none_required"].includes(parsed.attrs.evidence)) errors.push("evidence must be included or none_required");
      if (parsed.attrs.id) validateNonEmptySafeSegment(parsed.attrs.id, "id", errors);
      if (parsed.attrs.assignment_id) validateNonEmptySafeSegment(parsed.attrs.assignment_id, "assignment_id", errors);
      if (parsed.attrs.agent_id) validateNonEmptySafeSegment(parsed.attrs.agent_id, "agent_id", errors);
      validateIntegerField(parsed.attrs, "loaded_context_epoch", errors);
      validateIntegerField(parsed.attrs, "accepted_class_b_revision", errors, { required: false });
      if (parsed.attrs.created_at && !isIsoTimestamp(parsed.attrs.created_at)) errors.push("created_at must be an ISO timestamp");
      if (parsed.attrs.accepted_at && !isIsoTimestamp(parsed.attrs.accepted_at)) errors.push("accepted_at must be an ISO timestamp");
      for (const section of REQUIRED_REPORT_SECTIONS) {
        if (!hasMarkdownHeading(parsed.body, section)) errors.push(`section required: ## ${section}`);
        else if (!markdownSectionContent(parsed.body, section).trim()) errors.push(`section must not be empty: ## ${section}`);
      }
      const evidenceText = markdownSectionContent(parsed.body, "Evidence");
      if (parsed.attrs.evidence === "none_required" && !/none required|no evidence required|not required/i.test(evidenceText)) {
        errors.push("evidence none_required requires an Evidence section statement explaining that no evidence is required");
      }
    }
  }
  return resultEnvelope("sctl.classb.validate_file.v2", errors.length === 0, { file, sha256: file && exists(file) ? sha256File(file) : null }, errors, file && exists(file) ? [file] : []);
}

function renderClassB(root, input = {}) {
  const state = readContextState(root);
  const id = safeSegment(input.id || input.entryId || input.entry_id);
  const title = input.title || id;
  const scope = input.scope || input.reportScope || input.report_scope || "actionable_report";
  if (!CLASS_B_SCOPES.has(scope)) throw new Error(`Class B scope must be one of: ${Array.from(CLASS_B_SCOPES).join(", ")}`);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id || "UNASSIGNED");
  const agentId = safeSegment(input.agentId || input.agent_id || "sender_session");
  const role = input.role || "Change Author";
  const status = input.status || "ready";
  const evidence = input.evidence || "included";
  const body = input.fullBody || input.full_body || defaultOperationalReportBody({ ...input, title });
  return {
    id,
    title,
    scope,
    assignmentId,
    agentId,
    role,
    text: [
      "---",
      "contract_id: strata.class_b.file.v1",
      "class: B",
      `id: ${id}`,
      `title: ${String(title).replace(/\n/g, " ")}`,
      `scope: ${scope}`,
      `assignment_id: ${assignmentId}`,
      `agent_id: ${agentId}`,
      `role: ${String(role).replace(/\n/g, " ")}`,
      `status: ${status}`,
      `evidence: ${evidence}`,
      `loaded_context_epoch: ${state.current_class_b_revision || 0}`,
      `created_at: ${isoNow()}`,
      "---",
      "",
      body.trim(),
      "",
    ].join("\n"),
  };
}

function denyInvalidClassB(root, file, validation, meta = {}) {
  const attrs = file && exists(file) ? parseClassBMetadata(file) : {};
  const errorDispatch = recordErrorDispatch(root, {
    assignmentId: meta.assignmentId || attrs.assignment_id || "UNKNOWN_ASSIGNMENT",
    targetRole: meta.role || attrs.role || "Sender Session",
    targetId: meta.agentId || attrs.agent_id || "sender_session",
    summary: "Class B validation failed; commit was denied.",
    declaredFiles: file ? [path.relative(root, file)] : [],
  });
  return resultEnvelope("sctl.classb.commit_denied.v2", false, { file, commit_denied: true, validation_errors: validation.errors, error_dispatch: errorDispatch.result }, validation.errors, [file, ...errorDispatch.evidence_paths].filter(Boolean));
}

export function putClassBFile(root, input = {}) {
  const l = ensureLayout(root);
  const rendered = renderClassB(root, input);
  const file = classBFilePath(root, rendered.id);
  writeText(file, rendered.text);
  const validation = validateClassBFile(root, { file });
  if (!validation.ok) return denyInvalidClassB(root, file, validation, rendered);
  const state = incrementClassBState(root);
  annotateAcceptedRevision(file, state.class_b_revision);
  const telemetry = recordTelemetry(root, "classb.commit.completed", { result: "ok", assignment_id: rendered.assignmentId, id: rendered.id, accepted_class_b_revision: state.class_b_revision, context_revision: state.context_revision, refresh_required: state.refresh_required });
  const paths = [file, path.join(l.classD, "context_state.json"), telemetry.path].map((p) => contextRel(root, p));
  const git = gitCommitContext(l.context, `class B report put ${rendered.id}`, { paths });
  return resultEnvelope("sctl.classb.put_file.v2", true, { id: rendered.id, file, scope: rendered.scope, assignment_id: rendered.assignmentId, git, state, accepted_class_b_revision: state.class_b_revision }, [], [file, telemetry.path]);
}

export function commitClassBFile(root, input = {}) {
  const l = ensureLayout(root);
  const validation = validateClassBFile(root, input);
  const file = validation.result.file;
  if (!validation.ok) return denyInvalidClassB(root, file, validation, {});
  const attrs = parseClassBMetadata(file);
  const state = incrementClassBState(root);
  annotateAcceptedRevision(file, state.class_b_revision);
  const telemetry = recordTelemetry(root, "classb.commit.completed", { result: "ok", assignment_id: attrs.assignment_id || null, id: attrs.id || path.basename(file), accepted_class_b_revision: state.class_b_revision, context_revision: state.context_revision, refresh_required: state.refresh_required });
  const message = input.message || input.commitMessage || input.commit_message || `class B report commit ${path.relative(l.context, file)}`;
  const paths = [file, path.join(l.classD, "context_state.json"), telemetry.path].map((p) => contextRel(root, p));
  const git = gitCommitContext(l.context, message, { paths });
  return resultEnvelope("sctl.classb.commit_file.v2", git.ok, { file, sha256: sha256File(file), git, state, accepted_class_b_revision: state.class_b_revision }, git.ok ? [] : [git.stderr || git.error || "git commit failed"], [file, telemetry.path]);
}

export function listClassB(root) {
  const l = ensureLayout(root);
  return listMarkdownFiles(l.classB).map((file) => ({
    class: "B",
    path: file,
    relative_path: path.relative(root, file),
    sha256: sha256File(file),
    metadata: parseClassBMetadata(file),
  }));
}
