import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runAssignmentAppServer } from "../src/backend/appserver/index.js";
import { captureRunResult } from "../src/backend/artifacts/index.js";
import { createAssignment } from "../src/backend/assignments/index.js";
import { createCommandContext, fileExists } from "../src/backend/common.js";
import { loadRunsIndex, upsertRunIndex } from "../src/backend/runs/index.js";
import { runSecretScan } from "../src/backend/secret_scan/index.js";
import { initWorkspace } from "../src/backend/workspace/index.js";
function makeTempWorkspace() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "strata-backend-test-"));
}
test("strata init creates required context folders", () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    const result = initWorkspace(context);
    assert.ok(fileExists(result.context.assignments));
    assert.ok(fileExists(result.context.results));
    assert.ok(fileExists(result.context.appserverEvents));
});
test("assignment create writes a bounded assignment package", () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    initWorkspace(context);
    const result = createAssignment(context, {
        objective: "Return a concise summary.",
        workspacePath: workspace,
        allowedFiles: ["src/index.ts"],
        forbiddenFiles: ["context/D_trace"],
        expectedOutput: "Short final answer",
        stopConditions: ["Missing authority"],
    });
    assert.ok(fileExists(result.assignmentJsonPath));
    assert.ok(fileExists(result.assignmentPromptPath));
    assert.match(fs.readFileSync(result.assignmentPromptPath, "utf8"), /Strata bounded assignment/);
    assert.match(fs.readFileSync(result.assignmentPromptPath, "utf8"), /Runtime mode: appserver/);
});
test("runs index stores and reloads run entries", () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    initWorkspace(context);
    upsertRunIndex(context, {
        runId: "run-1",
        assignmentId: "assignment-1",
        status: "PASS",
        createdAt: new Date().toISOString(),
        resultPath: "result.md",
        tracePath: "trace.md",
        summaryPath: "summary.json",
    });
    const items = loadRunsIndex(context);
    assert.equal(items[0]?.runId, "run-1");
});
test("secret scan passes when no secret is present", () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    initWorkspace(context);
    const secretFile = path.join(workspace, "secret.txt");
    fs.writeFileSync(secretFile, "actual-secret-value", "utf8");
    fs.writeFileSync(path.join(workspace, "safe.log"), "no secrets here", "utf8");
    const result = runSecretScan(context, { secretFile });
    assert.equal(result.status, "PASS");
});
test("secret scan fails on bearer-looking secrets", () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    initWorkspace(context);
    const dummyBearer = `Authorization: ${"Bearer"} ${"abcdefghijklmnopqrstuvwxyz"}`;
    fs.writeFileSync(path.join(workspace, "context", "D_trace", "worker_logs", "bad.log"), dummyBearer, "utf8");
    const result = runSecretScan(context, {});
    assert.equal(result.status, "FAIL");
});
test("secret scan fails on API-key-like strings in source", () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    initWorkspace(context);
    const sourceDir = path.join(workspace, "src");
    fs.mkdirSync(sourceDir, { recursive: true });
    const badSource = path.join(sourceDir, "leak.ts");
    fs.writeFileSync(badSource, `const key = "${"sk-"}1234567890abcdef";\n`, "utf8");
    const result = runSecretScan(context, {});
    assert.equal(result.status, "FAIL");
    assert.ok(result.hits.includes(badSource));
});
test("secret scan covers package-level review artifacts", () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    initWorkspace(context);
    const patchPath = path.join(workspace, "harness_cli_backend_quality_pass.patch");
    fs.writeFileSync(patchPath, `${"Bearer"} ${"abcdefghijklmnopqrstuvwxyz"}
`, "utf8");
    const result = runSecretScan(context, {});
    assert.equal(result.status, "FAIL");
    assert.ok(result.hits.includes(patchPath));
});
test("App Server client buffers split stdout JSON-RPC lines", async () => {
    const workspace = makeTempWorkspace();
    const context = createCommandContext(workspace, workspace);
    initWorkspace(context);
    const assignment = createAssignment(context, {
        id: "assignment-buffering",
        objective: "Return OK.",
        workspacePath: workspace,
        allowedFiles: [],
        forbiddenFiles: [],
        expectedOutput: "OK",
        stopConditions: [],
    });
    const mockCodex = path.join(workspace, "mock-codex-appserver.mjs");
    fs.writeFileSync(mockCodex, [
        "#!/usr/bin/env node",
        "process.stdin.resume();",
        "const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');",
        "const splitEmit = (value) => {",
        "  const line = JSON.stringify(value) + '\\n';",
        "  process.stdout.write(line.slice(0, 11));",
        "  setTimeout(() => process.stdout.write(line.slice(11)), 5);",
        "};",
        "setTimeout(() => splitEmit({ id: 1, result: { thread: { id: 'thread-buffered' } } }), 5);",
        "setTimeout(() => {",
        "  emit({ method: 'item/agentMessage/delta', params: { delta: 'O' } });",
        "  emit({ method: 'item/agentMessage/delta', params: { delta: 'K' } });",
        "  emit({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'OK' } } });",
        "  emit({ method: 'turn/completed', params: { turn: { status: 'completed', error: null } } });",
        "}, 25);",
        "setTimeout(() => process.exit(0), 100);",
    ].join("\n"), "utf8");
    fs.chmodSync(mockCodex, 0o755);
    const summary = await runAssignmentAppServer(context, {
        codexExe: mockCodex,
        codexConfigPath: path.join(workspace, "config.toml"),
        bridgeBaseUrl: "http://127.0.0.1:38441/v1",
        bridgePort: 38441,
        model: "deepseek-v4-pro",
        modelProvider: "deepseek_bridge",
        modelReasoningEffort: "low",
    }, {
        assignmentPath: assignment.assignmentJsonPath,
        assignmentId: assignment.assignment.assignmentId,
        boundedPrompt: assignment.assignment.boundedPrompt,
        workspacePath: workspace,
    }, 1000);
    assert.equal(summary.ok, true);
    assert.equal(summary.threadId, "thread-buffered");
    assert.equal(summary.completionStatus, "completed");
    const capture = captureRunResult(context, summary.summaryPath);
    assert.equal(capture.finalMessage, "OK");
});
test("CLI doctor exits nonzero on FAIL", () => {
    const workspace = makeTempWorkspace();
    const cliPath = path.join(process.cwd(), "dist", "src", "cli", "index.js");
    const result = spawnSync(process.execPath, [cliPath, "doctor", "--workspace", workspace], {
        encoding: "utf8",
        env: { ...process.env, CODEX_EXE: path.join(workspace, "missing-codex.exe") },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Overall: FAIL/);
});
test("CLI rejects unsupported direct runtime mode", () => {
    const workspace = makeTempWorkspace();
    const cliPath = path.join(process.cwd(), "dist", "src", "cli", "index.js");
    const result = spawnSync(process.execPath, [cliPath, "assignment", "create", "--workspace", workspace, "--objective", "x", "--runtime-mode", "direct"], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported --runtime-mode/);
});
test("CLI assignment create separates control workspace and target workspace", () => {
    const controlWorkspace = makeTempWorkspace();
    const targetWorkspace = makeTempWorkspace();
    const cliPath = path.join(process.cwd(), "dist", "src", "cli", "index.js");
    const result = spawnSync(process.execPath, [
        cliPath,
        "assignment",
        "create",
        "--workspace",
        controlWorkspace,
        "--target-workspace",
        targetWorkspace,
        "--objective",
        "x",
    ], { encoding: "utf8" });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.assignment.workspacePath, targetWorkspace);
    assert.ok(parsed.assignmentJsonPath.startsWith(path.join(controlWorkspace, "context", "B_ledger", "assignments")));
});
