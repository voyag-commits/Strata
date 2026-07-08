import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contextFreshness, putContextEntry, repoStatus } from "../src/lib/context.js";
import { putClassBFile } from "../src/lib/classb.js";

function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }

test("Class A update increments revision and marks full context dispatch required", () => {
  const root = tmp("sctl-classa-epoch-");
  const before = repoStatus(root).result.state;
  const result = putContextEntry(root, { klass: "A", id: "context_taxonomy", title: "Context Taxonomy", body: "Class A owns doctrine and pin policy." });
  assert.equal(result.ok, true);
  const after = repoStatus(root).result.state;
  assert.equal(after.context_epoch, before.context_epoch + 1);
  assert.equal(after.class_a_revision, before.class_a_revision + 1);
  assert.equal(after.refresh_required, true);
  assert.equal(after.refresh_reason.includes("Class A contract or doctrine update"), true);
});

test("simple revision math routes Class B changes to latest-two context export", () => {
  const root = tmp("sctl-context-math-");
  for (let i = 1; i <= 3; i += 1) putClassBFile(root, { id: `B_A001_${i}`, title: `B ${i}`, assignmentId: "A001", agentId: "author_001", role: "Change Author" });
  const result = contextFreshness(root, { loadedContextEpoch: 1 });
  assert.equal(result.result.current_class_b_revision, 3);
  assert.equal(result.result.class_b_delta, 2);
  assert.equal(result.result.math, "3-1=2");
  assert.equal(result.result.export_mode, "class_b_latest");
  assert.equal(result.result.action, "latest_class_b_context_export");
  assert.equal(result.result.class_b_latest_count, 2);
});

test("generic context put routes Class B users to classb commands", () => {
  const root = tmp("sctl-context-b-reject-");
  assert.throws(() => putContextEntry(root, { klass: "B", id: "B1", title: "B1", body: "Body" }), /use classb commands/);
});


test("missing loaded Class A revision is treated as stale after Class A update", () => {
  const root = tmp("sctl-classa-missing-loaded-works-");
  putContextEntry(root, { klass: "A", id: "cycle_entry_contract", title: "Cycle Entry Contract", body: "Manual entry is Class A governed." });
  const result = contextFreshness(root, { loadedContextEpoch: 0 });
  assert.equal(result.result.class_a_delta, 1);
  assert.equal(result.result.retire_session, true);
  assert.equal(result.result.action, "retire_and_full_context_export");
});
