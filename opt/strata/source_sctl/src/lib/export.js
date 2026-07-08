import fs from "node:fs";
import path from "node:path";
import { listFilesRecursive, readContextState } from "./context.js";
import { ensureLayout } from "./layout.js";
import { isoNow, parseSimpleFrontmatter, readText, resultEnvelope, sha256File, timestamp, writeJson, writeText } from "./common.js";

function normalizeClasses(input) {
  const raw = input.includeClasses || input.include_classes || input.classes || input.class_list || "A,B";
  const arr = Array.isArray(raw) ? raw : String(raw).split(",");
  const set = new Set(arr.map((x) => String(x).trim().toUpperCase()).filter(Boolean));
  for (const klass of set) if (!["A", "B", "C"].includes(klass)) throw new Error(`unsupported context class for export: ${klass}`);
  return set.size ? Array.from(set) : ["A", "B"];
}

function parseOptionalNonNegativeInteger(raw, name) {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

function fileCreatedAt(file) {
  const parsed = parseSimpleFrontmatter(readText(file));
  return parsed.attrs.created_at || null;
}

function acceptedClassBRevision(file) {
  const parsed = parseSimpleFrontmatter(readText(file));
  const raw = parsed.attrs.accepted_class_b_revision || parsed.attrs.class_b_revision || parsed.attrs.current_class_b_revision;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

function shouldIncludeClassB(file, sinceClassBRevision) {
  if (sinceClassBRevision === undefined || sinceClassBRevision === null) return true;
  const rev = acceptedClassBRevision(file);
  if (rev === null) return true;
  return rev > sinceClassBRevision;
}

function selectLatestClassBFiles(files, count) {
  if (count === null) return files;
  if (count === 0) return [];
  return files
    .map((file) => ({ file, revision: acceptedClassBRevision(file) ?? -1, created_at: fileCreatedAt(file) || "" }))
    .sort((a, b) => (b.revision - a.revision) || b.created_at.localeCompare(a.created_at) || b.file.localeCompare(a.file))
    .slice(0, count)
    .sort((a, b) => (a.revision - b.revision) || a.created_at.localeCompare(b.created_at) || a.file.localeCompare(b.file))
  .map((item) => item.file);
}

const DIRECTOR_STUB_MARKERS = ["# Director Governing Entry Document", "## Objective", "## Definition Of Done"];

function isDirectorEntryStub(file) {
  return readText(file).includes("Write the governing cycle intent in plain Markdown");
}

function selectLatestUniqueClassA(files) {
  const real = files
    .filter((file) => !isDirectorEntryStub(file))
    .map((file) => ({ file, sha: sha256File(file), created_at: fileCreatedAt(file) || "" }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.file.localeCompare(a.file));
  if (!real.length) return [];
  const seen = new Set([real[0].sha]);
  const out = [real[0].file];
  for (let i = 1; i < real.length; i++) {
    if (seen.has(real[i].sha)) continue;
    seen.add(real[i].sha);
    out.push(real[i].file);
  }
  return out;
}

export function exportMarkdown(root, input = {}) {
  const l = ensureLayout(root);
  const createdAt = isoNow();
  const outDir = path.resolve(root, input.out || path.join(".strata", "exports", "context", timestamp()));
  const includeClasses = normalizeClasses(input);
  const sinceRaw = input.sinceClassBRevision ?? input.since_class_b_revision ?? input.loadedContextEpoch ?? input.loaded_context_epoch;
  const sinceClassBRevision = parseOptionalNonNegativeInteger(sinceRaw, "since_class_b_revision");
  const latestRaw = input.classBLatest ?? input.class_b_latest ?? input.latestClassB ?? input.latest_class_b ?? input.latestClassBCount ?? input.latest_class_b_count;
  const latestClassB = parseOptionalNonNegativeInteger(latestRaw, "class_b_latest");
  if (sinceClassBRevision !== null && latestClassB !== null) throw new Error("since_class_b_revision and class_b_latest cannot both be provided");
  fs.mkdirSync(outDir, { recursive: true });
  const state = readContextState(root);
  const filterDescription = latestClassB !== null
    ? `latest_${latestClassB}`
    : (sinceClassBRevision === null ? "full" : `accepted_class_b_revision>${sinceClassBRevision}`);
  const parts = [
    "# Strata Context Export",
    "",
    `created_at: ${createdAt}`,
    "authority_model: Git-tracked context files",
    "empty_context_valid: true",
    `include_classes: ${includeClasses.join(",")}`,
    `class_b_filter: ${filterDescription}`,
    "",
    "## Context State",
    "",
    `current_context_epoch: ${state.current_context_epoch}`,
    `current_class_b_revision: ${state.current_class_b_revision}`,
    `class_a_revision: ${state.class_a_revision}`,
    `class_b_revision: ${state.class_b_revision}`,
    `refresh_required: ${state.refresh_required ? "true" : "false"}`,
    "",
  ];
  const sources = [];
  const classDirs = { A: l.classA, B: l.classB, C: l.classC };
  for (const klass of includeClasses) {
    parts.push(`## Class ${klass}`, "");
    let files = listFilesRecursive(classDirs[klass]);
    if (klass === "B") files = selectLatestClassBFiles(files.filter((file) => shouldIncludeClassB(file, sinceClassBRevision)), latestClassB);
    if (klass === "A") files = selectLatestUniqueClassA(files);
    if (!files.length) {
      parts.push(`No Class ${klass} context files are currently exported.`, "");
      continue;
    }
    for (const file of files) {
      const source = { class: klass, path: file, relative_path: path.relative(root, file), sha256: sha256File(file), created_at: fileCreatedAt(file) };
      if (klass === "B") source.accepted_class_b_revision = acceptedClassBRevision(file);
      sources.push(source);
      parts.push(`### ${path.relative(root, file)}`, "", readText(file).trim(), "");
    }
  }
  const markdownPath = path.join(outDir, "context.md");
  const sourceIndexPath = path.join(outDir, "source_index.json");
  const manifestPath = path.join(outDir, "manifest.json");
  writeText(markdownPath, `${parts.join("\n").trim()}\n`);
  writeJson(sourceIndexPath, sources);
  writeJson(manifestPath, {
    contract_id: "strata.context_export_manifest.v2_simplified_runtime",
    authority_model: "git_tracked_context_files",
    empty_context_valid: true,
    include_classes: includeClasses,
    since_class_b_revision: sinceClassBRevision,
    class_b_latest: latestClassB,
    class_b_filter: filterDescription,
    markdown_path: markdownPath,
    source_index_path: sourceIndexPath,
    source_count: sources.length,
    state,
    created_at: createdAt,
  });
  return resultEnvelope("sctl.context.export_markdown.v2", true, { out_dir: outDir, markdown_path: markdownPath, source_index_path: sourceIndexPath, manifest_path: manifestPath, source_count: sources.length, state, include_classes: includeClasses, since_class_b_revision: sinceClassBRevision, class_b_latest: latestClassB, class_b_filter: filterDescription }, [], [markdownPath, sourceIndexPath, manifestPath]);
}
