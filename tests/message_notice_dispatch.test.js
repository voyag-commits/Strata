import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { putClassBFile } from "../src/lib/classb.js";
import { contextFreshness } from "../src/lib/context.js";
import { registerSession, sendTeamMessage } from "../src/lib/messages.js";
import { recordDispatch } from "../src/lib/dispatch_outbox.js";

function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }

test("dispatch envelope is deterministic Class C team message plus context export", () => {
  const root = tmp("sctl-deterministic-dispatch-");
  registerSession(root, { assignmentId: "A001", role: "Reviewer / QC Engineer", id: "reviewer_001" });
  registerSession(root, { assignmentId: "A999", role: "Reviewer / QC Engineer", id: "reviewer_other" });

  const b = putClassBFile(root, { id: "B_A001_READY", title: "Ready", assignmentId: "A001", agentId: "change_author_001", role: "Change Author" });
  assert.equal(b.ok, true);
  assert.equal(fs.existsSync(path.join(root, ".strata", "context", "C", "notices", "pending", "reviewer_other")), false);

  const msg = sendTeamMessage(root, { assignmentId: "A001", threadId: "THREAD_A001_REVIEW", messageId: "TM_A001_REVIEW", fromRole: "Change Author", fromId: "change_author_001", toRole: "Reviewer / QC Engineer", toId: "reviewer_001", messageKind: "qc_review_request", body: "Please review the Class B report.", relatedClassB: [b.result.file] });
  assert.equal(msg.ok, true);

  const dispatch = recordDispatch(root, { assignmentId: "A001", nonce: "N1", fromRole: "Change Author", fromId: "change_author_001", targetRole: "Reviewer / QC Engineer", targetId: "reviewer_001", messageFile: msg.result.file, relatedClassB: [b.result.file], summary: "Review request" });
  assert.equal(dispatch.ok, true);
  assert.equal(dispatch.result.notice_count, 0);
  const packet = fs.readFileSync(dispatch.result.outbox.packetMdPath, "utf8");
  assert.equal(packet.includes("dispatch_format: deterministic_class_c_plus_context_export_v1"), true);
  assert.equal(packet.includes("# Class C Team Message"), true);
  assert.equal(packet.includes("# Below is system level full context picture."), true);
  assert.equal(packet.includes("# Strata Context Export"), true);
  assert.equal(packet.includes("## Class B"), true);
  assert.equal(packet.includes("Delivery: paste"), false);
  assert.equal(fs.existsSync(dispatch.result.git_snapshot.packetMdPath), true);
  const gitPacket = fs.readFileSync(dispatch.result.git_snapshot.packetMdPath, "utf8");
  assert.equal(gitPacket, packet);
});

test("Class B revision math selects delta or full export policy", () => {
  const root = tmp("sctl-b-freshness-");
  registerSession(root, { assignmentId: "A777", role: "Reviewer / QC Engineer", id: "reviewer_777" });
  let last;
  for (let i = 1; i <= 11; i += 1) {
    last = putClassBFile(root, { id: `B_A777_${i}`, title: `B ${i}`, assignmentId: "A777", agentId: "change_author_777", role: "Change Author" });
    assert.equal(last.ok, true);
  }
  assert.equal(last.result.state.class_b_updates_since_full_refresh, 11);
  assert.equal(last.result.state.current_class_b_revision, 11);
  assert.equal(last.result.state.refresh_required, true);

  const delta = contextFreshness(root, { loadedContextEpoch: 8 });
  assert.equal(delta.result.math, "11-8=3");
  assert.equal(delta.result.export_mode, "class_b_delta");

  const full = contextFreshness(root, { loadedContextEpoch: 1 });
  assert.equal(full.result.math, "11-1=10");
  assert.equal(full.result.export_mode, "full");
});
