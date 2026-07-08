import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";


// -- Freeze guard ----------------------------------------------
export const FREEZE_MSG = "use launcher as-is, it is stable";
export const FREEZE_LOCK_FILENAME = "FREEZE_LOCK";

export interface FreezeVerifyResult {
  ok: boolean;
  frozen: boolean;
  total: number;
  passed: number;
  mismatches: string[];
}

/** Verify source files against PACKAGE_CHECKSUMS.sha256.
 *  If the FREEZE_LOCK marker exists and any file fails, throws with FREEZE_MSG. */
export function verifyPackageIntegrity(packageRoot: string): FreezeVerifyResult {
  const checksumPath = path.join(packageRoot, "PACKAGE_CHECKSUMS.sha256");
  const freezeLockPath = path.join(packageRoot, FREEZE_LOCK_FILENAME);
  const frozen = exists(freezeLockPath);

  if (!exists(checksumPath)) {
    return { ok: true, frozen, total: 0, passed: 0, mismatches: [] };
  }

  const lines = readText(checksumPath)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const mismatches: string[] = [];
  let passed = 0;

  // Directories excluded from freeze verification (runtime artifacts)
  const freezeExcludedDirs = [".strata-runtime", ".strata", "node_modules", "dist"];

  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (!match) continue;
    const [, expectedHash, relativePath] = match;

    // Skip runtime directories that naturally change during operation
    if (freezeExcludedDirs.some((dir) => relativePath.startsWith(dir + "/") || relativePath === dir)) {
      continue;
    }

    const filePath = path.join(packageRoot, relativePath);
    if (!exists(filePath)) {
      mismatches.push(`${relativePath} (missing)`);
      continue;
    }
    const actualHash = sha256Text(readText(filePath));
    if (actualHash !== expectedHash) {
      mismatches.push(`${relativePath} (modified)`);
    } else {
      passed += 1;
    }
  }

  const ok = mismatches.length === 0;
  const result: FreezeVerifyResult = { ok, frozen, total: lines.length, passed, mismatches };

  if (frozen && !ok) {
    throw new Error(FREEZE_MSG);
  }

  return result;
}

export function isFrozen(packageRoot: string): boolean {
  return exists(path.join(packageRoot, FREEZE_LOCK_FILENAME));
}

export function freezePackage(packageRoot: string): string {
  const freezeLockPath = path.join(packageRoot, FREEZE_LOCK_FILENAME);
  writeText(freezeLockPath, `${new Date().toISOString()} - package frozen\n`);
  return freezeLockPath;
}

export function unfreezePackage(packageRoot: string): boolean {
  const freezeLockPath = path.join(packageRoot, FREEZE_LOCK_FILENAME);
  if (exists(freezeLockPath)) {
    fs.unlinkSync(freezeLockPath);
    return true;
  }
  return false;
}


export interface RuntimeContext {
  projectRoot: string;
  workspaceRoot: string;
  now: Date;
}

export interface CommandResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  command: string;
  args: string[];
}

export interface RuntimeLayout {
  root: string;
  config: string;
  sessions: string;
  notices: string;
  evidence: string;
  providerChecks: string;
  sessionLaunch: string;
  sessionCapture: string;
  dispatchEdge: string;
  blocked: string;
}

export function createRuntimeContext(projectRoot = process.cwd(), workspaceRoot?: string): RuntimeContext {
  return { projectRoot: path.resolve(projectRoot), workspaceRoot: path.resolve(workspaceRoot ?? projectRoot), now: new Date() };
}

export function ensureDir(target: string): string {
  fs.mkdirSync(target, { recursive: true });
  return target;
}

export function exists(target: string): boolean {
  return fs.existsSync(target);
}

export function readText(target: string): string {
  return fs.readFileSync(target, "utf8");
}

export function writeText(target: string, content: string): string {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content, "utf8");
  return target;
}

export function readJson<T>(target: string): T {
  return JSON.parse(readText(target)) as T;
}

export function writeJson(target: string, value: unknown): string {
  return writeText(target, `${JSON.stringify(value, null, 2)}\n`);
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function fileStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").replace("T", "_");
}

export function safePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

export function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function runCommand(command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding = { encoding: "utf8" }): CommandResult {
  const result = spawnSync(command, args, { ...options, encoding: "utf8" });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? result.error.message : ""),
    command,
    args,
  };
}

const WSL_WT_EXE_CANDIDATES = [
  "/mnt/c/Users/%USER%/AppData/Local/Microsoft/WindowsApps/wt.exe",
];

function resolveWtExe(): string | null {
  const explicit = (process.env.STRATA_WT_EXE || process.env.WT_EXE || "").trim();
  if (explicit && exists(explicit)) return explicit;

  const users = new Set<string>();
  users.add(os.userInfo().username);
  const userProfile = (process.env.USERPROFILE || "").split(/[\\/]/).filter(Boolean).pop();
  if (userProfile) users.add(userProfile);
  try {
    for (const entry of fs.readdirSync("/mnt/c/Users", { withFileTypes: true })) {
      if (entry.isDirectory()) users.add(entry.name);
    }
  } catch { /* not mounted or unavailable */ }

  for (const user of users) {
    for (const candidate of WSL_WT_EXE_CANDIDATES) {
      const resolved = candidate.replace("%USER%", user);
      if (exists(resolved)) return resolved;
    }
  }

  const pathResult = spawnSync("bash", ["-lc", "command -v wt.exe"], { encoding: "utf8", timeout: 3000, stdio: "pipe" });
  if (pathResult.status === 0) {
    const resolved = (pathResult.stdout || "").trim().split(/\r?\n/)[0];
    if (resolved && exists(resolved)) return resolved;
  }
  return null;
}

export interface SpawnTerminalResult {
  ok: boolean;
  wt_path: string | null;
  session_name: string;
  detail: string;
}

export function isWsl(): boolean {
  try {
    const release = os.release().toLowerCase();
    if (release.includes("microsoft") || release.includes("wsl")) return true;
    if (exists("/proc/sys/fs/binfmt_misc/WSLInterop")) return true;
  } catch { /* not WSL */ }
  return false;
}

export function spawnTerminalTab(sessionName: string): SpawnTerminalResult {
  if (!isWsl()) return { ok: false, wt_path: null, session_name: sessionName, detail: "not_wsl" };
  const wtPath = resolveWtExe();
  if (!wtPath) return { ok: false, wt_path: null, session_name: sessionName, detail: "wt_exe_not_found" };
  const shellCmd = `exec tmux attach -t ${JSON.stringify(sessionName)}`;
  const wslArgs = ["wsl.exe"];
  const distroName = (process.env.WSL_DISTRO_NAME || "").trim();
  if (distroName) wslArgs.push("-d", distroName);
  wslArgs.push("-e", "bash", "-c", shellCmd);
  const result = spawnSync(wtPath, [
    "-w", "0", "new-tab",
    "--", ...wslArgs,
  ], {
    encoding: "utf8",
    timeout: 10000,
    stdio: "pipe",
  });
  const ok = result.status === 0;
  return {
    ok,
    wt_path: wtPath,
    session_name: sessionName,
    detail: ok ? "tab_spawned" : `exit_${result.status}: ${result.stderr || result.stdout || "unknown"}`,
  };
}

export function layoutFor(workspaceRoot: string): RuntimeLayout {
  const root = ensureDir(path.join(path.resolve(workspaceRoot), ".strata-runtime"));
  const config = ensureDir(path.join(root, "config"));
  const sessions = ensureDir(path.join(root, "sessions"));
  const notices = ensureDir(path.join(root, "notices"));
  const evidence = ensureDir(path.join(root, "evidence"));
  const providerChecks = ensureDir(path.join(evidence, "provider_checks"));
  const sessionLaunch = ensureDir(path.join(evidence, "session_launch"));
  const sessionCapture = ensureDir(path.join(evidence, "session_capture"));
  const dispatchEdge = ensureDir(path.join(evidence, "dispatch_edge"));
  const blocked = ensureDir(path.join(evidence, "blocked"));
  return { root, config, sessions, notices, evidence, providerChecks, sessionLaunch, sessionCapture, dispatchEdge, blocked };
}

export function resolveWorkspacePath(ctx: RuntimeContext, candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(ctx.workspaceRoot, candidate);
}
