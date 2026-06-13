import fs from "node:fs";
import path from "node:path";
import { listFilesRecursive, readContextState } from "./context.js";
import { ensureLayout } from "./layout.js";
import { exists, isoNow, parseSimpleFrontmatter, readText, resultEnvelope, safeSegment, sha256File, timestamp, writeJson, writeText } from "./common.js";

function normalizeClasses(input) {
  const raw = input.includeClasses || input.include_classes || input.classes || input.class_list || "A,B";
  const arr = Array.isArray(raw) ? raw : String(raw).split(",");
  const set = new Set(arr.map((x) => String(x).trim().toUpperCase()).filter(Boolean));
  for (const klass of set) if (!["A", "B", "C"].includes(klass)) throw new Error(`unsupported context class for export: ${klass}`);
  return set.size ? Array.from(set) : ["A", "B"];
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

export function exportMarkdown(root, input = {}) {
  const l = ensureLayout(root);
  const createdAt = isoNow();
  const outDir = path.resolve(root, input.out || path.join(".strata", "exports", "context", timestamp()));
  const includeClasses = normalizeClasses(input);
  const sinceRaw = input.sinceClassBRevision ?? input.since_class_b_revision ?? input.loadedContextEpoch ?? input.loaded_context_epoch;
  const sinceClassBRevision = sinceRaw === undefined || sinceRaw === null || sinceRaw === "" ? null : Number(sinceRaw);
  if (sinceClassBRevision !== null && (!Number.isInteger(sinceClassBRevision) || sinceClassBRevision < 0)) throw new Error("since_class_b_revision must be a non-negative integer");
  fs.mkdirSync(outDir, { recursive: true });
  const state = readContextState(root);
  const parts = [
    "# Strata Context Export",
    "",
    `created_at: ${createdAt}`,
    "authority_model: Git-tracked context files",
    "empty_context_valid: true",
    `include_classes: ${includeClasses.join(",")}`,
    sinceClassBRevision === null ? "class_b_filter: full" : `class_b_filter: accepted_class_b_revision>${sinceClassBRevision}`,
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
    if (klass === "B") files = files.filter((file) => shouldIncludeClassB(file, sinceClassBRevision));
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
    markdown_path: markdownPath,
    source_index_path: sourceIndexPath,
    source_count: sources.length,
    state,
    created_at: createdAt,
  });
  return resultEnvelope("sctl.context.export_markdown.v2", true, { out_dir: outDir, markdown_path: markdownPath, source_index_path: sourceIndexPath, manifest_path: manifestPath, source_count: sources.length, state, include_classes: includeClasses, since_class_b_revision: sinceClassBRevision }, [], [markdownPath, sourceIndexPath, manifestPath]);
}
