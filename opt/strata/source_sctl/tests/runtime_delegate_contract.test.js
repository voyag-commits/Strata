import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HARNESS = fs.readFileSync("flowmaps/flowmap02/live_cycle_harness.sh", "utf8");
const COMMON = fs.readFileSync("scripts/wsl_tmux/_sctl_adapter_common.sh", "utf8");
const SESSION_NEW = fs.readFileSync("scripts/wsl_tmux/sctl-session-new", "utf8");
const DISPATCH_INJECT = fs.readFileSync("scripts/wsl_tmux/sctl-dispatch-inject", "utf8");
const SESSION_CAPTURE = fs.readFileSync("scripts/wsl_tmux/sctl-session-capture", "utf8");
const SESSION_RETIRE = fs.readFileSync("scripts/wsl_tmux/sctl-session-retire", "utf8");
const RETURN_DIR = fs.readFileSync("scripts/wsl_tmux/sctl-return-dir", "utf8");
const RETURN_DROP = fs.readFileSync("scripts/wsl_tmux/sctl-return-drop", "utf8");

function mainBody() {
  return HARNESS.slice(HARNESS.indexOf("main() {"));
}

function assertOrdered(body, labels) {
  let cursor = -1;
  for (const label of labels) {
    const next = body.indexOf(label, cursor + 1);
    assert.notEqual(next, -1, `missing ordered step: ${label}`);
    assert.ok(next > cursor, `step out of order: ${label}`);
    cursor = next;
  }
}

const REQUIRED_OPERATIONAL_STAGES = [
  "load_director_entry",
  "validate_director_entry",
  "bind_director_entry_to_bootstrap_context",
  "bootstrap_context",
  "register_align_coordinator_session",
  "export_context",
  "prepare_branch",
  "register_align_author_session",
  "render_dispatch",
  "inject_packet",
  "wait_for_return",
  "classify_return",
  "commit_author_report_class_b",
  "register_align_reviewer_session",
  "infer_review_result",
  "run_ci",
  "merge_if_authorized",
  "commit_final_outcome",
  "retire_disposable_sessions",
  "refresh_coordinator_context",
  "export_context_after",
  "append_timeline",
  "final_audit",
];

test("SCTL runtime selection uses delegate names with one-cycle runtime-edge aliases only", () => {
  assert.match(HARNESS, /SCTL_RUNTIME_DELEGATE_ROOT/);
  assert.match(HARNESS, /SCTL_RUNTIME_DELEGATE_BIN/);
  assert.match(COMMON, /SCTL_RUNTIME_DELEGATE_ROOT/);
  assert.match(COMMON, /SCTL_RUNTIME_DELEGATE_BIN/);
  assert.match(COMMON, /SCTL_RUNTIME_EDGE_ROOT is deprecated/);
  assert.match(COMMON, /SCTL_RUNTIME_EDGE_CLI is deprecated/);
});

test("live harness preserves GitHub-main adapter vocabulary and does not call raw delegate verbs directly", () => {
  for (const adapter of ["sctl-session-new", "sctl-dispatch-render", "sctl-dispatch-inject", "sctl-session-capture", "sctl-session-retire"]) {
    assert.match(HARNESS, new RegExp(adapter));
  }
  assert.match(HARNESS, /register_session "1 session new delegated coordinator"/);
  assert.match(HARNESS, /align_session_name "1"/);
  assert.match(HARNESS, /inject_packet "7 author dispatch inject"/);
  assert.match(HARNESS, /capture_session "8 author session capture"/);
  assert.match(HARNESS, /retire_disposable_sessions/);
  assert.doesNotMatch(HARNESS, /delegate_session_launch_or_resolve|delegate_dispatch_deliver|run_delegate_json/);
  assert.doesNotMatch(HARNESS, /delegate\s+session-create|delegate\s+dispatch-deliver|delegate\s+session-capture/);
  assert.doesNotMatch(HARNESS, /runtime_edge_cli|strata-fleet-launch/);
});

test("adapter boundary maps shell-level Flowmap 02 operations to delegate verbs", () => {
  assert.match(SESSION_NEW, /session-create/);
  assert.match(SESSION_NEW, /session-register/);
  assert.match(SESSION_NEW, /sctl sessions register/);
  assert.match(DISPATCH_INJECT, /dispatch-deliver/);
  assert.match(SESSION_CAPTURE, /session-capture/);
  assert.match(SESSION_RETIRE, /session-terminate/);
  assert.match(SESSION_RETIRE, /TERMINATE_RUNTIME=0/);
  assert.match(SESSION_RETIRE, /sctl sessions release/);
  assert.match(RETURN_DIR, /return-dir/);
  assert.match(RETURN_DROP, /return-drop/);
});

test("adapter maps SCTL explicit-only lifecycle policy before runtime delegate calls", () => {
  assert.match(SESSION_NEW, /runtime_retire_policy_for_delegate/);
  assert.match(SESSION_NEW, /explicit-only\|explicit_only\|logical-only\|none/);
  assert.match(SESSION_NEW, /RUNTIME_RETIRE_POLICY/);
  assert.match(SESSION_RETIRE, /runtime_retire_policy_for_delegate/);
  assert.match(SESSION_RETIRE, /RUNTIME_RETIRE_POLICY/);
});

test("Director Entry is committed into context but never becomes a runtime session actor", () => {
  assert.match(HARNESS, /start_manual_cycle_entry/);
  assert.match(HARNESS, /Director Entry Document was committed to Class A/);
  assert.doesNotMatch(HARNESS, /register_session[^\n]*director/i);
  assert.doesNotMatch(HARNESS, /sctl-session-new[^\n]*director/i);
  assert.doesNotMatch(HARNESS, /target-role[^\n]*director/i);
});

test("Flowmap 02 operational order remains equivalent to GitHub main with Director Entry inserted before Coordinator dispatch", () => {
  assertOrdered(mainBody(), [
    "preflight",
    "bootstrap_context",
    "start_manual_cycle_entry",
    "register_session \"1 session new delegated coordinator\"",
    "align_session_name \"1\"",
    "inject_initial_coordinator_dispatch",
    "coordinator_context_export \"cycle_00\"",
    "export_full_context \"$CYCLE_LABEL\" \"coordinator_before\"",
    "prepare_codebase_branch",
    "register_session \"4 session new change author\"",
    "align_session_name \"4\"",
    "write_author_work_order",
    "send_author_message",
    "render_author_dispatch",
    "export_full_context \"$CYCLE_LABEL\" \"author_dispatch\"",
    "inject_packet \"7 author dispatch inject\"",
    "capture_session \"8 author session capture\"",
    "wait_for_return \"9\"",
    "classify_return \"10 classify author return\"",
    "commit_author_report_to_classb",
    "register_session \"12 session new reviewer\"",
    "align_session_name \"12\"",
    "write_reviewer_work_order",
    "send_reviewer_message",
    "render_reviewer_dispatch",
    "export_full_context \"$CYCLE_LABEL\" \"reviewer_dispatch\"",
    "inject_packet \"15 reviewer dispatch inject\"",
    "capture_session \"16 reviewer session capture\"",
    "wait_for_return \"17\"",
    "classify_return \"17 classify reviewer return\"",
    "infer_review_result",
    "run_ci_checks",
    "merge_if_authorized",
    "record_final_outcome",
    "retire_disposable_sessions",
    "coordinator_freshness",
    "export_full_context \"$CYCLE_LABEL\" \"coordinator_after\"",
    "append_cycle_timeline",
    "cycle_end_artifact_freshness",
    "final_audit",
  ]);
});

test("live harness emits the Director Entry delegate alignment operational stages in order", () => {
  for (const stage of REQUIRED_OPERATIONAL_STAGES) {
    assert.match(HARNESS, new RegExp(`record_operational_stage "${stage}"`));
  }
  assertOrdered(mainBody(), REQUIRED_OPERATIONAL_STAGES);
});

test("review result inference accepts reviewer wording from live delegate reports", () => {
  assert.match(HARNESS, /\\baccepted\\b/);
  assert.match(HARNESS, /merge\[\[:space:\]-\]\+recommended/);
  assert.match(HARNESS, /approved\|approve\|accepted\|accept/);
});

test("SCTL owns return directories and normal lifecycle release is non-destructive", () => {
  assert.match(HARNESS, /\.strata\/returns\/\$ASSIGNMENT_ID\/\$agent_id\/packet\.json/);
  assert.match(HARNESS, /retire_disposable_sessions/);
  assert.doesNotMatch(HARNESS, /delegate\s+session-terminate/);
  assert.match(SESSION_RETIRE, /--terminate-runtime\|--kill-tmux/);
  assert.match(SESSION_RETIRE, /runtime_left_alive_explicit_only/);
});

test("cycle-end artifact freshness cleans runtime, returns, and context git storage but does not own codebase-git branch lifecycle", () => {
  assert.match(HARNESS, /cycle_end_artifact_freshness/);
  assert.match(HARNESS, /cleanup_runtime_session/);
  assert.match(HARNESS, /reset_cycle_transient_artifacts/);
  assert.match(HARNESS, /cleanup_context_git_storage/);
  assert.match(HARNESS, /tmux kill-session/);
  assert.match(HARNESS, /git gc --prune=now/);
  assert.match(HARNESS, /Reviewer outcome detail remains in the report\/Class B layer/);
  // L3: harness no longer force-deletes cycle-owned branches at cycle end.
  assert.doesNotMatch(HARNESS, /cleanup_cycle_change_branch/);
  assert.doesNotMatch(HARNESS, /branch -D/);
  assert.doesNotMatch(HARNESS, /git switch -f/);
  assert.doesNotMatch(HARNESS, /branch_is_cycle_owned/);
  assert.doesNotMatch(HARNESS, /FRESHNESS_KEEP_CHANGE_BRANCH/);
  // Operator opt-in --delete-branch-after-merge (safe -d after merge) remains available.
  assert.match(HARNESS, /delete-branch-after-merge/);
  assert.match(HARNESS, /branch lifecycle is owned by the agents/);
});

test("SCTL package no longer contains mock runtime implementation files", () => {
  assert.equal(fs.existsSync("scripts/mock_runtime_delegate"), false);
  assert.equal(fs.existsSync("scripts/adr_06_18_e2e_mock_runtime.sh"), false);
  assert.equal(fs.existsSync("examples/adr_06_18_e2e_mock_runtime"), false);
});

test("run-start artifact freshness clears stale returns and disposable sessions before cycle 1 without touching codebase/context git", () => {
  assert.match(HARNESS, /run_start_artifact_freshness\(\)/);
  // Run-start pass is invoked exactly once, after the git panel startpoint and before the cycle-1 coordinator session.
  assertOrdered(mainBody(), [
    "call_sctl_git_panel_startpoint",
    "run_start_artifact_freshness",
    "register_session \"1 session new delegated coordinator\"",
  ]);
  // Clears stale transient return drop-box directories so wait_for_return cannot false-positive on a crashed prior run.
  assert.match(HARNESS, /run_start\.artifact_freshness\.returns/);
  assert.match(HARNESS, /STRATA-CODER-"\$ASSIGNMENT_ID"-C\*|STRATA-REVIEWER-"\$ASSIGNMENT_ID"-C\*/);
  // Run-start is determinism-only: no codebase-git branch deletion and no context-git content deletion/GC at run start.
  const runStartStart = HARNESS.indexOf("run_start_artifact_freshness() {");
  const runStartEnd = HARNESS.indexOf("\n}\n", runStartStart);
  const runStartBody = HARNESS.slice(runStartStart, runStartEnd);
  assert.doesNotMatch(runStartBody, /cleanup_cycle_change_branch|branch -D|git switch -f|git reset|git clean/);
  assert.doesNotMatch(runStartBody, /cleanup_context_git_storage|git gc|git reflog expire/);
  // Honors the same freshness opt-out as the cycle-end pass.
  assert.match(runStartBody, /ARTIFACT_FRESHNESS/);
});
