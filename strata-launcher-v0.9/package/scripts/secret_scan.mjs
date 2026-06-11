import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const excluded = new Set(["node_modules", "dist", ".git"]);
const patterns = [/\bBearer\s+[A-Za-z0-9._~+/=\-]{16,}\b/g, /\bsk-[A-Za-z0-9_\-]{16,}\b/g, /api[_-]?key\s*[:=]\s*[A-Za-z0-9_\-]{12,}/gi];
const hits = [];
function scan(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    let text = "";
    try { text = fs.readFileSync(target, "utf8"); } catch { return; }
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text) && !/placeholder|example|redacted|api key/i.test(text)) hits.push(path.relative(root, target));
    }
    return;
  }
  for (const item of fs.readdirSync(target, { withFileTypes: true })) {
    if (item.isDirectory() && excluded.has(item.name)) continue;
    scan(path.join(target, item.name));
  }
}
scan(root);
const outDir = path.join(root, ".strata-runtime", "evidence", "secret_scan");
fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, `secret_scan_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
fs.writeFileSync(reportPath, [`Secret scan report`, `status=${hits.length ? "FAIL" : "PASS"}`, ...hits.map((h) => `hit=${h}`)].join("\n") + "\n", "utf8");
console.log(JSON.stringify({ status: hits.length ? "FAIL" : "PASS", report_path: reportPath, hits }, null, 2));
if (hits.length) process.exitCode = 1;
