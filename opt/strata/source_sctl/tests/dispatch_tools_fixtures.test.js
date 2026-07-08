import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { recordDispatch, renderDispatchToFile } from "../src/lib/dispatch_outbox.js";
import { TOOLS } from "../src/lib/tools.js";
import { listTemplates } from "../src/lib/protocol.js";
import { runFixtureScene } from "../src/lib/fixtures.js";

function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }
function gitLog(root) { return spawnSync("git", ["log", "--oneline", "--all"], { cwd: path.join(root, ".strata", "context"), encoding: "utf8" }).stdout; }

test("dispatch record writes paste-ready outbox and Git dispatch packet snapshot", () => {
  const root = tmp("sctl-dispatch-record-");
  const result = recordDispatch(root, { assignmentId: "A010", nonce: "N1", targetRole: "Change Author", targetId: "change_author_001", summary: "Prepare template change", declaredFiles: ["TEMPLATE:src/example.md"] });
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(result.result.outbox.packetMdPath), true);
  assert.equal(fs.existsSync(result.result.git_snapshot.packetMdPath), true);
  assert.equal(fs.existsSync(result.result.dispatch_log_path), true);
  assert.equal(gitLog(root).includes("dispatch record A010 N1"), true);
  const packet = fs.readFileSync(result.result.outbox.packetMdPath, "utf8");
  assert.equal(packet.split(/\r?\n/)[0], "The coordinator assigned the following tasks via team internal envelope. Follow and perform the tasks accordingly.");
  assert.equal(packet.includes("assignment_id: A010"), true);
  assert.equal(packet.includes("The coordinator assigned the following tasks via team internal envelope."), true);
  assert.equal(packet.includes("# This is the template you use for submission"), true);
  assert.equal(packet.includes("# Class C Team Message"), false);
  const log = JSON.parse(fs.readFileSync(result.result.dispatch_log_path, "utf8"));
  assert.equal(log.metadata.nonce, "N1");
  assert.equal(log.metadata.pasted_body_metadata_policy, "assignment_id_only");
  assert.equal(log.metadata.dispatch_envelope_template.path, "templates/dispatch/deterministic_dispatch_envelope.template.md");
  assert.equal(log.dispatch_envelope.pasted_body, packet);
});

test("dispatch envelope template file is the authoritative render shape", () => {
  const root = tmp("sctl-dispatch-template-authority-");
  const rendered = renderDispatchToFile(root, { assignmentId: "A012", nonce: "N1", targetRole: "Change Author", targetId: "change_author_001" });
  assert.equal(rendered.ok, true);
  const text = fs.readFileSync(rendered.result.packetMdPath, "utf8");
  const template = fs.readFileSync(path.resolve("templates/dispatch/deterministic_dispatch_envelope.template.md"), "utf8");
  assert.equal(template.includes("<fixed_header>"), true);
  assert.equal(template.includes("<context_export>"), true);
  assert.equal(template.includes("<submission_template>"), true);
  assert.equal(rendered.result.packet.dispatch_envelope_template.path, "templates/dispatch/deterministic_dispatch_envelope.template.md");
  assert.equal(text.includes("<fixed_header>"), false);
  assert.equal(text.includes("<context_export>"), false);
  assert.equal(text.includes("<submission_template>"), false);
  assert.equal(text.split(/\r?\n/)[0], "The coordinator assigned the following tasks via team internal envelope. Follow and perform the tasks accordingly.");
});

test("dispatch render is deterministic in structure and does not commit", () => {
  const root = tmp("sctl-dispatch-render-");
  const rendered = renderDispatchToFile(root, { assignmentId: "A011", nonce: "N1", targetRole: "Reviewer", targetId: "reviewer_001", summary: "Review only" });
  assert.equal(rendered.ok, true);
  const text = fs.readFileSync(rendered.result.packetMdPath, "utf8");
  assert.equal(text.split(/\r?\n/)[0], "A codebase change has been made by Change Author. The task definitions, overall architecture, and task progress can be reviewed in the context picture. Review the most recent code changes, make merge/deny decision, and submit your work via assigned path.");
  assert.equal(text.includes("A codebase change has been made by Change Author."), true);
  assert.equal(text.includes("# Class C Team Message"), false);
  assert.equal(text.includes("# Runtime Inputs And Return Contract"), false);
  assert.equal(text.includes("# Below is system level full context picture."), true);
  assert.equal(text.includes("# This is the template you use for submission"), true);
  assert.equal(fs.existsSync(path.join(root, ".strata", "context", ".git")), false);
});

test("tool registry is operational tooling only and protocol has no evidence_ready template", () => {
  assert.equal(TOOLS.every((tool) => tool.operator_role === "Tooling / Dispatch Operator"), true);
  assert.equal(TOOLS.every((tool) => tool.runtime_tmux === false), true);
  assert.equal(TOOLS.every((tool) => tool.watches_implementation_git === false), true);
  assert.equal(TOOLS.map((t) => t.tool_id).join("\n").toLowerCase().includes("scan_git"), false);
  assert.equal(listTemplates().includes("worker_return_packet.evidence_ready"), false);
});

test("fixture scene produces team activity Git log", () => {
  const root = tmp("sctl-fixture-scene-");
  const result = runFixtureScene(root, "deterministic_dispatch_envelope");
  assert.equal(result.ok, true);
  const joined = result.result.git_log.join("\n");
  assert.equal(joined.includes("class B report put"), true);
  assert.equal(joined.includes("team message"), true);
  assert.equal(joined.includes("dispatch record"), true);
});
