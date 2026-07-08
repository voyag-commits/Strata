import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureLayout } from "./layout.js";
import { exists, resultEnvelope } from "./common.js";

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\''`)}'`;
}

function commandExists(command) {
  const out = spawnSync("bash", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  return out.status === 0;
}

function repoPathFor(root, repoKind, input) {
  if (repoKind === "sctl") return ensureLayout(root).context;
  if (repoKind === "codebase") return path.resolve(input.codebaseRepo || input.codebase_repo || process.env.CODEBASE_REPO || process.cwd());
  throw new Error("panel git repo must be sctl or codebase");
}

export function openGitPanel(root, input = {}) {
  const repo = input.repo || input.target || "sctl";
  const repoPath = repoPathFor(root, repo, input);
  if (!exists(path.join(repoPath, ".git"))) throw new Error(`git repository not found: ${repoPath}`);
  const requestedTool = input.tool || input.command || "git-status";
  let command;
  let args;
  let cwd = repoPath;
  if (requestedTool === "git-status") {
    command = "git";
    args = ["-C", repoPath, "status", "--short", "--branch"];
    cwd = process.cwd();
  } else if (["lazygit", "gitk"].includes(requestedTool)) {
    if (!commandExists(requestedTool)) throw new Error(`git panel command is not available: ${requestedTool}`);
    command = requestedTool;
    args = [];
  } else {
    throw new Error("panel git tool must be lazygit, gitk, or git-status");
  }
  const launcher = { command, args, cwd, repo, repo_path: repoPath, mode: requestedTool === "git-status" ? "status_panel_fallback" : "visible_git_panel" };
  if (input.printCommand) return resultEnvelope("sctl.panel.git.caller.v1", true, { launcher, executed: false }, [], []);
  const out = spawnSync(command, args, { cwd, stdio: requestedTool === "git-status" ? "pipe" : "inherit", encoding: "utf8" });
  return resultEnvelope("sctl.panel.git.caller.v1", out.status === 0, { launcher, executed: true, status: out.status, stdout: out.stdout || "", stderr: out.stderr || "" }, out.status === 0 ? [] : [out.stderr || `git panel command failed: ${requestedTool}`], []);
}

export function gitPanelCaller(root, input = {}) {
  return openGitPanel(root, { ...input, tool: input.tool || input.command || "git-status", printCommand: input.printCommand ?? true });
}
