import fs from "node:fs";
import path from "node:path";
import { ensureLayout } from "./layout.js";
import { exists, fileSlug, isoNow, readJsonOr, resultEnvelope, run, safeSegment, writeJson, writeText } from "./common.js";
import { recordTelemetry } from "./telemetry.js";

export const B_DELTA_EXPORT_THRESHOLD = 5;
export const B_FULL_REFRESH_THRESHOLD = 10;

export function contextStatePath(contextRoot) {
  return path.join(contextRoot, "D_trace", "context_state.json");
}

function defaultContextState() {
  return {
    contract_id: "strata.context_state.v2_simplified_runtime",
    context_epoch: 1,
    current_context_epoch: 0,
    context_revision: 0,
    class_a_revision: 0,
    class_b_revision: 0,
    current_class_b_revision: 0,
    class_b_updates_since_full_refresh: 0,
    refresh_required: false,
    refresh_reason: null,
    context_update_policy: "simple_revision_math",
    created_at: isoNow(),
    updated_at: isoNow(),
  };
}

function normalizeContextState(raw = {}) {
  const base = defaultContextState();
  const classBRevision = Number(raw.class_b_revision ?? raw.current_class_b_revision ?? raw.context_revision ?? 0);
  const classARevision = Number(raw.class_a_revision ?? Math.max(0, Number(raw.context_epoch ?? 1) - 1));
  const contextRevision = Number(raw.context_revision ?? (classARevision + classBRevision));
  return {
    ...base,
    ...raw,
    contract_id: "strata.context_state.v2_simplified_runtime",
    context_epoch: Number(raw.context_epoch ?? base.context_epoch),
    current_context_epoch: Number(raw.current_context_epoch ?? classBRevision),
    context_revision: contextRevision,
    class_a_revision: classARevision,
    class_b_revision: classBRevision,
    current_class_b_revision: Number(raw.current_class_b_revision ?? classBRevision),
    class_b_updates_since_full_refresh: Number(raw.class_b_updates_since_full_refresh ?? 0),
    refresh_required: Boolean(raw.refresh_required),
    refresh_reason: raw.refresh_reason ?? null,
    context_update_policy: "simple_revision_math",
    created_at: raw.created_at || base.created_at,
    updated_at: raw.updated_at || base.updated_at,
  };
}

export function ensureIsolatedContextGit(contextRoot) {
  fs.mkdirSync(contextRoot, { recursive: true });
  const gitDir = path.join(contextRoot, ".git");
  if (!exists(gitDir)) {
    run("git", ["init"], { cwd: contextRoot });
    run("git", ["config", "user.email", "strata-sctl@example.invalid"], { cwd: contextRoot });
    run("git", ["config", "user.name", "Strata SCTL"], { cwd: contextRoot });
  }
  const top = run("git", ["rev-parse", "--show-toplevel"], { cwd: contextRoot });
  if (!top.ok) throw new Error(top.stderr || "SCTL context Git repository is unavailable");
  if (path.resolve(top.stdout.trim()) !== path.resolve(contextRoot)) {
    throw new Error(`SCTL context Git must be isolated at ${contextRoot}`);
  }
  return { ok: true, context_root: contextRoot };
}

export function gitCommitContext(contextRoot, message, options = {}) {
  ensureIsolatedContextGit(contextRoot);
  const paths = options.paths && options.paths.length ? options.paths : ["."];
  for (const p of paths) {
    const rel = path.isAbsolute(p) ? path.relative(contextRoot, p) : p;
    if (rel && !rel.startsWith("..")) run("git", ["add", rel], { cwd: contextRoot });
  }
  const commit = run("git", ["commit", "-m", message], { cwd: contextRoot });
  if (!commit.ok && /nothing to commit|no changes added/i.test(commit.stdout + commit.stderr)) {
    return { ok: true, status: "no_changes", stdout: commit.stdout, stderr: commit.stderr, commit: null };
  }
  const head = run("git", ["rev-parse", "--short", "HEAD"], { cwd: contextRoot });
  return { ...commit, commit: head.ok ? head.stdout.trim() : null };
}

export function readContextState(root) {
  const l = ensureLayout(root);
  return normalizeContextState(readJsonOr(contextStatePath(l.context), defaultContextState()));
}

export function writeContextState(root, state) {
  const l = ensureLayout(root);
  const normalized = normalizeContextState(state);
  const next = { ...normalized, updated_at: isoNow() };
  writeJson(contextStatePath(l.context), next);
  return next;
}

export function incrementClassBState(root) {
  const state = readContextState(root);
  const nextClassBRevision = Number(state.class_b_revision || 0) + 1;
  const nextCount = Number(state.class_b_updates_since_full_refresh || 0) + 1;
  return writeContextState(root, {
    ...state,
    context_revision: Number(state.context_revision || 0) + 1,
    class_b_revision: nextClassBRevision,
    current_class_b_revision: nextClassBRevision,
    current_context_epoch: nextClassBRevision,
    class_b_updates_since_full_refresh: nextCount,
    refresh_required: nextCount > B_FULL_REFRESH_THRESHOLD,
    refresh_reason: nextCount > B_FULL_REFRESH_THRESHOLD ? `Class B update count exceeded ${B_FULL_REFRESH_THRESHOLD}` : null,
  });
}

export function incrementClassAState(root) {
  const state = readContextState(root);
  const nextClassARevision = Number(state.class_a_revision || 0) + 1;
  return writeContextState(root, {
    ...state,
    context_epoch: Number(state.context_epoch || 1) + 1,
    context_revision: Number(state.context_revision || 0) + 1,
    class_a_revision: nextClassARevision,
    class_b_updates_since_full_refresh: 0,
    refresh_required: true,
    refresh_reason: "Class A contract or doctrine update requires fresh full context dispatch",
  });
}

export function contextFreshness(root, input = {}) {
  const state = readContextState(root);
  const loaded = Number(input.loadedContextEpoch ?? input.loaded_context_epoch ?? input.loadedClassBRevision ?? input.loaded_class_b_revision ?? 0);
  if (!Number.isInteger(loaded) || loaded < 0) throw new Error("loaded_context_epoch must be a non-negative integer");
  const loadedClassA = input.loadedClassARevision ?? input.loaded_class_a_revision;
  const loadedA = loadedClassA === undefined || loadedClassA === null || loadedClassA === "" ? state.class_a_revision : Number(loadedClassA);
  if (!Number.isInteger(loadedA) || loadedA < 0) throw new Error("loaded_class_a_revision must be a non-negative integer when provided");
  const currentB = Number(state.current_class_b_revision || state.class_b_revision || 0);
  const classBDelta = Math.max(0, currentB - loaded);
  const classADelta = Math.max(0, Number(state.class_a_revision || 0) - loadedA);
  let action = "no_update_required";
  let exportMode = "none";
  let retireSession = false;
  if (classADelta > 0) {
    action = "retire_and_full_context_export";
    exportMode = "full";
    retireSession = true;
  } else if (classBDelta > B_DELTA_EXPORT_THRESHOLD) {
    action = "full_context_export";
    exportMode = "full";
  } else if (classBDelta > 0) {
    action = "delta_context_export";
    exportMode = "class_b_delta";
  }
  return resultEnvelope("sctl.context.freshness.v1", true, {
    loaded_context_epoch: loaded,
    loaded_class_a_revision: loadedA,
    current_context_epoch: currentB,
    current_class_b_revision: currentB,
    current_class_a_revision: state.class_a_revision,
    class_b_delta: classBDelta,
    class_a_delta: classADelta,
    export_mode: exportMode,
    action,
    retire_session: retireSession,
    math: `${currentB}-${loaded}=${classBDelta}`,
    policy: "If Class A changed, retire and full export. If Class B delta is 1-5, delta export. If Class B delta is greater than 5, full export.",
    state,
  }, [], []);
}

export function bootstrap(root) {
  const l = ensureLayout(root);
  ensureIsolatedContextGit(l.context);
  const state = writeContextState(root, readContextState(root));
  const readme = writeText(path.join(l.context, "README.md"), [
    "# Strata Git-backed Context",
    "",
    "Class A holds architecture, doctrine, contracts, and bootstrap file-pin policy.",
    "Class B holds validated timestamped operational reports and progress records.",
    "Class C holds human team messages and role-to-role communication.",
    "Class D_trace holds telemetry, dispatch packet snapshots, return ledgers, diagnostics, and raw trace artifacts.",
    "",
    "Dispatch context is generated through context.export_markdown. Empty context is valid.",
    "Session context freshness is evaluated with simple revision math: current_class_b_revision - loaded_context_epoch.",
    "",
  ].join("\n"));
  const git = gitCommitContext(l.context, "strata context bootstrap", { paths: ["README.md", "D_trace/context_state.json"] });
  const telemetry = recordTelemetry(root, "context.bootstrap.completed", { result: "ok", git_commit: git.commit, current_class_b_revision: state.current_class_b_revision });
  gitCommitContext(l.context, "telemetry context bootstrap", { paths: [path.relative(l.context, telemetry.path)] });
  return resultEnvelope("sctl.context.bootstrap.v1", true, { context_repo: l.context, git, state }, [], [readme, contextStatePath(l.context), telemetry.path]);
}

export function repoStatus(root) {
  const l = ensureLayout(root);
  ensureIsolatedContextGit(l.context);
  const status = run("git", ["status", "--short"], { cwd: l.context });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: l.context });
  return resultEnvelope("sctl.context.repo_status.v1", true, { context_repo: l.context, git_available: status.ok, head: head.ok ? head.stdout.trim() : null, status_short: status.stdout.split(/\r?\n/).filter(Boolean), stderr: status.stderr || null, state: readContextState(root) }, [], []);
}

export function putContextEntry(root, input) {
  const l = ensureLayout(root);
  const klass = String(input.klass || input.class || "").toUpperCase();
  if (!["A", "C"].includes(klass)) throw new Error("generic context put supports Class A and Class C; use classb commands for Class B reports");
  const id = safeSegment(input.id);
  const title = input.title || id;
  const body = input.body || "";
  const dir = klass === "A" ? l.classA : l.classC;
  const file = path.join(dir, `${fileSlug(id)}.md`);
  const text = `---\ncontract_id: strata.context_entry.v1\nclass: ${klass}\nid: ${id}\ntitle: ${title}\ncreated_at: ${isoNow()}\n---\n\n${body}\n`;
  writeText(file, text);
  let statePath = null;
  if (klass === "A") {
    incrementClassAState(root);
    statePath = contextStatePath(l.context);
  }
  const rels = [path.relative(l.context, file), ...(statePath ? [path.relative(l.context, statePath)] : [])];
  const git = gitCommitContext(l.context, `context ${klass} put ${id}`, { paths: rels });
  const telemetry = recordTelemetry(root, `context.class_${klass.toLowerCase()}.put.completed`, { result: "ok", id, git_commit: git.commit });
  gitCommitContext(l.context, `telemetry context ${klass} put ${id}`, { paths: [path.relative(l.context, telemetry.path)] });
  return resultEnvelope("sctl.context.put.v1", true, { class: klass, id, path: file, git }, [], [file, ...(statePath ? [statePath] : []), telemetry.path]);
}

export function listFilesRecursive(dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(full));
    else if (ent.isFile() && ent.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}
