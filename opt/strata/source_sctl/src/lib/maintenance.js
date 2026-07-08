import fs from "node:fs";
import path from "node:path";
import { ensureLayout } from "./layout.js";
import { exists, isoNow, readJsonOr, readText, resultEnvelope, sha256File, timestamp, writeJson } from "./common.js";
import { readContextState, repoStatus, bootstrap } from "./context.js";
import { secretScan } from "./secret_scan.js";
import { listClassB } from "./classb.js";
import { listSessions } from "./messages.js";
import { telemetryPath } from "./telemetry.js";

function packageRoot() {
  return path.resolve(new URL(".", import.meta.url).pathname, "..", "..");
}

function checksumsFile() {
  return path.join(packageRoot(), "PACKAGE_CHECKSUMS.sha256");
}

export function doctor(root) {
  const l = ensureLayout(root);
  const checks = [];
  const status = repoStatus(root);
  checks.push({ name: "repo_status", ok: status.ok, head: status.result.head, dirty: status.result.status_short.length > 0 });
  const state = readContextState(root);
  checks.push({ name: "context_state", ok: true, class_a_revision: state.class_a_revision, current_class_b_revision: state.current_class_b_revision, context_revision: state.context_revision });
  const scan = secretScan(root);
  checks.push({ name: "secret_scan", ok: scan.ok, findings: scan.result.findings.length });
  const sumsFile = checksumsFile();
  const sumsExists = exists(sumsFile);
  let sumsLines = 0;
  if (sumsExists) {
    try { sumsLines = readText(sumsFile).split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#")).length; } catch { sumsLines = 0; }
  }
  checks.push({ name: "package_checksums", ok: sumsExists && sumsLines > 0, path: sumsFile, entries: sumsLines });
  checks.push({ name: "telemetry_log", ok: exists(telemetryPath(root)), path: telemetryPath(root) });
  return resultEnvelope("sctl.doctor.v1", checks.every((c) => c.ok), { checks, state }, [], []);
}

export function initWorkspace(root) {
  const l = ensureLayout(root);
  const result = bootstrap(root);
  return resultEnvelope("sctl.init_workspace.v1", result.ok, { layout: l, bootstrap: result.result }, result.errors, result.evidence_paths);
}

export function status(root) {
  const l = ensureLayout(root);
  const statusResult = repoStatus(root);
  const state = readContextState(root);
  const activeCycle = readJsonOr(path.join(l.cyclesTrace, "active_cycle.json"), null);
  return resultEnvelope("sctl.status.v1", true, {
    context_repo: statusResult.result.context_repo,
    head: statusResult.result.head,
    status_short: statusResult.result.status_short,
    state,
    active_cycle: activeCycle,
  }, statusResult.errors, statusResult.evidence_paths);
}

export function logs(root, input = {}) {
  const file = telemetryPath(root);
  const tail = Number.isInteger(input.tail) && input.tail > 0 ? input.tail : 50;
  const kind = input.kind || null;
  let lines = [];
  if (exists(file)) {
    lines = readText(file).split(/\r?\n/).filter(Boolean);
    if (kind) lines = lines.filter((line) => { try { return String(JSON.parse(line).event || "").startsWith(kind); } catch { return false; } });
    lines = lines.slice(-tail);
  }
  return resultEnvelope("sctl.logs.v1", true, { file, kind, tail, count: lines.length, lines }, [], exists(file) ? [file] : []);
}

function copyTree(src, dst) {
  if (!exists(src)) return [];
  const copied = [];
  const walk = (dir, rel = "") => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const relPath = path.join(rel, ent.name);
      if (ent.isDirectory()) walk(full, relPath);
      else if (ent.isFile()) {
        const target = path.join(dst, relPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(full, target);
        copied.push(target);
      }
    }
  };
  walk(src);
  return copied;
}

export function collectEvidence(root, input = {}) {
  const l = ensureLayout(root);
  const outDir = input.out || path.join(l.evidence, `collect_${timestamp()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const evidenceFiles = [];
  const manifest = { collected_at: isoNow(), workspace: root, out_dir: outDir, sections: [] };
  const stateFile = path.join(l.context, "D_trace", "context_state.json");
  if (exists(stateFile)) {
    const target = path.join(outDir, "context_state.json");
    fs.copyFileSync(stateFile, target);
    evidenceFiles.push(target);
    manifest.sections.push({ name: "context_state", file: target });
  }
  const classB = input.assignmentId ? listClassB(root).filter((b) => b.metadata && b.metadata.assignment_id === input.assignmentId) : listClassB(root);
  const classBDir = path.join(outDir, "class_b");
  fs.mkdirSync(classBDir, { recursive: true });
  for (const b of classB) {
    const target = path.join(classBDir, path.basename(b.path));
    fs.copyFileSync(b.path, target);
    evidenceFiles.push(target);
  }
  manifest.sections.push({ name: "class_b", count: classB.length, dir: classBDir });
  const dTraceDir = path.join(outDir, "d_trace");
  const dTraceFiles = copyTree(l.classD, dTraceDir);
  evidenceFiles.push(...dTraceFiles);
  manifest.sections.push({ name: "d_trace", count: dTraceFiles.length, dir: dTraceDir });
  const sessions = listSessions(root);
  const sessionsTarget = path.join(outDir, "active_sessions.json");
  const sessionsSource = sessions.result.file || path.join(l.classCSessions, "active_sessions.json");
  if (exists(sessionsSource)) fs.copyFileSync(sessionsSource, sessionsTarget);
  else writeJson(sessionsTarget, { sessions: [], created_at: isoNow() });
  evidenceFiles.push(sessionsTarget);
  manifest.sections.push({ name: "active_sessions", file: sessionsTarget, sessions: sessions.result.sessions.length });
  const manifestPath = path.join(outDir, "manifest.json");
  writeJson(manifestPath, manifest);
  evidenceFiles.push(manifestPath);
  return resultEnvelope("sctl.collect_evidence.v1", true, { out_dir: outDir, manifest: manifestPath, files: evidenceFiles.length }, [], [manifestPath]);
}

export function paths(root, input = {}) {
  const l = layout(root);
  return resultEnvelope("sctl.paths.v1", true, {
    package_root: packageRoot(),
    workspace_root: root,
    director_entry_source: input.directorEntrySource || null,
    director_entry_controlled: l.directorEntryFile,
    target_codebase: input.codebaseRepo || null,
    runtime_delegate: process.env.SCTL_RUNTIME_DELEGATE_ROOT || null,
  }, [], []);
}

function layout(root) { return ensureLayout(root); }
