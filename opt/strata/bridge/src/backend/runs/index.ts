import path from "node:path";
import { ensureContextLayout, readJson, writeJson, type CommandContext } from "../common.js";

export interface RunIndexEntry {
  runId: string;
  assignmentId: string;
  status: string;
  createdAt: string;
  resultPath: string | null;
  tracePath: string | null;
  summaryPath: string;
}

export function loadRunsIndex(context: CommandContext): RunIndexEntry[] {
  const layout = ensureContextLayout(context.workspaceRoot);
  return readJson<RunIndexEntry[]>(layout.runsIndexPath);
}

export function saveRunsIndex(context: CommandContext, items: RunIndexEntry[]): void {
  const layout = ensureContextLayout(context.workspaceRoot);
  writeJson(layout.runsIndexPath, items);
}

export function upsertRunIndex(context: CommandContext, item: RunIndexEntry): void {
  const items = loadRunsIndex(context);
  const next = items.filter((entry) => entry.runId !== item.runId);
  next.unshift(item);
  saveRunsIndex(context, next.slice(0, 200));
}

export function findRun(context: CommandContext, runIdOrAssignmentId: string): RunIndexEntry | null {
  const items = loadRunsIndex(context);
  return items.find((item) => item.runId === runIdOrAssignmentId || item.assignmentId === runIdOrAssignmentId) ?? null;
}

export function resolveRunSummaryPath(context: CommandContext, runIdOrAssignmentId: string): string | null {
  const item = findRun(context, runIdOrAssignmentId);
  if (!item) return null;
  return path.resolve(item.summaryPath);
}
