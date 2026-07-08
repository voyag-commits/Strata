import path from "node:path";
import { type CommandContext, ensureContextLayout, fileStamp, isoStamp, shortId, writeJson, writeText } from "../common.js";

export interface AssignmentCreateInput {
  id?: string;
  title?: string;
  objective: string;
  workspacePath: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  expectedOutput: string;
  stopConditions: string[];
  runtimeMode?: "appserver";
}

export interface AssignmentRecord extends AssignmentCreateInput {
  assignmentId: string;
  createdAt: string;
  boundedPrompt: string;
}

export interface AssignmentCreateResult {
  assignment: AssignmentRecord;
  assignmentJsonPath: string;
  assignmentPromptPath: string;
}

function buildPrompt(assignment: AssignmentRecord): string {
  const lines = [
    "Strata bounded assignment",
    `Assignment ID: ${assignment.assignmentId}`,
    `Title: ${assignment.title ?? "Untitled assignment"}`,
    `Workspace: ${assignment.workspacePath}`,
    `Runtime mode: ${assignment.runtimeMode ?? "appserver"}`,
    "",
    "Objective:",
    assignment.objective,
    "",
    "Allowed files:",
    ...(assignment.allowedFiles.length > 0 ? assignment.allowedFiles.map((item) => `- ${item}`) : ["- none specified"]),
    "",
    "Forbidden files:",
    ...(assignment.forbiddenFiles.length > 0 ? assignment.forbiddenFiles.map((item) => `- ${item}`) : ["- none specified"]),
    "",
    "Expected output:",
    assignment.expectedOutput,
    "",
    "Stop conditions:",
    ...(assignment.stopConditions.length > 0 ? assignment.stopConditions.map((item) => `- ${item}`) : ["- none specified"]),
    "",
    "Return requirements:",
    "- Complete only the bounded assignment.",
    "- Use tools when needed for file inspection, file edits, command output, or tests.",
    "- Do not use tools when the objective can be completed directly from the prompt.",
    "- Do not include hidden reasoning.",
    "- If blocked, say BLOCKED and give the concrete blocker.",
    "- End with a concise final answer suitable for Class B promotion.",
  ];
  return lines.join("\n");
}

export function createAssignment(context: CommandContext, input: AssignmentCreateInput): AssignmentCreateResult {
  const layout = ensureContextLayout(context.workspaceRoot);
  const assignmentId = input.id ?? shortId("assignment", context.now);
  const assignment: AssignmentRecord = {
    ...input,
    assignmentId,
    title: input.title ?? assignmentId,
    createdAt: isoStamp(context.now),
    workspacePath: path.resolve(input.workspacePath),
    boundedPrompt: "",
  };
  assignment.boundedPrompt = buildPrompt(assignment);
  const baseName = `${assignmentId}_${fileStamp(context.now)}`;
  const assignmentJsonPath = path.join(layout.assignments, `${baseName}.json`);
  const assignmentPromptPath = path.join(layout.assignments, `${baseName}.prompt.md`);
  writeJson(assignmentJsonPath, assignment);
  writeText(assignmentPromptPath, `${assignment.boundedPrompt}\n`);
  return { assignment, assignmentJsonPath, assignmentPromptPath };
}
