import path from "node:path";
import { ensureContextLayout, writeText, fileExists } from "../common.js";
export function initWorkspace(context) {
    const layout = ensureContextLayout(context.workspaceRoot);
    const createdFiles = [];
    const rootMarker = path.join(context.workspaceRoot, "strata-workspace.md");
    if (!fileExists(rootMarker)) {
        writeText(rootMarker, [
            "# Strata Workspace",
            "",
            "This workspace is initialized for CLI-first Strata backend runtime operations.",
            "Do not store API keys in this workspace.",
        ].join("\n"));
        createdFiles.push(rootMarker);
    }
    return {
        workspaceRoot: context.workspaceRoot,
        context: layout,
        createdFiles,
    };
}
