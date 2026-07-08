import path from "node:path";
import { readJson } from "../common.js";
import { loadRuntimeConfig } from "../config/index.js";
import { runAssignmentAppServer } from "../appserver/index.js";
import { captureRunResult, writeClassBResult, writeClassDTrace } from "../artifacts/index.js";
import { runSecretScan } from "../secret_scan/index.js";
import { upsertRunIndex } from "../runs/index.js";
export async function runAssignment(context, assignmentPath, secretFile) {
    const assignment = readJson(path.resolve(assignmentPath));
    const runtimeConfig = loadRuntimeConfig(context.projectRoot);
    const summary = await runAssignmentAppServer(context, runtimeConfig, {
        assignmentPath: path.resolve(assignmentPath),
        assignmentId: String(assignment.assignmentId),
        boundedPrompt: String(assignment.boundedPrompt),
        workspacePath: String(assignment.workspacePath),
    });
    const capture = captureRunResult(context, summary.summaryPath);
    const classB = writeClassBResult(context, capture);
    const classD = writeClassDTrace(context, capture);
    const secretScan = runSecretScan(context, {
        secretFile,
        extraTargets: [classB.markdownPath, classD.markdownPath],
    });
    upsertRunIndex(context, {
        runId: summary.runId,
        assignmentId: String(assignment.assignmentId),
        status: capture.resultState,
        createdAt: summary.createdAt,
        resultPath: classB.markdownPath,
        tracePath: classD.markdownPath,
        summaryPath: summary.summaryPath,
    });
    return {
        summary,
        resultPath: classB.markdownPath,
        tracePath: classD.markdownPath,
        secretScanReport: secretScan.reportPath,
        secretScanStatus: secretScan.status,
    };
}
