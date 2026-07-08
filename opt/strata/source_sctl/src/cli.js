#!/usr/bin/env node
import { applyConfig, boolFlag, flagList, intFlag, optionalFlag, parseArgv, printJson, requireFlag, resultEnvelope, workspaceRoot, writeText } from "./lib/common.js";
import { bootstrap, contextFreshness, putContextEntry, repoStatus } from "./lib/context.js";
import { commitClassBFile, ingestClassBReturnFile, listClassB, putClassBFile, validateClassBFile } from "./lib/classb.js";
import { exportMarkdown } from "./lib/export.js";
import { classifyWorkerReturnPacket } from "./lib/worker_returns.js";
import { recordDispatch, recordInjectionResult, renderDispatchPacket } from "./lib/dispatch_outbox.js";
import { sendTeamMessage, validateTeamMessageFile, registerSession, releaseSession, retireSession, listSessions } from "./lib/messages.js";
import { listTools, inspectTool } from "./lib/tools.js";
import { listTemplates, template, templateEnvelope } from "./lib/protocol.js";
import { listFixtureScenes, runFixtureScene } from "./lib/fixtures.js";
import { secretScan } from "./lib/secret_scan.js";
import { buildWorkflowFlowmap } from "./lib/flowmap.js";
import { coordinatorContextPolicy, coordinatorCycleComplete, coordinatorRecreated, exitCycle, manualCycleEntryPath, manualCycleEntryTemplate, submitCycleEntry, validateManualCycleEntry, writeManualCycleEntryTemplate } from "./lib/cycles.js";
import { openGitPanel } from "./lib/panel.js";
import { collectEvidence, doctor, initWorkspace, logs, status as maintenanceStatus, paths as reportPaths } from "./lib/maintenance.js";

const HELP = `Strata SCTL Kernel Component 1/3/4 CLI v0.9.5-cycle-entry

Commands:
  help
  context bootstrap [--workspace DIR]
  context repo-status [--workspace DIR]
  context put --class A|C --id ID --title TITLE --body TEXT
  context export-markdown [--out DIR] [--include-classes A,B] [--since-class-b-revision N] [--class-b-latest N]
  context freshness --loaded-context-epoch N [--loaded-class-a-revision N]

  cycle entry-path
  cycle template [--write]
  cycle validate-entry
  cycle submit --assignment-id A001 [--file .strata/cycles/director_entry/director_governing_entry.md] [--cycle-id ID] [--coordinator-id ID] [--no-dispatch]
  cycle start  --assignment-id A001 [--file .strata/cycles/director_entry/director_governing_entry.md] [--cycle-id ID] [--coordinator-id ID] [--no-dispatch]
  cycle exit --cycle-id ID --reason complete|architectural_blocker|manual_stop [--summary TEXT] [--evidence FILE]

  coordinator context-policy --assignment-id A001 [--coordinator-id delegated_coordinator_001]
  coordinator cycle-complete --assignment-id A001 [--coordinator-id delegated_coordinator_001] [--cycle-id CYCLE_ID]
  coordinator recreate-record --assignment-id A001 [--coordinator-id delegated_coordinator_001]

  panel git [--repo sctl|codebase] [--codebase-repo DIR] [--tool lazygit|gitk|git-status] [--print-command]

  sessions register --assignment-id A001 --role "Reviewer / QC Engineer" --id reviewer_001 [--session-name RUNTIME_SESSION_NAME] [--runtime-session-name NAME] [--runtime-role ROLE] [--session-mode disposable|long_running]
  sessions release --assignment-id A001 --id reviewer_001 [--reason TEXT] [--status released|closed|superseded]
  sessions retire --assignment-id A001 --id reviewer_001 [--reason TEXT]  # legacy alias for logical release; does not terminate runtime
  sessions list

  classb put --id B1 --title TITLE --assignment-id A001 --agent-id change_author_001 --role "Change Author" [--scope actionable_report]
  classb validate --file .strata/context/B/B1.md
  classb commit --file .strata/context/B/B1.md [--message TEXT]
  classb ingest-return --source .strata/returns/A001/session/file.md [--id B1] [--message TEXT]
  classb list

  message send --assignment-id A001 --thread-id THREAD_A001 --from-role ROLE --from-id ID --to-role ROLE --to-id ID --message-kind qc_review_request --body TEXT [--related-class-b FILE]
  message validate --file .strata/context/C/threads/THREAD/TM.md

  dispatch render --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID [--envelope-type initial_task_coordination|sctl_dispatch] [--template-path FILE] [--class-b-latest 2] [--out FILE]
  dispatch record --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID [--envelope-type initial_task_coordination|sctl_dispatch] [--template-path FILE] [--class-b-latest 2] [--declared-file TEMPLATE:path]
  dispatch record-injection --dispatch-log FILE --result-file FILE
  dispatch test-delegate --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID [--target-session TMUX] [--template-path FILE]
  returns classify --packet FILE
  flowmap inspect --assignment-id A001 --target-id reviewer_001 --nonce N1

  fixtures list-scenes
  fixtures run-scene --name direct_to_trunk_small_change

  tools list
  tools inspect --tool TOOL_ID
  protocol list-templates
  protocol template --name dispatch_packet
  secret-scan

Maintenance wrapper (thin layer over internals; does not modify SCTL operations):
  doctor
  init-workspace
  status
  logs [--tail N] [--kind EVENT_PREFIX]
  collect-evidence [--out DIR] [--assignment-id A001]
  paths [--director-entry-source FILE] [--codebase-repo DIR]

Top-level aliases (equivalent to the cycle subcommands):
  entry-path
  entry-template [--write]
  validate-entry
  cycle-start --assignment-id A001 [--file FILE] [--coordinator-id ID] [--no-dispatch]

Configuration:
  --config ./sctl.env   Load KEY=VALUE pairs from a config file before flags resolve.
                       Real process.env always wins over the file; CLI flags win over both.

Boundary:
  SCTL owns the isolated .strata/context Git repository.
  SCTL records Director Entry Document commits, cycle exit, dispatch, returns, and Class B reports.
  SCTL does not own secrets, watch implementation Git, or inspect chatboxes.
  Runtime delivery is delegated to thin WSL/tmux adapters and the existing launcher stack.
`;

function dispatchInput(flags) {
  return {
    assignmentId: requireFlag(flags, "assignment-id"),
    nonce: requireFlag(flags, "nonce"),
    fromRole: optionalFlag(flags, "from-role"),
    fromId: optionalFlag(flags, "from-id"),
    targetRole: requireFlag(flags, "target-role"),
    targetId: requireFlag(flags, "target-id"),
    summary: optionalFlag(flags, "summary", "SCTL dispatch"),
    dispatchKind: optionalFlag(flags, "dispatch-kind", "SCTL_CONTEXT_COMMIT"),
    envelopeType: optionalFlag(flags, "envelope-type"),
    trigger: optionalFlag(flags, "trigger"),
    targetSession: optionalFlag(flags, "target-session"),
    messageFile: optionalFlag(flags, "message-file"),
    relatedClassB: flagList(flags, "related-class-b"),
    declaredFiles: flagList(flags, "declared-file"),
    requiredAction: optionalFlag(flags, "required-action"),
    templatePaths: [...flagList(flags, "template-path"), ...flagList(flags, "submission-template")],
    sourceContextClass: optionalFlag(flags, "source-context-class"),
    sourceContextPath: optionalFlag(flags, "source-context-path"),
    sourceContextSha256: optionalFlag(flags, "source-context-sha256"),
    sourceContextGitCommit: optionalFlag(flags, "source-context-git-commit"),
    cycleId: optionalFlag(flags, "cycle-id"),
    workOrderId: optionalFlag(flags, "work-order-id"),
    submissionPath: optionalFlag(flags, "submission-path"),
    returnPath: optionalFlag(flags, "return-path"),
    codebaseRepo: optionalFlag(flags, "codebase-repo"),
    trunkBranch: optionalFlag(flags, ["trunk-branch", "base-branch"]),
    changeBranch: optionalFlag(flags, ["change-branch", "assigned-branch"]),
    shortName: optionalFlag(flags, "short-name"),
    directorEntryDocumentPath: optionalFlag(flags, "director-entry-document-path"),
    directorEntryDocumentSha256: optionalFlag(flags, "director-entry-document-sha256"),
    includeClasses: optionalFlag(flags, "include-classes", "A,B"),
    sinceClassBRevision: optionalFlag(flags, "since-class-b-revision"),
    classBLatest: optionalFlag(flags, ["class-b-latest", "latest-class-b"], "2"),
  };
}

async function main() {
  const { positionals, flags } = parseArgv(process.argv.slice(2));
  applyConfig(flags);
  const root = workspaceRoot(flags);
  const [area, action] = positionals;
  try {
    if (!area || area === "help" || flags.help) { process.stdout.write(HELP); return; }
    if (area === "secret-scan") return printJson(secretScan(root));
    if (area === "context") {
      if (action === "bootstrap") return printJson(bootstrap(root));
      if (action === "repo-status") return printJson(repoStatus(root));
      if (action === "put") return printJson(putContextEntry(root, { klass: requireFlag(flags, "class"), id: requireFlag(flags, "id"), title: optionalFlag(flags, "title"), body: optionalFlag(flags, "body", "") }));
      if (action === "export-markdown") return printJson(exportMarkdown(root, { out: optionalFlag(flags, "out"), includeClasses: optionalFlag(flags, "include-classes", "A,B"), sinceClassBRevision: optionalFlag(flags, "since-class-b-revision"), classBLatest: optionalFlag(flags, ["class-b-latest", "latest-class-b"]) }));
      if (action === "freshness") return printJson(contextFreshness(root, { loadedContextEpoch: intFlag(flags, "loaded-context-epoch"), loadedClassARevision: optionalFlag(flags, "loaded-class-a-revision") }));
    }
    if (area === "cycle") {
      if (action === "entry-path") { process.stdout.write(`${manualCycleEntryPath(root)}
`); return; }
      if (action === "template") {
        if (flags.write) return printJson(writeManualCycleEntryTemplate(root, { file: optionalFlag(flags, ["file", "out"]) }));
        process.stdout.write(`${manualCycleEntryTemplate()}
`); return;
      }
      if (action === "validate-entry") return printJson(validateManualCycleEntry(root, { file: optionalFlag(flags, ["file", "entry-file"]), dir: optionalFlag(flags, ["dir", "entry-dir"]) }));
      if (action === "submit" || action === "start") return printJson(submitCycleEntry(root, { file: optionalFlag(flags, ["file", "entry-file"]), dir: optionalFlag(flags, ["dir", "entry-dir"]), assignmentId: requireFlag(flags, "assignment-id"), cycleId: optionalFlag(flags, "cycle-id"), coordinatorId: optionalFlag(flags, "coordinator-id"), coordinatorRole: optionalFlag(flags, "coordinator-role"), codebaseRepo: optionalFlag(flags, "codebase-repo"), trunkBranch: optionalFlag(flags, ["trunk-branch", "base-branch"]), changeBranch: optionalFlag(flags, ["change-branch", "assigned-branch"]), shortName: optionalFlag(flags, "short-name"), noDispatch: boolFlag(flags, "no-dispatch", false) }));
      if (action === "exit") return printJson(exitCycle(root, { assignmentId: optionalFlag(flags, "assignment-id"), cycleId: optionalFlag(flags, "cycle-id"), reason: requireFlag(flags, "reason"), summary: optionalFlag(flags, "summary"), coordinatorId: optionalFlag(flags, "coordinator-id"), evidence: flagList(flags, "evidence") }));
    }
    if (area === "coordinator") {
      if (action === "context-policy") return printJson(coordinatorContextPolicy(root, { assignmentId: requireFlag(flags, "assignment-id"), coordinatorId: optionalFlag(flags, "coordinator-id", "delegated_coordinator_001") }));
      if (action === "cycle-complete") return printJson(coordinatorCycleComplete(root, { assignmentId: requireFlag(flags, "assignment-id"), coordinatorId: optionalFlag(flags, "coordinator-id", "delegated_coordinator_001"), cycleId: optionalFlag(flags, "cycle-id") }));
      if (action === "recreate-record") return printJson(coordinatorRecreated(root, { assignmentId: requireFlag(flags, "assignment-id"), coordinatorId: optionalFlag(flags, "coordinator-id", "delegated_coordinator_001") }));
    }
    if (area === "panel" && action === "git") return printJson(openGitPanel(root, { repo: optionalFlag(flags, "repo", "sctl"), codebaseRepo: optionalFlag(flags, "codebase-repo"), tool: optionalFlag(flags, "tool"), printCommand: boolFlag(flags, "print-command") }));
    if (area === "sessions") {
      if (action === "register") return printJson(registerSession(root, {
        assignmentId: requireFlag(flags, "assignment-id"),
        role: requireFlag(flags, "role"),
        id: requireFlag(flags, "id"),
        sessionName: optionalFlag(flags, ["session-name", "tmux-session"]),
        sessionMode: optionalFlag(flags, "session-mode", "disposable"),
        loadedContextEpoch: optionalFlag(flags, "loaded-context-epoch"),
        loadedClassARevision: optionalFlag(flags, "loaded-class-a-revision"),
        runtime: optionalFlag(flags, "runtime"),
        returnDir: optionalFlag(flags, "return-dir"),
        evidenceDir: optionalFlag(flags, "evidence-dir"),
        runtimeSessionName: optionalFlag(flags, "runtime-session-name"),
        runtimeRole: optionalFlag(flags, "runtime-role"),
        runtimeTmuxTarget: optionalFlag(flags, "runtime-tmux-target"),
        runtimeBindingId: optionalFlag(flags, "runtime-binding-id"),
        runtimeBindingStatus: optionalFlag(flags, "runtime-binding-status"),
        delegateEvidencePath: optionalFlag(flags, "delegate-evidence-path"),
        terminationPolicy: optionalFlag(flags, "termination-policy"),
        status: optionalFlag(flags, "status"),
      }));
      if (action === "release") return printJson(releaseSession(root, { assignmentId: requireFlag(flags, "assignment-id"), id: requireFlag(flags, "id"), reason: optionalFlag(flags, "reason"), status: optionalFlag(flags, "status") }));
      if (action === "retire") return printJson(retireSession(root, { assignmentId: requireFlag(flags, "assignment-id"), id: requireFlag(flags, "id"), reason: optionalFlag(flags, "reason"), status: optionalFlag(flags, "status") }));
      if (action === "list") return printJson(listSessions(root));
    }
    if (area === "classb") {
      if (action === "put") return printJson(putClassBFile(root, { id: requireFlag(flags, "id"), title: optionalFlag(flags, "title"), body: optionalFlag(flags, "body", ""), fullBody: optionalFlag(flags, "full-body"), scope: optionalFlag(flags, "scope", "actionable_report"), assignmentId: optionalFlag(flags, "assignment-id", "UNASSIGNED"), agentId: optionalFlag(flags, "agent-id", "sender_session"), role: optionalFlag(flags, "role", "Change Author"), status: optionalFlag(flags, "status", "ready"), evidence: optionalFlag(flags, "evidence", "included"), summary: optionalFlag(flags, "summary"), progressDelta: optionalFlag(flags, "progress-delta"), trunkIntegration: optionalFlag(flags, "trunk-integration"), verification: optionalFlag(flags, "verification"), risks: optionalFlag(flags, "risks"), nextAction: optionalFlag(flags, "next-action"), evidenceDetail: optionalFlag(flags, "evidence-detail") }));
      if (action === "validate") return printJson(validateClassBFile(root, { file: requireFlag(flags, "file") }));
      if (action === "commit") return printJson(commitClassBFile(root, { file: requireFlag(flags, "file"), message: optionalFlag(flags, "message") }));
      if (action === "ingest-return") return printJson(ingestClassBReturnFile(root, { source: requireFlag(flags, ["source", "file"]), id: optionalFlag(flags, "id"), message: optionalFlag(flags, "message"), overwrite: boolFlag(flags, "overwrite", false) }));
      if (action === "list") return printJson(resultEnvelope("sctl.classb.list.v1", true, { files: listClassB(root) }, [], []));
    }
    if (area === "message") {
      if (action === "send") return printJson(sendTeamMessage(root, { assignmentId: requireFlag(flags, "assignment-id"), threadId: optionalFlag(flags, "thread-id"), messageId: optionalFlag(flags, "message-id"), fromRole: requireFlag(flags, "from-role"), fromId: requireFlag(flags, "from-id"), toRole: requireFlag(flags, "to-role"), toId: requireFlag(flags, "to-id"), messageKind: optionalFlag(flags, "message-kind", "coordination_note"), body: optionalFlag(flags, "body", ""), bodyFile: optionalFlag(flags, "body-file"), relatedClassB: flagList(flags, "related-class-b"), requestedHandling: optionalFlag(flags, "requested-handling") }));
      if (action === "validate") return printJson(validateTeamMessageFile(root, { file: requireFlag(flags, "file") }));
    }
    if (area === "dispatch") {
      if (action === "record" || action === "test-delegate" || action === "delegate") return printJson(recordDispatch(root, dispatchInput(flags)));
      if (action === "record-injection") return printJson(recordInjectionResult(root, { dispatchLog: requireFlag(flags, "dispatch-log"), resultFile: optionalFlag(flags, ["result-file", "injection-result-file"]), resultJson: optionalFlag(flags, ["result-json", "injection-result-json"]) }));
      if (action === "render") {
        const rendered = renderDispatchPacket(root, dispatchInput(flags));
        const out = optionalFlag(flags, "out");
        if (out) {
          const file = writeText(out, rendered.markdown);
          return printJson(resultEnvelope("sctl.dispatch.render.v3", true, { file, packet: rendered.packet }, [], [file, ...rendered.contextExport.evidence_paths]));
        }
        process.stdout.write(rendered.markdown);
        return;
      }
    }
    if (area === "returns" && action === "classify") return printJson(classifyWorkerReturnPacket(root, requireFlag(flags, "packet")));
    if (area === "flowmap" && action === "inspect") return printJson(buildWorkflowFlowmap(root, { assignmentId: requireFlag(flags, "assignment-id"), targetId: requireFlag(flags, "target-id"), nonce: requireFlag(flags, "nonce"), sessionName: optionalFlag(flags, "session-name") }));
    if (area === "fixtures") {
      if (action === "list-scenes") return printJson(listFixtureScenes());
      if (action === "run-scene") return printJson(runFixtureScene(root, requireFlag(flags, "name")));
    }
    if (area === "tools") {
      if (action === "list") return printJson(listTools());
      if (action === "inspect") return printJson(inspectTool(requireFlag(flags, "tool")));
    }
    if (area === "protocol") {
      if (action === "list-templates") return printJson(resultEnvelope("sctl.protocol.list_templates.v1", true, { templates: listTemplates() }, [], []));
      if (action === "template") { process.stdout.write(template(requireFlag(flags, "name")) + "\n"); return; }
      if (action === "template-envelope") return printJson(templateEnvelope(requireFlag(flags, "name")));
    }
    if (area === "doctor") return printJson(doctor(root));
    if (area === "init-workspace") return printJson(initWorkspace(root));
    if (area === "status") return printJson(maintenanceStatus(root));
    if (area === "logs") return printJson(logs(root, { tail: intFlag(flags, "tail", 50), kind: optionalFlag(flags, "kind") }));
    if (area === "collect-evidence") return printJson(collectEvidence(root, { out: optionalFlag(flags, "out"), assignmentId: optionalFlag(flags, "assignment-id") }));
    if (area === "paths") return printJson(reportPaths(root, { directorEntrySource: optionalFlag(flags, "director-entry-source"), codebaseRepo: optionalFlag(flags, "codebase-repo") }));
    if (area === "entry-path") { process.stdout.write(`${manualCycleEntryPath(root)}
`); return; }
    if (area === "entry-template") {
      if (boolFlag(flags, "write", false)) return printJson(writeManualCycleEntryTemplate(root));
      process.stdout.write(`${manualCycleEntryTemplate()}
`); return;
    }
    if (area === "validate-entry") return printJson(validateManualCycleEntry(root, { file: optionalFlag(flags, ["file", "entry-file"]), dir: optionalFlag(flags, ["dir", "entry-dir"]) }));
    if (area === "cycle-start") return printJson(submitCycleEntry(root, { file: optionalFlag(flags, ["file", "entry-file"]), dir: optionalFlag(flags, ["dir", "entry-dir"]), assignmentId: requireFlag(flags, "assignment-id"), cycleId: optionalFlag(flags, "cycle-id"), coordinatorId: optionalFlag(flags, "coordinator-id"), coordinatorRole: optionalFlag(flags, "coordinator-role"), codebaseRepo: optionalFlag(flags, "codebase-repo"), trunkBranch: optionalFlag(flags, ["trunk-branch", "base-branch"]), changeBranch: optionalFlag(flags, ["change-branch", "assigned-branch"]), shortName: optionalFlag(flags, "short-name"), noDispatch: boolFlag(flags, "no-dispatch", false) }));
    throw new Error(`unknown command: ${positionals.join(" ")}`);
  } catch (error) {
    printJson(resultEnvelope("sctl.cli_error.v1", false, { command: positionals }, [error instanceof Error ? error.message : String(error)], []));
    process.exitCode = 1;
  }
}
main();
