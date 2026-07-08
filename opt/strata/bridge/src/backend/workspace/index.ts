import path from "node:path";
import { ensureContextLayout, type ContextLayout, type CommandContext, writeText, fileExists } from "../common.js";

export interface InitResult {
  workspaceRoot: string;
  context: ContextLayout;
  createdFiles: string[];
}

export function initWorkspace(context: CommandContext): InitResult {
  const layout = ensureContextLayout(context.workspaceRoot);
  const createdFiles: string[] = [];
  const rootMarker = path.join(context.workspaceRoot, "strata-workspace.md");
  if (!fileExists(rootMarker)) {
    writeText(
      rootMarker,
      [
        "# Strata Workspace",
        "",
        "This workspace is initialized for CLI-first Strata backend runtime operations.",
        "Do not store API keys in this workspace.",
      ].join("\n"),
    );
    createdFiles.push(rootMarker);
  }
  return {
    workspaceRoot: context.workspaceRoot,
    context: layout,
    createdFiles,
  };
}
