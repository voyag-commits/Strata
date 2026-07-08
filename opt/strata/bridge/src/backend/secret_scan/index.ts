import fs from "node:fs";
import path from "node:path";
import { ensureContextLayout, fileStamp, type CommandContext, writeText } from "../common.js";

export interface SecretScanResult {
  reportPath: string;
  status: "PASS" | "FAIL";
  hits: string[];
}

export interface SecretScanOptions {
  secretFile?: string;
  extraTargets?: string[];
}

function defaultTargets(workspaceRoot: string): string[] {
  const rootFiles = fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(workspaceRoot, entry.name));
  return [
    path.join(workspaceRoot, "src"),
    path.join(workspaceRoot, "tests"),
    path.join(workspaceRoot, "context", "B_ledger"),
    path.join(workspaceRoot, "context", "D_trace"),
    path.join(workspaceRoot, "examples"),
    path.join(workspaceRoot, "review_evidence"),
    ...rootFiles,
    ...fs
      .readdirSync(workspaceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^Strata_.*Package/i.test(entry.name))
      .map((entry) => path.join(workspaceRoot, entry.name)),
  ];
}

function collectFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const stats = fs.statSync(root);
  if (stats.isFile()) return [root];
  const results: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && ["node_modules", "dist", ".git", "target", ".vite"].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function readSecret(secretFile?: string): string | null {
  if (!secretFile) return process.env.DEEPSEEK_API_KEY?.trim() ?? null;
  return fs.readFileSync(path.resolve(secretFile), "utf8").trim();
}

export function runSecretScan(context: CommandContext, options: SecretScanOptions): SecretScanResult {
  const layout = ensureContextLayout(context.workspaceRoot);
  const reportPath = path.join(layout.secretScans, `secret_scan_${fileStamp(context.now)}.txt`);
  const secret = readSecret(options.secretFile);
  const hits = new Set<string>();
  const targets = [...defaultTargets(context.workspaceRoot), ...(options.extraTargets ?? []).map((item) => path.resolve(item))];
  const secretPatterns = [
    /\bBearer\s+[A-Za-z0-9._~+/=\-]{16,}\b/g,
    /\bsk-[A-Za-z0-9_\-]{16,}\b/g,
  ];

  const hasUnredactedPatternMatch = (content: string): boolean => {
    for (const pattern of secretPatterns) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        if (!match[0].toLowerCase().includes("redacted")) return true;
      }
    }
    return false;
  };

  for (const target of targets) {
    for (const filePath of collectFiles(target)) {
      if (options.secretFile && path.resolve(filePath) === path.resolve(options.secretFile)) continue;
      let content = "";
      try {
        content = fs.readFileSync(filePath, "utf8");
      } catch {
        continue;
      }
      if (secret && secret.length > 0 && content.includes(secret)) {
        hits.add(filePath);
        continue;
      }
      if (hasUnredactedPatternMatch(content)) {
        hits.add(filePath);
      }
    }
  }

  const hitList = [...hits].sort();
  const status = hitList.length === 0 ? "PASS" : "FAIL";
  const lines = [
    "Secret scan report",
    `timestamp=${context.now.toISOString()}`,
    `targets=${targets.join(";")}`,
    `result=${status}`,
  ];
  if (options.secretFile) lines.push(`excluded=${path.resolve(options.secretFile)}`);
  if (hitList.length > 0) {
    lines.push("hits:");
    lines.push(...hitList);
  }
  writeText(reportPath, `${lines.join("\n")}\n`);
  return { reportPath, status, hits: hitList };
}
