import path from "node:path";
import { bootstrap } from "./context.js";
import { recordDispatch } from "./dispatch_outbox.js";
import { putClassBFile } from "./classb.js";
import { registerSession, sendTeamMessage } from "./messages.js";
import { isoNow, resultEnvelope, run, writeJson, writeText } from "./common.js";
import { ensureLayout } from "./layout.js";
import { defaultOperationalReportBody } from "./reports.js";

export const SCENES = {
  direct_to_trunk_small_change: {
    description: "Direct-to-trunk template workflow with deterministic dispatch and reviewer activity.",
    assignment_id: "A001",
  },
  short_lived_branch_review: {
    description: "Short-lived branch represented by declared template paths and review outcome.",
    assignment_id: "A002",
  },
  blocker_recovery: {
    description: "Blocker path with defect-style Class B and deterministic context export.",
    assignment_id: "A003",
  },
  deterministic_dispatch_context: {
    description: "Class C task message plus context.export_markdown output; no notice-state dependency.",
    assignment_id: "A004",
  },
  deterministic_dispatch_envelope: {
    description: "Alias for deterministic Class C plus context export dispatch fixture.",
    assignment_id: "A004",
  },
  deterministic_dispatch_envelope: {
    description: "Alias for deterministic_dispatch_context; Class C task message plus context export envelope.",
    assignment_id: "A004",
  },
};

export function listFixtureScenes() {
  return resultEnvelope("sctl.fixtures.list_scenes.v1", true, { scenes: Object.entries(SCENES).map(([name, meta]) => ({ name, ...meta })) }, [], []);
}

function contextGitLog(root) {
  const l = ensureLayout(root);
  const r = run("git", ["log", "--oneline", "--all"], { cwd: l.context });
  return r.ok ? r.stdout.trim().split(/\r?\n/).filter(Boolean) : [];
}

function writeReturnFixture(root, assignmentId, agentId, reportBody) {
  const l = ensureLayout(root);
  const dir = path.join(l.returns, assignmentId, agentId);
  const report = writeText(path.join(dir, "operational_report.md"), reportBody);
  const packet = writeJson(path.join(dir, "packet.json"), {
    contract_id: "worker_return_packet.v1",
    return_id: `RET_${assignmentId}_${agentId}`,
    assignment_id: assignmentId,
    agent_id: agentId,
    role: agentId.includes("reviewer") ? "Reviewer / QC Engineer" : "Change Author",
    return_kind: "OPERATIONAL_REPORT_READY",
    status: "ready",
    summary: "Synthetic fixture report ready.",
    nonce: `${assignmentId}_RET_1`,
    report_scope: "actionable_report",
    implementation_repository: "TEMPLATE_ONLY",
    implementation_commit: null,
    trunk_branch: "main",
    short_lived_branch: null,
    integration_mode: "direct_to_trunk",
    supersedes_entry_id: null,
    message_path: null,
    question_path: null,
    report_path: report,
    diagnostic_path: null,
    created_at: isoNow(),
  });
  return { report, packet };
}

export function runFixtureScene(root, name) {
  if (!SCENES[name]) throw new Error(`unknown fixture scene: ${name}`);
  const l = ensureLayout(root);
  const assignmentId = SCENES[name].assignment_id;
  const evidence = [];
  bootstrap(root);
  evidence.push(registerSession(root, { assignmentId, role: "Change Author", id: "change_author_001", sessionMode: "disposable" }));
  evidence.push(registerSession(root, { assignmentId, role: "Reviewer / QC Engineer", id: "reviewer_001", sessionMode: "disposable" }));

  if (name === "direct_to_trunk_small_change") {
    evidence.push(recordDispatch(root, { assignmentId, nonce: `${assignmentId}_N1`, targetRole: "Change Author", targetId: "change_author_001", summary: "Prepare template direct-to-trunk change.", declaredFiles: ["TEMPLATE:src/small_change.md", "TEMPLATE:tests/small_change.test.md"], dispatchKind: "DECLARED_DELTA" }));
    evidence.push(putClassBFile(root, { id: `B_${assignmentId}_OPERATIONAL_READY`, title: `${assignmentId} operational ready`, assignmentId, agentId: "change_author_001", role: "Change Author", scope: "actionable_report", summary: "Template direct-to-trunk change completed.", progressDelta: "Change Author prepared the declared template delta.", trunkIntegration: "Integration mode is direct_to_trunk with template references only.", verification: "Fixture verification passed through SCTL validation.", evidenceDetail: "Dispatch packet and Class B report body carry the accepted evidence.", nextAction: "Reviewer receives Class C request with exported context." }));
    const msg = sendTeamMessage(root, { assignmentId, threadId: `THREAD_${assignmentId}_REVIEW`, messageId: `TM_${assignmentId}_REVIEW_REQUEST`, fromRole: "Change Author", fromId: "change_author_001", toRole: "Reviewer / QC Engineer", toId: "reviewer_001", messageKind: "qc_review_request", relatedClassB: [path.join(l.classB, `b_${assignmentId.toLowerCase()}_operational_ready.md`)], body: "Please review the operational report and confirm fixture acceptance." });
    evidence.push(msg);
    evidence.push(recordDispatch(root, { assignmentId, nonce: `${assignmentId}_N2`, fromRole: "Change Author", fromId: "change_author_001", targetRole: "Reviewer / QC Engineer", targetId: "reviewer_001", summary: "Review request with deterministic context export.", messageFile: msg.result.file, relatedClassB: msg.result.related_class_b, dispatchKind: "TEAM_MESSAGE" }));
  }

  if (name === "short_lived_branch_review") {
    evidence.push(recordDispatch(root, { assignmentId, nonce: `${assignmentId}_N1`, targetRole: "Change Author", targetId: "change_author_001", summary: "Prepare short-lived branch template review.", declaredFiles: ["TEMPLATE:branches/short_lived_delta.md"], dispatchKind: "DECLARED_DELTA" }));
    evidence.push(putClassBFile(root, { id: `B_${assignmentId}_REVIEW_OUTCOME`, title: `${assignmentId} review outcome`, assignmentId, agentId: "reviewer_001", role: "Reviewer / QC Engineer", scope: "review_outcome", summary: "Reviewer accepted the short-lived branch fixture after SCTL validation.", progressDelta: "Review outcome recorded as a Class B report.", trunkIntegration: "Short-lived branch metadata is represented by declared template paths.", verification: "Fixture scene generated a review outcome report and Git activity log.", evidenceDetail: "SCTL context Git contains dispatch and Class B commits.", nextAction: "Proceed to next trunk-safe assignment." }));
  }

  if (name === "blocker_recovery") {
    evidence.push(recordDispatch(root, { assignmentId, nonce: `${assignmentId}_N1`, targetRole: "Change Author", targetId: "change_author_001", summary: "Recover from blocker using template diagnostic.", declaredFiles: ["TEMPLATE:diagnostics/blocker_recovery.md"], dispatchKind: "DECLARED_DELTA" }));
    evidence.push(putClassBFile(root, { id: `B_${assignmentId}_DEFECT_RECORD`, title: `${assignmentId} blocker recovery defect record`, assignmentId, agentId: "change_author_001", role: "Change Author", scope: "defect_record", summary: "Blocker was recorded as a defect-style Class B report.", progressDelta: "The fixture moved from blocked state to recovery plan.", trunkIntegration: "No live implementation Git was watched.", verification: "SCTL accepted the strict report body.", evidenceDetail: "Evidence is embedded in this report section.", risks: "Recovery remains open until Reviewer returns outcome.", nextAction: "Reviewer receives recovery review request." }));
  }

  if (name === "deterministic_dispatch_context" || name === "deterministic_dispatch_envelope") {
    evidence.push(putClassBFile(root, { id: `B_${assignmentId}_OPERATIONAL_READY`, title: `${assignmentId} operational ready`, assignmentId, agentId: "change_author_001", role: "Change Author", scope: "actionable_report", summary: "Class B update changed current_class_b_revision for export math." }));
    const msg = sendTeamMessage(root, { assignmentId, threadId: `THREAD_${assignmentId}_DETERMINISTIC`, messageId: `TM_${assignmentId}_DETERMINISTIC`, fromRole: "Change Author", fromId: "change_author_001", toRole: "Reviewer / QC Engineer", toId: "reviewer_001", messageKind: "coordination_note", relatedClassB: [path.join(l.classB, `b_${assignmentId.toLowerCase()}_operational_ready.md`)], body: "Use this Class C team message as the task guide. Use the exported context below as the system picture." });
    evidence.push(msg);
    evidence.push(recordDispatch(root, { assignmentId, nonce: `${assignmentId}_N1`, fromRole: "Change Author", fromId: "change_author_001", targetRole: "Reviewer / QC Engineer", targetId: "reviewer_001", summary: "Deterministic dispatch context fixture.", messageFile: msg.result.file, relatedClassB: msg.result.related_class_b, dispatchKind: "TEAM_MESSAGE" }));
  }

  if (name === "direct_to_trunk_small_change") {
    const ret = writeReturnFixture(root, assignmentId, "change_author_001", defaultOperationalReportBody({ title: "Fixture Operational Report", evidenceDetail: "Return fixture evidence is the report body and packet path." }));
    evidence.push({ evidence_paths: [ret.report, ret.packet] });
  }

  const log = contextGitLog(root);
  return resultEnvelope("sctl.fixtures.run_scene.v1", true, { scene: name, assignment_id: assignmentId, git_log: log }, [], evidence.flatMap((x) => x.evidence_paths || []));
}
