import fs from "node:fs";
import path from "node:path";
import { gitCommitContext, incrementClassAState, readContextState } from "./context.js";
import { ensureLayout } from "./layout.js";
import { exists, fileSlug, isInsidePath, isoNow, readJsonOr, readText, resultEnvelope, safeSegment, sha256File, timestamp, workspacePath, writeJson, writeText } from "./common.js";
import { recordDispatch } from "./dispatch_outbox.js";
import { recordTelemetry } from "./telemetry.js";

const ENTRY_CONTRACT_ID = "strata.cycle.director_governing_entry.v1";
const DIRECTOR_ENTRY_CLASS_A_CONTRACT_ID = "strata.class_a.director_governing_entry_document.v1";
const EXIT_CONTRACT_ID = "strata.cycle.exit_packet.v1";
const COORDINATOR_STATE_CONTRACT_ID = "strata.coordinator.lifecycle_state.v1";
const COORDINATOR_THRESHOLD = 4;
const COORDINATOR_RECENT_CLASS_B = 2;
const EXIT_REASONS = new Set(["complete", "architectural_blocker", "manual_stop"]);
function contextRel(root, file) {
  return path.relative(ensureLayout(root).context, file);
}

function activeCyclePath(root) {
  return path.join(ensureLayout(root).cyclesTrace, "active_cycle.json");
}

function activeCycle(root) {
  return readJsonOr(activeCyclePath(root), null);
}

function coordinatorStatePath(root, assignmentId, coordinatorId) {
  const l = ensureLayout(root);
  return path.join(l.coordinatorLifecycle, fileSlug(assignmentId), `${fileSlug(coordinatorId)}.json`);
}

function safeReason(raw) {
  const reason = String(raw || "").trim() === "manually_stopped" ? "manual_stop" : String(raw || "").trim();
  if (!EXIT_REASONS.has(reason)) throw new Error(`exit reason must be one of: ${Array.from(EXIT_REASONS).join(", ")}`);
  return reason;
}

function directorEntryClassAPath(root, assignmentId, cycleId, sourceFile) {
  const l = ensureLayout(root);
  const base = fileSlug(path.basename(sourceFile, path.extname(sourceFile)) || "director_governing_entry");
  return path.join(l.classA, "director_governing_entries", fileSlug(assignmentId), `${fileSlug(cycleId)}_${base}.md`);
}

export function manualCycleEntryPath(root) {
  return ensureLayout(root).directorEntryFile;
}

export function manualCycleEntryTemplate() {
  return [
    "# Director Governing Entry Document",
    "",
    "Write the governing cycle intent in plain Markdown. SCTL validates only that this is a Markdown file, commits the document immutably into Class A, and then creates a normalized runtime cycle-entry reference object.",
    "",
    "## Objective",
    "",
    "",
    "## Scope",
    "",
    "Included:",
    "",
    "Excluded:",
    "",
    "## Definition Of Done",
    "",
    "",
    "## Constraints",
    "",
    "",
    "## Stop Conditions",
    "",
    "- Architectural blocker that prevents safe progress.",
    "- Full task completion compared with this Director Entry Document.",
    "",
    "## Notes",
    "",
    "",
  ].join("\n");
}

export function writeManualCycleEntryTemplate(root, input = {}) {
  const l = ensureLayout(root);
  const file = workspacePath(root, input.file || input.out || l.directorEntryFile);
  if (!isInsidePath(l.directorEntry, file)) throw new Error("Director Entry Document template must be under .strata/cycles/director_entry");
  writeText(file, manualCycleEntryTemplate());
  return resultEnvelope("sctl.cycle.director_entry.template.write.v1", true, { file }, [], [file]);
}

export function detectManualCycleEntryFile(root, input = {}) {
  const l = ensureLayout(root);
  if (input.file || input.entryFile || input.entry_file) {
    const file = workspacePath(root, input.file || input.entryFile || input.entry_file);
    if (!file || !isInsidePath(l.directorEntry, file)) throw new Error("Director Entry Document file must be under .strata/cycles/director_entry");
    return file;
  }
  const dir = workspacePath(root, input.dir || input.entryDir || input.entry_dir || l.directorEntry);
  if (!dir || !isInsidePath(l.directorEntry, dir)) throw new Error("Director Entry Document directory must be under .strata/cycles/director_entry");
  if (!exists(dir)) throw new Error("Director Entry Document directory is missing");
  const files = fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort();
  if (files.length === 0) throw new Error("Director Entry Document directory must contain exactly one Markdown file");
  if (files.length > 1) throw new Error(`Director Entry Document directory has multiple Markdown files: ${files.map((file) => path.basename(file)).join(", ")}`);
  return files[0];
}

export function validateManualCycleEntry(root, input = {}) {
  const errors = [];
  let file = null;
  try { file = detectManualCycleEntryFile(root, input); }
  catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  if (!file) errors.push("Director Entry Document file is required");
  else {
    if (path.extname(file).toLowerCase() !== ".md") errors.push("Director Entry Document must be one Markdown file");
    if (!exists(file)) errors.push("Director Entry Document file is missing");
    else if (!fs.statSync(file).isFile()) errors.push("Director Entry Document must be a file");
  }
  return resultEnvelope("sctl.cycle.director_entry.validate.v1", errors.length === 0, { file, sha256: file && exists(file) ? sha256File(file) : null }, errors, file && exists(file) ? [file] : []);
}

export function startCycleFromManualEntry(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const coordinatorId = safeSegment(input.coordinatorId || input.coordinator_id || "delegated_coordinator_001");
  const coordinatorRole = input.coordinatorRole || input.coordinator_role || "Delegated Coordinator";
  const codebaseRepo = input.codebaseRepo || input.codebase_repo || "";
  const trunkBranch = input.trunkBranch || input.trunk_branch || input.baseBranch || input.base_branch || "main";
  const shortName = input.shortName || input.short_name || "director-entry-cycle";
  const changeBranch = input.changeBranch || input.change_branch || input.assignedBranch || input.assigned_branch || `change/${assignmentId}/C01-${fileSlug(shortName)}`;
  const validation = validateManualCycleEntry(root, { file: input.file || input.entryFile || input.entry_file, dir: input.dir || input.entryDir || input.entry_dir || l.directorEntry });
  if (!validation.ok) return resultEnvelope("sctl.cycle.director_entry.submit.denied.v1", false, { started: false, validation: validation.result }, validation.errors, validation.evidence_paths);

  const sourceText = readText(validation.result.file);
  const cycleId = safeSegment(input.cycleId || input.cycle_id || `CYCLE_${assignmentId}_${timestamp()}`);

  const classAPath = directorEntryClassAPath(root, assignmentId, cycleId, validation.result.file);
  writeText(classAPath, sourceText.endsWith("\n") ? sourceText : `${sourceText}\n`);
  const stateAfterA = incrementClassAState(root);
  const telemetryA = recordTelemetry(root, "cycle.director_entry.class_a_commit.completed", { result: "ok", assignment_id: assignmentId, cycle_id: cycleId, class_a_path: classAPath });
  const classAGit = gitCommitContext(l.context, `Class A Director Entry Document ${assignmentId} ${cycleId}`, { paths: [classAPath, path.join(l.classD, "context_state.json"), telemetryA.path].map((p) => contextRel(root, p)) });
  const classASha = sha256File(classAPath);

  const cycleDir = path.join(l.cyclesTrace, fileSlug(cycleId));
  const entry = {
    contract_id: ENTRY_CONTRACT_ID,
    cycle_id: cycleId,
    assignment_id: assignmentId,
    status: "active",
    coordinator: { role: coordinatorRole, id: coordinatorId },
    director_entry_document: {
      contract_id: DIRECTOR_ENTRY_CLASS_A_CONTRACT_ID,
      class: "A",
      path: classAPath,
      relative_path: path.relative(root, classAPath),
      context_relative_path: contextRel(root, classAPath),
      sha256: classASha,
      git_commit: classAGit.commit,
    },
    source_file: validation.result.file,
    source_sha256: validation.result.sha256,
    validation_policy: "markdown_file_only_no_format_constraints",
    normalized: {
      contract_id: "strata.cycle.director_governing_entry_reference.v1",
      cycle_id: cycleId,
      assignment_id: assignmentId,
      status: "active",
      coordinator: { role: coordinatorRole, id: coordinatorId },
      director_entry_document: {
        contract_id: DIRECTOR_ENTRY_CLASS_A_CONTRACT_ID,
        class: "A",
        path: classAPath,
        relative_path: path.relative(root, classAPath),
        context_relative_path: contextRel(root, classAPath),
        sha256: classASha,
        git_commit: classAGit.commit,
      },
      validation_policy: "markdown_file_only_no_director_semantic_parsing",
    },
    context_state_at_entry: {
      class_a_revision: stateAfterA.class_a_revision,
      current_class_b_revision: stateAfterA.current_class_b_revision,
      context_revision: stateAfterA.context_revision,
    },
    created_at: isoNow(),
  };
  const entryPath = writeJson(path.join(cycleDir, "cycle_entry.json"), entry);
  const activePath = writeJson(activeCyclePath(root), { ...entry, active_cycle_path: entryPath, updated_at: isoNow() });
  const telemetry = recordTelemetry(root, "cycle.director_entry.submit.completed", { result: "ok", assignment_id: assignmentId, cycle_id: cycleId, coordinator_id: coordinatorId, class_a_git_commit: classAGit.commit });
  const git = gitCommitContext(l.context, `cycle entry reference ${assignmentId} ${cycleId}`, { paths: [entryPath, activePath, telemetry.path].map((p) => contextRel(root, p)) });

  const dispatchEnabled = input.noDispatch === true || input.no_dispatch === true || input.dispatch === false ? false : true;
  const dispatch = dispatchEnabled ? recordDispatch(root, {
    dispatchKind: "DIRECTOR_ENTRY_CONTEXT_COMMIT",
    trigger: "CLASS_A_CONTEXT_COMMIT",
    envelopeType: "initial_task_coordination",
    assignmentId,
    nonce: safeSegment(input.nonce || `N_COORD_${fileSlug(cycleId).toUpperCase()}`),
    fromRole: "SCTL Context Commit Trigger",
    fromId: "sctl_context_git",
    targetRole: coordinatorRole,
    targetId: coordinatorId,
    sourceContextClass: "A",
    sourceContextPath: path.relative(root, classAPath),
    sourceContextSha256: classASha,
    sourceContextGitCommit: classAGit.commit,
    cycleId,
    workOrderId: `WO_${assignmentId}_${cycleId}_C01`,
    directorEntryDocumentPath: path.relative(root, classAPath),
    directorEntryDocumentSha256: classASha,
    codebaseRepo,
    trunkBranch,
    changeBranch,
    shortName,
    submissionTemplate: "templates/work_products/coordinator_work_order.template.md",
    declaredFiles: [
      `DIRECTOR_ENTRY_DOCUMENT:${path.relative(root, classAPath)}`,
      `CYCLE_ENTRY_OBJECT:${path.relative(root, entryPath)}`,
      `CODEBASE_REPO:${codebaseRepo || "<codebase_repo>"}`,
      `TRUNK_BRANCH:${trunkBranch}`,
      `CHANGE_BRANCH:${changeBranch}`,
    ],
    includeClasses: "A,B",
    classBLatest: COORDINATOR_RECENT_CLASS_B,
  }) : null;

  return resultEnvelope("sctl.cycle.director_entry.submit.v1", true, {
    cycle_id: cycleId,
    assignment_id: assignmentId,
    coordinator_id: coordinatorId,
    entry: entry.normalized,
    entry_path: entryPath,
    active_cycle_path: activePath,
    director_entry_document: entry.director_entry_document,
    class_a_git: classAGit,
    cycle_git: git,
    coordinator_dispatch: dispatch ? dispatch.result : null,
    dispatch_deferred: !dispatchEnabled,
  }, [], [classAPath, entryPath, activePath, telemetryA.path, telemetry.path, ...(dispatch ? dispatch.evidence_paths : [])]);
}

export function exitCycle(root, input = {}) {
  const l = ensureLayout(root);
  const current = activeCycle(root);
  const cycleId = safeSegment(input.cycleId || input.cycle_id || current?.cycle_id || "");
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id || current?.assignment_id || "");
  const reason = safeReason(input.reason || input.exit_reason);
  const summary = input.summary || input.exitSummary || input.exit_summary || "Coordinator closed the cycle by explicit exit packet.";
  const cycleDir = path.join(l.cyclesTrace, fileSlug(cycleId));
  const exitPacket = {
    contract_id: EXIT_CONTRACT_ID,
    cycle_id: cycleId,
    assignment_id: assignmentId,
    status: reason === "complete" ? "complete" : "closed",
    reason,
    summary,
    comparison_basis: "Coordinator compared current state against the Director Governing Entry Document committed in Class A.",
    evidence: input.evidence || [],
    created_at: isoNow(),
  };
  const exitPath = writeJson(path.join(cycleDir, `cycle_exit_${fileSlug(reason)}_${timestamp()}.json`), exitPacket);
  const activePath = writeJson(activeCyclePath(root), { ...(current || {}), cycle_id: cycleId, assignment_id: assignmentId, status: exitPacket.status, exit_reason: reason, exit_packet_path: exitPath, updated_at: isoNow() });
  const telemetry = recordTelemetry(root, "cycle.exit.completed", { result: "ok", assignment_id: assignmentId, cycle_id: cycleId, reason });
  const git = gitCommitContext(l.context, `cycle exit ${assignmentId} ${cycleId} ${reason}`, { paths: [exitPath, activePath, telemetry.path].map((p) => contextRel(root, p)) });
  return resultEnvelope("sctl.cycle.exit.v1", true, { cycle_id: cycleId, assignment_id: assignmentId, reason, exit_path: exitPath, active_cycle_path: activePath, git }, [], [exitPath, activePath, telemetry.path]);
}

function defaultCoordinatorState(assignmentId, coordinatorId) {
  return {
    contract_id: COORDINATOR_STATE_CONTRACT_ID,
    assignment_id: assignmentId,
    coordinator_id: coordinatorId,
    completed_cycles_since_recreate: 0,
    total_completed_cycles: 0,
    recreation_threshold_cycles: COORDINATOR_THRESHOLD,
    latest_class_b_context_count: COORDINATOR_RECENT_CLASS_B,
    updated_at: isoNow(),
  };
}

function readCoordinatorState(root, assignmentId, coordinatorId) {
  const file = coordinatorStatePath(root, assignmentId, coordinatorId);
  return readJsonOr(file, defaultCoordinatorState(assignmentId, coordinatorId));
}

function writeCoordinatorState(root, state) {
  const file = coordinatorStatePath(root, state.assignment_id, state.coordinator_id);
  return writeJson(file, { ...state, updated_at: isoNow() });
}

export function coordinatorContextPolicy(root, input = {}) {
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const coordinatorId = safeSegment(input.coordinatorId || input.coordinator_id || "delegated_coordinator_001");
  const state = readCoordinatorState(root, assignmentId, coordinatorId);
  const contextState = readContextState(root);
  return resultEnvelope("sctl.coordinator.context_policy.v1", true, {
    assignment_id: assignmentId,
    coordinator_id: coordinatorId,
    class_a_required: true,
    latest_class_b_count: COORDINATOR_RECENT_CLASS_B,
    completed_cycles_since_recreate: Number(state.completed_cycles_since_recreate || 0),
    recreation_threshold_cycles: Number(state.recreation_threshold_cycles || COORDINATOR_THRESHOLD),
    recreation_required: Number(state.completed_cycles_since_recreate || 0) >= Number(state.recreation_threshold_cycles || COORDINATOR_THRESHOLD),
    policy: "Coordinator feed is Class A plus latest 2 Class B reports by default; recreate coordinator after 4 completed coordinator-author-reviewer cycles.",
    context_state: contextState,
  }, [], []);
}

export function coordinatorCycleComplete(root, input = {}) {
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const coordinatorId = safeSegment(input.coordinatorId || input.coordinator_id || "delegated_coordinator_001");
  const cycleId = input.cycleId || input.cycle_id || activeCycle(root)?.cycle_id || null;
  const prior = readCoordinatorState(root, assignmentId, coordinatorId);
  const threshold = Number(prior.recreation_threshold_cycles || COORDINATOR_THRESHOLD);
  const completed = Number(prior.completed_cycles_since_recreate || 0) + 1;
  const total = Number(prior.total_completed_cycles || 0) + 1;
  const recreationRequired = completed >= threshold;
  const next = {
    ...prior,
    contract_id: COORDINATOR_STATE_CONTRACT_ID,
    assignment_id: assignmentId,
    coordinator_id: coordinatorId,
    completed_cycles_since_recreate: completed,
    total_completed_cycles: total,
    recreation_threshold_cycles: threshold,
    latest_class_b_context_count: COORDINATOR_RECENT_CLASS_B,
    recreation_required: recreationRequired,
    last_completed_cycle_id: cycleId,
  };
  const statePath = writeCoordinatorState(root, next);
  const eventPath = writeJson(path.join(ensureLayout(root).coordinatorLifecycle, fileSlug(assignmentId), `${fileSlug(coordinatorId)}_cycle_${String(total).padStart(4, "0")}_${timestamp()}.json`), {
    contract_id: "strata.coordinator.cycle_complete_event.v1",
    assignment_id: assignmentId,
    coordinator_id: coordinatorId,
    cycle_id: cycleId,
    completed_cycles_since_recreate: completed,
    total_completed_cycles: total,
    recreation_threshold_cycles: threshold,
    recreation_required: recreationRequired,
    created_at: isoNow(),
  });
  const telemetry = recordTelemetry(root, "coordinator.cycle_complete.completed", { result: "ok", assignment_id: assignmentId, coordinator_id: coordinatorId, completed_cycles_since_recreate: completed, recreation_required: recreationRequired });
  const git = gitCommitContext(ensureLayout(root).context, `coordinator cycle complete ${assignmentId} ${coordinatorId} ${total}`, { paths: [statePath, eventPath, telemetry.path].map((p) => contextRel(root, p)) });
  return resultEnvelope("sctl.coordinator.cycle_complete.v1", true, { assignment_id: assignmentId, coordinator_id: coordinatorId, cycle_id: cycleId, completed_cycles_since_recreate: completed, total_completed_cycles: total, recreation_threshold_cycles: threshold, recreation_required: recreationRequired, next_action: recreationRequired ? "recreate_coordinator_before_next_cycle" : "continue_existing_coordinator", latest_class_b_count: COORDINATOR_RECENT_CLASS_B, git }, [], [statePath, eventPath, telemetry.path]);
}

export function coordinatorRecreated(root, input = {}) {
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const coordinatorId = safeSegment(input.coordinatorId || input.coordinator_id || "delegated_coordinator_001");
  const prior = readCoordinatorState(root, assignmentId, coordinatorId);
  const next = {
    ...prior,
    assignment_id: assignmentId,
    coordinator_id: coordinatorId,
    completed_cycles_since_recreate: 0,
    latest_class_b_context_count: COORDINATOR_RECENT_CLASS_B,
    recreation_required: false,
    recreated_at: isoNow(),
  };
  const statePath = writeCoordinatorState(root, next);
  const eventPath = writeJson(path.join(ensureLayout(root).coordinatorLifecycle, fileSlug(assignmentId), `${fileSlug(coordinatorId)}_recreated_${timestamp()}.json`), {
    contract_id: "strata.coordinator.recreated_event.v1",
    assignment_id: assignmentId,
    coordinator_id: coordinatorId,
    latest_class_b_context_count: COORDINATOR_RECENT_CLASS_B,
    created_at: isoNow(),
  });
  const telemetry = recordTelemetry(root, "coordinator.recreated.completed", { result: "ok", assignment_id: assignmentId, coordinator_id: coordinatorId });
  const git = gitCommitContext(ensureLayout(root).context, `coordinator recreated ${assignmentId} ${coordinatorId}`, { paths: [statePath, eventPath, telemetry.path].map((p) => contextRel(root, p)) });
  return resultEnvelope("sctl.coordinator.recreated.v1", true, { assignment_id: assignmentId, coordinator_id: coordinatorId, completed_cycles_since_recreate: 0, latest_class_b_count: COORDINATOR_RECENT_CLASS_B, git }, [], [statePath, eventPath, telemetry.path]);
}

export function submitCycleEntry(root, input = {}) {
  return startCycleFromManualEntry(root, { ...input, entryFile: input.file || input.path || input.entryFile || input.entry_file, coordinatorId: input.coordinatorId || input.coordinator_id, cycleId: input.cycleId || input.cycle_id, noDispatch: input.noDispatch || input.no_dispatch });
}
