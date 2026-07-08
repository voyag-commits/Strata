import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface ContextLayout {
  root: string;
  aContract: string;
  bLedger: string;
  cPool: string;
  dTrace: string;
  assignments: string;
  results: string;
  testReports: string;
  appserverEvents: string;
  workerLogs: string;
  secretScans: string;
  runsIndexPath: string;
}

export interface CommandContext {
  projectRoot: string;
  workspaceRoot: string;
  now: Date;
}

export function createCommandContext(projectRoot = process.cwd(), workspaceRoot?: string): CommandContext {
  return {
    projectRoot: path.resolve(projectRoot),
    workspaceRoot: path.resolve(workspaceRoot ?? projectRoot),
    now: new Date(),
  };
}

export function ensureDir(targetPath: string): string {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
}

export function fileExists(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

export function readText(targetPath: string): string {
  return fs.readFileSync(targetPath, "utf8");
}

export function writeText(targetPath: string, content: string): string {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content, "utf8");
  return targetPath;
}

export function writeJson(targetPath: string, content: unknown): string {
  return writeText(targetPath, `${JSON.stringify(content, null, 2)}\n`);
}

export function readJson<T>(targetPath: string): T {
  return JSON.parse(readText(targetPath)) as T;
}

export function isoStamp(date: Date): string {
  return date.toISOString();
}

export function fileStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").replace("T", "_");
}

export function shortId(prefix: string, date: Date = new Date()): string {
  return `${prefix}_${fileStamp(date)}`;
}

export function ensureContextLayout(root: string): ContextLayout {
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

export function collectFiles(root: string): string[] {
  const resolved = path.resolve(root);
  const results: string[] = [];
  if (!fileExists(resolved)) return results;
  const stats = fs.statSync(resolved);
  if (stats.isFile()) return [resolved];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    const fullPath = path.join(resolved, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

export function hashFiles(paths: string[]): string {
  const hash = crypto.createHash("sha256");
  for (const filePath of paths) {
    hash.update(filePath);
    hash.update("\n");
    hash.update(fs.readFileSync(filePath));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function formatTable(rows: string[][]): string {
  if (rows.length === 0) return "";
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
