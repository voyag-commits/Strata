import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyWorkerReturnPacket } from "../src/lib/worker_returns.js";
import { listClassB } from "../src/lib/classb.js";
import { defaultOperationalReportBody } from "../src/lib/reports.js";

function basePacket(reportPath, override = {}) {
  return {
    contract_id: "worker_return_packet.v1",
    return_id: "R1",
    assignment_id: "A001",
    agent_id: "change_author_001",
    role: "Change Author",
    return_kind: "OPERATIONAL_REPORT_READY",
    status: "ready",
    summary: "done",
    nonce: "N1",
    report_scope: "actionable_report",
    implementation_repository: "TEMPLATE_ONLY",
    implementation_commit: null,
    trunk_branch: "main",
    short_lived_branch: null,
    integration_mode: "direct_to_trunk",
    supersedes_entry_id: null,
    report_path: reportPath,
    message_path: null,
    question_path: null,
    diagnostic_path: null,
    created_at: new Date().toISOString(),
    ...override,
  };
}

function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }

test("OPERATIONAL_REPORT_READY validates report body and remains separate from Class B", () => {
  const root = tmp("sctl-operational-ready-");
  const returnsDir = path.join(root, ".strata", "returns", "A001", "change_author_001");
  fs.mkdirSync(returnsDir, { recursive: true });
  const report = path.join(returnsDir, "operational_report.md");
  fs.writeFileSync(report, defaultOperationalReportBody({ title: "Operational Report" }), "utf8");
  const packet = path.join(returnsDir, "packet.json");
  fs.writeFileSync(packet, JSON.stringify(basePacket(report), null, 2));
  const result = classifyWorkerReturnPacket(root, packet);
  assert.equal(result.ok, true);
  assert.equal(result.result.classification.routing_decision, "OPERATIONAL_REPORT_READY_LEDGERED_NOT_CLASS_B");
  assert.equal(result.result.classification.class_b_entry_path, null);
  assert.equal(listClassB(root).length, 0);
});

test("malformed OPERATIONAL_REPORT_READY report is routed to Class D and error dispatch", () => {
  const root = tmp("sctl-operational-bad-report-");
  const returnsDir = path.join(root, ".strata", "returns", "A001", "change_author_001");
  fs.mkdirSync(returnsDir, { recursive: true });
  const report = path.join(returnsDir, "operational_report.md");
  fs.writeFileSync(report, "# Operational Report\n\nmissing sections\n", "utf8");
  const packet = path.join(returnsDir, "packet.json");
  fs.writeFileSync(packet, JSON.stringify(basePacket(report), null, 2));
  const result = classifyWorkerReturnPacket(root, packet);
  assert.equal(result.ok, false);
  assert.equal(result.result.classification.routing_decision, "OPERATIONAL_REPORT_READY_INVALID_TO_CLASSD");
  assert.ok(result.result.classification.error_dispatch);
  assert.equal(listClassB(root).length, 0);
});

test("EVIDENCE_READY and evidence_path are retired from Worker Return Packets", () => {
  const root = tmp("sctl-evidence-retired-");
  const packet = path.join(root, "packet.json");
  fs.writeFileSync(packet, JSON.stringify({
    contract_id: "worker_return_packet.v1",
    return_id: "R2",
    assignment_id: "A001",
    agent_id: "change_author_001",
    role: "Change Author",
    return_kind: "EVIDENCE_READY",
    status: "evidence_recorded_not_class_b",
    summary: "evidence only",
    nonce: "N2",
    report_scope: "evidence_only",
    message_path: null,
    question_path: null,
    report_path: null,
    diagnostic_path: null,
    evidence_path: ".strata/evidence/A001/change_author_001/evidence.json",
    created_at: new Date().toISOString()
  }, null, 2));
  const result = classifyWorkerReturnPacket(root, packet);
  assert.equal(result.ok, false);
  assert.equal(result.result.classification.routing_decision, "INVALID_RETURN_PACKET_TO_CLASSD");
  assert.equal(result.result.classification.errors.some((e) => e.includes("evidence_path is retired")), true);
});
