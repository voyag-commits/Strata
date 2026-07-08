import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CLI = path.resolve("src/cli.js");
function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }
function cli(args) { return spawnSync("node", [CLI, ...args], { encoding: "utf8" }); }
function json(run) { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); }

test("Operational tooling role can run simplified CLI workflow", () => {
  const root = tmp("sctl-cli-smoke-");
  assert.equal(json(cli(["context", "bootstrap", "--workspace", root])).ok, true);
  assert.equal(json(cli(["tools", "list", "--workspace", root])).result.tools.every((t) => t.operator_role === "Tooling / Dispatch Operator"), true);
  assert.equal(json(cli(["sessions", "register", "--workspace", root, "--assignment-id", "A900", "--role", "Reviewer / QC Engineer", "--id", "reviewer_900", "--session-mode", "disposable"])).ok, true);
  const b = json(cli(["classb", "put", "--workspace", root, "--id", "B_A900_READY", "--title", "Ready", "--assignment-id", "A900", "--agent-id", "change_author_900", "--role", "Change Author"]));
  assert.equal(b.ok, true);
  const freshness = json(cli(["context", "freshness", "--workspace", root, "--loaded-context-epoch", "0"]));
  assert.equal(freshness.result.class_b_delta, 1);
  const msg = json(cli(["message", "send", "--workspace", root, "--assignment-id", "A900", "--from-role", "Change Author", "--from-id", "change_author_900", "--to-role", "Reviewer / QC Engineer", "--to-id", "reviewer_900", "--message-kind", "qc_review_request", "--body", "Please review.", "--related-class-b", b.result.file]));
  assert.equal(msg.ok, true);
  const dispatch = json(cli(["dispatch", "record", "--workspace", root, "--assignment-id", "A900", "--nonce", "N1", "--target-role", "Reviewer / QC Engineer", "--target-id", "reviewer_900", "--message-file", msg.result.file, "--related-class-b", b.result.file, "--summary", "Review request"]));
  assert.equal(dispatch.ok, true);
  assert.equal(dispatch.result.notice_count, 0);
  const packet = fs.readFileSync(dispatch.result.outbox.packetMdPath, "utf8");
  assert.equal(packet.includes("# Below is system level full context picture."), true);
  assert.equal(packet.split(/\r?\n/)[0], "A codebase change has been made by Change Author. The task definitions, overall architecture, and task progress can be reviewed in the context picture. Review the most recent code changes, make merge/deny decision, and submit your work via assigned path.");
  assert.equal(packet.includes("assignment_id: A900"), true);
  assert.equal(packet.includes("A codebase change has been made by Change Author."), true);
  assert.equal(packet.includes("# Class C Team Message"), false);
  assert.equal(packet.includes("# Runtime Inputs And Return Contract"), false);
  assert.equal(packet.includes("# Strata Context Export"), true);
  assert.equal(packet.includes("# This is the template you use for submission"), true);
  assert.equal(fs.existsSync(path.join(root, ".strata", "context", "D_trace", "telemetry", "workflow_telemetry.jsonl")), true);
});
