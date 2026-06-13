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
});

test("dispatch render is deterministic in structure and does not commit", () => {
  const root = tmp("sctl-dispatch-render-");
  const rendered = renderDispatchToFile(root, { assignmentId: "A011", nonce: "N1", targetRole: "Reviewer", targetId: "reviewer_001", summary: "Review only" });
  assert.equal(rendered.ok, true);
  const text = fs.readFileSync(rendered.result.packetMdPath, "utf8");
  assert.equal(text.includes("# Class C Team Message"), true);
  assert.equal(text.includes("# Below is system level full context picture."), true);
  assert.equal(text.includes("empty_context_valid: true"), true);
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
