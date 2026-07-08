import path from "node:path";
import { ensureContextLayout, readJson, writeJson } from "../common.js";
export function loadRunsIndex(context) {
    const layout = ensureContextLayout(context.workspaceRoot);
    return readJson(layout.runsIndexPath);
}
export function saveRunsIndex(context, items) {
    const layout = ensureContextLayout(context.workspaceRoot);
    writeJson(layout.runsIndexPath, items);
}
export function upsertRunIndex(context, item) {
    const items = loadRunsIndex(context);
    const next = items.filter((entry) => entry.runId !== item.runId);
    next.unshift(item);
    saveRunsIndex(context, next.slice(0, 200));
}
export function findRun(context, runIdOrAssignmentId) {
    const items = loadRunsIndex(context);
    return items.find((item) => item.runId === runIdOrAssignmentId || item.assignmentId === runIdOrAssignmentId) ?? null;
}
export function resolveRunSummaryPath(context, runIdOrAssignmentId) {
    const item = findRun(context, runIdOrAssignmentId);
    if (!item)
        return null;
    return path.resolve(item.summaryPath);
}
