import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { ContractError } from "./contract_shapes.js";
// -- Freeze guard ----------------------------------------------
export const FREEZE_MSG = "use launcher as-is, it is stable";
export const FREEZE_LOCK_FILENAME = "FREEZE_LOCK";
/** Verify source files against PACKAGE_CHECKSUMS.sha256.
 *  If the FREEZE_LOCK marker exists and any file fails, throws with FREEZE_MSG. */
export function verifyPackageIntegrity(packageRoot) {
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
    const mismatches = [];
    let passed = 0;
    // Directories excluded from freeze verification (runtime artifacts)
    const freezeExcludedDirs = [".strata-runtime", ".strata", "node_modules", "dist"];
    for (const line of lines) {
        const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
        if (!match)
            continue;
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
        }
        else {
            passed += 1;
        }
    }
    const ok = mismatches.length === 0;
    const result = { ok, frozen, total: lines.length, passed, mismatches };
    if (frozen && !ok) {
        throw new Error(FREEZE_MSG);
    }
    return result;
}
export function isFrozen(packageRoot) {
    return exists(path.join(packageRoot, FREEZE_LOCK_FILENAME));
}
export function freezePackage(packageRoot) {
    const freezeLockPath = path.join(packageRoot, FREEZE_LOCK_FILENAME);
    writeText(freezeLockPath, `${new Date().toISOString()} - package frozen\n`);
    return freezeLockPath;
}
export function unfreezePackage(packageRoot) {
    const freezeLockPath = path.join(packageRoot, FREEZE_LOCK_FILENAME);
    if (exists(freezeLockPath)) {
        fs.unlinkSync(freezeLockPath);
        return true;
    }
    return false;
}
export function createRuntimeContext(projectRoot = process.cwd(), workspaceRoot) {
    return { projectRoot: path.resolve(projectRoot), workspaceRoot: path.resolve(workspaceRoot ?? projectRoot), now: new Date() };
}
export function ensureDir(target) {
    fs.mkdirSync(target, { recursive: true });
    return target;
}
export function exists(target) {
    return fs.existsSync(target);
}
export function readText(target) {
    return fs.readFileSync(target, "utf8");
}
export function writeText(target, content) {
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, content, "utf8");
    return target;
}
export function readJson(target) {
    return JSON.parse(readText(target));
}
export function writeJson(target, value) {
    return writeText(target, `${JSON.stringify(value, null, 2)}\n`);
}
export function iso(date) {
    return date.toISOString();
}
export function fileStamp(date) {
    return date.toISOString().replace(/[:.]/g, "-").replace("T", "_");
}
export function safePart(value) {
    const raw = String(value ?? "").trim();
    if (!raw)
        throw new ContractError("INVALID_ARGUMENT", "safe part cannot be empty", true);
    const cleaned = raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!cleaned)
        throw new ContractError("INVALID_ARGUMENT", "safe part cannot become empty after normalization", true);
    if (cleaned === "." || cleaned === ".." || /^\.+$/.test(cleaned))
        throw new ContractError("INVALID_ARGUMENT", "safe part cannot be a dot-only path segment", true);
    return cleaned;
}
export function isInsidePath(parent, child) {
    const relative = path.relative(path.resolve(parent), path.resolve(child));
    return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
export function assertInsidePath(parent, child, label = "path") {
    if (!isInsidePath(parent, child))
        throw new ContractError("INVALID_ARGUMENT", `${label} escaped expected parent: ${child}`, true);
}
export function sha256Text(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}
export function runCommand(command, args, options = { encoding: "utf8" }) {
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
function resolveWtExe() {
    const explicit = (process.env.STRATA_WT_EXE || process.env.WT_EXE || "").trim();
    if (explicit && exists(explicit))
        return explicit;
    const users = new Set();
    users.add(os.userInfo().username);
    const userProfile = (process.env.USERPROFILE || "").split(/[\\/]/).filter(Boolean).pop();
    if (userProfile)
        users.add(userProfile);
    try {
        for (const entry of fs.readdirSync("/mnt/c/Users", { withFileTypes: true })) {
            if (entry.isDirectory())
                users.add(entry.name);
        }
    }
    catch { /* not mounted or unavailable */ }
    for (const user of users) {
        for (const candidate of WSL_WT_EXE_CANDIDATES) {
            const resolved = candidate.replace("%USER%", user);
            if (exists(resolved))
                return resolved;
        }
    }
    const pathResult = spawnSync("bash", ["-lc", "command -v wt.exe"], { encoding: "utf8", timeout: 3000, stdio: "pipe" });
    if (pathResult.status === 0) {
        const resolved = (pathResult.stdout || "").trim().split(/\r?\n/)[0];
        if (resolved && exists(resolved))
            return resolved;
    }
    return null;
}
export function isWsl() {
    try {
        const release = os.release().toLowerCase();
        if (release.includes("microsoft") || release.includes("wsl"))
            return true;
        if (exists("/proc/sys/fs/binfmt_misc/WSLInterop"))
            return true;
    }
    catch { /* not WSL */ }
    return false;
}
export function spawnTerminalTab(sessionName) {
    if (!isWsl())
        return { ok: false, wt_path: null, session_name: sessionName, detail: "not_wsl" };
    const wtPath = resolveWtExe();
    if (!wtPath)
        return { ok: false, wt_path: null, session_name: sessionName, detail: "wt_exe_not_found" };
    const shellCmd = `exec tmux attach -t ${JSON.stringify(sessionName)}`;
    const wslArgs = ["wsl.exe"];
    const distroName = (process.env.WSL_DISTRO_NAME || "").trim();
    if (distroName)
        wslArgs.push("-d", distroName);
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
export function layoutFor(workspaceRoot) {
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
export function resolveWorkspacePath(ctx, candidate) {
    return path.isAbsolute(candidate) ? candidate : path.resolve(ctx.workspaceRoot, candidate);
}
