import test from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../src/lib/tools.js";

test("SCTL tool registry contains no runtime session tools", () => {
  const toolIds = TOOLS.map((tool) => tool.tool_id).join("\n").toLowerCase();
  assert.equal(toolIds.includes("session."), false);
  assert.equal(toolIds.includes("codex"), false);
  assert.equal(toolIds.includes("tmux"), false);
  assert.equal(TOOLS.every((tool) => tool.runtime_tmux === false), true);
});
