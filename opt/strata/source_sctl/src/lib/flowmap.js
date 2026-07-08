import fs from "node:fs";
import path from "node:path";
import { gitCommitContext } from "./context.js";
import { ensureLayout } from "./layout.js";
import { exists, readJsonOr, readText, resultEnvelope, run, safeSegment, sha256File, writeJson, writeText } from "./common.js";
import { activeSessionsPath } from "./messages.js";

function contextRel(contextRoot, file) {
  return path.relative(contextRoot, file);
}

function pathCheck(file, extra = {}) {
  return {
    path: file,
    exists: exists(file),
    non_empty: exists(file) ? fs.statSync(file).size > 0 : false,
    sha256: exists(file) && fs.statSync(file).isFile() ? sha256File(file) : null,
    ...extra,
  };
}

function latestTelemetry(l) {
  if (!exists(l.telemetry)) return [];
  return fs.readdirSync(l.telemetry)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .slice(-5)
    .map((name) => path.join(l.telemetry, name));
}

function matchingMessages(l, assignmentId, targetId) {
  const out = [];
  if (!exists(l.classCThreads)) return out;
  for (const thread of fs.readdirSync(l.classCThreads, { withFileTypes: true })) {
    if (!thread.isDirectory()) continue;
    const threadDir = path.join(l.classCThreads, thread.name);
    for (const ent of fs.readdirSync(threadDir, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
      const file = path.join(threadDir, ent.name);
      const text = readText(file);
      if (text.includes(`assignment_id: ${assignmentId}`) && text.includes(`to_id: ${targetId}`)) out.push(file);
    }
  }
  return out.sort();
}

function lastGitLog(contextRoot) {
  const log = run("git", ["log", "--oneline", "-12"], { cwd: contextRoot });
  return log.ok ? log.stdout.trim().split(/\r?\n/).filter(Boolean) : [];
}

function gitStatus(contextRoot) {
  const status = run("git", ["status", "--short"], { cwd: contextRoot });
  return status.ok ? status.stdout.split(/\r?\n/).filter(Boolean) : [`git status failed: ${status.stderr || status.stdout}`];
}

function buildMarkdown(flowmap) {
  const lines = [
    "# SCTL Workflow Flowmap",
    "",
    `assignment_id: ${flowmap.assignment_id}`,
    `target_id: ${flowmap.target_id}`,
    `nonce: ${flowmap.nonce}`,
    `contract_id: ${flowmap.contract_id}`,
    "",
  ];
  for (const step of flowmap.steps) {
    lines.push(`## ${step.step}. ${step.name}`, "");
    lines.push(`call: ${step.call}`, "");
    lines.push(`result: ${step.result}`, "");
    lines.push(`diagnosis: ${step.diagnosis}`, "");
    if (step.watch?.length) {
      lines.push("watch:");
      for (const item of step.watch) lines.push(`- ${item.path}: exists=${item.exists} non_empty=${item.non_empty}`);
      lines.push("");
    }
  }
  lines.push("## Git Evidence", "");
  for (const item of flowmap.git_log) lines.push(`- ${item}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function buildWorkflowFlowmap(root, input = {}) {
  const l = ensureLayout(root);
  const assignmentId = safeSegment(input.assignmentId || input.assignment_id);
  const targetId = safeSegment(input.targetId || input.target_id);
  const nonce = safeSegment(input.nonce);
  const sessionName = input.sessionName || input.session_name || `STRATA-REVIEW-A-LIVE-${assignmentId.replace(/^A_LIVE_/, "").padStart(3, "0")}`;
  const flowmapDir = path.join(l.classD, "flowmaps", assignmentId, targetId, nonce);
  const packetDir = path.join(l.dispatchPackets, assignmentId, targetId, nonce);
  const packetMd = path.join(packetDir, "dispatch_packet.md");
  const packetJson = path.join(packetDir, "dispatch_packet.json");
  const contextExportDir = path.join(packetDir, "context_export");
  const activeSessions = readJsonOr(activeSessionsPath(root), { sessions: [] });
  const session = (activeSessions.sessions || []).find((s) => s.assignment_id === assignmentId && s.id === targetId) || null;
  const messageFiles = matchingMessages(l, assignmentId, targetId);
  const returnPacket = path.join(l.returns, assignmentId, targetId, "packet.json");
  const operationalReport = path.join(l.returns, assignmentId, targetId, "operational_report.md");
  const ledgerFiles = exists(l.returnLedgers)
    ? fs.readdirSync(l.returnLedgers).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(l.returnLedgers, name))
    : [];
  const classBFiles = exists(l.classB)
    ? fs.readdirSync(l.classB).filter((name) => name.endsWith(".md")).sort().map((name) => path.join(l.classB, name))
    : [];
  const sessionCapture = path.join(l.evidence, "session_captures", `${sessionName}.txt`);
  const exportedAgain = path.join(l.exports);
  const packetText = exists(packetMd) ? readText(packetMd) : "";
  const steps = [
    {
      step: 0,
      name: "Context Git exists",
      call: "node src/cli.js context bootstrap",
      result: exists(path.join(l.context, ".git")) ? "context Git repository is present" : "context Git repository is missing",
      diagnosis: exists(path.join(l.context, ".git")) ? "PASS: SCTL context Git exists and can be inspected." : "FAIL: bootstrap did not create the isolated context Git repo.",
      watch: [pathCheck(path.join(l.context, ".git")), pathCheck(path.join(l.classD, "context_state.json")), pathCheck(path.join(l.context, "README.md"))],
    },
    {
      step: 1,
      name: "Delegate session is registered",
      call: 'strata-runtime-edge delegate session-register --assignment-id A_LIVE_001 --role "Reviewer / QC Engineer" --session-id reviewer_live_001 --tmux-target STRATA-REVIEW-A-LIVE-001',
      result: session ? `registered session_name=${session.session_name} status=${session.status}` : "session registration not found",
      diagnosis: session && session.session_name === sessionName ? "PASS: registered SCTL session name matches the expected live target." : "FINDING: session record missing or name does not match expected live target.",
      watch: [pathCheck(activeSessionsPath(root), { matched_session: session }), ...latestTelemetry(l).map((file) => pathCheck(file))],
    },
    {
      step: 2,
      name: "Role submission source is in context",
      call: "node src/cli.js classb commit ... or cycle start",
      result: `${messageFiles.length} optional Class C message file(s) found`,
      diagnosis: "INSPECT: canonical dispatch no longer requires a Class C message; role work must come from committed Class A/B context and the appended submission template.",
      watch: messageFiles.map((file) => pathCheck(file)),
    },
    {
      step: 3,
      name: "Dispatch envelope is rendered and recorded",
      call: "scripts/wsl_tmux/sctl-dispatch-render ...",
      result: exists(packetMd) ? "Git snapshot dispatch packet exists" : "Git snapshot dispatch packet missing",
      diagnosis: exists(packetMd)
        && (packetText.includes("# SCTL Dispatch Envelope") || packetText.includes("# Initial task coordination envelope"))
        && packetText.includes("# Below is system level full context picture.")
        && packetText.includes("# This is the template you use for submission")
        ? "PASS: canonical Git-backed packet contains envelope title, context picture, and submission template."
        : "FAIL: dispatch packet is missing or does not satisfy required content checks.",
      watch: [
        pathCheck(packetMd),
        pathCheck(packetJson),
        pathCheck(path.join(contextExportDir, "context.md")),
        pathCheck(path.join(contextExportDir, "source_index.json")),
        pathCheck(path.join(contextExportDir, "manifest.json")),
      ],
    },
    {
      step: 4,
      name: "Delegate dispatch delivery happens",
      call: `strata-runtime-edge delegate dispatch-deliver --session-id ${targetId} --packet ${path.relative(root, packetMd)} --workspace ${root}`,
      result: exists(packetMd) ? "canonical packet is available for delegate delivery" : "canonical packet unavailable",
      diagnosis: "INSPECT: SCTL proves packet/session inputs; live session receipt is handled through delegate evidence/capture.",
      watch: [pathCheck(packetMd)],
    },
    {
      step: 5,
      name: "Session work is captured",
      call: `strata-runtime-edge delegate session-capture --session-id ${targetId} --workspace ${root}`,
      result: exists(sessionCapture) ? "session capture file exists" : "session capture file missing",
      diagnosis: exists(sessionCapture) ? "PASS: session capture evidence exists outside context Git." : "FINDING: capture evidence has not been created at the flowmap watch path.",
      watch: [pathCheck(sessionCapture)],
    },
    {
      step: 6,
      name: "Worker returns to SCTL",
      call: `node src/cli.js returns classify --packet .strata/returns/${assignmentId}/${targetId}/packet.json`,
      result: exists(returnPacket) ? `${ledgerFiles.length} return ledger JSON file(s) present` : "worker return packet missing",
      diagnosis: exists(returnPacket) && ledgerFiles.length ? "PASS: return packet exists and return ledger evidence is present." : "FINDING: return intake evidence is incomplete for this assignment/target.",
      watch: [pathCheck(returnPacket), pathCheck(operationalReport), ...ledgerFiles.slice(-5).map((file) => pathCheck(file))],
    },
    {
      step: 7,
      name: "Accepted report enters Class B",
      call: "node src/cli.js classb put ...",
      result: `${classBFiles.length} Class B report file(s) present`,
      diagnosis: classBFiles.length ? "PASS: Class B has accepted report files and context state tracks revision." : "FINDING: no Class B report files found.",
      watch: [...classBFiles.slice(-5).map((file) => pathCheck(file)), pathCheck(path.join(l.classD, "context_state.json"))],
    },
    {
      step: 8,
      name: "Context can be exported again and injected again",
      call: "node src/cli.js context freshness ...; node src/cli.js context export-markdown ...",
      result: exists(exportedAgain) ? "exports directory exists" : "exports directory missing",
      diagnosis: "INSPECT: freshness/export command results should be read from the live step execution log.",
      watch: [pathCheck(exportedAgain)],
    },
  ];
  const flowmap = {
    contract_id: "sctl.flowmap.inspect.v1",
    assignment_id: assignmentId,
    target_id: targetId,
    nonce,
    root,
    session_name: sessionName,
    git_status_short: gitStatus(l.context),
    git_log: lastGitLog(l.context),
    steps,
  };
  const jsonPath = writeJson(path.join(flowmapDir, "flowmap.json"), flowmap);
  const mdPath = writeText(path.join(flowmapDir, "flowmap.md"), buildMarkdown(flowmap));
  const git = gitCommitContext(l.context, `flowmap inspect ${assignmentId} ${targetId} ${nonce}`, { paths: [contextRel(l.context, jsonPath), contextRel(l.context, mdPath)] });
  return resultEnvelope("sctl.flowmap.inspect.v1", true, { flowmap, json_path: jsonPath, markdown_path: mdPath, git }, [], [jsonPath, mdPath]);
}
