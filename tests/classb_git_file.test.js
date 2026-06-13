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
