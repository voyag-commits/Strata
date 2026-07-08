import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startCycleFromManualEntry, exitCycle, writeManualCycleEntryTemplate } from "../src/lib/cycles.js";
import { putClassBFile } from "../src/lib/classb.js";
import { exportMarkdown } from "../src/lib/export.js";

function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }

function directorEntry() {
  return `# Director Governing Entry Document

## Objective

Patch the routing workflow.

## Required Work

Add the Director Entry commit gate.

## Definition Of Done

The coordinator starts from committed Class A context.

## Stop Conditions

Exit on completion or architectural blocker.
`;
}

test("Director Entry Document is committed to Class A, normalized by reference, and dispatched to Coordinator", () => {
  const root = tmp("sctl-director-entry-");
  const entryDir = path.join(root, ".strata", "cycles", "director_entry");
  fs.mkdirSync(entryDir, { recursive: true });
  const entryFile = path.join(entryDir, "director_governing_entry.md");
  fs.writeFileSync(entryFile, directorEntry(), "utf8");

  const started = startCycleFromManualEntry(root, {
    entryFile,
    assignmentId: "A100",
    coordinatorId: "coord_001",
    codebaseRepo: "/tmp/codebase",
    trunkBranch: "main",
    changeBranch: "change/A100/C01-smoke",
    shortName: "smoke",
  });
  assert.equal(started.ok, true);
  assert.equal(started.result.entry.validation_policy, "markdown_file_only_no_director_semantic_parsing");
  assert.equal(started.result.entry.director_entry_document.sha256, started.result.director_entry_document.sha256);
  assert.equal(started.result.director_entry_document.class, "A");
  assert.equal(started.result.director_entry_document.contract_id, "strata.class_a.director_governing_entry_document.v1");
  assert.equal(fs.existsSync(started.result.director_entry_document.path), true);
  assert.equal(fs.existsSync(started.result.entry_path), true);
  assert.equal(started.result.coordinator_dispatch.packet.dispatch_kind, "DIRECTOR_ENTRY_CONTEXT_COMMIT");
  assert.equal(started.result.coordinator_dispatch.packet.declared_files.includes("CODEBASE_REPO:/tmp/codebase"), true);
  assert.match(fs.readFileSync(started.result.coordinator_dispatch.outbox.packetMdPath, "utf8"), /Assigned branch: change\/A100\/C01-smoke/);

  const entry = JSON.parse(fs.readFileSync(started.result.entry_path, "utf8"));
  assert.equal(entry.director_entry_document.git_commit, started.result.director_entry_document.git_commit);
  assert.match(entry.director_entry_document.sha256, /^[a-f0-9]{64}$/);

  const exported = exportMarkdown(root, { includeClasses: "A,B" });
  const text = fs.readFileSync(exported.result.markdown_path, "utf8");
  assert.equal(text.includes("# Director Governing Entry Document"), true);

  const exited = exitCycle(root, { cycleId: started.result.cycle_id, reason: "complete", summary: "done" });
  assert.equal(exited.ok, true);
  assert.equal(fs.existsSync(exited.result.exit_path), true);
});


test("explicit Director Entry file outside controlled inbox is rejected", () => {
  const root = tmp("sctl-director-entry-path-guard-");
  const outside = path.join(root, "director_governing_entry.md");
  fs.writeFileSync(outside, directorEntry(), "utf8");

  const started = startCycleFromManualEntry(root, { entryFile: outside, assignmentId: "A101", coordinatorId: "coord_001" });
  assert.equal(started.ok, false);
  assert.match(started.errors.join("\n"), /Director Entry Document file must be under \.strata\/cycles\/director_entry/);
});

test("cycle template writes the dedicated Director Entry Markdown file", () => {
  const root = tmp("sctl-cycle-template-");
  const result = writeManualCycleEntryTemplate(root, {});
  assert.equal(result.ok, true);
  assert.equal(result.result.file.endsWith(path.join(".strata", "cycles", "director_entry", "director_governing_entry.md")), true);
  const text = fs.readFileSync(result.result.file, "utf8");
  assert.equal(text.includes("# Director Governing Entry Document"), true);
  assert.equal(text.includes("## Objective"), true);
});

test("context export latest-class-b keeps only newest Class B reports", () => {
  const root = tmp("sctl-latest-classb-");
  for (let i = 1; i <= 4; i += 1) {
    const result = putClassBFile(root, { id: `B_LATEST_${i}`, title: `B ${i}`, assignmentId: "A200", agentId: "coordinator", role: "Delegated Coordinator" });
    assert.equal(result.ok, true);
  }
  const exported = exportMarkdown(root, { latestClassB: 2 });
  assert.equal(exported.ok, true);
  const text = fs.readFileSync(exported.result.markdown_path, "utf8");
  assert.equal(text.includes("id: B_LATEST_1"), false);
  assert.equal(text.includes("id: B_LATEST_2"), false);
  assert.equal(text.includes("id: B_LATEST_3"), true);
  assert.equal(text.includes("id: B_LATEST_4"), true);
  assert.equal(text.includes("class_b_filter: latest_2"), true);
});
