import fs from "node:fs";
import path from "node:path";
import { ensureLayout } from "./layout.js";
import { resultEnvelope, writeJson } from "./common.js";

const SKIP = new Set(["node_modules", ".git", ".strata", "dist"]);
const PATTERNS = [/OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{20,}/, /BEGIN (RSA|OPENSSH|DSA|EC) PRIVATE KEY/, /password\s*[:=]\s*['\"][^'\"]{8,}['\"]/i];
function collect(dir, out = []) { for (const ent of fs.readdirSync(dir, { withFileTypes: true })) { if (SKIP.has(ent.name)) continue; const full = path.join(dir, ent.name); if (ent.isDirectory()) collect(full, out); else if (ent.isFile() && ent.size < 1024 * 1024) out.push(full); } return out; }
export function secretScan(root) {
  const findings = [];
  for (const file of collect(root)) {
    let text = "";
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    for (const pattern of PATTERNS) if (pattern.test(text)) findings.push({ file: path.relative(root, file), pattern: String(pattern) });
  }
  const l = ensureLayout(root);
  const report = writeJson(path.join(l.evidence, `secret_scan_${new Date().toISOString().replace(/[:.]/g, "-")}.json`), { findings, created_at: new Date().toISOString() });
  return resultEnvelope("sctl.secret_scan.v1", findings.length === 0, { findings }, findings.length ? ["potential secret patterns found"] : [], [report]);
}
