import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { putClassBFile, validateClassBFile, commitClassBFile, listClassB } from "../src/lib/classb.js";
import { registerSession } from "../src/lib/messages.js";
import { exportMarkdown } from "../src/lib/export.js";

function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }
function git(cwd, args) { return spawnSync("git", args, { cwd, encoding: "utf8" }); }

test("Class B is strict Git-tracked report without notice-state machinery", () => {
  const root = tmp("sctl-classb-strict-");
  registerSession(root, { assignmentId: "A001", role: "Reviewer / QC Engineer", id: "reviewer_001" });

  const created = putClassBFile(root, { id: "B_A001_OPERATIONAL_READY", title: "Entry", assignmentId: "A001", agentId: "change_author_001", role: "Change Author", scope: "actionable_report" });
  assert.equal(created.ok, true);
  assert.match(created.result.file, /\.strata\/context\/B\/b_a001_operational_ready\.md$/);
  assert.equal(created.result.state.current_class_b_revision, 1);

  const valid = validateClassBFile(root, { file: created.result.file });
  assert.equal(valid.ok, true);
  assert.equal(listClassB(root).length, 1);

  const exported = exportMarkdown(root, {});
  const text = fs.readFileSync(exported.result.markdown_path, "utf8");
  assert.equal(text.includes("## Class B"), true);
  assert.equal(text.includes("accepted_class_b_revision: 1"), true);
  assert.equal(text.includes("## Operational Summary"), true);
});

test("Class B validator rejects loose Markdown and commit denial records error dispatch", () => {
  const root = tmp("sctl-classb-deny-");
  const bad = path.join(root, ".strata", "context", "B", "bad.md");
  fs.mkdirSync(path.dirname(bad), { recursive: true });
  fs.writeFileSync(bad, "random line with class: B\n", "utf8");

  const valid = validateClassBFile(root, { file: bad });
  assert.equal(valid.ok, false);
  assert.equal(valid.errors.some((e) => e.includes("frontmatter")), true);

  const denied = commitClassBFile(root, { file: bad });
  assert.equal(denied.ok, false);
  assert.equal(denied.result.commit_denied, true);
  assert.equal(fs.existsSync(denied.result.error_dispatch.dispatch_log_path), true);

  const status = git(path.join(root, ".strata", "context"), ["status", "--short"]);
  assert.equal(status.ok || status.status === 0, true);
  assert.equal(status.stdout.includes("?? B/"), true);
});

test("Class B validator rejects invalid status, timestamp, and empty required sections", () => {
  const root = tmp("sctl-classb-schema-");
  const bad = path.join(root, ".strata", "context", "B", "bad_schema.md");
  fs.mkdirSync(path.dirname(bad), { recursive: true });
  fs.writeFileSync(bad, `---
contract_id: strata.class_b.file.v1
class: B
id: BAD_SCHEMA
title: Bad
scope: actionable_report
assignment_id: A001
agent_id: agent_001
role: Change Author
status: banana
evidence: included
loaded_context_epoch: not_a_number
created_at: yesterday
---

# Bad

## Operational Summary

## Progress Delta

x

## Trunk Integration

x

## Verification

x

## Evidence

x

## Risks / Blockers

x

## Next Action

x
`, "utf8");
  const result = validateClassBFile(root, { file: bad });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((e) => e.includes("status")), true);
  assert.equal(result.errors.some((e) => e.includes("loaded_context_epoch")), true);
  assert.equal(result.errors.some((e) => e.includes("created_at")), true);
  assert.equal(result.errors.some((e) => e.includes("section must not be empty")), true);
});

test("Class B accepts Coordinator Work Order contract without operational-report sections", () => {
  const root = tmp("sctl-classb-workorder-");
  const file = path.join(root, ".strata", "context", "B", "wo_a001_c01.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---
contract_id: strata.class_b.coordinator_work_order.v1
class: B
id: WO_A001_C01_CHANGE_AUTHOR
scope: actionable_report
status: ready
assignment_id: A001
cycle_id: C01
work_order_id: WO_A001_C01_CHANGE_AUTHOR
coordinator_id: coord_001
target_role: Change Author
target_session_mode: disposable
dispatch_required: true
director_entry_document_path: .strata/context/A/director_governing_entries/a001/cycle.md
director_entry_document_sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
created_at: 2026-06-18T00:00:00.000Z
---

# Coordinator Work Order

## Objective

Do one bounded change.

## Required Change Items

1. **Change item:** Patch one function.
   - Target area/files: src/example.js
   - Required action: implement
   - Acceptance condition: tests pass
   - Evidence required: test output

## General Work Rules

- Inspect relevant files before editing.

## Scope

In scope: one function.

## Codebase Assignment

Codebase repo: /tmp/codebase  
Base branch: main  
Assigned branch: change/A001/C01

## Acceptance Criteria

- Tests pass.

## Validation

Run: npm test

## Return Contract

Packet: /tmp/packet.json  
Operational report: /tmp/operational_report.md

## Evidence Required

- Changed files

## Stop / Escalation Conditions

- Missing repo/path

## Merge / Completion Expectation

Author does not merge.
`, "utf8");

  const valid = validateClassBFile(root, { file });
  assert.equal(valid.ok, true);
  const committed = commitClassBFile(root, { file });
  assert.equal(committed.ok, true);
  assert.equal(committed.result.accepted_class_b_revision, 1);
});

test("Coordinator Work Order template starts with parseable frontmatter", () => {
  const template = fs.readFileSync("templates/work_products/coordinator_work_order.template.md", "utf8");
  assert.equal(template.startsWith("---\n"), true);
  assert.doesNotMatch(template.slice(0, 80), /^Submission path:/);
  assert.match(template, /submission_path: <submission_path>/);
});

test("Review Outcome template asks for an explicit merge-gate recommendation", () => {
  const template = fs.readFileSync("templates/reports/review_outcome.template.md", "utf8");
  assert.match(template, /Recommendation: <approved, denied, or blocked>/);
});

test("SCTL context Git is isolated inside an outer implementation Git repo", () => {
  const root = tmp("sctl-isolated-context-");
  git(root, ["init"]);
  git(root, ["config", "user.email", "outer@example.invalid"]);
  git(root, ["config", "user.name", "Outer"]);

  const created = putClassBFile(root, { id: "B_ISOLATED", title: "Isolated", assignmentId: "A010", agentId: "tooling_operator", role: "Tooling / Dispatch Operator" });
  assert.equal(created.ok, true);
  assert.equal(fs.existsSync(path.join(root, ".strata", "context", ".git")), true);
  const outerLog = git(root, ["log", "--oneline", "--all"]);
  assert.equal(outerLog.stdout.trim(), "");
  const contextLog = git(path.join(root, ".strata", "context"), ["log", "--oneline", "--all"]);
  assert.equal(contextLog.stdout.includes("class B report put B_ISOLATED"), true);
});
