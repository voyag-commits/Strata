import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CLI = path.resolve("src/cli.js");
function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }
function cli(args, env = {}) {
  return spawnSync("node", [CLI, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
}
function json(run) { assert.equal(run.status, 0, run.stderr || run.stdout); return JSON.parse(run.stdout); }

test("doctor reports checks on a fresh workspace", () => {
  const root = tmp("sctl-doctor-");
  assert.equal(json(cli(["context", "bootstrap", "--workspace", root])).ok, true);
  const d = json(cli(["doctor", "--workspace", root]));
  assert.equal(d.ok, true);
  const names = d.result.checks.map((c) => c.name);
  assert.deepEqual(names.sort(), ["context_state", "package_checksums", "repo_status", "secret_scan", "telemetry_log"].sort());
  assert.equal(d.result.checks.find((c) => c.name === "secret_scan").findings, 0);
});

test("init-workspace is idempotent and creates layout", () => {
  const root = tmp("sctl-init-");
  const first = json(cli(["init-workspace", "--workspace", root]));
  assert.equal(first.ok, true);
  assert.equal(fs.existsSync(path.join(root, ".strata", "context", "README.md")), true);
  const second = json(cli(["init-workspace", "--workspace", root]));
  assert.equal(second.ok, true);
});

test("status reports context state and active cycle", () => {
  const root = tmp("sctl-status-");
  json(cli(["context", "bootstrap", "--workspace", root]));
  const s = json(cli(["status", "--workspace", root]));
  assert.equal(s.ok, true);
  assert.equal(typeof s.result.state.current_class_b_revision, "number");
  assert.equal(s.result.active_cycle, null);
});

test("logs returns telemetry lines with tail and kind filters", () => {
  const root = tmp("sctl-logs-");
  json(cli(["context", "bootstrap", "--workspace", root]));
  const all = json(cli(["logs", "--workspace", root]));
  assert.equal(all.ok, true);
  assert.ok(all.result.count >= 1);
  const filtered = json(cli(["logs", "--workspace", root, "--kind", "context.bootstrap"]));
  assert.ok(filtered.result.count >= 1);
  assert.ok(filtered.result.lines.every((l) => JSON.parse(l).event.startsWith("context.bootstrap")));
  const tailed = json(cli(["logs", "--workspace", root, "--tail", "1"]));
  assert.equal(tailed.result.count, 1);
});

test("collect-evidence writes a manifest and copies artifacts", () => {
  const root = tmp("sctl-evidence-");
  json(cli(["context", "bootstrap", "--workspace", root]));
  const out = path.join(root, "evidence-out");
  const c = json(cli(["collect-evidence", "--workspace", root, "--out", out]));
  assert.equal(c.ok, true);
  assert.equal(fs.existsSync(path.join(out, "manifest.json")), true);
  assert.equal(fs.existsSync(path.join(out, "context_state.json")), true);
  assert.equal(fs.existsSync(path.join(out, "active_sessions.json")), true);
});

test("top-level aliases match cycle subcommands", () => {
  const root = tmp("sctl-aliases-");
  json(cli(["context", "bootstrap", "--workspace", root]));
  const ep = cli(["entry-path", "--workspace", root]).stdout.trim();
  const cep = cli(["cycle", "entry-path", "--workspace", root]).stdout.trim();
  assert.equal(ep, cep);
});

test("--config loads STRATA_WORKSPACE from env file", () => {
  const root = tmp("sctl-config-");
  json(cli(["context", "bootstrap", "--workspace", root]));
  const envFile = path.join(root, "sctl.env");
  fs.writeFileSync(envFile, `# sctl config\nSTRATA_WORKSPACE=${root}\n`);
  const s = json(cli(["--config", envFile, "status"]));
  assert.equal(s.ok, true);
  assert.equal(s.result.context_repo, path.join(root, ".strata", "context"));
});

test("paths reports the five path categories", () => {
  const root = tmp("sctl-paths-");
  const p = json(cli(["paths", "--workspace", root, "--codebase-repo", "/tmp/project"]));
  assert.equal(p.ok, true);
  assert.equal(p.result.workspace_root, root);
  assert.ok(p.result.package_root.length > 0);
  assert.ok(p.result.director_entry_controlled.endsWith("director_governing_entry.md"));
  assert.equal(p.result.target_codebase, "/tmp/project");
  assert.equal(p.result.director_entry_source, null);
});
