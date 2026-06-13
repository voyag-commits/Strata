#!/usr/bin/env node
import { flagList, intFlag, optionalFlag, parseArgv, printJson, requireFlag, resultEnvelope, workspaceRoot, writeText } from "./lib/common.js";
import { bootstrap, contextFreshness, putContextEntry, repoStatus } from "./lib/context.js";
import { commitClassBFile, listClassB, putClassBFile, validateClassBFile } from "./lib/classb.js";
import { exportMarkdown } from "./lib/export.js";
import { classifyWorkerReturnPacket } from "./lib/worker_returns.js";
import { recordDispatch, renderDispatchPacket } from "./lib/dispatch_outbox.js";
import { sendTeamMessage, validateTeamMessageFile, registerSession, retireSession, listSessions } from "./lib/messages.js";
import { listTools, inspectTool } from "./lib/tools.js";
import { listTemplates, template, templateEnvelope } from "./lib/protocol.js";
import { listFixtureScenes, runFixtureScene } from "./lib/fixtures.js";
import { secretScan } from "./lib/secret_scan.js";
import { buildWorkflowFlowmap } from "./lib/flowmap.js";

const HELP = `Strata SCTL Kernel Component 1/3/4 CLI v0.9.4-simplified-runtime

Commands:
  help
  context bootstrap [--workspace DIR]
  context repo-status [--workspace DIR]
  context put --class A|C --id ID --title TITLE --body TEXT
  context export-markdown [--out DIR] [--include-classes A,B] [--since-class-b-revision N]
  context freshness --loaded-context-epoch N [--loaded-class-a-revision N]

  sessions register --assignment-id A001 --role "Reviewer / QC Engineer" --id reviewer_001 [--session-name TMUX_NAME] [--session-mode disposable|long_running]
  sessions retire --assignment-id A001 --id reviewer_001 [--reason TEXT]
  sessions list

  classb put --id B1 --title TITLE --assignment-id A001 --agent-id change_author_001 --role "Change Author" [--scope actionable_report]
  classb validate --file .strata/context/B/B1.md
  classb commit --file .strata/context/B/B1.md [--message TEXT]
  classb list

  message send --assignment-id A001 --thread-id THREAD_A001 --from-role ROLE --from-id ID --to-role ROLE --to-id ID --message-kind qc_review_request --body TEXT [--related-class-b FILE]
  message validate --file .strata/context/C/threads/THREAD/TM.md

  dispatch render --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID --summary TEXT [--message-file FILE] [--out FILE]
  dispatch record --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID --summary TEXT [--message-file FILE] [--declared-file TEMPLATE:path]
  returns classify --packet FILE
  flowmap inspect --assignment-id A001 --target-id reviewer_001 --nonce N1

  fixtures list-scenes
  fixtures run-scene --name direct_to_trunk_small_change

  tools list
  tools inspect --tool TOOL_ID
  protocol list-templates
  protocol template --name class_c_team_message
  secret-scan

Boundary:
  SCTL owns the isolated .strata/context Git repository.
  SCTL does not launch Codex, own secrets, watch implementation Git, or inspect chatboxes.
  Dispatch format is deterministic: Class C team message + headline + context.export_markdown output.
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
    dispatchKind: optionalFlag(flags, "dispatch-kind", "DETERMINISTIC_CLASS_C_CONTEXT"),
    messageFile: optionalFlag(flags, "message-file"),
    relatedClassB: flagList(flags, "related-class-b"),
    declaredFiles: flagList(flags, "declared-file"),
    requiredAction: optionalFlag(flags, "required-action"),
    includeClasses: optionalFlag(flags, "include-classes", "A,B"),
    sinceClassBRevision: optionalFlag(flags, "since-class-b-revision"),
  };
}

async function main() {
  const { positionals, flags } = parseArgv(process.argv.slice(2));
  const root = workspaceRoot(flags);
  const [area, action] = positionals;
  try {
    if (!area || area === "help" || flags.help) { process.stdout.write(HELP); return; }
    if (area === "secret-scan") return printJson(secretScan(root));
    if (area === "context") {
      if (action === "bootstrap") return printJson(bootstrap(root));
      if (action === "repo-status") return printJson(repoStatus(root));
      if (action === "put") return printJson(putContextEntry(root, { klass: requireFlag(flags, "class"), id: requireFlag(flags, "id"), title: optionalFlag(flags, "title"), body: optionalFlag(flags, "body", "") }));
      if (action === "export-markdown") return printJson(exportMarkdown(root, { out: optionalFlag(flags, "out"), includeClasses: optionalFlag(flags, "include-classes", "A,B"), sinceClassBRevision: optionalFlag(flags, "since-class-b-revision") }));
      if (action === "freshness") return printJson(contextFreshness(root, { loadedContextEpoch: intFlag(flags, "loaded-context-epoch"), loadedClassARevision: optionalFlag(flags, "loaded-class-a-revision") }));
    }
    if (area === "sessions") {
      if (action === "register") return printJson(registerSession(root, { assignmentId: requireFlag(flags, "assignment-id"), role: requireFlag(flags, "role"), id: requireFlag(flags, "id"), sessionName: optionalFlag(flags, "session-name"), sessionMode: optionalFlag(flags, "session-mode", "disposable"), loadedContextEpoch: optionalFlag(flags, "loaded-context-epoch"), loadedClassARevision: optionalFlag(flags, "loaded-class-a-revision") }));
      if (action === "retire") return printJson(retireSession(root, { assignmentId: requireFlag(flags, "assignment-id"), id: requireFlag(flags, "id"), reason: optionalFlag(flags, "reason") }));
      if (action === "list") return printJson(listSessions(root));
    }
    if (area === "classb") {
      if (action === "put") return printJson(putClassBFile(root, { id: requireFlag(flags, "id"), title: optionalFlag(flags, "title"), body: optionalFlag(flags, "body", ""), fullBody: optionalFlag(flags, "full-body"), scope: optionalFlag(flags, "scope", "actionable_report"), assignmentId: optionalFlag(flags, "assignment-id", "UNASSIGNED"), agentId: optionalFlag(flags, "agent-id", "sender_session"), role: optionalFlag(flags, "role", "Change Author"), status: optionalFlag(flags, "status", "ready"), evidence: optionalFlag(flags, "evidence", "included"), summary: optionalFlag(flags, "summary"), progressDelta: optionalFlag(flags, "progress-delta"), trunkIntegration: optionalFlag(flags, "trunk-integration"), verification: optionalFlag(flags, "verification"), risks: optionalFlag(flags, "risks"), nextAction: optionalFlag(flags, "next-action"), evidenceDetail: optionalFlag(flags, "evidence-detail") }));
      if (action === "validate") return printJson(validateClassBFile(root, { file: requireFlag(flags, "file") }));
      if (action === "commit") return printJson(commitClassBFile(root, { file: requireFlag(flags, "file"), message: optionalFlag(flags, "message") }));
      if (action === "list") return printJson(resultEnvelope("sctl.classb.list.v1", true, { files: listClassB(root) }, [], []));
    }
    if (area === "message") {
      if (action === "send") return printJson(sendTeamMessage(root, { assignmentId: requireFlag(flags, "assignment-id"), threadId: optionalFlag(flags, "thread-id"), messageId: optionalFlag(flags, "message-id"), fromRole: requireFlag(flags, "from-role"), fromId: requireFlag(flags, "from-id"), toRole: requireFlag(flags, "to-role"), toId: requireFlag(flags, "to-id"), messageKind: optionalFlag(flags, "message-kind", "coordination_note"), body: optionalFlag(flags, "body", ""), bodyFile: optionalFlag(flags, "body-file"), relatedClassB: flagList(flags, "related-class-b"), requestedHandling: optionalFlag(flags, "requested-handling") }));
      if (action === "validate") return printJson(validateTeamMessageFile(root, { file: requireFlag(flags, "file") }));
    }
    if (area === "dispatch") {
      if (action === "record") return printJson(recordDispatch(root, dispatchInput(flags)));
      if (action === "render") {
        const rendered = renderDispatchPacket(root, dispatchInput(flags));
        const out = optionalFlag(flags, "out");
        if (out) {
          const file = writeText(out, rendered.markdown);
          return printJson(resultEnvelope("sctl.dispatch.render.v1", true, { file, packet: rendered.packet }, [], [file, ...rendered.contextExport.evidence_paths]));
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
    throw new Error(`unknown command: ${positionals.join(" ")}`);
  } catch (error) {
    printJson(resultEnvelope("sctl.cli_error.v1", false, { command: positionals }, [error instanceof Error ? error.message : String(error)], []));
    process.exitCode = 1;
  }
}
main();
