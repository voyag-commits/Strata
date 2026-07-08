import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export function createCommandContext(projectRoot = process.cwd(), workspaceRoot) {
    return {
        projectRoot: path.resolve(projectRoot),
        workspaceRoot: path.resolve(workspaceRoot ?? projectRoot),
        now: new Date(),
    };
}
export function ensureDir(targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
    return targetPath;
}
export function fileExists(targetPath) {
    return fs.existsSync(targetPath);
}
export function readText(targetPath) {
    return fs.readFileSync(targetPath, "utf8");
}
export function writeText(targetPath, content) {
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, content, "utf8");
    return targetPath;
}
export function writeJson(targetPath, content) {
    return writeText(targetPath, `${JSON.stringify(content, null, 2)}\n`);
}
export function readJson(targetPath) {
    return JSON.parse(readText(targetPath));
}
export function isoStamp(date) {
    return date.toISOString();
}
export function fileStamp(date) {
    return date.toISOString().replace(/[:.]/g, "-").replace("T", "_");
}
export function shortId(prefix, date = new Date()) {
    return `${prefix}_${fileStamp(date)}`;
}
export function ensureContextLayout(root) {
    const resolvedRoot = path.resolve(root);
    const contextRoot = ensureDir(path.join(resolvedRoot, "context"));
    const aContract = ensureDir(path.join(contextRoot, "A_contract"));
    const bLedger = ensureDir(path.join(contextRoot, "B_ledger"));
    const cPool = ensureDir(path.join(contextRoot, "C_pool"));
    const dTrace = ensureDir(path.join(contextRoot, "D_trace"));
    const assignments = ensureDir(path.join(bLedger, "assignments"));
    const results = ensureDir(path.join(bLedger, "results"));
    const testReports = ensureDir(path.join(bLedger, "test_reports"));
    const appserverEvents = ensureDir(path.join(dTrace, "appserver_events"));
    const workerLogs = ensureDir(path.join(dTrace, "worker_logs"));
    const secretScans = ensureDir(path.join(dTrace, "secret_scans"));
    const runsIndexPath = path.join(dTrace, "runs_index.json");
    if (!fileExists(runsIndexPath)) {
        writeJson(runsIndexPath, []);
    }
    return {
        root: contextRoot,
        aContract,
        bLedger,
        cPool,
        dTrace,
        assignments,
        results,
        testReports,
        appserverEvents,
        workerLogs,
        secretScans,
        runsIndexPath,
    };
}
export function collectFiles(root) {
    const resolved = path.resolve(root);
    const results = [];
    if (!fileExists(resolved))
        return results;
    const stats = fs.statSync(resolved);
    if (stats.isFile())
        return [resolved];
    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
        const fullPath = path.join(resolved, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectFiles(fullPath));
        }
        else if (entry.isFile()) {
            results.push(fullPath);
        }
    }
    return results.sort();
}
export function hashFiles(paths) {
    const hash = crypto.createHash("sha256");
    for (const filePath of paths) {
        hash.update(filePath);
        hash.update("\n");
        hash.update(fs.readFileSync(filePath));
        hash.update("\n");
    }
    return hash.digest("hex");
}
export function formatTable(rows) {
    if (rows.length === 0)
        return "";
    const widths = rows[0].map((_, col) => Math.max(...rows.map((row) => row[col].length)));
    return rows
        .map((row, rowIndex) => {
        const line = row.map((cell, col) => cell.padEnd(widths[col], " ")).join("  ");
        if (rowIndex === 0) {
            const divider = widths.map((width) => "-".repeat(width)).join("  ");
            return `${line}\n${divider}`;
        }
        return line;
    })
        .join("\n");
}
