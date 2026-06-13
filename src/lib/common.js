import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export function parseArgv(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) { positionals.push(item); continue; }
    const eq = item.indexOf("=");
    let key;
    let value;
    if (eq >= 0) { key = item.slice(2, eq); value = item.slice(eq + 1); }
    else {
      key = item.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { value = next; i += 1; }
      else value = true;
    }
    if (flags[key] === undefined) flags[key] = value;
    else if (Array.isArray(flags[key])) flags[key].push(value);
    else flags[key] = [flags[key], value];
  }
  return { flags, positionals };
}

export function optionalFlag(flags, names, fallback = undefined) {
  for (const name of Array.isArray(names) ? names : [names]) {
    const value = flags[name];
    if (value === undefined) continue;
    if (Array.isArray(value)) return String(value[value.length - 1]);
    if (value === true) return "true";
    return String(value);
  }
  return fallback;
}
export function requireFlag(flags, names) {
  const value = optionalFlag(flags, names);
  if (value === undefined || value === "") throw new Error(`missing required flag --${Array.isArray(names) ? names[0] : names}`);
  return value;
}
export function boolFlag(flags, name, fallback = false) {
  const value = flags[name];
  if (value === undefined) return fallback;
  if (value === true) return true;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}
export function flagList(flags, name) {
  const value = flags[name];
  if (value === undefined) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.flatMap((v) => String(v).split(",").map((x) => x.trim()).filter(Boolean));
}
export function intFlag(flags, names, fallback = undefined) {
  const value = optionalFlag(flags, names, fallback === undefined ? undefined : String(fallback));
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^-?\d+$/.test(String(value))) throw new Error(`flag --${Array.isArray(names) ? names[0] : names} must be an integer`);
  return Number(value);
}
export function workspaceRoot(flags = {}) {
  return path.resolve(optionalFlag(flags, "workspace", process.env.STRATA_WORKSPACE || process.cwd()));
}
export function safeSegment(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("safe segment cannot be empty");
  const cleaned = raw.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160);
  if (!cleaned) throw new Error("safe segment cannot become empty after normalization");
  return cleaned;
}
export function fileSlug(input) { return safeSegment(String(input).toLowerCase().replace(/[^a-z0-9_.-]+/gi, "-")); }
export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }
export function writeText(file, text) { ensureDir(path.dirname(file)); fs.writeFileSync(file, text, "utf8"); return file; }
export function appendText(file, text) { ensureDir(path.dirname(file)); fs.appendFileSync(file, text, "utf8"); return file; }
export function readText(file) { return fs.readFileSync(file, "utf8"); }
export function writeJson(file, obj) { return writeText(file, `${JSON.stringify(obj, null, 2)}\n`); }
export function readJson(file) { return JSON.parse(readText(file)); }
export function readJsonOr(file, fallback) { return exists(file) ? readJson(file) : fallback; }
export function appendJsonl(file, obj) { return appendText(file, `${JSON.stringify(obj)}\n`); }
export function exists(file) { return fs.existsSync(file); }
export function nowDate() {
  const fixed = process.env.SCTL_FIXED_NOW;
  if (fixed) {
    const d = new Date(fixed);
    if (Number.isNaN(d.getTime())) throw new Error("SCTL_FIXED_NOW must be an ISO-compatible timestamp");
    return d;
  }
  return new Date();
}
export function timestamp(date = nowDate()) { return date.toISOString().replace(/[:.]/g, "-"); }
export function isoNow() { return nowDate().toISOString(); }
export function sha256Text(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
export function sha256File(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
export function run(command, args = [], options = {}) {
  const out = spawnSync(command, args, { cwd: options.cwd, input: options.input, encoding: "utf8", shell: false, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, ...(options.env || {}) } });
  return { command, args, cwd: options.cwd || process.cwd(), status: out.status, signal: out.signal, stdout: out.stdout || "", stderr: out.stderr || "", ok: out.status === 0, error: out.error ? String(out.error.message || out.error) : null };
}
export function resultEnvelope(toolId, ok, result = {}, errors = [], evidencePaths = []) {
  return { contract_id: "strata.sctl.result_envelope.v1", tool_id: toolId, ok: Boolean(ok), result, errors, evidence_paths: evidencePaths, created_at: isoNow() };
}
export function printJson(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
export function relativeOrAbsolute(root, file) { if (!file) return null; return path.isAbsolute(file) ? file : path.resolve(root, file); }
export function isInsidePath(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}
export function workspacePath(root, file) {
  const resolved = relativeOrAbsolute(root, file);
  if (!resolved) return null;
  if (!isInsidePath(root, resolved)) throw new Error(`path is outside workspace: ${file}`);
  return resolved;
}

export function parseSimpleFrontmatter(text) {
  if (!text.startsWith("---\n")) return { attrs: {}, body: text, hasFrontmatter: false };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { attrs: {}, body: text, hasFrontmatter: false };
  const raw = text.slice(4, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  const attrs = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    attrs[key] = val;
  }
  return { attrs, body, hasFrontmatter: true };
}

export function hasMarkdownHeading(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^##\\s+${escaped}\\s*$`, "im").test(text);
}

export function markdownSectionContent(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|$(?![\\s\\S]))`, "im");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

export function isIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
