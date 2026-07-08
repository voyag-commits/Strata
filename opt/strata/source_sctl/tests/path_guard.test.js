import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safeSegment } from "../src/lib/common.js";

const CLI = path.resolve("src/cli.js");
function tmp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), name)); }
function cli(args) { return spawnSync("node", [CLI, ...args], { encoding: "utf8" }); }

test("safeSegment rejects dot-only path segments", () => {
  assert.throws(() => safeSegment("."), /dot-only/);
  assert.throws(() => safeSegment(".."), /dot-only/);
  assert.throws(() => safeSegment("..."), /dot-only/);
});

test("dispatch record rejects dot-segment IDs before deriving outbox paths", () => {
  const root = tmp("sctl-path-guard-");
  const run = cli(["dispatch", "record", "--workspace", root, "--assignment-id", "..", "--nonce", "..", "--target-role", "Change Author", "--target-id", ".."]); 
  assert.notEqual(run.status, 0);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join("\n"), /dot-only path segment/);
});
