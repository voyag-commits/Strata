import fs from "node:fs";
import path from "node:path";
import { ensureContextLayout, isoStamp, readJson, shortId, writeJson, writeText, } from "../common.js";
export function captureRunResult(context, summaryPath) {
    const summary = readJson(summaryPath);
    const eventsPath = String(summary.eventsPath);
    const stderrPath = String(summary.stderrPath);
    const assignmentPath = String(summary.assignmentPath);
    const assignment = readJson(assignmentPath);
    const eventLines = readJsonLines(eventsPath);
    let deltaText = "";
    let completedText = "";
    for (const line of eventLines) {
        if (line.method === "item/agentMessage/delta") {
            deltaText += String(line.params?.delta ?? "");
        }
        if (line.method === "item/completed" && line.params?.item?.type === "agentMessage") {
            completedText = String(line.params.item.text ?? "");
        }
    }
    const completionPayload = summary.completionPayload;
    const errorMessage = typeof completionPayload?.error?.message === "string"
        ? `Run failed before final agent message:\n\n${completionPayload.error.message}`
        : "";
    const finalMessage = completedText || deltaText || errorMessage;
    const completionStatus = summary.completionStatus ?? null;
    const resultState = completionStatus === "completed" && finalMessage
        ? "PASS"
        : completionStatus === "completed"
            ? "PARTIAL"
            : completionStatus === "failed"
                ? "FAIL"
                : "BLOCKED";
    return {
        runId: String(summary.runId),
        assignmentId: String(assignment.assignmentId),
        assignmentPath,
        summaryPath,
        eventsPath,
        stderrPath,
        completionStatus,
        finalMessage,
        resultState,
        capturedAt: isoStamp(context.now),
    };
}
export function writeClassBResult(context, capture) {
    const layout = ensureContextLayout(context.workspaceRoot);
    const resultId = shortId(`result_${capture.runId}`, context.now);
    const markdownPath = path.join(layout.results, `${resultId}.md`);
    const jsonPath = path.join(layout.results, `${resultId}.json`);
    const markdown = [
        `# ${resultId}`,
        "",
        `Status: ${capture.resultState}`,
        `Captured at: ${capture.capturedAt}`,
        `Run ID: ${capture.runId}`,
        `Assignment ID: ${capture.assignmentId}`,
        "",
        "## Final Message",
        "",
        capture.finalMessage || "(empty)",
    ].join("\n");
    writeText(markdownPath, `${markdown}\n`);
    writeJson(jsonPath, capture);
    return { markdownPath, jsonPath };
}
export function writeClassDTrace(context, capture) {
    const layout = ensureContextLayout(context.workspaceRoot);
    const traceId = shortId(`trace_${capture.runId}`, context.now);
    const markdownPath = path.join(layout.workerLogs, `${traceId}.md`);
    const body = [
        `# ${traceId}`,
        "",
        `Run ID: ${capture.runId}`,
        `Assignment ID: ${capture.assignmentId}`,
        `Status: ${capture.completionStatus ?? "unknown"}`,
        "",
        "## Raw Trace Files",
        "",
        `- Events: ${path.relative(context.workspaceRoot, capture.eventsPath) || capture.eventsPath}`,
        `- stderr: ${path.relative(context.workspaceRoot, capture.stderrPath) || capture.stderrPath}`,
        `- Summary: ${path.relative(context.workspaceRoot, capture.summaryPath) || capture.summaryPath}`,
    ].join("\n");
    writeText(markdownPath, `${body}\n`);
    return { markdownPath };
}
function readJsonLines(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    return text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
        try {
            return JSON.parse(line);
        }
        catch {
            return {};
        }
    });
}
