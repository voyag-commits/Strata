#!/usr/bin/env bash
set -Eeuo pipefail

# Flowmap 02 live operator harness.
# Based on the observed A005 live cycle. This script has no dry-run mode.
# It performs guarded live SCTL/codebase operations and writes structured evidence.

SCRIPT_NAME="$(basename "$0")"
PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"
SCTL_WORKSPACE=""
CODEBASE_REPO=""
SCTL_RUNTIME_EDGE_ROOT="${SCTL_RUNTIME_EDGE_ROOT:-}"
ENVELOPE_TEMPLATE_FILE="${ENVELOPE_TEMPLATE_FILE:-/mnt/c/Users/hou16/Downloads/Envelope Template.txt}"
ASSIGNMENT_ID=""
SHORT_NAME="sample-uniform-sphere-v2"
TRUNK_BRANCH="main"
CHANGE_BRANCH=""
OBJECTIVE="Implement one small assigned codebase change and return a Class B-ready operational report."
RUN_ROOT=""
RETURN_TIMEOUT=300
POLL_INTERVAL=5
ALLOW_MERGE=0
ALLOW_DIRTY_CODEBASE=0
REUSE_BRANCH=0
PAUSE_BEFORE_RETIRE=0
SKIP_NPM_TEST=0
SKIP_ADAPTER_SYNTAX=0
PASTE_DELAY="${SCTL_DISPATCH_PASTE_DELAY:-5}"
NO_TAB=0
REVIEW_RESULT_OVERRIDE="${FLOWMAP02_REVIEW_RESULT:-}"
DELETE_BRANCH_AFTER_MERGE=0
CYCLE_COUNT=1
CYCLE_INDEX=1
CYCLE_LABEL="cycle_01"
CYCLE_SUFFIX="C01"
CYCLE_DIAG_PREFIX=""
BASE_CHANGE_BRANCH=""
BASE_SHORT_NAME=""

COORDINATOR_ROLE="Delegated Coordinator"
TRUNK_COORDINATOR_ID="delegated_coordinator_001"
CHANGE_AUTHOR_ID="change_author_001"
REVIEWER_ID="reviewer_001"
TRUNK_COORDINATOR_SESSION=""
CHANGE_AUTHOR_SESSION=""
REVIEWER_SESSION=""
NONCE_AUTHOR="N_AUTHOR_1"
NONCE_REVIEW="N_REVIEW_1"

VALIDATION_COMMANDS=()

LOG=""
DIAG=""
REPORT=""
RESULT_JSON=""
STEP_STATUS_JSONL=""
TIMELINE=""
FINAL_STATUS="PARTIAL"
CURRENT_STEP="startup"
MERGE_RESULT="not_attempted"
CI_RESULT="not_run"
REVIEW_RESULT="unknown"
AUTHOR_CLASSB_FILE_REL=""
FINAL_CLASSB_FILE=""
AUTHOR_MESSAGE_FILE=""
REVIEW_MESSAGE_FILE=""
AUTHOR_PACKET_REL=""
REVIEWER_PACKET_REL=""
AUTHOR_REPORT_ABS=""
REVIEWER_REPORT_ABS=""
AUTHOR_WORK_ORDER_FILE=""
REVIEWER_WORK_ORDER_FILE=""
CI_LOG=""
PULL_LOG=""
START_UTC=""
END_UTC=""

usage() {
  cat <<'USAGE'
Usage:
  live_cycle_harness.sh \
    --assignment-id A_FLOWMAP_02_006 \
    --sctl-workspace /absolute/path/to/SCTL_WORKSPACE \
    --codebase-repo /absolute/path/to/CODEBASE_REPO \
    --objective "One sentence objective" \
    --allow-merge

Required:
  --assignment-id ID
  --sctl-workspace DIR
  --codebase-repo DIR

Common options:
  --package-root DIR              SCTL package root. Default: two dirs above this script.
  --runtime-edge-root DIR         Runtime-edge launcher root. Also accepts env SCTL_RUNTIME_EDGE_ROOT.
  --envelope-template FILE        Deterministic work envelope template file.
  --cycles N                      Number of disposable author/reviewer cycles. Default: 1.
  --short-name NAME               Branch short name. Default: sample-uniform-sphere-v2.
  --trunk-branch NAME             Default: main.
  --change-branch NAME            Default: change/<assignment-id>/<short-name>.
  --objective TEXT                One sentence work objective.
  --validation-command CMD        Add validation command. Repeatable.
  --return-timeout SECONDS        Per-session return wait timeout. Default: 300.
  --poll-interval SECONDS         Return wait polling interval. Default: 5.
  --run-root DIR                  Output directory. Default: <package>/_test_runs/flowmap02/run_<UTC>.
  --allow-merge                   Permit ff-only merge after reviewer approval and green CI.
  --review-result VALUE           Override parsed reviewer result: approved, denied, or blocked.
  --reuse-branch                  Permit reusing an existing change branch.
  --allow-dirty-codebase          Permit starting with dirty Codebase Git status.
  --pause-before-retire           Pause before retiring disposable sessions for visual inspection.
  --delete-branch-after-merge     Delete the local change branch after successful merge.
  --skip-npm-test                 Skip SCTL package npm test preflight.
  --skip-adapter-syntax           Skip adapter bash syntax preflight.
  --paste-delay SECONDS           Adapter paste delay. Default from SCTL_DISPATCH_PASTE_DELAY or 5.
  --no-tab                        Pass --no-tab to sctl-dispatch-inject.
  --help

Default A005 validation commands, used only if no --validation-command is supplied:
  python3 -m py_compile code/ensemble_core.py
  python3 -c "import sys, numpy as np; sys.path.insert(0, 'code'); from ensemble_core import sample_uniform_sphere; pts=sample_uniform_sphere(200, 3.0, 123, recenter=False); assert pts.shape == (200, 3), pts.shape; assert np.all(np.linalg.norm(pts, axis=1) <= 3.0 + 1e-12); print('sample_uniform_sphere smoke passed')"
USAGE
}

shell_quote() { printf '%q' "$1"; }

qjoin() {
  local first=1
  for arg in "$@"; do
    if [ "$first" -eq 0 ]; then printf ' '; fi
    shell_quote "$arg"
    first=0
  done
}

utc_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
stamp() { date -u +%Y%m%dT%H%M%SZ; }
lower_safe() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '_'; }
sanitize_tsv() { printf '%s' "$1" | tr '\t\r\n' '   '; }
json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }
is_abs() { [[ "${1:-}" = /* ]]; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "startup" "BLOCKED_MISSING_COMMAND" "required command not found: $1" "Install or expose $1 in PATH."
}

write_diag_header() {
  printf 'created_at\tstep\tstatus\tobservation\tdiagnosis\tnext_action\n' > "$DIAG"
}

write_timeline_header() {
  printf 'cycle\tbranch\tauthor_commit\treviewer_commit\treview\tci\tmerge\tclass_b_author\tclass_b_outcome\tcontext_before\tcontext_after\n' > "$TIMELINE"
}

record_diag() {
  local step="$1" status="$2" observation="$3" diagnosis="$4" next_action="$5" created
  if [ -n "$CYCLE_DIAG_PREFIX" ]; then
    case "$step" in
      preflight*|0|1|1.*|2|startup|22|22.*) ;;
      "$CYCLE_DIAG_PREFIX".*) ;;
      *) step="$CYCLE_DIAG_PREFIX.$step" ;;
    esac
  fi
  created="$(utc_now)"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$created" "$(sanitize_tsv "$step")" "$(sanitize_tsv "$status")" \
    "$(sanitize_tsv "$observation")" "$(sanitize_tsv "$diagnosis")" "$(sanitize_tsv "$next_action")" >> "$DIAG"
  printf '{"created_at":%s,"step":%s,"status":%s,"observation":%s,"diagnosis":%s,"next_action":%s}\n' \
    "$(json_escape "$created")" "$(json_escape "$step")" "$(json_escape "$status")" \
    "$(json_escape "$observation")" "$(json_escape "$diagnosis")" "$(json_escape "$next_action")" >> "$STEP_STATUS_JSONL"
  echo "DIAG[$step]=$status | $observation | $diagnosis"
}

append_cycle_timeline() {
  local author_packet reviewer_packet author_commit reviewer_commit class_b_author class_b_outcome context_before context_after
  author_packet="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/packet.json"
  reviewer_packet="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$REVIEWER_ID/packet.json"
  author_commit="$(json_get "$author_packet" implementation_commit 2>/dev/null || printf 'missing')"
  reviewer_commit="$(json_get "$reviewer_packet" implementation_commit 2>/dev/null || printf 'missing')"
  class_b_author="$SCTL_WORKSPACE/$AUTHOR_CLASSB_FILE_REL"
  class_b_outcome="$FINAL_CLASSB_FILE"
  context_before="$RUN_ROOT/context_exports/$CYCLE_LABEL/coordinator_before/context.md"
  context_after="$RUN_ROOT/context_exports/$CYCLE_LABEL/coordinator_after/context.md"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(sanitize_tsv "$CYCLE_LABEL")" \
    "$(sanitize_tsv "$CHANGE_BRANCH")" \
    "$(sanitize_tsv "$author_commit")" \
    "$(sanitize_tsv "$reviewer_commit")" \
    "$(sanitize_tsv "$REVIEW_RESULT")" \
    "$(sanitize_tsv "$CI_RESULT")" \
    "$(sanitize_tsv "$MERGE_RESULT")" \
    "$(sanitize_tsv "$class_b_author")" \
    "$(sanitize_tsv "$class_b_outcome")" \
    "$(sanitize_tsv "$context_before")" \
    "$(sanitize_tsv "$context_after")" >> "$TIMELINE"
  record_diag "timeline" "OBSERVED" "$TIMELINE row appended for $CYCLE_LABEL" "Cycle summary timeline captures branch, commits, review, CI, merge, Class B, and context export pointers in one screen." "Continue."
}

set_cycle_context() {
  CYCLE_INDEX="$1"
  CYCLE_PAD="$(printf '%02d' "$CYCLE_INDEX")"
  CYCLE_SUFFIX="C${CYCLE_PAD}"
  CYCLE_LABEL="cycle_${CYCLE_PAD}"
  CYCLE_DIAG_PREFIX="$CYCLE_LABEL"
  CHANGE_AUTHOR_ID="change_author_c${CYCLE_PAD}"
  REVIEWER_ID="reviewer_c${CYCLE_PAD}"
  CHANGE_AUTHOR_SESSION="TBD-CA-${ASSIGNMENT_ID}-${CYCLE_SUFFIX}"
  REVIEWER_SESSION="TBD-CR-${ASSIGNMENT_ID}-${CYCLE_SUFFIX}"
  NONCE_AUTHOR="N_AUTHOR_${CYCLE_SUFFIX}"
  NONCE_REVIEW="N_REVIEW_${CYCLE_SUFFIX}"
  if [ "$CYCLE_COUNT" -eq 1 ] && [ -n "$BASE_CHANGE_BRANCH" ]; then
    CHANGE_BRANCH="$BASE_CHANGE_BRANCH"
  else
    CHANGE_BRANCH="change/${ASSIGNMENT_ID}/${CYCLE_SUFFIX}-${BASE_SHORT_NAME}"
  fi
  CI_LOG="$RUN_ROOT/${ASSIGNMENT_ID}_${CYCLE_SUFFIX}_ci.log"
  PULL_LOG="$RUN_ROOT/${ASSIGNMENT_ID}_${CYCLE_SUFFIX}_pull.log"
  MERGE_RESULT="not_attempted"
  CI_RESULT="not_run"
  REVIEW_RESULT="unknown"
  AUTHOR_CLASSB_FILE_REL=""
  FINAL_CLASSB_FILE=""
  AUTHOR_MESSAGE_FILE=""
  REVIEW_MESSAGE_FILE=""
  AUTHOR_PACKET_REL=""
  REVIEWER_PACKET_REL=""
  AUTHOR_REPORT_ABS=""
  REVIEWER_REPORT_ABS=""
  AUTHOR_WORK_ORDER_FILE=""
  REVIEWER_WORK_ORDER_FILE=""
}

json_get() {
  local file="$1" path_expr="$2"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const pathExpr = process.argv[2];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    let cur = data;
    for (const part of pathExpr.split(".")) {
      if (!part) continue;
      if (cur == null || !(part in cur)) process.exit(2);
      cur = cur[part];
    }
    if (cur == null) process.exit(2);
    if (typeof cur === "object") console.log(JSON.stringify(cur)); else console.log(String(cur));
  ' "$file" "$path_expr"
}

json_get_active_session_field() {
  local file="$1" assignment="$2" agent_id="$3" field="$4"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const assignment = process.argv[2];
    const id = process.argv[3];
    const field = process.argv[4];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const sessions = Array.isArray(data.sessions) ? data.sessions : [];
    const hit = sessions.find(s => s.assignment_id === assignment && s.id === id);
    if (!hit || !(field in hit)) process.exit(2);
    console.log(String(hit[field]));
  ' "$file" "$assignment" "$agent_id" "$field"
}

current_class_b_revision() {
  local state_file="$SCTL_WORKSPACE/.strata/context/D_trace/context_state.json"
  if [ ! -f "$state_file" ]; then printf '0\n'; return 0; fi
  json_get "$state_file" "current_class_b_revision" 2>/dev/null || printf '0\n'
}

require_revision_increment() {
  local step="$1" before="$2" after="$3" expected
  expected=$((before + 1))
  if [ "$after" -ne "$expected" ]; then
    fail "$step" "BROKEN_REVISION_MATH" "Class B revision moved $before -> $after; expected $expected" "Inspect classb commit/put and context_state.json."
  fi
}

run_step() {
  local label="$1" status=0
  shift
  CURRENT_STEP="$label"
  echo
  echo "===== $label ====="
  printf '+ '; qjoin "$@"; printf '\n'
  if "$@"; then status=0; else status=$?; fi
  echo "STATUS[$label]=$status"
  return "$status"
}

run_capture() {
  local label="$1" outfile="$2" status=0
  shift 2
  CURRENT_STEP="$label"
  mkdir -p "$(dirname "$outfile")"
  echo
  echo "===== $label ====="
  printf '+ '; qjoin "$@"; printf '\n'
  set +e
  "$@" 2>&1 | tee "$outfile"
  status=${PIPESTATUS[0]}
  set -e
  echo "STATUS[$label]=$status"
  return "$status"
}

run_json() {
  local label="$1" outfile="$2" status=0
  shift 2
  CURRENT_STEP="$label"
  mkdir -p "$(dirname "$outfile")"
  echo
  echo "===== $label ====="
  printf '+ '; qjoin "$@"; printf '\n'
  set +e
  "$@" | tee "$outfile"
  status=${PIPESTATUS[0]}
  set -e
  echo "STATUS[$label]=$status"
  return "$status"
}

export_full_context() {
  local cycle="$1" label="$2" out_dir json_out
  out_dir="$RUN_ROOT/context_exports/$cycle/$label"
  json_out="$RUN_ROOT/context_exports/$cycle/${label}_export.json"
  mkdir -p "$out_dir" "$(dirname "$json_out")"
  run_json "context export $cycle/$label" "$json_out" \
    node "$PACKAGE_ROOT/src/cli.js" \
      --workspace "$SCTL_WORKSPACE" \
      context export-markdown \
      --include-classes A,B \
      --out "$out_dir" \
    || fail "context export $cycle/$label" "BROKEN_CONTEXT_EXPORT" "$out_dir" "Inspect context export-markdown output."
  echo "FULL_CONTEXT_EXPORT[$cycle/$label]=$out_dir/context.md"
  record_diag "context_export.$label" "OBSERVED" "$out_dir/context.md" "Standalone full context export written outside the pasted dispatch packet and outside the operational log body." "Continue."
}

fail() {
  local step="$1" status="$2" observation="$3" next_action="$4"
  FINAL_STATUS="$status"
  record_diag "$step" "$status" "$observation" "Stopped at bounded failure boundary." "$next_action"
  finish_report "$status"
  exit 1
}

unexpected_error() {
  local line="$1" status="$2"
  FINAL_STATUS="BROKEN_UNEXPECTED_ERROR"
  record_diag "$CURRENT_STEP" "BROKEN_UNEXPECTED_ERROR" "line=$line status=$status" "Unexpected shell error." "Inspect $LOG and patch the harness boundary handling."
  finish_report "$FINAL_STATUS"
  exit "$status"
}
trap 'unexpected_error "$LINENO" "$?"' ERR

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --assignment-id) ASSIGNMENT_ID="$2"; shift 2 ;;
      --sctl-workspace) SCTL_WORKSPACE="$2"; shift 2 ;;
      --codebase-repo) CODEBASE_REPO="$2"; shift 2 ;;
      --package-root) PACKAGE_ROOT="$2"; shift 2 ;;
      --runtime-edge-root) SCTL_RUNTIME_EDGE_ROOT="$2"; shift 2 ;;
      --envelope-template) ENVELOPE_TEMPLATE_FILE="$2"; shift 2 ;;
      --cycles) CYCLE_COUNT="$2"; shift 2 ;;
      --short-name) SHORT_NAME="$2"; shift 2 ;;
      --trunk-branch) TRUNK_BRANCH="$2"; shift 2 ;;
      --change-branch) CHANGE_BRANCH="$2"; shift 2 ;;
      --objective) OBJECTIVE="$2"; shift 2 ;;
      --validation-command|--validation-cmd) VALIDATION_COMMANDS+=("$2"); shift 2 ;;
      --return-timeout) RETURN_TIMEOUT="$2"; shift 2 ;;
      --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
      --run-root) RUN_ROOT="$2"; shift 2 ;;
      --allow-merge) ALLOW_MERGE=1; shift ;;
      --review-result) REVIEW_RESULT_OVERRIDE="$2"; shift 2 ;;
      --reuse-branch) REUSE_BRANCH=1; shift ;;
      --allow-dirty-codebase) ALLOW_DIRTY_CODEBASE=1; shift ;;
      --pause-before-retire) PAUSE_BEFORE_RETIRE=1; shift ;;
      --delete-branch-after-merge) DELETE_BRANCH_AFTER_MERGE=1; shift ;;
      --skip-npm-test) SKIP_NPM_TEST=1; shift ;;
      --skip-adapter-syntax) SKIP_ADAPTER_SYNTAX=1; shift ;;
      --paste-delay) PASTE_DELAY="$2"; shift 2 ;;
      --no-tab) NO_TAB=1; shift ;;
      --help) usage; exit 0 ;;
      *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
  done
}

validate_config() {
  [ -n "$ASSIGNMENT_ID" ] || { usage >&2; exit 2; }
  [ -n "$SCTL_WORKSPACE" ] || { usage >&2; exit 2; }
  [ -n "$CODEBASE_REPO" ] || { usage >&2; exit 2; }
  is_abs "$PACKAGE_ROOT" || { echo "error: --package-root must be absolute" >&2; exit 2; }
  is_abs "$SCTL_WORKSPACE" || { echo "error: --sctl-workspace must be absolute" >&2; exit 2; }
  is_abs "$CODEBASE_REPO" || { echo "error: --codebase-repo must be absolute" >&2; exit 2; }
  if [ -n "$SCTL_RUNTIME_EDGE_ROOT" ] && ! is_abs "$SCTL_RUNTIME_EDGE_ROOT"; then
    echo "error: --runtime-edge-root must be absolute when supplied" >&2; exit 2
  fi
  is_abs "$ENVELOPE_TEMPLATE_FILE" || { echo "error: --envelope-template must be absolute" >&2; exit 2; }
  [ -f "$ENVELOPE_TEMPLATE_FILE" ] || { echo "error: --envelope-template file not found: $ENVELOPE_TEMPLATE_FILE" >&2; exit 2; }
  [[ "$RETURN_TIMEOUT" =~ ^[0-9]+$ ]] || { echo "error: --return-timeout must be an integer" >&2; exit 2; }
  [[ "$POLL_INTERVAL" =~ ^[0-9]+$ ]] || { echo "error: --poll-interval must be an integer" >&2; exit 2; }
  [[ "$CYCLE_COUNT" =~ ^[0-9]+$ ]] || { echo "error: --cycles must be an integer" >&2; exit 2; }
  [ "$CYCLE_COUNT" -ge 1 ] || { echo "error: --cycles must be >= 1" >&2; exit 2; }
  [ "$POLL_INTERVAL" -gt 0 ] || { echo "error: --poll-interval must be > 0" >&2; exit 2; }
  BASE_CHANGE_BRANCH="$CHANGE_BRANCH"
  BASE_SHORT_NAME="$SHORT_NAME"
  TRUNK_COORDINATOR_SESSION="TBD-DC-${ASSIGNMENT_ID}"
  if [ "${#VALIDATION_COMMANDS[@]}" -eq 0 ]; then
    VALIDATION_COMMANDS+=("python3 -m py_compile code/ensemble_core.py")
    VALIDATION_COMMANDS+=("python3 -c \"import sys, numpy as np; sys.path.insert(0, 'code'); from ensemble_core import sample_uniform_sphere; pts=sample_uniform_sphere(200, 3.0, 123, recenter=False); assert pts.shape == (200, 3), pts.shape; assert np.all(np.linalg.norm(pts, axis=1) <= 3.0 + 1e-12); print('sample_uniform_sphere smoke passed')\"")
  fi
}

init_run_root() {
  START_UTC="$(utc_now)"
  if [ -z "$RUN_ROOT" ]; then RUN_ROOT="$PACKAGE_ROOT/_test_runs/flowmap02/run_$(stamp)"; fi
  mkdir -p "$RUN_ROOT"
  LOG="$RUN_ROOT/flowmap02_operational.log"
  DIAG="$RUN_ROOT/flowmap02_step_diagnosis.tsv"
  REPORT="$RUN_ROOT/flowmap02_result.md"
  RESULT_JSON="$RUN_ROOT/flowmap02_result.json"
  STEP_STATUS_JSONL="$RUN_ROOT/flowmap02_step_status.jsonl"
  TIMELINE="$RUN_ROOT/cycle_timeline.tsv"
  CI_LOG="$RUN_ROOT/${ASSIGNMENT_ID}_ci.log"
  PULL_LOG="$RUN_ROOT/${ASSIGNMENT_ID}_pull.log"
  write_diag_header
  write_timeline_header
  : > "$STEP_STATUS_JSONL"
  : > "$LOG"
  exec > >(tee -a "$LOG") 2>&1
  echo "FLOWMAP_02_START=$START_UTC"
  echo "RUN_ROOT=$RUN_ROOT"
  echo "PACKAGE_ROOT=$PACKAGE_ROOT"
  echo "SCTL_WORKSPACE=$SCTL_WORKSPACE"
  echo "CODEBASE_REPO=$CODEBASE_REPO"
  echo "SCTL_RUNTIME_EDGE_ROOT=$SCTL_RUNTIME_EDGE_ROOT"
  echo "ENVELOPE_TEMPLATE_FILE=$ENVELOPE_TEMPLATE_FILE"
  echo "ASSIGNMENT_ID=$ASSIGNMENT_ID"
  echo "TRUNK_BRANCH=$TRUNK_BRANCH"
  echo "BASE_CHANGE_BRANCH=$BASE_CHANGE_BRANCH"
  echo "SHORT_NAME=$SHORT_NAME"
  echo "CYCLE_COUNT=$CYCLE_COUNT"
  echo "RETURN_TIMEOUT=$RETURN_TIMEOUT"
}

finish_report() {
  local result="$1" active_sessions_file context_state_file sctl_status codebase_status
  END_UTC="$(utc_now)"
  active_sessions_file="$SCTL_WORKSPACE/.strata/context/C/sessions/active_sessions.json"
  context_state_file="$SCTL_WORKSPACE/.strata/context/D_trace/context_state.json"
  sctl_status="not_checked"
  codebase_status="not_checked"
  if [ -d "$SCTL_WORKSPACE/.strata/context/.git" ]; then
    sctl_status="$(git -C "$SCTL_WORKSPACE/.strata/context" status --short 2>/dev/null | sed ':a;N;$!ba;s/\n/; /g')"
    [ -n "$sctl_status" ] || sctl_status="clean"
  fi
  if [ -d "$CODEBASE_REPO/.git" ]; then
    codebase_status="$(git -C "$CODEBASE_REPO" status --short 2>/dev/null | sed ':a;N;$!ba;s/\n/; /g')"
    [ -n "$codebase_status" ] || codebase_status="clean"
  fi
  cat > "$REPORT" <<EOF
# Flowmap 02 Live Cycle Result

Overall result: $result

Assignment ID: $ASSIGNMENT_ID
Start: $START_UTC
End: $END_UTC
SCTL workspace: $SCTL_WORKSPACE
Codebase repo: $CODEBASE_REPO
Trunk branch: $TRUNK_BRANCH
Cycles: $CYCLE_COUNT
Last cycle: $CYCLE_LABEL
Last change branch: $CHANGE_BRANCH
Last review result: $REVIEW_RESULT
Last CI result: $CI_RESULT
Last merge result: $MERGE_RESULT

## Evidence files

- Operational log: $LOG
- Step diagnosis TSV: $DIAG
- Step status JSONL: $STEP_STATUS_JSONL
- Cycle timeline TSV: $TIMELINE
- Result JSON: $RESULT_JSON
- Context exports root: $RUN_ROOT/context_exports
- Last CI log: $CI_LOG
- Last codebase pull log: $PULL_LOG
- Active sessions: $active_sessions_file
- Context state: $context_state_file
- Author packet: $SCTL_WORKSPACE/$AUTHOR_PACKET_REL
- Reviewer packet: $SCTL_WORKSPACE/$REVIEWER_PACKET_REL
- Author report: $AUTHOR_REPORT_ABS
- Reviewer report: $REVIEWER_REPORT_ABS
- Author Class B file: $SCTL_WORKSPACE/$AUTHOR_CLASSB_FILE_REL
- Final Class B file: $FINAL_CLASSB_FILE

## Git status

SCTL context Git: $sctl_status

Codebase Git: $codebase_status

## Step diagnosis

\`\`\`tsv
$(cat "$DIAG" 2>/dev/null || true)
\`\`\`
EOF
  cat > "$RESULT_JSON" <<EOF
{
  "overall_result": $(json_escape "$result"),
  "assignment_id": $(json_escape "$ASSIGNMENT_ID"),
  "start_utc": $(json_escape "$START_UTC"),
  "end_utc": $(json_escape "$END_UTC"),
  "run_root": $(json_escape "$RUN_ROOT"),
  "package_root": $(json_escape "$PACKAGE_ROOT"),
  "sctl_workspace": $(json_escape "$SCTL_WORKSPACE"),
  "codebase_repo": $(json_escape "$CODEBASE_REPO"),
  "trunk_branch": $(json_escape "$TRUNK_BRANCH"),
  "cycles": $CYCLE_COUNT,
  "last_cycle": $(json_escape "$CYCLE_LABEL"),
  "last_change_branch": $(json_escape "$CHANGE_BRANCH"),
  "last_review_result": $(json_escape "$REVIEW_RESULT"),
  "last_ci_result": $(json_escape "$CI_RESULT"),
  "last_merge_result": $(json_escape "$MERGE_RESULT"),
  "allow_merge": $ALLOW_MERGE,
  "return_timeout_seconds": $RETURN_TIMEOUT,
  "log": $(json_escape "$LOG"),
  "diagnosis_tsv": $(json_escape "$DIAG"),
  "status_jsonl": $(json_escape "$STEP_STATUS_JSONL"),
  "cycle_timeline_tsv": $(json_escape "$TIMELINE"),
  "report": $(json_escape "$REPORT"),
  "context_exports_root": $(json_escape "$RUN_ROOT/context_exports"),
  "last_ci_log": $(json_escape "$CI_LOG"),
  "last_pull_log": $(json_escape "$PULL_LOG"),
  "author_packet": $(json_escape "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL"),
  "reviewer_packet": $(json_escape "$SCTL_WORKSPACE/$REVIEWER_PACKET_REL"),
  "author_report": $(json_escape "$AUTHOR_REPORT_ABS"),
  "reviewer_report": $(json_escape "$REVIEWER_REPORT_ABS"),
  "author_classb_file": $(json_escape "$SCTL_WORKSPACE/$AUTHOR_CLASSB_FILE_REL"),
  "final_classb_file": $(json_escape "$FINAL_CLASSB_FILE")
}
EOF
  echo "FLOWMAP_02_END=$END_UTC"
  echo "RUN_ROOT=$RUN_ROOT"
  echo "LOG=$LOG"
  echo "DIAG=$DIAG"
  echo "TIMELINE=$TIMELINE"
  echo "REPORT=$REPORT"
  echo "RESULT_JSON=$RESULT_JSON"
}

preflight() {
  need_cmd node; need_cmd git; need_cmd bash; need_cmd python3; need_cmd tmux
  if [ "$SKIP_NPM_TEST" -eq 0 ]; then need_cmd npm; fi
  [ -d "$PACKAGE_ROOT" ] || fail "preflight" "BLOCKED_MISSING_PACKAGE_ROOT" "$PACKAGE_ROOT" "Pass --package-root pointing to the SCTL package root."
  [ -f "$PACKAGE_ROOT/src/cli.js" ] || fail "preflight" "BLOCKED_MISSING_SCTL_CLI" "$PACKAGE_ROOT/src/cli.js" "Use the package root that contains src/cli.js."
  [ -d "$SCTL_WORKSPACE" ] || mkdir -p "$SCTL_WORKSPACE"
  [ -d "$CODEBASE_REPO/.git" ] || fail "preflight" "BLOCKED_MISSING_CODEBASE_GIT" "$CODEBASE_REPO" "Pass --codebase-repo pointing to an implementation Git repo."
  for adapter in sctl-session-new sctl-dispatch-render sctl-dispatch-inject sctl-session-capture sctl-session-retire; do
    [ -x "$PACKAGE_ROOT/scripts/wsl_tmux/$adapter" ] || fail "preflight" "BLOCKED_MISSING_ADAPTER" "$adapter" "Use the patched package with WSL/tmux adapters."
  done
  if [ "$SKIP_NPM_TEST" -eq 0 ]; then
    run_step "preflight npm test" bash -lc "cd \"$PACKAGE_ROOT\" && npm test" || fail "preflight npm test" "BROKEN_PACKAGE_TESTS" "npm test failed" "Inspect package test output before running live sessions."
    record_diag "preflight.tests" "OBSERVED" "package tests passed" "SCTL package baseline is executable." "Continue."
  else
    record_diag "preflight.tests" "SKIPPED" "--skip-npm-test" "Package tests were skipped by operator." "Continue with reduced preflight assurance."
  fi
  if [ "$SKIP_ADAPTER_SYNTAX" -eq 0 ]; then
    run_step "preflight adapter syntax" bash -lc "cd \"$PACKAGE_ROOT\" && for script in scripts/wsl_tmux/sctl-*; do bash -n \"\$script\" || exit 1; done" || fail "preflight adapter syntax" "BROKEN_ADAPTER_SYNTAX" "adapter syntax check failed" "Inspect adapter script syntax."
    record_diag "preflight.adapters" "OBSERVED" "adapter syntax passed" "Adapter scripts parse." "Continue."
  else
    record_diag "preflight.adapters" "SKIPPED" "--skip-adapter-syntax" "Adapter syntax check was skipped by operator." "Continue with reduced preflight assurance."
  fi
}

bootstrap_context() {
  run_json "0 context bootstrap" "$RUN_ROOT/context_bootstrap.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" context bootstrap || fail "0 context bootstrap" "BROKEN_CONTEXT_BOOTSTRAP" "context bootstrap failed" "Inspect SCTL workspace permissions and context Git state."
  record_diag "0" "OBSERVED" "context bootstrap ok" "SCTL context Git exists and bootstrap committed or updated state." "Continue."
}

register_session() {
  local label="$1" assignment="$2" role="$3" agent_id="$4" session_name="$5" mode="$6" outfile="$7"
  local env_args=(env)
  if [ -n "$SCTL_RUNTIME_EDGE_ROOT" ]; then env_args+=("SCTL_RUNTIME_EDGE_ROOT=$SCTL_RUNTIME_EDGE_ROOT"); fi
  run_json "$label" "$outfile" \
    "${env_args[@]}" "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-new" \
    --workspace "$SCTL_WORKSPACE" --assignment-id "$assignment" --role "$role" --id "$agent_id" --session-name "$session_name" --session-mode "$mode" \
    || fail "$label" "BROKEN_SESSION_REGISTER" "$agent_id" "Inspect runtime-edge/fleet launcher and SCTL session registration."
}

align_session_name() {
  local label="$1" desired="$2" desired_hyphen candidates count candidate
  if tmux has-session -t "$desired" >/dev/null 2>&1; then
    record_diag "$label" "OBSERVED" "$desired already exists" "Launcher used requested tmux session name." "Continue."
    return 0
  fi
  desired_hyphen="${desired//_/-}"
  candidates="$(tmux list-sessions -F '#S' 2>/dev/null | { grep -F "$desired" || grep -F "$desired_hyphen" || true; })"
  count="$(printf '%s\n' "$candidates" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$count" = "1" ]; then
    candidate="$(printf '%s\n' "$candidates" | sed '/^$/d' | head -n 1)"
    run_step "$label align session name" tmux rename-session -t "$candidate" "$desired" || fail "$label align session name" "BROKEN_SESSION_RENAME" "$candidate -> $desired" "Inspect tmux session names."
    record_diag "$label.session_target" "OBSERVED" "$candidate renamed to $desired" "Launcher created a role-prefixed name; harness aligned it to registered session_name." "Continue."
    return 0
  fi
  fail "$label.session_target" "MISSING_SESSION_TARGET" "desired=$desired candidates=$candidates" "Inspect tmux ls and adapter launcher output."
}

prepare_codebase_branch() {
  record_diag "3.codebase_repo" "OBSERVED" "$CODEBASE_REPO" "Using caller-supplied Codebase Git repo. Codebase Git is implementation work; SCTL Git is coordination/dispatch/reports/evidence trace." "Continue."
  local dirty
  dirty="$(git -C "$CODEBASE_REPO" status --short)"
  echo; echo "===== 3 codebase branch status ====="; echo "+ git -C $(shell_quote "$CODEBASE_REPO") status --short"; printf '%s\n' "$dirty"; echo "STATUS[3 codebase branch status]=0"
  if [ -n "$dirty" ] && [ "$ALLOW_DIRTY_CODEBASE" -eq 0 ]; then
    fail "3 codebase branch status" "BLOCKED_DIRTY_CODEBASE" "$dirty" "Commit, stash, clean, or rerun with --allow-dirty-codebase if intentional."
  fi
  run_step "3 codebase switch trunk" git -C "$CODEBASE_REPO" switch "$TRUNK_BRANCH" || fail "3 codebase switch trunk" "BROKEN_TRUNK_SWITCH" "$TRUNK_BRANCH" "Inspect Codebase Git trunk branch."
  if run_capture "3 codebase pull ff only" "$PULL_LOG" git -C "$CODEBASE_REPO" pull --ff-only; then
    record_diag "3.pull" "OBSERVED" "ff-only pull ok" "Trunk branch updated from upstream." "Continue."
  else
    if grep -qi "no tracking information" "$PULL_LOG"; then
      record_diag "3.pull" "WARN_LOCAL_MAIN_NO_UPSTREAM" "$TRUNK_BRANCH has no upstream" "Harness continued from local trunk." "Set upstream if remote freshness is required."
    else
      fail "3 codebase pull ff only" "BROKEN_PULL" "git pull --ff-only failed" "Inspect $PULL_LOG or resolve remote/trunk state."
    fi
  fi
  if git -C "$CODEBASE_REPO" show-ref --verify --quiet "refs/heads/$CHANGE_BRANCH"; then
    if [ "$REUSE_BRANCH" -eq 0 ]; then
      fail "3 codebase create branch" "BLOCKED_BRANCH_EXISTS" "$CHANGE_BRANCH" "Use a new --short-name/--change-branch or pass --reuse-branch intentionally."
    fi
    run_step "3 codebase switch existing branch" git -C "$CODEBASE_REPO" switch "$CHANGE_BRANCH" || fail "3 codebase switch existing branch" "BROKEN_BRANCH_SWITCH" "$CHANGE_BRANCH" "Inspect existing branch."
  else
    run_step "3 codebase create branch" git -C "$CODEBASE_REPO" switch -c "$CHANGE_BRANCH" "$TRUNK_BRANCH" || fail "3 codebase create branch" "BROKEN_BRANCH_CREATE" "$CHANGE_BRANCH" "Inspect trunk and branch naming."
  fi
  record_diag "3" "OBSERVED" "$CHANGE_BRANCH" "Short-lived Codebase Git branch exists outside SCTL Git." "Continue."
}

validation_text() {
  local idx=1
  for cmd in "${VALIDATION_COMMANDS[@]}"; do
    printf -- '- Command %s: `%s`\n' "$idx" "$cmd"
    idx=$((idx + 1))
  done
  printf -- '- Record exact command output or failure.\n'
}

materialize_envelope_template() {
  local file="$1" role="$2" objective="$3" required="$4" done="$5" stop="$6" return_files="$7" author_classb_rel="${8:-}"
  ENVELOPE_ASSIGNMENT_ID="$ASSIGNMENT_ID" \
  ENVELOPE_ROLE="$role" \
  ENVELOPE_SESSION_MODE="disposable" \
  ENVELOPE_SCTL_WORKSPACE="$SCTL_WORKSPACE" \
  ENVELOPE_CODEBASE_REPO="$CODEBASE_REPO" \
  ENVELOPE_TRUNK_BRANCH="$TRUNK_BRANCH" \
  ENVELOPE_ASSIGNED_BRANCH="$CHANGE_BRANCH" \
  ENVELOPE_RETURN_PATH="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$([ "$role" = "Change Author" ] && printf '%s' "$CHANGE_AUTHOR_ID" || printf '%s' "$REVIEWER_ID")/" \
  ENVELOPE_AUTHOR_CLASSB_REL="$author_classb_rel" \
  ENVELOPE_OBJECTIVE="$objective" \
  ENVELOPE_REQUIRED="$required" \
  ENVELOPE_VALIDATION="$(validation_text)" \
  ENVELOPE_DONE="$done" \
  ENVELOPE_STOP="$stop" \
  ENVELOPE_RETURN_FILES="$return_files" \
  python3 - "$ENVELOPE_TEMPLATE_FILE" "$file" <<'PY'
import os
import re
import sys

template_path, output_path = sys.argv[1], sys.argv[2]
text = open(template_path, encoding="utf-8").read()

assignment = [
    f"Assignment ID: {os.environ['ENVELOPE_ASSIGNMENT_ID']}",
    f"Role: {os.environ['ENVELOPE_ROLE']}",
    f"Session mode: {os.environ['ENVELOPE_SESSION_MODE']}",
    f"SCTL workspace: {os.environ['ENVELOPE_SCTL_WORKSPACE']}",
    f"Codebase repo: {os.environ['ENVELOPE_CODEBASE_REPO']}",
    f"Trunk branch: {os.environ['ENVELOPE_TRUNK_BRANCH']}",
    f"Assigned branch: {os.environ['ENVELOPE_ASSIGNED_BRANCH']}",
]
author_classb = os.environ.get("ENVELOPE_AUTHOR_CLASSB_REL", "")
if author_classb:
    assignment.append(f"Author Class B report: {author_classb}")
assignment.append(f"Return path: {os.environ['ENVELOPE_RETURN_PATH']}")

sections = {
    "Assignment": "\n".join(assignment),
    "Objective": os.environ["ENVELOPE_OBJECTIVE"],
    "Required work": os.environ["ENVELOPE_REQUIRED"],
    "Validation": os.environ["ENVELOPE_VALIDATION"],
    "Definition of done": os.environ["ENVELOPE_DONE"],
    "Stop conditions": os.environ["ENVELOPE_STOP"],
    "Return files": os.environ["ENVELOPE_RETURN_FILES"],
}

def replace_section(doc, heading, body):
    pattern = rf"(## {re.escape(heading)}\n\n)(.*?)(?=\n\n(?:## |# Below is system level full context picture\.|\Z))"
    replacement = rf"\1{body.strip()}"
    next_doc, count = re.subn(pattern, replacement, doc, flags=re.S)
    if count != 1:
        raise SystemExit(f"template section not found exactly once: {heading}")
    return next_doc

for heading, body in sections.items():
    text = replace_section(text, heading, body)

headline = "# Below is system level full context picture."
if headline not in text:
    raise SystemExit("template missing system context headline")
text = text.split(headline, 1)[0].rstrip() + "\n\n" + headline + "\n\n"
text += "The SCTL dispatch renderer appends the canonical Class A/B context export below this fixed headline.\n"
with open(output_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)
PY
}

write_author_work_order() {
  local dir="$SCTL_WORKSPACE/.strata/work_orders/$ASSIGNMENT_ID/$CYCLE_LABEL" file
  mkdir -p "$dir"
  file="$dir/change_author_work_order.md"
  materialize_envelope_template "$file" "Change Author" "$OBJECTIVE" \
    "- Create or checkout the assigned branch from current trunk.
- Confirm pwd, git status, and current branch before editing.
- Inspect the relevant files before editing.
- Implement only the assigned change.
- Run the listed validation commands when possible.
- Do not change unrelated architecture, workflow, or SCTL files.
- Prepare a Worker Return Packet and Class B-ready operational report." \
    "- Code change is present on the assigned branch.
- Tests/validation were run or failure is explained.
- Evidence section is included.
- Return packet uses worker_return_packet.v1.
- Operational report is Class B-ready." \
    "- Required repo/path is missing.
- Validation command is unclear.
- Physics/model requirement conflicts with code.
- You need authority beyond the assigned change." \
    "- Drop packet.json here: $SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/packet.json
- Drop operational_report.md here: $SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/operational_report.md"
  AUTHOR_WORK_ORDER_FILE="$file"
  record_diag "5.work_order" "OBSERVED" "$file" "Author envelope body was materialized from $ENVELOPE_TEMPLATE_FILE and run-specific values." "Continue."
}

write_reviewer_work_order() {
  local author_classb_rel="$1" dir="$SCTL_WORKSPACE/.strata/work_orders/$ASSIGNMENT_ID/$CYCLE_LABEL" file
  mkdir -p "$dir"
  file="$dir/reviewer_work_order.md"
  materialize_envelope_template "$file" "Code Reviewer / QC Engineer" "Review the codebase branch and author report. Return approved, denied, or blocked with evidence." \
    "- Confirm pwd, git status, and current branch before reviewing.
- Inspect the diff between $TRUNK_BRANCH and $CHANGE_BRANCH.
- Inspect the author Class B report.
- Check whether the implementation matches the assigned objective.
- Check whether validation evidence is adequate.
- Return a Worker Return Packet and operational report." \
    "- Recommendation is explicit: approved, denied, or blocked.
- Evidence section includes branch, commit, changed files, and validation status.
- Denial or blocker includes exact next action.
- Return packet uses worker_return_packet.v1." \
    "- Required repo/path is missing.
- Author report is missing or invalid.
- Review requires authority beyond code review." \
    "- Drop packet.json here: $SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$REVIEWER_ID/packet.json
- Drop operational_report.md here: $SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$REVIEWER_ID/operational_report.md" \
    "$author_classb_rel"
  REVIEWER_WORK_ORDER_FILE="$file"
  record_diag "13.work_order" "OBSERVED" "$file" "Reviewer envelope body was materialized from $ENVELOPE_TEMPLATE_FILE and run-specific values." "Continue."
}

send_author_message() {
  run_json "5 author message send" "$RUN_ROOT/${CYCLE_SUFFIX}_author_message.json" \
    node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" message send \
      --assignment-id "$ASSIGNMENT_ID" --thread-id "THREAD_${ASSIGNMENT_ID}_${CYCLE_SUFFIX}_AUTHOR" \
      --from-role "$COORDINATOR_ROLE" --from-id "$TRUNK_COORDINATOR_ID" \
      --to-role "Change Author" --to-id "$CHANGE_AUTHOR_ID" \
      --message-kind "coordination_note" \
      --requested-handling "Work only on the assigned short-lived codebase branch. Return a Worker Return Packet and Class B-ready operational report to the specified SCTL return path." \
      --body-file "$AUTHOR_WORK_ORDER_FILE" || fail "5 author message send" "BROKEN_MESSAGE_SEND" "author message send failed" "Inspect Class C message validation and work order body."
  AUTHOR_MESSAGE_FILE="$(json_get "$RUN_ROOT/${CYCLE_SUFFIX}_author_message.json" result.file)"
  run_json "5 author message validate" "$RUN_ROOT/${CYCLE_SUFFIX}_author_message_validate.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" message validate --file "$AUTHOR_MESSAGE_FILE" || fail "5 author message validate" "BROKEN_MESSAGE_VALIDATE" "$AUTHOR_MESSAGE_FILE" "Inspect generated author message."
  record_diag "5" "OBSERVED" "$AUTHOR_MESSAGE_FILE" "Envelope input artifact exists and validates." "Continue."
}

render_author_dispatch() {
  AUTHOR_PACKET_REL=".strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/$NONCE_AUTHOR/dispatch_packet.md"
  run_json "6 author dispatch render" "$RUN_ROOT/${CYCLE_SUFFIX}_author_dispatch_render.json" \
    "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-dispatch-render" --workspace "$SCTL_WORKSPACE" \
      --assignment-id "$ASSIGNMENT_ID" --nonce "$NONCE_AUTHOR" \
      --from-role "$COORDINATOR_ROLE" --from-id "$TRUNK_COORDINATOR_ID" \
      --target-role "Change Author" --target-id "$CHANGE_AUTHOR_ID" \
      --summary "Flowmap 02 $CYCLE_SUFFIX Change Author branch assignment" --message-file "$AUTHOR_MESSAGE_FILE" \
      --declared-file "CODEBASE_REPO:$CODEBASE_REPO" --declared-file "TRUNK_BRANCH:$TRUNK_BRANCH" --declared-file "CHANGE_BRANCH:$CHANGE_BRANCH" \
      || fail "6 author dispatch render" "BROKEN_DISPATCH_RENDER" "author dispatch render failed" "Inspect recordDispatch/renderDispatchPacket/exportMarkdown."
  [ -f "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL" ] || fail "6 author dispatch render" "MISSING_DISPATCH_PACKET" "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL" "Inspect D_trace dispatch packet creation."
  record_diag "6" "OBSERVED" "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL" "Packet contains fixed envelope input and context export headline." "Continue."
}

inject_packet() {
  local label="$1" session_name="$2" packet_rel="$3"
  local args=("$PACKAGE_ROOT/scripts/wsl_tmux/sctl-dispatch-inject" --session "$session_name" --packet "$packet_rel" --paste-delay "$PASTE_DELAY")
  if [ "$NO_TAB" -eq 1 ]; then args+=(--no-tab); fi
  run_capture "$label" "$RUN_ROOT/${CYCLE_SUFFIX}_${label// /_}.log" bash -lc 'cd "$0" && "$@"' "$SCTL_WORKSPACE" "${args[@]}" || fail "$label" "BROKEN_DISPATCH_INJECT" "$session_name $packet_rel" "Inspect tmux session and packet path."
}

capture_session() {
  local label="$1" session_name="$2"
  run_capture "$label" "$RUN_ROOT/${CYCLE_SUFFIX}_${label// /_}.log" bash -lc 'cd "$0" && "$@"' "$SCTL_WORKSPACE" \
    "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-capture" --session "$session_name" --out ".strata/evidence/session_captures/${session_name}.txt" || return 1
}

wait_for_return() {
  local step="$1" agent_id="$2" session_name="$3"
  local packet_abs="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$agent_id/packet.json"
  local report_abs1="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$agent_id/operational_report.md"
  local report_abs2="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$agent_id/review_report.md"
  local start now elapsed
  start="$(date +%s)"
  echo; echo "===== $step wait for return ====="; echo "waiting up to ${RETURN_TIMEOUT}s for $packet_abs"
  while true; do
    if [ -f "$packet_abs" ] && { [ -f "$report_abs1" ] || [ -f "$report_abs2" ]; }; then
      if [ "$agent_id" = "$CHANGE_AUTHOR_ID" ]; then AUTHOR_REPORT_ABS="$report_abs1"; [ -f "$AUTHOR_REPORT_ABS" ] || AUTHOR_REPORT_ABS="$report_abs2"; else REVIEWER_REPORT_ABS="$report_abs1"; [ -f "$REVIEWER_REPORT_ABS" ] || REVIEWER_REPORT_ABS="$report_abs2"; fi
      echo "STATUS[$step wait for return]=0"
      record_diag "$step.wait" "OBSERVED" "$packet_abs" "Worker return packet and operational report appeared without harness simulation." "Continue."
      return 0
    fi
    now="$(date +%s)"; elapsed=$((now - start))
    if [ "$elapsed" -ge "$RETURN_TIMEOUT" ]; then
      echo "STATUS[$step wait for return]=124"
      capture_session "$step timeout session capture" "$session_name" || true
      fail "$step.wait" "BLOCKED_TIMEOUT" "$packet_abs missing after ${RETURN_TIMEOUT}s" "Inspect session capture and decide whether to fix worker prompt, return path, or runtime."
    fi
    sleep "$POLL_INTERVAL"
  done
}

classify_return() {
  local label="$1" agent_id="$2" outfile="$3" packet_rel ok kind routing
  packet_rel=".strata/returns/$ASSIGNMENT_ID/$agent_id/packet.json"
  run_json "$label" "$outfile" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" returns classify --packet "$packet_rel" || fail "$label" "BROKEN_RETURN_CLASSIFY" "$packet_rel" "Inspect worker_return_packet.v1 and operational report validation."
  ok="$(json_get "$outfile" result.classification.valid_packet)"
  kind="$(json_get "$outfile" result.classification.return_kind)"
  routing="$(json_get "$outfile" result.classification.routing_decision)"
  [ "$ok" = "true" ] || fail "$label" "BROKEN_INVALID_RETURN_PACKET" "$packet_rel" "Inspect classification JSON errors."
  [ "$kind" = "OPERATIONAL_REPORT_READY" ] || fail "$label" "BLOCKED_UNEXPECTED_RETURN_KIND" "$kind" "Handle non-OPERATIONAL_REPORT_READY worker return."
  record_diag "$label" "OBSERVED" "$kind / $routing" "Return was ledgered, not automatically promoted to Class B." "Continue."
}

diagnose_return_implementation_ref() {
  local label="$1" agent_id="$2" packet_abs repo commit branch_head
  packet_abs="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$agent_id/packet.json"
  repo="$(json_get "$packet_abs" implementation_repository 2>/dev/null || printf '')"
  commit="$(json_get "$packet_abs" implementation_commit 2>/dev/null || printf '')"
  branch_head="$(git -C "$CODEBASE_REPO" rev-parse "$CHANGE_BRANCH" 2>/dev/null || printf '')"
  if [ "$repo" = "$CODEBASE_REPO" ] && [ -n "$commit" ] && [ "$commit" = "$branch_head" ]; then
    record_diag "$label.impl_ref" "OBSERVED" "repository=$repo commit=$commit branch_head=$branch_head" "Worker Return Packet implementation_repository and implementation_commit match the assigned Codebase Git branch head." "Continue."
  else
    record_diag "$label.impl_ref" "WARN_RETURN_IMPLEMENTATION_REF_MISMATCH" "repository=$repo commit=$commit expected_repo=$CODEBASE_REPO branch_head=$branch_head" "Worker Return Packet implementation reference does not match the assigned Codebase Git branch head; inspect whether the worker reported the wrong checkout, stale commit, or post-merge commit." "Inspect packet.json and codebase git log."
  fi
}

commit_author_report_to_classb() {
  local lower_assignment before after
  lower_assignment="$(lower_safe "$ASSIGNMENT_ID")"
  AUTHOR_CLASSB_FILE_REL=".strata/context/B/b_${lower_assignment}_${CYCLE_LABEL}_author_ready.md"
  mkdir -p "$SCTL_WORKSPACE/.strata/context/B"
  [ -f "$AUTHOR_REPORT_ABS" ] || fail "11 classb commit author report" "MISSING_AUTHOR_REPORT" "$AUTHOR_REPORT_ABS" "Inspect author return path."
  cp "$AUTHOR_REPORT_ABS" "$SCTL_WORKSPACE/$AUTHOR_CLASSB_FILE_REL"
  before="$(current_class_b_revision)"
  run_json "11 classb commit author report" "$RUN_ROOT/${CYCLE_SUFFIX}_author_classb_commit.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" classb commit --file "$AUTHOR_CLASSB_FILE_REL" --message "class B accept $ASSIGNMENT_ID $CYCLE_SUFFIX author report" || fail "11 classb commit author report" "BROKEN_CLASSB_AUTHOR_COMMIT" "$AUTHOR_CLASSB_FILE_REL" "Inspect Class B report schema and validation errors."
  after="$(current_class_b_revision)"
  require_revision_increment "11 classb commit author report" "$before" "$after"
  record_diag "11" "OBSERVED" "Class B revision $before -> $after" "Author report accepted into Class B and revision incremented exactly once." "Continue."
}

send_reviewer_message() {
  run_json "13 review message send" "$RUN_ROOT/${CYCLE_SUFFIX}_review_message.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" message send \
    --assignment-id "$ASSIGNMENT_ID" --thread-id "THREAD_${ASSIGNMENT_ID}_${CYCLE_SUFFIX}_REVIEW" \
    --from-role "$COORDINATOR_ROLE" --from-id "$TRUNK_COORDINATOR_ID" \
    --to-role "Code Reviewer / QC Engineer" --to-id "$REVIEWER_ID" \
    --message-kind "qc_review_request" --related-class-b "$AUTHOR_CLASSB_FILE_REL" \
    --requested-handling "Review the codebase branch, the Change Author report, and available CI/test evidence. Return approved, denied, or blocked." \
    --body-file "$REVIEWER_WORK_ORDER_FILE" || fail "13 review message send" "BROKEN_REVIEW_MESSAGE_SEND" "review message send failed" "Inspect review work order body and related Class B path."
  REVIEW_MESSAGE_FILE="$(json_get "$RUN_ROOT/${CYCLE_SUFFIX}_review_message.json" result.file)"
  run_json "13 review message validate" "$RUN_ROOT/${CYCLE_SUFFIX}_review_message_validate.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" message validate --file "$REVIEW_MESSAGE_FILE" || fail "13 review message validate" "BROKEN_REVIEW_MESSAGE_VALIDATE" "$REVIEW_MESSAGE_FILE" "Inspect generated reviewer message."
  record_diag "13" "OBSERVED" "$REVIEW_MESSAGE_FILE" "Review envelope input artifact exists and validates." "Continue."
}

render_reviewer_dispatch() {
  REVIEWER_PACKET_REL=".strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/$REVIEWER_ID/$NONCE_REVIEW/dispatch_packet.md"
  run_json "14 review dispatch render" "$RUN_ROOT/${CYCLE_SUFFIX}_review_dispatch_render.json" "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-dispatch-render" \
    --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --nonce "$NONCE_REVIEW" \
    --from-role "$COORDINATOR_ROLE" --from-id "$TRUNK_COORDINATOR_ID" \
    --target-role "Code Reviewer / QC Engineer" --target-id "$REVIEWER_ID" \
    --summary "Flowmap 02 $CYCLE_SUFFIX code review request" --message-file "$REVIEW_MESSAGE_FILE" \
    --declared-file "CODEBASE_REPO:$CODEBASE_REPO" --declared-file "TRUNK_BRANCH:$TRUNK_BRANCH" --declared-file "CHANGE_BRANCH:$CHANGE_BRANCH" \
    || fail "14 review dispatch render" "BROKEN_REVIEW_DISPATCH_RENDER" "review dispatch render failed" "Inspect recordDispatch/renderDispatchPacket/exportMarkdown."
  [ -f "$SCTL_WORKSPACE/$REVIEWER_PACKET_REL" ] || fail "14 review dispatch render" "MISSING_REVIEW_DISPATCH_PACKET" "$SCTL_WORKSPACE/$REVIEWER_PACKET_REL" "Inspect D_trace dispatch packet creation."
  record_diag "14" "OBSERVED" "$SCTL_WORKSPACE/$REVIEWER_PACKET_REL" "Packet contains fixed envelope input and context export headline." "Continue."
}

infer_review_result() {
  if [ -n "$REVIEW_RESULT_OVERRIDE" ]; then
    REVIEW_RESULT="$(printf '%s' "$REVIEW_RESULT_OVERRIDE" | tr '[:upper:]' '[:lower:]')"
  else
    local text
    text="$(tr '[:upper:]' '[:lower:]' < "$REVIEWER_REPORT_ABS" 2>/dev/null || true)"
    if printf '%s' "$text" | grep -Eq '\bapproved\b|\bapprove\b|recommendation:[[:space:]]*approved|recommendation:[[:space:]]*approve'; then REVIEW_RESULT="approved"; elif printf '%s' "$text" | grep -Eq '\bdenied\b|\bdeny\b|recommendation:[[:space:]]*denied|recommendation:[[:space:]]*deny'; then REVIEW_RESULT="denied"; elif printf '%s' "$text" | grep -Eq '\bblocked\b|\bblocker\b|recommendation:[[:space:]]*blocked'; then REVIEW_RESULT="blocked"; else REVIEW_RESULT="unknown"; fi
  fi
  case "$REVIEW_RESULT" in approved|approve) REVIEW_RESULT="approved" ;; denied|deny) REVIEW_RESULT="denied" ;; blocked|blocker) REVIEW_RESULT="blocked" ;; *) fail "17 review result parse" "BLOCKED_REVIEW_RESULT_UNKNOWN" "$REVIEW_RESULT" "Set --review-result approved|denied|blocked or require reviewer report to state the recommendation explicitly." ;; esac
  record_diag "17.review_result" "OBSERVED" "$REVIEW_RESULT" "Reviewer recommendation is available for CI/merge gate." "Continue."
}

run_ci_checks() {
  if [ "$REVIEW_RESULT" != "approved" ]; then CI_RESULT="skipped_review_${REVIEW_RESULT}"; record_diag "18A.ci" "SKIPPED" "$REVIEW_RESULT" "CI skipped because reviewer did not approve." "Record final non-merged outcome."; return 0; fi
  run_capture "18A ci local checks" "$CI_LOG" bash -lc '
    set -o pipefail
    repo="$1"; branch="$2"; shift 2
    cd "$repo"
    git switch "$branch" >/dev/null
    status=0
    for cmd in "$@"; do printf "+ %s\n" "$cmd"; bash -lc "$cmd" || status=$?; done
    exit "$status"
  ' _ "$CODEBASE_REPO" "$CHANGE_BRANCH" "${VALIDATION_COMMANDS[@]}"
  local status=$?
  if [ "$status" -eq 0 ]; then CI_RESULT="passed"; record_diag "18A.ci" "OBSERVED" "$CI_LOG" "Declared validation commands were executed before merge." "Continue."; else CI_RESULT="failed"; fail "18A.ci" "BROKEN_CI_FAILED" "$CI_LOG" "Inspect validation output and return to author/revision path."; fi
}

merge_if_authorized() {
  if [ "$REVIEW_RESULT" != "approved" ]; then MERGE_RESULT="not_merged_review_${REVIEW_RESULT}"; record_diag "18A.merge" "SKIPPED" "$REVIEW_RESULT" "Merge skipped because reviewer did not approve." "Record final non-merged outcome."; return 0; fi
  if [ "$CI_RESULT" != "passed" ]; then MERGE_RESULT="not_merged_ci_${CI_RESULT}"; record_diag "18A.merge" "SKIPPED" "$CI_RESULT" "Merge skipped because CI/checks did not pass." "Record final non-merged outcome."; return 0; fi
  if [ "$ALLOW_MERGE" -ne 1 ]; then MERGE_RESULT="blocked_merge_not_authorized"; fail "18A.merge" "BLOCKED_MERGE_NOT_AUTHORIZED" "review approved and CI passed, but --allow-merge not supplied" "Rerun with --allow-merge if Delegated Coordinator has merge authority."; fi
  run_step "18A merge ff only" bash -lc 'cd "$0" && git switch "$1" && git merge --ff-only "$2" && git status --short' "$CODEBASE_REPO" "$TRUNK_BRANCH" "$CHANGE_BRANCH" || fail "18A.merge" "BROKEN_MERGE_FAILED" "$CHANGE_BRANCH -> $TRUNK_BRANCH" "Inspect Codebase Git merge boundary."
  MERGE_RESULT="merged"
  record_diag "18A.merge" "OBSERVED" "$CHANGE_BRANCH -> $TRUNK_BRANCH" "Authorized merge operator completed the merge after review approval and CI/checks." "Continue."
  if [ "$DELETE_BRANCH_AFTER_MERGE" -eq 1 ]; then run_step "18A delete merged branch" git -C "$CODEBASE_REPO" branch -d "$CHANGE_BRANCH" || fail "18A.delete_branch" "BROKEN_BRANCH_DELETE" "$CHANGE_BRANCH" "Inspect branch merge/delete state."; record_diag "18A.delete_branch" "OBSERVED" "$CHANGE_BRANCH deleted" "Merged branch was removed because --delete-branch-after-merge was supplied." "Continue."; fi
}

record_final_outcome() {
  local before after status_word
  before="$(current_class_b_revision)"
  if [ "$MERGE_RESULT" = "merged" ]; then status_word="approved"; else status_word="not_merged"; fi
  run_json "19 final outcome classb put" "$RUN_ROOT/${CYCLE_SUFFIX}_final_outcome_classb_put.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" classb put \
    --id "B_${ASSIGNMENT_ID}_${CYCLE_SUFFIX}_MERGE_OUTCOME" --title "$ASSIGNMENT_ID $CYCLE_SUFFIX $status_word outcome" --assignment-id "$ASSIGNMENT_ID" --agent-id "$TRUNK_COORDINATOR_ID" --role "$COORDINATOR_ROLE" --scope "review_outcome" \
    --summary "Cycle $CYCLE_SUFFIX reviewer outcome: $REVIEW_RESULT; final integration outcome: $status_word." \
    --progress-delta "Flowmap 02 routed delegated coordinator intent through disposable author and reviewer sessions for $CYCLE_SUFFIX." \
    --trunk-integration "Codebase repo: $CODEBASE_REPO; trunk: $TRUNK_BRANCH; branch: $CHANGE_BRANCH; merge setting: $ALLOW_MERGE; merge result: $MERGE_RESULT; authorized merge operator: Delegated Coordinator ($TRUNK_COORDINATOR_ID) for current live tests." \
    --verification "Reviewer return classified. CI result: $CI_RESULT. CI log path: $CI_LOG." \
    --evidence-detail "Author packet: $AUTHOR_PACKET_REL; review packet: $REVIEWER_PACKET_REL; return ledgers: .strata/context/D_trace/return_ledgers/." \
    --risks "If final integration outcome is not merged, inspect CI/merge diagnostics before selecting the next change." \
    --next-action "Refresh Delegated Coordinator context and resolve any non-merged integration outcome before selecting the next small change." \
    || fail "19 final outcome classb put" "BROKEN_FINAL_CLASSB_PUT" "final outcome Class B put failed" "Inspect final outcome Class B arguments."
  after="$(current_class_b_revision)"
  require_revision_increment "19 final outcome classb put" "$before" "$after"
  FINAL_CLASSB_FILE="$(json_get "$RUN_ROOT/${CYCLE_SUFFIX}_final_outcome_classb_put.json" result.file 2>/dev/null || true)"
  record_diag "19" "OBSERVED" "Class B revision $before -> $after" "Final outcome entered Class B." "Continue."
}

retire_disposable_sessions() {
  if [ "$PAUSE_BEFORE_RETIRE" -eq 1 ]; then echo; echo "PAUSE_BEFORE_RETIRE=1"; echo "Inspect sessions now, then press Enter to retire disposable sessions."; read -r _; fi
  local env_args=(env)
  if [ -n "$SCTL_RUNTIME_EDGE_ROOT" ]; then env_args+=("SCTL_RUNTIME_EDGE_ROOT=$SCTL_RUNTIME_EDGE_ROOT"); fi
  run_json "20 retire change author" "$RUN_ROOT/${CYCLE_SUFFIX}_retire_change_author.json" "${env_args[@]}" "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-retire" --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --id "$CHANGE_AUTHOR_ID" --session "$CHANGE_AUTHOR_SESSION" --reason "Flowmap 02 $CYCLE_SUFFIX Change Author cycle completed" || fail "20 retire change author" "BROKEN_RETIRE_AUTHOR" "$CHANGE_AUTHOR_ID" "Inspect session lifecycle state."
  run_json "20 retire reviewer" "$RUN_ROOT/${CYCLE_SUFFIX}_retire_reviewer.json" "${env_args[@]}" "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-retire" --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --id "$REVIEWER_ID" --session "$REVIEWER_SESSION" --reason "Flowmap 02 $CYCLE_SUFFIX review cycle completed" || fail "20 retire reviewer" "BROKEN_RETIRE_REVIEWER" "$REVIEWER_ID" "Inspect session lifecycle state."
  record_diag "20" "OBSERVED" "disposable sessions retired" "Author and reviewer lifecycle closure was recorded through SCTL." "Continue."
}

coordinator_freshness() {
  local sessions_file="$SCTL_WORKSPACE/.strata/context/C/sessions/active_sessions.json" loaded_epoch loaded_a action
  loaded_epoch="$(json_get_active_session_field "$sessions_file" "$ASSIGNMENT_ID" "$TRUNK_COORDINATOR_ID" loaded_context_epoch 2>/dev/null || printf '0')"
  loaded_a="$(json_get_active_session_field "$sessions_file" "$ASSIGNMENT_ID" "$TRUNK_COORDINATOR_ID" loaded_class_a_revision 2>/dev/null || printf '0')"
  run_json "21 coordinator freshness" "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_freshness.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" context freshness --loaded-context-epoch "$loaded_epoch" --loaded-class-a-revision "$loaded_a" || fail "21 coordinator freshness" "BROKEN_FRESHNESS" "loaded_context_epoch=$loaded_epoch loaded_class_a_revision=$loaded_a" "Inspect context_state.json and active_sessions.json."
  action="$(json_get "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_freshness.json" result.action 2>/dev/null || printf 'unknown')"
  if [ "$action" = "delta_context_export" ]; then
    run_json "21 coordinator export refresh" "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_export_refresh.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" context export-markdown --include-classes A,B --since-class-b-revision "$loaded_epoch" --out ".strata/exports/${ASSIGNMENT_ID}_${CYCLE_LABEL}_coordinator_refresh" || fail "21 coordinator export refresh" "BROKEN_COORDINATOR_EXPORT" "$action" "Inspect context export."
  else
    run_json "21 coordinator export refresh" "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_export_refresh.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" context export-markdown --include-classes A,B --out ".strata/exports/${ASSIGNMENT_ID}_${CYCLE_LABEL}_coordinator_refresh" || fail "21 coordinator export refresh" "BROKEN_COORDINATOR_EXPORT" "$action" "Inspect context export."
  fi
  record_diag "21" "OBSERVED" "freshness action=$action loaded_epoch=$loaded_epoch" "Coordinator can refresh from current SCTL Git state instead of private chat memory." "Continue."
}

final_audit() {
  run_capture "22 final sctl git status" "$RUN_ROOT/final_sctl_git_status.txt" git -C "$SCTL_WORKSPACE/.strata/context" status --short || fail "22 final sctl git status" "BROKEN_SCTL_GIT_STATUS" ".strata/context" "Inspect SCTL context Git."
  run_capture "22 final sctl git log" "$RUN_ROOT/final_sctl_git_log.txt" git -C "$SCTL_WORKSPACE/.strata/context" log --oneline -30 || fail "22 final sctl git log" "BROKEN_SCTL_GIT_LOG" ".strata/context" "Inspect SCTL context Git log."
  run_capture "22 final codebase branches" "$RUN_ROOT/final_codebase_branches.txt" git -C "$CODEBASE_REPO" branch --list || true
  run_capture "22 final codebase log" "$RUN_ROOT/final_codebase_log.txt" git -C "$CODEBASE_REPO" log --oneline --decorate -20 || true
  run_capture "22 final dispatch files" "$RUN_ROOT/final_dispatch_files.txt" find "$SCTL_WORKSPACE/.strata/context/D_trace/dispatch_packets" -maxdepth 5 -type f || true
  run_capture "22 final return ledgers" "$RUN_ROOT/final_return_ledgers.txt" find "$SCTL_WORKSPACE/.strata/context/D_trace/return_ledgers" -type f || true
  run_capture "22 final classb files" "$RUN_ROOT/final_classb_files.txt" find "$SCTL_WORKSPACE/.strata/context/B" -type f || true
  local sctl_status
  sctl_status="$(cat "$RUN_ROOT/final_sctl_git_status.txt" 2>/dev/null || true)"
  if [ -n "$sctl_status" ]; then fail "22 final sctl git status" "BROKEN_SCTL_GIT_DIRTY" "$sctl_status" "Inspect uncommitted SCTL context Git changes."; fi
  record_diag "22" "OBSERVED" "status clean" "SCTL context Git is clean and log contains cycle commits." "Complete."
}

main() {
  parse_args "$@"
  validate_config
  init_run_root
  preflight
  bootstrap_context

  register_session "1 session new delegated coordinator" "$ASSIGNMENT_ID" "$COORDINATOR_ROLE" "$TRUNK_COORDINATOR_ID" "$TRUNK_COORDINATOR_SESSION" "long_running" "$RUN_ROOT/session_new_delegated_coordinator.json"
  align_session_name "1" "$TRUNK_COORDINATOR_SESSION"
  record_diag "1" "OBSERVED" "$TRUNK_COORDINATOR_ID registered" "Persistent Delegated Coordinator was recorded in SCTL Git." "Continue."

  local coord_loaded_epoch coord_loaded_a sessions_file
  sessions_file="$SCTL_WORKSPACE/.strata/context/C/sessions/active_sessions.json"
  coord_loaded_epoch="$(json_get_active_session_field "$sessions_file" "$ASSIGNMENT_ID" "$TRUNK_COORDINATOR_ID" loaded_context_epoch 2>/dev/null || printf '0')"
  coord_loaded_a="$(json_get_active_session_field "$sessions_file" "$ASSIGNMENT_ID" "$TRUNK_COORDINATOR_ID" loaded_class_a_revision 2>/dev/null || printf '0')"
  run_json "2 context freshness coordinator" "$RUN_ROOT/coordinator_initial_freshness.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" context freshness --loaded-context-epoch "$coord_loaded_epoch" --loaded-class-a-revision "$coord_loaded_a" || fail "2 context freshness coordinator" "BROKEN_INITIAL_FRESHNESS" "loaded_context_epoch=$coord_loaded_epoch" "Inspect active_sessions and context_state."
  record_diag "2" "OBSERVED" "freshness result emitted" "Coordinator context freshness math is available for decision." "Continue."

  local cycle
  for cycle in $(seq 1 "$CYCLE_COUNT"); do
    set_cycle_context "$cycle"
    echo
    echo "===== BEGIN $CYCLE_LABEL ====="
    echo "CYCLE_SUFFIX=$CYCLE_SUFFIX"
    echo "CHANGE_AUTHOR_ID=$CHANGE_AUTHOR_ID"
    echo "REVIEWER_ID=$REVIEWER_ID"
    echo "CHANGE_AUTHOR_SESSION=$CHANGE_AUTHOR_SESSION"
    echo "REVIEWER_SESSION=$REVIEWER_SESSION"
    echo "CHANGE_BRANCH=$CHANGE_BRANCH"

    export_full_context "$CYCLE_LABEL" "coordinator_before"
    prepare_codebase_branch

    register_session "4 session new change author" "$ASSIGNMENT_ID" "Change Author" "$CHANGE_AUTHOR_ID" "$CHANGE_AUTHOR_SESSION" "disposable" "$RUN_ROOT/${CYCLE_SUFFIX}_session_new_change_author.json"
    align_session_name "4" "$CHANGE_AUTHOR_SESSION"
    record_diag "4" "OBSERVED" "$CHANGE_AUTHOR_ID active disposable" "Fresh Change Author session for $CYCLE_SUFFIX was recorded in SCTL Git." "Continue."

    write_author_work_order
    send_author_message
    render_author_dispatch
    export_full_context "$CYCLE_LABEL" "author_dispatch"
    inject_packet "7 author dispatch inject" "$CHANGE_AUTHOR_SESSION" "$AUTHOR_PACKET_REL"
    record_diag "7" "OBSERVED" "$CHANGE_AUTHOR_SESSION injected" "Change Author packet was injected through adapter using Git-backed packet path." "Continue."
    capture_session "8 author session capture" "$CHANGE_AUTHOR_SESSION" || true
    record_diag "8" "OBSERVED" "$CHANGE_AUTHOR_SESSION capture attempted" "Author session capture evidence was requested." "Continue."
    wait_for_return "9" "$CHANGE_AUTHOR_ID" "$CHANGE_AUTHOR_SESSION"
    classify_return "10 classify author return" "$CHANGE_AUTHOR_ID" "$RUN_ROOT/${CYCLE_SUFFIX}_author_classify.json"
    diagnose_return_implementation_ref "10 author return" "$CHANGE_AUTHOR_ID"
    commit_author_report_to_classb

    register_session "12 session new reviewer" "$ASSIGNMENT_ID" "Code Reviewer / QC Engineer" "$REVIEWER_ID" "$REVIEWER_SESSION" "disposable" "$RUN_ROOT/${CYCLE_SUFFIX}_session_new_reviewer.json"
    align_session_name "12" "$REVIEWER_SESSION"
    record_diag "12" "OBSERVED" "$REVIEWER_ID active disposable" "Fresh reviewer session for $CYCLE_SUFFIX was recorded in SCTL Git." "Continue."

    write_reviewer_work_order "$AUTHOR_CLASSB_FILE_REL"
    send_reviewer_message
    render_reviewer_dispatch
    export_full_context "$CYCLE_LABEL" "reviewer_dispatch"
    inject_packet "15 reviewer dispatch inject" "$REVIEWER_SESSION" "$REVIEWER_PACKET_REL"
    record_diag "15" "OBSERVED" "$REVIEWER_SESSION injected" "Reviewer packet was injected through adapter." "Continue."
    capture_session "16 reviewer session capture" "$REVIEWER_SESSION" || true
    record_diag "16" "OBSERVED" "$REVIEWER_SESSION capture attempted" "Reviewer session capture evidence was requested." "Continue."
    wait_for_return "17" "$REVIEWER_ID" "$REVIEWER_SESSION"
    classify_return "17 classify reviewer return" "$REVIEWER_ID" "$RUN_ROOT/${CYCLE_SUFFIX}_reviewer_classify.json"
    diagnose_return_implementation_ref "17 reviewer return" "$REVIEWER_ID"
    infer_review_result

    record_diag "18A.authority" "OBSERVED" "$TRUNK_COORDINATOR_ID" "Current live-test policy delegates authorized merge operator authority to the Delegated Coordinator after reviewer approval and green CI." "Continue."
    run_ci_checks
    merge_if_authorized
    record_final_outcome
    retire_disposable_sessions
    coordinator_freshness
    export_full_context "$CYCLE_LABEL" "coordinator_after"
    append_cycle_timeline
    echo "===== END $CYCLE_LABEL ====="
  done
  CYCLE_DIAG_PREFIX=""
  final_audit

  FINAL_STATUS="OBSERVED"
  finish_report "$FINAL_STATUS"
}

main "$@"
