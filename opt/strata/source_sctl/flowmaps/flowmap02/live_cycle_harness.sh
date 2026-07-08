#!/usr/bin/env bash
set -Eeuo pipefail

# Flowmap 02 live operator harness.
# Based on the observed A005 live cycle. This script has no dry-run mode.
# It performs guarded live SCTL/codebase operations and writes structured evidence.

SCRIPT_NAME="$(basename "$0")"
PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"
SCTL_NODE="${SCTL_NODE:-node}"
# shellcheck source=../../scripts/lib/require_linux.sh
source "$PACKAGE_ROOT/scripts/lib/require_linux.sh"
sctl_require_linux_execution_environment "Flowmap 02 live harness"
SCTL_WORKSPACE=""
CODEBASE_REPO=""
SCTL_RUNTIME_DELEGATE_ROOT="${SCTL_RUNTIME_DELEGATE_ROOT:-}"
SCTL_RUNTIME_DELEGATE_BIN="${SCTL_RUNTIME_DELEGATE_BIN:-}"
SCTL_RUNTIME_LAUNCH_CONFIG="${SCTL_RUNTIME_LAUNCH_CONFIG:-}"
SESSION_CREATE_EXTRA_ARGS="${SCTL_RUNTIME_SESSION_EXTRA_ARGS:-}"
ENVELOPE_TEMPLATE_FILE="${ENVELOPE_TEMPLATE_FILE:-}"
ASSIGNMENT_ID=""
SHORT_NAME="sample-uniform-sphere-v2"
TRUNK_BRANCH="main"
CHANGE_BRANCH=""
OBJECTIVE="Implement one small assigned codebase change and return a Class B-ready operational report."
RUN_ROOT=""
RETURN_TIMEOUT=360
POLL_INTERVAL=5
PAUSE_BEFORE_RETIRE=0
SKIP_NPM_TEST=0
SKIP_ADAPTER_SYNTAX=0
PASTE_DELAY="${SCTL_DISPATCH_PASTE_DELAY:-5}"
NO_TAB=1
REVIEW_RESULT_OVERRIDE="${FLOWMAP02_REVIEW_RESULT:-}"
CYCLE_COUNT=1
COORDINATOR_RETIRE_EVERY=4
LATEST_CLASS_B_CONTEXT=2
ARTIFACT_FRESHNESS=1
FRESHNESS_KEEP_RUNTIME_SESSIONS=0
FRESHNESS_SKIP_CONTEXT_GC=0
CYCLE_ENTRY_DIR=""
CYCLE_ENTRY_FILE=""
DIRECTOR_ENTRY_SOURCE=""
CYCLE_ENTRY_ID=""
CYCLE_ENTRY_JSON=""
CYCLE_EXIT_RECORDED=0
OPEN_GIT_PANEL=0
GIT_PANEL_COMMAND="${SCTL_GIT_PANEL:-git-status}"
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


LOG=""
DIAG=""
REPORT=""
RESULT_JSON=""
STEP_STATUS_JSONL=""
TIMELINE=""
FINAL_STATUS="PARTIAL"
CURRENT_STEP="startup"
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
AUTHOR_WORK_ORDER_CLASSB_REL=""
REVIEWER_WORK_ORDER_FILE=""
START_UTC=""
END_UTC=""

usage() {
  cat <<'USAGE'
Usage:
  live_cycle_harness.sh \
    --assignment-id A_FLOWMAP_02_006 \
    --sctl-workspace /absolute/path/to/SCTL_WORKSPACE \
    --codebase-repo /absolute/path/to/CODEBASE_REPO \
    --cycle-entry-dir /absolute/path/to/SCTL_WORKSPACE/.strata/cycles/director_entry

Required:
  --assignment-id ID
  --sctl-workspace DIR
  --codebase-repo DIR

Common options:
  --package-root DIR              SCTL package root. Default: two dirs above this script.
  --runtime-delegate-root DIR     Runtime delegate root. Also accepts env SCTL_RUNTIME_DELEGATE_ROOT.
  --runtime-delegate-bin FILE     Runtime delegate CLI file/binary. Also accepts env SCTL_RUNTIME_DELEGATE_BIN.
  --runtime-launch-config FILE    Optional delegate launcher config. Also accepts env SCTL_RUNTIME_LAUNCH_CONFIG.
  --runtime-session-extra-args TEXT Extra args passed through the adapter to the runtime launcher. Also accepts env SCTL_RUNTIME_SESSION_EXTRA_ARGS.
  --runtime-edge-root DIR         Deprecated one-cycle alias for --runtime-delegate-root.
  --envelope-template FILE        Deprecated; canonical SCTL envelope is rendered by the CLI.
  --cycles N                      Number of disposable author/reviewer cycles. Default: 1.
  --short-name NAME               Branch short name. Default: sample-uniform-sphere-v2.
  --trunk-branch NAME             Default: main.
  --change-branch NAME            Default: change/<assignment-id>/<short-name>.
  --objective TEXT                Legacy summary text only; governing implementation scope belongs in the Director Entry Document and Coordinator Work Order.
  --cycle-entry-dir DIR           Directory containing exactly one Director Entry Markdown file. Default: <sctl-workspace>/.strata/cycles/director_entry.
  --cycle-entry-file FILE         Explicit Director Entry Markdown file under .strata/cycles/director_entry.
  --director-entry-source FILE    Copy this source Markdown file into the Director Entry directory before cycle start. Windows C:\ paths are translated to /mnt/c paths.
  --return-timeout SECONDS        Per-session return wait timeout. Default: 360.
  --poll-interval SECONDS         Return wait polling interval. Default: 5.
  --run-root DIR                  Output directory. Default: <package>/_test_runs/flowmap02/run_<UTC>.
  --review-result VALUE           Override parsed reviewer result: approved, denied, or blocked.
  --pause-before-retire           Deprecated name; now pauses before logical release only. No runtime sessions are killed.
  --no-artifact-freshness         Disable cycle-end stale artifact cleanup.
  --keep-runtime-sessions         Keep disposable runtime tmux sessions after logical release.
  --skip-context-gc               Skip cycle-end context Git garbage collection.
  --skip-npm-test                 Skip SCTL package npm test preflight.
  --skip-adapter-syntax           Skip adapter bash syntax preflight.
  --paste-delay SECONDS           Adapter paste delay. Default from SCTL_DISPATCH_PASTE_DELAY or 5.
  --open-inject-tab               Open an extra Windows Terminal attach tab during dispatch injection.
  --no-tab                        Deprecated compatibility flag; dispatch injection is no-tab by default.
  --open-git-panel                Call the SCTL Git panel caller after context bootstrap.
  --git-panel-command TOOL        Panel tool for SCTL caller: git-status, lazygit, or gitk. Default: git-status.
  --help

USAGE
}

shell_quote() { printf '%q' "$1"; }

wsl_path() {
  local p="$1" drive rest
  if [[ "$p" =~ ^([A-Za-z]):\\(.*)$ ]]; then
    drive="${BASH_REMATCH[1],,}"
    rest="${BASH_REMATCH[2]//\\//}"
    printf '/mnt/%s/%s' "$drive" "$rest"
  else
    printf '%s' "$p"
  fi
}

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
  printf 'cycle\tbranch\tauthor_commit\treviewer_commit\treview\tclass_b_author\tclass_b_outcome\tcontext_before\tcontext_after\n' > "$TIMELINE"
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

record_operational_stage() {
  local stage="$1" status="$2" observation="$3" diagnosis="$4" next_action="${5:-Continue.}"
  echo "OPERATIONAL_STAGE[$stage]=$status | $observation"
  record_diag "$stage" "$status" "$observation" "$diagnosis" "$next_action"
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
  CHANGE_AUTHOR_SESSION="STRATA-CODER-${ASSIGNMENT_ID}-${CYCLE_SUFFIX}"
  REVIEWER_SESSION="STRATA-REVIEWER-${ASSIGNMENT_ID}-${CYCLE_SUFFIX}"
  NONCE_AUTHOR="N_AUTHOR_${CYCLE_SUFFIX}"
  NONCE_REVIEW="N_REVIEW_${CYCLE_SUFFIX}"
  if [ "$CYCLE_COUNT" -eq 1 ] && [ -n "$BASE_CHANGE_BRANCH" ]; then
    CHANGE_BRANCH="$BASE_CHANGE_BRANCH"
  else
    CHANGE_BRANCH="change/${ASSIGNMENT_ID}/${CYCLE_SUFFIX}-${BASE_SHORT_NAME}"
  fi
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
      --class-b-latest "$LATEST_CLASS_B_CONTEXT" \
      --out "$out_dir" \
    || fail "context export $cycle/$label" "BROKEN_CONTEXT_EXPORT" "$out_dir" "Inspect context export-markdown output."
  echo "FULL_CONTEXT_EXPORT[$cycle/$label]=$out_dir/context.md"
  record_diag "context_export.$label" "OBSERVED" "$out_dir/context.md" "Standalone Class A plus latest Class B context export written outside the pasted dispatch packet and outside the operational log body." "Continue."
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
      --runtime-delegate-root) SCTL_RUNTIME_DELEGATE_ROOT="$2"; shift 2 ;;
      --runtime-delegate-bin) SCTL_RUNTIME_DELEGATE_BIN="$2"; shift 2 ;;
      --runtime-launch-config) SCTL_RUNTIME_LAUNCH_CONFIG="$2"; shift 2 ;;
      --runtime-session-extra-args) SESSION_CREATE_EXTRA_ARGS="$2"; shift 2 ;;
      --runtime-edge-root) SCTL_RUNTIME_DELEGATE_ROOT="$2"; echo "warning: --runtime-edge-root is deprecated; use --runtime-delegate-root" >&2; shift 2 ;;
      --envelope-template) ENVELOPE_TEMPLATE_FILE="$2"; shift 2 ;;
      --cycles) CYCLE_COUNT="$2"; shift 2 ;;
      --short-name) SHORT_NAME="$2"; shift 2 ;;
      --trunk-branch) TRUNK_BRANCH="$2"; shift 2 ;;
      --change-branch) CHANGE_BRANCH="$2"; shift 2 ;;
      --objective) OBJECTIVE="$2"; shift 2 ;;
      --cycle-entry-dir) CYCLE_ENTRY_DIR="$2"; shift 2 ;;
      --cycle-entry-file) CYCLE_ENTRY_FILE="$2"; shift 2 ;;
      --director-entry-source|--manual-entry-source) DIRECTOR_ENTRY_SOURCE="$2"; shift 2 ;;
      --return-timeout) RETURN_TIMEOUT="$2"; shift 2 ;;
      --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
      --run-root) RUN_ROOT="$2"; shift 2 ;;
      --review-result) REVIEW_RESULT_OVERRIDE="$2"; shift 2 ;;
      --pause-before-retire) PAUSE_BEFORE_RETIRE=1; shift ;;
      --no-artifact-freshness) ARTIFACT_FRESHNESS=0; shift ;;
      --keep-runtime-sessions) FRESHNESS_KEEP_RUNTIME_SESSIONS=1; shift ;;
      --skip-context-gc) FRESHNESS_SKIP_CONTEXT_GC=1; shift ;;
      --skip-npm-test) SKIP_NPM_TEST=1; shift ;;
      --skip-adapter-syntax) SKIP_ADAPTER_SYNTAX=1; shift ;;
      --paste-delay) PASTE_DELAY="$2"; shift 2 ;;
      --open-inject-tab) NO_TAB=0; shift ;;
      --no-tab) NO_TAB=1; shift ;;
      --open-git-panel) OPEN_GIT_PANEL=1; shift ;;
      --git-panel-command) GIT_PANEL_COMMAND="$2"; shift 2 ;;
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
  if [ -z "$SCTL_RUNTIME_DELEGATE_ROOT" ] && [ -n "${SCTL_RUNTIME_EDGE_ROOT:-}" ]; then
    SCTL_RUNTIME_DELEGATE_ROOT="$SCTL_RUNTIME_EDGE_ROOT"
    echo "warning: SCTL_RUNTIME_EDGE_ROOT is deprecated; use SCTL_RUNTIME_DELEGATE_ROOT" >&2
  fi
  if [ -z "$SCTL_RUNTIME_DELEGATE_BIN" ] && [ -n "${SCTL_RUNTIME_EDGE_CLI:-}" ]; then
    SCTL_RUNTIME_DELEGATE_BIN="$SCTL_RUNTIME_EDGE_CLI"
    echo "warning: SCTL_RUNTIME_EDGE_CLI is deprecated; use SCTL_RUNTIME_DELEGATE_BIN" >&2
  fi
  if [ -n "$SCTL_RUNTIME_DELEGATE_ROOT" ] && ! is_abs "$SCTL_RUNTIME_DELEGATE_ROOT"; then
    echo "error: --runtime-delegate-root must be absolute when supplied" >&2; exit 2
  fi
  if [ -z "$SCTL_RUNTIME_DELEGATE_BIN" ] && [ -n "$SCTL_RUNTIME_DELEGATE_ROOT" ]; then
    SCTL_RUNTIME_DELEGATE_BIN="$SCTL_RUNTIME_DELEGATE_ROOT/dist/src/cli.js"
  fi
  [ -n "$SCTL_RUNTIME_DELEGATE_BIN" ] || { echo "error: SCTL runtime delegate required. Set --runtime-delegate-bin or --runtime-delegate-root." >&2; exit 2; }
  if [ ! -f "$SCTL_RUNTIME_DELEGATE_BIN" ] && ! command -v "$SCTL_RUNTIME_DELEGATE_BIN" >/dev/null 2>&1; then
    echo "error: runtime delegate binary not found: $SCTL_RUNTIME_DELEGATE_BIN" >&2; exit 2
  fi
  if [ -n "$ENVELOPE_TEMPLATE_FILE" ] && { ! is_abs "$ENVELOPE_TEMPLATE_FILE" || [ ! -f "$ENVELOPE_TEMPLATE_FILE" ]; }; then
    echo "warning: --envelope-template is deprecated and ignored by canonical SCTL dispatch rendering: $ENVELOPE_TEMPLATE_FILE" >&2
  fi
  [[ "$RETURN_TIMEOUT" =~ ^[0-9]+$ ]] || { echo "error: --return-timeout must be an integer" >&2; exit 2; }
  [[ "$POLL_INTERVAL" =~ ^[0-9]+$ ]] || { echo "error: --poll-interval must be an integer" >&2; exit 2; }
  [[ "$CYCLE_COUNT" =~ ^[0-9]+$ ]] || { echo "error: --cycles must be an integer" >&2; exit 2; }
  [ "$CYCLE_COUNT" -ge 1 ] || { echo "error: --cycles must be >= 1" >&2; exit 2; }
  [ "$POLL_INTERVAL" -gt 0 ] || { echo "error: --poll-interval must be > 0" >&2; exit 2; }
  BASE_CHANGE_BRANCH="$CHANGE_BRANCH"
  BASE_SHORT_NAME="$SHORT_NAME"
  if [ -z "$CYCLE_ENTRY_DIR" ]; then CYCLE_ENTRY_DIR="$SCTL_WORKSPACE/.strata/cycles/director_entry"; fi
  if [ -n "$DIRECTOR_ENTRY_SOURCE" ]; then DIRECTOR_ENTRY_SOURCE="$(wsl_path "$DIRECTOR_ENTRY_SOURCE")"; fi
  is_abs "$CYCLE_ENTRY_DIR" || { echo "error: --cycle-entry-dir must be absolute" >&2; exit 2; }
  if [ -n "$CYCLE_ENTRY_FILE" ]; then is_abs "$CYCLE_ENTRY_FILE" || { echo "error: --cycle-entry-file must be absolute" >&2; exit 2; }; fi
  TRUNK_COORDINATOR_SESSION=""
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
  echo "SCTL_RUNTIME_DELEGATE_ROOT=$SCTL_RUNTIME_DELEGATE_ROOT"
  echo "SCTL_RUNTIME_DELEGATE_BIN=$SCTL_RUNTIME_DELEGATE_BIN"
  echo "SCTL_RUNTIME_LAUNCH_CONFIG=$SCTL_RUNTIME_LAUNCH_CONFIG"
  echo "SESSION_CREATE_EXTRA_ARGS=$SESSION_CREATE_EXTRA_ARGS"
  echo "ENVELOPE_TEMPLATE_FILE_DEPRECATED=$ENVELOPE_TEMPLATE_FILE"
  echo "ASSIGNMENT_ID=$ASSIGNMENT_ID"
  echo "TRUNK_BRANCH=$TRUNK_BRANCH"
  echo "BASE_CHANGE_BRANCH=$BASE_CHANGE_BRANCH"
  echo "SHORT_NAME=$SHORT_NAME"
  echo "CYCLE_COUNT=$CYCLE_COUNT"
  echo "COORDINATOR_RETIRE_EVERY=$COORDINATOR_RETIRE_EVERY"
  echo "LATEST_CLASS_B_CONTEXT=$LATEST_CLASS_B_CONTEXT"
  echo "ARTIFACT_FRESHNESS=$ARTIFACT_FRESHNESS"
  echo "FRESHNESS_KEEP_RUNTIME_SESSIONS=$FRESHNESS_KEEP_RUNTIME_SESSIONS"
  echo "FRESHNESS_SKIP_CONTEXT_GC=$FRESHNESS_SKIP_CONTEXT_GC"
  echo "CYCLE_ENTRY_DIR=$CYCLE_ENTRY_DIR"
  echo "CYCLE_ENTRY_FILE=$CYCLE_ENTRY_FILE"
  echo "GIT_PANEL_COMMAND=$GIT_PANEL_COMMAND"
  echo "RETURN_TIMEOUT=$RETURN_TIMEOUT"
}

finish_report() {
  local result="$1" active_sessions_file context_state_file sctl_status codebase_status
  END_UTC="$(utc_now)"
  record_cycle_exit_once "$result"
  active_sessions_file="$SCTL_WORKSPACE/.strata/context/C/sessions/active_sessions.json"
  context_state_file="$SCTL_WORKSPACE/.strata/context/D_trace/context_state.json"
  sctl_status="not_checked"
  codebase_status="not_checked"
  if [ -d "$SCTL_WORKSPACE/.strata/context/.git" ]; then
    sctl_status="$(git -C "$SCTL_WORKSPACE/.strata/context" status --short 2>/dev/null | sed ':a;N;$!ba;s/\n/; /g')"
    [ -n "$sctl_status" ] || sctl_status="clean"
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

## Evidence files

- Operational log: $LOG
- Step diagnosis TSV: $DIAG
- Step status JSONL: $STEP_STATUS_JSONL
- Cycle timeline TSV: $TIMELINE
- Result JSON: $RESULT_JSON
- Context exports root: $RUN_ROOT/context_exports
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
  "return_timeout_seconds": $RETURN_TIMEOUT,
  "log": $(json_escape "$LOG"),
  "diagnosis_tsv": $(json_escape "$DIAG"),
  "status_jsonl": $(json_escape "$STEP_STATUS_JSONL"),
  "cycle_timeline_tsv": $(json_escape "$TIMELINE"),
  "report": $(json_escape "$REPORT"),
  "context_exports_root": $(json_escape "$RUN_ROOT/context_exports"),
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
  need_cmd node; need_cmd git; need_cmd bash; need_cmd python3
  if [ "$SKIP_NPM_TEST" -eq 0 ]; then need_cmd npm; fi
  [ -d "$PACKAGE_ROOT" ] || fail "preflight" "BLOCKED_MISSING_PACKAGE_ROOT" "$PACKAGE_ROOT" "Pass --package-root pointing to the SCTL package root."
  [ -f "$PACKAGE_ROOT/src/cli.js" ] || fail "preflight" "BLOCKED_MISSING_SCTL_CLI" "$PACKAGE_ROOT/src/cli.js" "Use the package root that contains src/cli.js."
  for adapter in sctl-session-new sctl-dispatch-render sctl-dispatch-inject sctl-session-capture sctl-session-retire sctl-session-list sctl-return-dir sctl-return-drop; do
    [ -x "$PACKAGE_ROOT/scripts/wsl_tmux/$adapter" ] || fail "preflight" "BLOCKED_MISSING_ADAPTER" "$adapter" "Use the package root that contains the Flowmap 02 runtime delegate adapter boundary."
  done
  [ -d "$SCTL_WORKSPACE" ] || mkdir -p "$SCTL_WORKSPACE"
  [ -d "$CODEBASE_REPO/.git" ] || fail "preflight" "BLOCKED_MISSING_CODEBASE_GIT" "$CODEBASE_REPO" "Pass --codebase-repo pointing to an implementation Git repo."
  run_json "preflight delegate session list" "$RUN_ROOT/preflight_delegate_session_list.json" \
    env "SCTL_RUNTIME_DELEGATE_ROOT=$SCTL_RUNTIME_DELEGATE_ROOT" "SCTL_RUNTIME_DELEGATE_BIN=$SCTL_RUNTIME_DELEGATE_BIN" \
      "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-list" --workspace "$SCTL_WORKSPACE" \
    || fail "preflight delegate" "BROKEN_RUNTIME_DELEGATE" "$SCTL_RUNTIME_DELEGATE_BIN" "Inspect delegate installation and SCTL_RUNTIME_DELEGATE_* configuration."
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
  record_operational_stage "bootstrap_context" "OBSERVED" "context bootstrap ok" "SCTL context Git exists and bootstrap committed or updated state." "Continue."
}


load_director_entry() {
  if [ -n "$DIRECTOR_ENTRY_SOURCE" ]; then
    [ -f "$DIRECTOR_ENTRY_SOURCE" ] || fail "load_director_entry" "BLOCKED_MISSING_DIRECTOR_ENTRY_SOURCE" "$DIRECTOR_ENTRY_SOURCE" "Provide an existing Markdown source file."
    case "$DIRECTOR_ENTRY_SOURCE" in *.md|*.MD) ;; *) fail "load_director_entry" "BLOCKED_DIRECTOR_ENTRY_SOURCE_FORMAT" "$DIRECTOR_ENTRY_SOURCE" "Director Entry source must be a Markdown file." ;; esac
    mkdir -p "$CYCLE_ENTRY_DIR"
    find "$CYCLE_ENTRY_DIR" -maxdepth 1 -type f -name '*.md' -delete
    CYCLE_ENTRY_FILE="$CYCLE_ENTRY_DIR/$(basename "$DIRECTOR_ENTRY_SOURCE")"
    cp "$DIRECTOR_ENTRY_SOURCE" "$CYCLE_ENTRY_FILE"
    record_operational_stage "load_director_entry" "OBSERVED" "$DIRECTOR_ENTRY_SOURCE -> $CYCLE_ENTRY_FILE" "Director Entry Markdown was copied into the controlled SCTL director_entry inbox." "Validate Director Entry."
    record_diag "0.director_entry_import" "OBSERVED" "$DIRECTOR_ENTRY_SOURCE -> $CYCLE_ENTRY_FILE" "Director Entry Markdown was copied into the controlled SCTL director_entry inbox before commit." "Submit it to SCTL cycle start."
    return 0
  fi
  if [ -n "$CYCLE_ENTRY_FILE" ]; then
    record_operational_stage "load_director_entry" "OBSERVED" "$CYCLE_ENTRY_FILE" "Caller supplied an explicit Director Entry file." "Validate Director Entry."
    return 0
  fi
  [ -d "$CYCLE_ENTRY_DIR" ] || fail "load_director_entry" "BLOCKED_MISSING_CYCLE_ENTRY_DIR" "$CYCLE_ENTRY_DIR" "Create the dedicated Director Entry directory and one Markdown file."
  mapfile -t entry_files < <(find "$CYCLE_ENTRY_DIR" -maxdepth 1 -type f -name '*.md' | sort)
  if [ "${#entry_files[@]}" -eq 0 ]; then fail "load_director_entry" "BLOCKED_MISSING_CYCLE_ENTRY" "$CYCLE_ENTRY_DIR" "Place exactly one Markdown file in the dedicated directory."; fi
  if [ "${#entry_files[@]}" -gt 1 ]; then fail "load_director_entry" "BLOCKED_AMBIGUOUS_CYCLE_ENTRY" "${entry_files[*]}" "Keep exactly one Markdown entry file in the directory."; fi
  CYCLE_ENTRY_FILE="${entry_files[0]}"
  record_operational_stage "load_director_entry" "OBSERVED" "$CYCLE_ENTRY_FILE" "Director Entry Markdown file was loaded from the controlled SCTL director_entry inbox." "Validate Director Entry."
}

validate_director_entry() {
  [ -n "$CYCLE_ENTRY_FILE" ] || fail "validate_director_entry" "BLOCKED_MISSING_CYCLE_ENTRY" "$CYCLE_ENTRY_DIR" "Load exactly one Director Entry Markdown file first."
  [ -f "$CYCLE_ENTRY_FILE" ] || fail "validate_director_entry" "BLOCKED_MISSING_CYCLE_ENTRY" "$CYCLE_ENTRY_FILE" "Create the Director Entry Markdown file."
  case "$CYCLE_ENTRY_FILE" in "$SCTL_WORKSPACE/.strata/cycles/director_entry/"*.md) ;; *) fail "validate_director_entry" "BLOCKED_CYCLE_ENTRY_PATH" "$CYCLE_ENTRY_FILE" "Place the entry under .strata/cycles/director_entry." ;; esac
  case "$CYCLE_ENTRY_FILE" in *.md|*.MD) ;; *) fail "validate_director_entry" "BLOCKED_CYCLE_ENTRY_FORMAT" "$CYCLE_ENTRY_FILE" "Director Entry must be one Markdown file." ;; esac
  record_operational_stage "validate_director_entry" "OBSERVED" "$CYCLE_ENTRY_FILE" "Director Entry passed the harness path and Markdown file gate." "Bind it to context bootstrap."
  record_diag "0.cycle_entry_detect" "OBSERVED" "$CYCLE_ENTRY_FILE" "Director Entry Markdown file is present." "Submit it to SCTL cycle start."
}

bind_director_entry_to_bootstrap_context() {
  [ -n "$CYCLE_ENTRY_FILE" ] || fail "bind_director_entry_to_bootstrap_context" "BLOCKED_MISSING_CYCLE_ENTRY" "$CYCLE_ENTRY_DIR" "Load and validate Director Entry before binding."
  record_operational_stage "bind_director_entry_to_bootstrap_context" "OBSERVED" "$CYCLE_ENTRY_FILE" "Validated Director Entry is the governing Class A input for bootstrap and cycle start; SCTL still performs no semantic task parsing." "Bootstrap context."
}

detect_manual_cycle_entry() {
  load_director_entry
  validate_director_entry
}

initial_change_branch_for_cycle_start() {
  if [ "$CYCLE_COUNT" -eq 1 ] && [ -n "$BASE_CHANGE_BRANCH" ]; then
    printf '%s' "$BASE_CHANGE_BRANCH"
  else
    printf 'change/%s/C01-%s' "$ASSIGNMENT_ID" "$BASE_SHORT_NAME"
  fi
}

start_manual_cycle_entry() {
  if [ -z "$CYCLE_ENTRY_FILE" ]; then
    detect_manual_cycle_entry
    bind_director_entry_to_bootstrap_context
  fi
  CYCLE_ENTRY_JSON="$RUN_ROOT/cycle_entry_start.json"
  local initial_change_branch
  initial_change_branch="$(initial_change_branch_for_cycle_start)"
  run_json "0 cycle start" "$CYCLE_ENTRY_JSON" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" cycle start --assignment-id "$ASSIGNMENT_ID" --file "$CYCLE_ENTRY_FILE" --coordinator-id "$TRUNK_COORDINATOR_ID" --codebase-repo "$CODEBASE_REPO" --trunk-branch "$TRUNK_BRANCH" --change-branch "$initial_change_branch" --short-name "$BASE_SHORT_NAME"     || fail "0 cycle start" "BROKEN_CYCLE_START" "$CYCLE_ENTRY_FILE" "Inspect the Director Entry Class A commit path and normalized cycle-entry reference object."
  CYCLE_ENTRY_ID="$(json_get "$CYCLE_ENTRY_JSON" result.cycle_id 2>/dev/null || printf '')"
  record_diag "0.cycle_start" "OBSERVED" "$CYCLE_ENTRY_ID" "Director Entry Document was committed to Class A and normalized into a reference object without SCTL semantic task parsing." "Proceed to coordinator cycle."
}

record_cycle_exit_once() {
  local result="$1" reason="complete"
  [ "$CYCLE_EXIT_RECORDED" -eq 0 ] || return 0
  [ -n "$CYCLE_ENTRY_ID" ] || return 0
  case "$result" in
    OBSERVED) reason="complete" ;;
    BLOCKED*|BROKEN*|PARTIAL*) reason="architectural_blocker" ;;
    *) reason="manual_stop" ;;
  esac
  CYCLE_EXIT_RECORDED=1
  run_json "0 cycle exit" "$RUN_ROOT/cycle_exit_${reason}.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" cycle exit --assignment-id "$ASSIGNMENT_ID" --cycle-id "$CYCLE_ENTRY_ID" --reason "$reason" --summary "Flowmap 02 result: $result" || true
}

call_sctl_git_panel_startpoint() {
  if [ "$OPEN_GIT_PANEL" -eq 1 ]; then
    run_json "0 sctl git panel" "$RUN_ROOT/sctl_git_panel.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" panel git --repo sctl --tool "$GIT_PANEL_COMMAND"       || fail "0 sctl git panel" "BROKEN_SCTL_GIT_PANEL_CALLER" "$GIT_PANEL_COMMAND" "Use git-status or install the selected panel command."
    record_diag "0.git_panel" "OBSERVED" "$GIT_PANEL_COMMAND" "SCTL Git panel caller executed at the starting point." "Continue."
  else
    record_diag "0.git_panel" "OBSERVED" "sctl panel git caller available" "Visible Git panel can be called from SCTL; operator did not request launch." "Continue."
  fi
}

set_runtime_session_global() {
  local session_id="$1" runtime_session_name="$2"
  case "$session_id" in
    "$TRUNK_COORDINATOR_ID") TRUNK_COORDINATOR_SESSION="$runtime_session_name" ;;
    "$CHANGE_AUTHOR_ID") CHANGE_AUTHOR_SESSION="$runtime_session_name" ;;
    "$REVIEWER_ID") REVIEWER_SESSION="$runtime_session_name" ;;
  esac
}

register_session() {
  local label="$1" assignment="$2" role="$3" agent_id="$4" session_name="$5" mode="$6" outfile="$7" resolve_existing="${8:-0}"
  local args runtime_session_name env_args
  env_args=(env "SCTL_RUNTIME_DELEGATE_ROOT=$SCTL_RUNTIME_DELEGATE_ROOT" "SCTL_RUNTIME_DELEGATE_BIN=$SCTL_RUNTIME_DELEGATE_BIN" "SCTL_RUNTIME_LAUNCH_CONFIG=$SCTL_RUNTIME_LAUNCH_CONFIG" "SCTL_RUNTIME_SESSION_EXTRA_ARGS=$SESSION_CREATE_EXTRA_ARGS")
  args=("$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-new"
    --workspace "$SCTL_WORKSPACE"
    --assignment-id "$assignment"
    --role "$role"
    --id "$agent_id"
    --session-mode "$mode"
    --cycle-id "$CYCLE_ENTRY_ID")
  if [ -n "$session_name" ]; then args+=(--session-name "$session_name"); fi
  if [ "$resolve_existing" -eq 1 ]; then args+=(--resolve-existing); fi
  run_json "$label" "$outfile" "${env_args[@]}" "${args[@]}" \
    || fail "$label" "BROKEN_SESSION_REGISTER" "$agent_id" "Inspect runtime delegate adapter registration/alignment and SCTL session metadata."
  runtime_session_name="$(json_get "$outfile" result.session.runtime_session_name 2>/dev/null || json_get "$outfile" result.session.session_name 2>/dev/null || printf '')"
  [ -n "$runtime_session_name" ] || fail "$label" "MISSING_RUNTIME_SESSION_NAME" "$outfile" "Adapter must return SCTL session metadata with runtime_session_name."
  set_runtime_session_global "$agent_id" "$runtime_session_name"
}

align_session_name() {
  local label="$1" desired="$2"
  [ -n "$desired" ] || fail "$label.session_target" "MISSING_SESSION_TARGET" "runtime_session_name missing" "Inspect delegate session registry and adapter output."
  record_diag "$label.session_target" "OBSERVED" "$desired" "Runtime session name was resolved from the adapter registry; no synthetic SCTL id is used for runtime targeting." "Continue."
}

inject_packet() {
  local label="$1" session_name="$2" packet_rel="$3" agent_id="${4:-}"
  local packet_path args env_args
  [ -n "$agent_id" ] || agent_id="$session_name"
  packet_path="$packet_rel"
  case "$packet_path" in /*) ;; *) packet_path="$SCTL_WORKSPACE/$packet_path" ;; esac
  env_args=(env "SCTL_RUNTIME_DELEGATE_ROOT=$SCTL_RUNTIME_DELEGATE_ROOT" "SCTL_RUNTIME_DELEGATE_BIN=$SCTL_RUNTIME_DELEGATE_BIN")
  args=("$PACKAGE_ROOT/scripts/wsl_tmux/sctl-dispatch-inject"
    --workspace "$SCTL_WORKSPACE"
    --assignment-id "$ASSIGNMENT_ID"
    --id "$agent_id"
    --session "$session_name"
    --packet "$packet_path"
    --paste-delay "$PASTE_DELAY")
  if [ "$NO_TAB" -eq 1 ]; then args+=(--no-tab); fi
  run_capture "$label" "$RUN_ROOT/${CYCLE_SUFFIX}_${label// /_}.log" "${env_args[@]}" "${args[@]}" \
    || fail "$label" "BROKEN_DISPATCH_INJECT" "$session_name $packet_path" "Inspect runtime delegate dispatch delivery, registry binding, and packet path."
}

capture_session() {
  local label="$1" session_name="$2" agent_id="${3:-}"
  local out_file env_args
  [ -n "$agent_id" ] || agent_id="$session_name"
  out_file="$SCTL_WORKSPACE/.strata/evidence/session_captures/${session_name}.txt"
  env_args=(env "SCTL_RUNTIME_DELEGATE_ROOT=$SCTL_RUNTIME_DELEGATE_ROOT" "SCTL_RUNTIME_DELEGATE_BIN=$SCTL_RUNTIME_DELEGATE_BIN")
  run_capture "$label" "$RUN_ROOT/${CYCLE_SUFFIX}_${label// /_}.log" "${env_args[@]}" \
    "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-capture" --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --id "$agent_id" --session "$session_name" --out "$out_file" --lines 200 || return 1
}

reset_cycle_transient_artifacts() {
  local return_base="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID"
  if [ -d "$return_base" ]; then
    find "$return_base" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} + 2>/dev/null || true
    record_diag "$CYCLE_LABEL.artifact_freshness.returns" "OBSERVED" "$return_base disposable worker returns cleared before coordinator handoff" "Cycle-end cleanup deleted only assignment-owned transient worker return directories before refreshing the coordinator. Coordinator handoff files may be recreated for the next cycle; Class B reports and return ledgers remain in context Git." "Continue."
  else
    record_diag "$CYCLE_LABEL.artifact_freshness.returns" "SKIPPED" "$return_base absent" "No transient return directories were present for this assignment." "Continue."
  fi
}

cleanup_runtime_session() {
  local session_name="$1" label="$2"
  [ -n "$session_name" ] || return 0
  if [ "$FRESHNESS_KEEP_RUNTIME_SESSIONS" -eq 1 ]; then
    record_diag "$CYCLE_LABEL.artifact_freshness.runtime" "SKIPPED" "$session_name kept by option" "Operator requested runtime session retention." "Continue."
    return 0
  fi
  if ! command -v tmux >/dev/null 2>&1; then
    record_diag "$CYCLE_LABEL.artifact_freshness.runtime" "WARN_NO_TMUX" "$session_name" "tmux was not available for cycle-end runtime cleanup." "Inspect runtime sessions manually."
    return 0
  fi
  if tmux has-session -t "$session_name" 2>/dev/null; then
    if tmux kill-session -t "$session_name" 2>/dev/null; then
      record_diag "$CYCLE_LABEL.artifact_freshness.runtime" "OBSERVED" "$label $session_name killed" "Cycle-end cleanup removed the disposable runtime session after its report was classified and committed." "Continue."
    else
      record_diag "$CYCLE_LABEL.artifact_freshness.runtime" "WARN_CLEANUP_FAILED" "$label $session_name" "tmux reported the disposable runtime session but could not kill it." "Inspect tmux manually."
    fi
  else
    record_diag "$CYCLE_LABEL.artifact_freshness.runtime" "SKIPPED" "$label $session_name already absent" "No zombie disposable runtime session remained for this role." "Continue."
  fi
}

cleanup_context_git_storage() {
  local cleanup_log status
  if [ "$FRESHNESS_SKIP_CONTEXT_GC" -eq 1 ]; then
    record_diag "$CYCLE_LABEL.artifact_freshness.context_git" "SKIPPED" "context gc skipped by option" "Operator requested context Git maintenance skip." "Continue."
    return 0
  fi
  if [ ! -d "$SCTL_WORKSPACE/.strata/context/.git" ]; then
    record_diag "$CYCLE_LABEL.artifact_freshness.context_git" "SKIPPED" "context git absent" "No context Git repository was available for storage maintenance." "Continue."
    return 0
  fi
  cleanup_log="$RUN_ROOT/${CYCLE_SUFFIX}_artifact_freshness_context_git.log"
  set +e
  {
    echo "+ git count-objects -v before"
    git -C "$SCTL_WORKSPACE/.strata/context" count-objects -v
    echo "+ git reflog expire --expire=now --all"
    git -C "$SCTL_WORKSPACE/.strata/context" reflog expire --expire=now --all
    echo "+ git gc --prune=now --quiet"
    git -C "$SCTL_WORKSPACE/.strata/context" gc --prune=now --quiet
    echo "+ git count-objects -v after"
    git -C "$SCTL_WORKSPACE/.strata/context" count-objects -v
  } 2>&1 | tee "$cleanup_log"
  status=${PIPESTATUS[0]}
  set -e
  if [ "$status" -eq 0 ]; then
    record_diag "$CYCLE_LABEL.artifact_freshness.context_git" "OBSERVED" "$cleanup_log" "Context Git storage was packed/pruned without deleting Class B reports or changing reviewer outcome semantics." "Continue."
  else
    record_diag "$CYCLE_LABEL.artifact_freshness.context_git" "WARN_CLEANUP_FAILED" "$cleanup_log" "Cycle continued, but context Git storage maintenance failed." "Inspect the cleanup log."
  fi
}

run_start_artifact_freshness() {
  if [ "$ARTIFACT_FRESHNESS" -eq 0 ]; then
    record_diag "run_start.artifact_freshness" "SKIPPED" "--no-artifact-freshness" "Operator disabled run-start stale artifact cleanup." "Continue."
    return 0
  fi
  local return_base="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID"
  if [ -d "$return_base" ]; then
    find "$return_base" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} + 2>/dev/null || true
    record_diag "run_start.artifact_freshness.returns" "OBSERVED" "$return_base stale worker returns cleared before cycle 1" "Run-start cleanup deleted assignment-owned transient worker return directories so a crashed prior run's stale packet.json cannot make wait_for_return fire immediately. Class B reports and return ledgers remain in context Git." "Continue."
  else
    record_diag "run_start.artifact_freshness.returns" "SKIPPED" "$return_base absent" "No transient return directories were present at run start." "Continue."
  fi
  if [ "$FRESHNESS_KEEP_RUNTIME_SESSIONS" -eq 1 ]; then
    record_diag "run_start.artifact_freshness.runtime" "SKIPPED" "disposable sessions kept by option" "Operator requested runtime session retention." "Continue."
  elif ! command -v tmux >/dev/null 2>&1; then
    record_diag "run_start.artifact_freshness.runtime" "WARN_NO_TMUX" "tmux not available" "tmux was not available for run-start runtime cleanup." "Inspect runtime sessions manually."
  else
    local swept=0 session_name
    while IFS= read -r session_name; do
      [ -n "$session_name" ] || continue
      case "$session_name" in
        STRATA-CODER-"$ASSIGNMENT_ID"-C*|STRATA-REVIEWER-"$ASSIGNMENT_ID"-C*)
          if tmux kill-session -t "$session_name" 2>/dev/null; then
            swept=1
            record_diag "run_start.artifact_freshness.runtime" "OBSERVED" "$session_name killed" "Run-start cleanup removed a stale disposable runtime session so the next cycle's session-create cannot collide on a duplicate name." "Continue."
          fi
          ;;
      esac
    done < <(tmux ls -F '#{session_name}' 2>/dev/null || true)
    if [ "$swept" -eq 0 ]; then
      record_diag "run_start.artifact_freshness.runtime" "SKIPPED" "no stale disposable sessions" "No zombie disposable author/reviewer sessions remained for this assignment at run start." "Continue."
    fi
  fi
  record_diag "run_start.artifact_freshness" "OBSERVED" "run-start cleanup complete" "Harness cleared stale transient worker return directories and disposable runtime sessions before cycle 1, so a crashed prior run cannot poison the first cycle via a stale packet.json or a duplicate-name tmux session. Codebase-git branches and context-git content are untouched; context-git GC runs only at cycle end." "Begin cycle 1."
}

cycle_end_artifact_freshness() {
  if [ "$ARTIFACT_FRESHNESS" -eq 0 ]; then
    record_diag "$CYCLE_LABEL.artifact_freshness" "SKIPPED" "--no-artifact-freshness" "Operator disabled cycle-end stale artifact cleanup." "Continue."
    return 0
  fi
  cleanup_runtime_session "$CHANGE_AUTHOR_SESSION" "author"
  cleanup_runtime_session "$REVIEWER_SESSION" "reviewer"
  reset_cycle_transient_artifacts
  cleanup_context_git_storage
  record_diag "$CYCLE_LABEL.artifact_freshness" "OBSERVED" "cycle-end cleanup complete" "Harness cleaned stale runtime/transient artifacts only. Codebase-git branch lifecycle is owned by the agents, not the harness; Reviewer outcome detail remains in the report/Class B layer, and coordinator refresh proceeds from committed context." "Continue."
}


write_author_work_order() {
  local submitted copied work_order_id commit_json before after
  submitted="$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/$TRUNK_COORDINATOR_ID/coordinator_work_order.md"
  echo; echo "===== 5 wait for Coordinator-authored Class B work order ====="; echo "waiting up to ${RETURN_TIMEOUT}s for $submitted"
  local start_ts now elapsed
  start_ts="$(date +%s)"
  while true; do
    if [ -f "$submitted" ]; then break; fi
    now="$(date +%s)"; elapsed=$((now-start_ts))
    if [ "$elapsed" -ge "$RETURN_TIMEOUT" ]; then
      fail "5 coordinator work order wait" "BLOCKED_COORDINATOR_WORK_ORDER_REQUIRED" "$submitted missing after ${RETURN_TIMEOUT}s" "The harness must not author Coordinator work. Inject the Coordinator envelope, let Coordinator submit coordinator_work_order.md, then retry."
    fi
    sleep "$POLL_INTERVAL"
  done
  mkdir -p "$SCTL_WORKSPACE/.strata/context/B"
  work_order_id="WO_${ASSIGNMENT_ID}_${CYCLE_SUFFIX}_CHANGE_AUTHOR"
  copied="$SCTL_WORKSPACE/.strata/context/B/$(lower_safe "$work_order_id").md"
  cp "$submitted" "$copied"
  before="$(current_class_b_revision)"
  commit_json="$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_work_order_classb_commit.json"
  run_json "5 coordinator work order Class B commit" "$commit_json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" classb commit --file "$copied" --message "Class B Coordinator Work Order $work_order_id" \
    || fail "5 coordinator work order Class B commit" "BROKEN_COORDINATOR_WORK_ORDER_COMMIT" "$copied" "Inspect Coordinator-authored Work Order Class B schema and required fields."
  after="$(current_class_b_revision)"
  require_revision_increment "5 coordinator work order Class B commit" "$before" "$after"
  AUTHOR_WORK_ORDER_FILE="$copied"
  AUTHOR_WORK_ORDER_CLASSB_REL="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$copied" "$SCTL_WORKSPACE")"
  record_diag "5.work_order" "OBSERVED" "$submitted -> $copied" "Coordinator-authored Work Order was accepted as Class B before Change Author dispatch." "Use committed Class B context as dispatch source."
}
write_reviewer_work_order() {
  local author_classb_rel="$1"
  REVIEWER_WORK_ORDER_FILE=""
  record_diag "13.work_order" "SKIPPED" "$author_classb_rel" "Reviewer dispatch is a canonical context envelope; no reviewer-specific work-order body is materialized by the harness." "Render reviewer envelope from committed Class B context."
}
send_author_message() {
  AUTHOR_MESSAGE_FILE="$AUTHOR_WORK_ORDER_FILE"
  [ -f "$AUTHOR_MESSAGE_FILE" ] || fail "5 author work order source" "MISSING_COORDINATOR_WORK_ORDER" "$AUTHOR_MESSAGE_FILE" "Create and commit the Class B Coordinator Work Order before dispatch."
  record_diag "5" "OBSERVED" "$AUTHOR_MESSAGE_FILE" "Dispatch source is the committed Class B Coordinator Work Order, not an uncommitted Class C/body-file artifact." "Render Change Author dispatch from this Class B artifact."
}

render_author_dispatch() {
  AUTHOR_PACKET_REL=".strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/$NONCE_AUTHOR/dispatch_packet.md"
  run_json "6 author dispatch render" "$RUN_ROOT/${CYCLE_SUFFIX}_author_dispatch_render.json" \
    "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-dispatch-render" --workspace "$SCTL_WORKSPACE" \
      --assignment-id "$ASSIGNMENT_ID" --nonce "$NONCE_AUTHOR" \
      --from-role "$COORDINATOR_ROLE" --from-id "$TRUNK_COORDINATOR_ID" \
      --target-role "Change Author" --target-id "$CHANGE_AUTHOR_ID" --target-session "$CHANGE_AUTHOR_SESSION" \
      --summary "Flowmap 02 $CYCLE_SUFFIX Change Author branch assignment" \
      --class-b-latest "$LATEST_CLASS_B_CONTEXT" \
      --related-class-b "$AUTHOR_WORK_ORDER_CLASSB_REL" --source-context-class B --source-context-path "$AUTHOR_WORK_ORDER_CLASSB_REL" \
      --codebase-repo "$CODEBASE_REPO" --trunk-branch "$TRUNK_BRANCH" --change-branch "$CHANGE_BRANCH" --short-name "$SHORT_NAME" \
      --declared-file "CODEBASE_REPO:$CODEBASE_REPO" --declared-file "TRUNK_BRANCH:$TRUNK_BRANCH" --declared-file "CHANGE_BRANCH:$CHANGE_BRANCH" \
      || fail "6 author dispatch render" "BROKEN_DISPATCH_RENDER" "author dispatch render failed" "Inspect recordDispatch/renderDispatchPacket/exportMarkdown."
  [ -f "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL" ] || fail "6 author dispatch render" "MISSING_DISPATCH_PACKET" "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL" "Inspect D_trace dispatch packet creation."
  record_diag "6" "OBSERVED" "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL" "Packet contains fixed envelope input and context export headline." "Continue."
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
      capture_session "$step timeout session capture" "$session_name" "$agent_id" || true
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
  REVIEW_MESSAGE_FILE=""
  record_diag "13" "SKIPPED" "$AUTHOR_CLASSB_FILE_REL" "No Class C reviewer message is generated; review assignment is selected by target role and current context picture." "Render reviewer dispatch from committed Class B context."
}
render_reviewer_dispatch() {
  REVIEWER_PACKET_REL=".strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/$REVIEWER_ID/$NONCE_REVIEW/dispatch_packet.md"
  run_json "14 review dispatch render" "$RUN_ROOT/${CYCLE_SUFFIX}_review_dispatch_render.json" "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-dispatch-render" \
    --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --nonce "$NONCE_REVIEW" \
    --from-role "$COORDINATOR_ROLE" --from-id "$TRUNK_COORDINATOR_ID" \
    --target-role "Code Reviewer / QC Engineer" --target-id "$REVIEWER_ID" --target-session "$REVIEWER_SESSION" \
    --summary "Flowmap 02 $CYCLE_SUFFIX code review request" \
    --class-b-latest "$LATEST_CLASS_B_CONTEXT" \
    --related-class-b "$AUTHOR_CLASSB_FILE_REL" --source-context-class B --source-context-path "$AUTHOR_CLASSB_FILE_REL" \
    --codebase-repo "$CODEBASE_REPO" --trunk-branch "$TRUNK_BRANCH" --change-branch "$CHANGE_BRANCH" --short-name "$SHORT_NAME" \
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
    if printf '%s' "$text" | grep -Eq 'outcome:[[:space:]]*approved|\bapproved\b|\bapprove\b|\baccepted\b|\baccept\b|merge[[:space:]-]+recommended'; then REVIEW_RESULT="approved"; elif printf '%s' "$text" | grep -Eq 'outcome:[[:space:]]*rejected|\brejected\b|\breject\b'; then REVIEW_RESULT="rejected"; elif printf '%s' "$text" | grep -Eq 'outcome:[[:space:]]*suspended|\bsuspended\b'; then REVIEW_RESULT="suspended"; elif printf '%s' "$text" | grep -Eq 'outcome:[[:space:]]*needs_rework|needs[[:space:]-]+rework|revision[[:space:]-]+requested|needs[[:space:]-]+revision'; then REVIEW_RESULT="needs_rework"; elif printf '%s' "$text" | grep -Eq 'outcome:[[:space:]]*issue_found|issue[[:space:]-]+found'; then REVIEW_RESULT="issue_found"; else REVIEW_RESULT="needs_rework"; fi
  fi
  case "$REVIEW_RESULT" in approved|approve|accepted|accept) REVIEW_RESULT="approved" ;; rejected|reject) REVIEW_RESULT="rejected" ;; suspended) REVIEW_RESULT="suspended" ;; needs_rework) REVIEW_RESULT="needs_rework" ;; issue_found) REVIEW_RESULT="issue_found" ;; *) REVIEW_RESULT="needs_rework" ;; esac
  record_diag "17.review_result" "OBSERVED" "$REVIEW_RESULT" "Reviewer outcome recorded; only approved gates CI and merge. Cycle continues to coordinator regardless." "Continue."
}



record_final_outcome() {
  local before after status_word
  before="$(current_class_b_revision)"
  if [ "$REVIEW_RESULT" = "approved" ]; then status_word="approved"; else status_word="reviewed"; fi
  run_json "19 final outcome classb put" "$RUN_ROOT/${CYCLE_SUFFIX}_final_outcome_classb_put.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" classb put \
    --id "B_${ASSIGNMENT_ID}_${CYCLE_SUFFIX}_MERGE_OUTCOME" --title "$ASSIGNMENT_ID $CYCLE_SUFFIX $status_word outcome" --assignment-id "$ASSIGNMENT_ID" --agent-id "$TRUNK_COORDINATOR_ID" --role "$COORDINATOR_ROLE" --scope "review_outcome" \
    --summary "Cycle $CYCLE_SUFFIX reviewer outcome: $REVIEW_RESULT; final integration outcome: $status_word." \
    --progress-delta "Flowmap 02 routed delegated coordinator intent through disposable author and reviewer sessions for $CYCLE_SUFFIX." \
    --trunk-integration "Codebase repo: $CODEBASE_REPO; trunk: $TRUNK_BRANCH; branch: $CHANGE_BRANCH. Branch lifecycle is owned by the agents, not the harness." \
    --verification "Reviewer return classified. Review result: $REVIEW_RESULT." \
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
  if [ "$PAUSE_BEFORE_RETIRE" -eq 1 ]; then echo; echo "PAUSE_BEFORE_RETIRE=1 (legacy flag)"; echo "Inspect sessions now, then press Enter to record logical release. No runtime session will be killed."; read -r _; fi
  local env_args
  env_args=(env "SCTL_RUNTIME_DELEGATE_ROOT=$SCTL_RUNTIME_DELEGATE_ROOT" "SCTL_RUNTIME_DELEGATE_BIN=$SCTL_RUNTIME_DELEGATE_BIN")
  run_json "20 retire change author" "$RUN_ROOT/${CYCLE_SUFFIX}_retire_change_author.json" "${env_args[@]}" \
    "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-retire" --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --id "$CHANGE_AUTHOR_ID" --session "$CHANGE_AUTHOR_SESSION" --status released --reason "Flowmap 02 $CYCLE_SUFFIX Change Author cycle completed; runtime left alive" \
    || fail "20 retire change author" "BROKEN_RETIRE_AUTHOR" "$CHANGE_AUTHOR_ID" "Inspect SCTL session metadata and adapter lifecycle release."
  run_json "20 retire reviewer" "$RUN_ROOT/${CYCLE_SUFFIX}_retire_reviewer.json" "${env_args[@]}" \
    "$PACKAGE_ROOT/scripts/wsl_tmux/sctl-session-retire" --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --id "$REVIEWER_ID" --session "$REVIEWER_SESSION" --status released --reason "Flowmap 02 $CYCLE_SUFFIX review cycle completed; runtime left alive" \
    || fail "20 retire reviewer" "BROKEN_RETIRE_REVIEWER" "$REVIEWER_ID" "Inspect SCTL session metadata and adapter lifecycle release."
  record_diag "20" "OBSERVED" "disposable sessions logically retired" "Author and reviewer lifecycle closure was recorded through SCTL. Runtime sessions remain alive unless explicit operator cleanup is requested." "Continue."
}

inject_initial_coordinator_dispatch() {
  local packet
  packet="$(json_get "$CYCLE_ENTRY_JSON" result.coordinator_dispatch.outbox.packetMdPath 2>/dev/null || printf '')"
  [ -n "$packet" ] || fail "2 coordinator dispatch locate" "MISSING_COORDINATOR_DISPATCH_PACKET" "$CYCLE_ENTRY_JSON" "cycle start must return coordinator_dispatch.outbox.packetMdPath."
  [ -f "$packet" ] || fail "2 coordinator dispatch locate" "MISSING_COORDINATOR_DISPATCH_PACKET" "$packet" "Inspect cycle start dispatch record."
  inject_packet "2 coordinator dispatch inject" "$TRUNK_COORDINATOR_SESSION" "$packet" "$TRUNK_COORDINATOR_ID"
  record_diag "2.coordinator_dispatch" "OBSERVED" "$TRUNK_COORDINATOR_SESSION injected $packet" "Initial Coordinator received the Director/Class A context envelope; author dispatch must wait for Coordinator-authored Class B work order." "Wait for Coordinator submission."
}

render_and_inject_recurring_coordinator_dispatch() {
  local nonce packet_rel source_rel
  nonce="N_COORD_${CYCLE_SUFFIX}_NEXT"
  packet_rel=".strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/$TRUNK_COORDINATOR_ID/$nonce/dispatch_packet.md"
  source_rel=""
  if [ -n "$FINAL_CLASSB_FILE" ] && [ -f "$FINAL_CLASSB_FILE" ]; then
    source_rel="$(python3 -c 'import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))' "$FINAL_CLASSB_FILE" "$SCTL_WORKSPACE")"
  elif [ -n "$AUTHOR_CLASSB_FILE_REL" ]; then
    source_rel="$AUTHOR_CLASSB_FILE_REL"
  fi
  local args
  args=("$PACKAGE_ROOT/scripts/wsl_tmux/sctl-dispatch-render"
    --workspace "$SCTL_WORKSPACE" --assignment-id "$ASSIGNMENT_ID" --nonce "$nonce"
    --from-role "SCTL Context Commit Trigger" --from-id "sctl_context_git"
    --target-role "$COORDINATOR_ROLE" --target-id "$TRUNK_COORDINATOR_ID" --target-session "$TRUNK_COORDINATOR_SESSION"
    --dispatch-kind "CLASS_B_CONTEXT_COMMIT" --class-b-latest "$LATEST_CLASS_B_CONTEXT"
    --template-path "templates/work_products/coordinator_work_order.template.md")
  if [ -n "$source_rel" ]; then
    args+=(--related-class-b "$source_rel" --source-context-class B --source-context-path "$source_rel")
  fi
  run_json "21 coordinator dispatch render" "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_dispatch_render.json" "${args[@]}" \
    || fail "21 coordinator dispatch render" "BROKEN_COORDINATOR_DISPATCH_RENDER" "$packet_rel" "Inspect canonical envelope render."
  [ -f "$SCTL_WORKSPACE/$packet_rel" ] || fail "21 coordinator dispatch render" "MISSING_COORDINATOR_DISPATCH_PACKET" "$SCTL_WORKSPACE/$packet_rel" "Inspect D_trace dispatch packet creation."
  inject_packet "21 coordinator dispatch inject" "$TRUNK_COORDINATOR_SESSION" "$SCTL_WORKSPACE/$packet_rel" "$TRUNK_COORDINATOR_ID"
  record_diag "21.coordinator_dispatch" "OBSERVED" "$TRUNK_COORDINATOR_SESSION injected $packet_rel" "Recurring Coordinator received Class B context envelope for next task-order decision." "Continue or end run."
}

coordinator_context_export() {
  local cycle="$1" label="$2" out_dir json_out
  out_dir="$RUN_ROOT/context_exports/$cycle/$label"
  json_out="$RUN_ROOT/context_exports/$cycle/${label}_export.json"
  mkdir -p "$out_dir" "$(dirname "$json_out")"
  run_json "21 coordinator context latest2 $cycle/$label" "$json_out"     node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" context export-markdown       --include-classes A,B --class-b-latest "$LATEST_CLASS_B_CONTEXT" --out "$out_dir"     || fail "21 coordinator context latest2" "BROKEN_COORDINATOR_EXPORT" "$out_dir" "Inspect context export."
  record_diag "21" "OBSERVED" "latest_${LATEST_CLASS_B_CONTEXT} Class B export: $out_dir/context.md" "Coordinator refresh uses fixed latest-two Class B policy rather than expanding delta history." "Continue."
}

coordinator_freshness() {
  coordinator_context_export "$CYCLE_LABEL" "coordinator_refresh_latest2"
}

coordinator_cycle_complete() {
  run_json "21 coordinator cycle complete" "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_cycle_complete.json"     node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" coordinator cycle-complete       --assignment-id "$ASSIGNMENT_ID" --coordinator-id "$TRUNK_COORDINATOR_ID" --cycle-id "$CYCLE_ENTRY_ID"     || fail "21 coordinator cycle complete" "BROKEN_COORDINATOR_CYCLE_COUNT" "$CYCLE_ENTRY_ID" "Inspect coordinator lifecycle state."
}

rotate_coordinator_if_due() {
  local cycle="$1" required="false"
  required="$(json_get "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_cycle_complete.json" result.recreation_required 2>/dev/null || printf 'false')"
  if [ "$required" != "true" ] || [ "$cycle" -ge "$CYCLE_COUNT" ]; then
    record_diag "21.coordinator_rotate" "OBSERVED" "recreation_required=$required cycle=$cycle" "Coordinator recreation is cycle-count driven; no recreation needed before next coordinator work." "Continue."
    return 0
  fi
  local old_coordinator_id old_runtime_session next_generation next_session_name
  old_coordinator_id="$TRUNK_COORDINATOR_ID"
  old_runtime_session="$TRUNK_COORDINATOR_SESSION"
  next_generation=$((cycle / COORDINATOR_RETIRE_EVERY + 1))
  run_json "21 SCTL release coordinator" "$RUN_ROOT/${CYCLE_SUFFIX}_sctl_release_coordinator.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" sessions release --assignment-id "$ASSIGNMENT_ID" --id "$old_coordinator_id" --status superseded --reason "Coordinator reached $COORDINATOR_RETIRE_EVERY completed cycles; runtime session left alive: $old_runtime_session" || fail "21 SCTL release coordinator" "BROKEN_SCTL_RELEASE_COORDINATOR" "$old_coordinator_id" "Inspect SCTL session metadata."
  TRUNK_COORDINATOR_ID="delegated_coordinator_r$(printf '%02d' "$next_generation")"
  next_session_name="STRATA-COORDINATOR-${ASSIGNMENT_ID}-R$(printf '%02d' "$next_generation")"
  TRUNK_COORDINATOR_SESSION="$next_session_name"
  register_session "21 recreate coordinator" "$ASSIGNMENT_ID" "$COORDINATOR_ROLE" "$TRUNK_COORDINATOR_ID" "$TRUNK_COORDINATOR_SESSION" "long_running" "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_recreate_session.json" 0
  align_session_name "21" "$TRUNK_COORDINATOR_SESSION"
  run_json "21 coordinator recreate record" "$RUN_ROOT/${CYCLE_SUFFIX}_coordinator_recreate_record.json" node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" coordinator recreate-record --assignment-id "$ASSIGNMENT_ID" --coordinator-id "$TRUNK_COORDINATOR_ID"     || fail "21 coordinator recreate record" "BROKEN_COORDINATOR_RECREATE_RECORD" "$TRUNK_COORDINATOR_ID" "Inspect coordinator lifecycle record."
  coordinator_context_export "$CYCLE_LABEL" "coordinator_recreated_latest2"
  record_diag "21.coordinator_rotate" "OBSERVED" "coordinator recreated after $COORDINATOR_RETIRE_EVERY completed cycles" "New coordinator session received Class A plus latest $LATEST_CLASS_B_CONTEXT Class B reports." "Continue."
}

final_audit() {
  run_capture "22 final sctl git status" "$RUN_ROOT/final_sctl_git_status.txt" git -C "$SCTL_WORKSPACE/.strata/context" status --short || fail "22 final sctl git status" "BROKEN_SCTL_GIT_STATUS" ".strata/context" "Inspect SCTL context Git."
  run_capture "22 final sctl git log" "$RUN_ROOT/final_sctl_git_log.txt" git -C "$SCTL_WORKSPACE/.strata/context" log --oneline -30 || fail "22 final sctl git log" "BROKEN_SCTL_GIT_LOG" ".strata/context" "Inspect SCTL context Git log."
  run_capture "22 final dispatch files" "$RUN_ROOT/final_dispatch_files.txt" find "$SCTL_WORKSPACE/.strata/context/D_trace/dispatch_packets" -maxdepth 5 -type f || true
  run_capture "22 final return ledgers" "$RUN_ROOT/final_return_ledgers.txt" find "$SCTL_WORKSPACE/.strata/context/D_trace/return_ledgers" -type f || true
  run_capture "22 final classb files" "$RUN_ROOT/final_classb_files.txt" find "$SCTL_WORKSPACE/.strata/context/B" -type f || true
  local sctl_status
  sctl_status="$(cat "$RUN_ROOT/final_sctl_git_status.txt" 2>/dev/null || true)"
  if [ -n "$sctl_status" ]; then fail "22 final sctl git status" "BROKEN_SCTL_GIT_DIRTY" "$sctl_status" "Inspect uncommitted SCTL context Git changes."; fi
  record_diag "22" "OBSERVED" "status clean" "SCTL context Git is clean and log contains cycle commits." "Complete."
  record_operational_stage "final_audit" "OBSERVED" "status clean" "SCTL context Git is clean and log contains cycle commits." "Complete."
}

main() {
  parse_args "$@"
  validate_config
  init_run_root
  load_director_entry
  validate_director_entry
  bind_director_entry_to_bootstrap_context
  preflight
  bootstrap_context
  start_manual_cycle_entry
  call_sctl_git_panel_startpoint

  run_start_artifact_freshness

  register_session "1 session new delegated coordinator" "$ASSIGNMENT_ID" "$COORDINATOR_ROLE" "$TRUNK_COORDINATOR_ID" "$TRUNK_COORDINATOR_SESSION" "long_running" "$RUN_ROOT/session_new_delegated_coordinator.json" 1
  align_session_name "1" "$TRUNK_COORDINATOR_SESSION"
  record_diag "1" "OBSERVED" "$TRUNK_COORDINATOR_ID registered" "Persistent Delegated Coordinator was recorded in SCTL Git through the adapter boundary." "Continue."
  record_operational_stage "register_align_coordinator_session" "OBSERVED" "$TRUNK_COORDINATOR_ID -> $TRUNK_COORDINATOR_SESSION" "Coordinator logical session was registered and aligned through the runtime delegate adapter boundary." "Export context."

  inject_initial_coordinator_dispatch
  coordinator_context_export "cycle_00" "coordinator_initial_latest2"
  record_diag "2" "OBSERVED" "initial coordinator envelope plus latest_${LATEST_CLASS_B_CONTEXT} context" "Coordinator starts from Class A plus recent Class B reports, not unbounded history." "Continue."

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
    record_operational_stage "export_context" "OBSERVED" "$RUN_ROOT/context_exports/$CYCLE_LABEL/coordinator_before/context.md" "Coordinator-before context export is available for this cycle." "Register Change Author session."

    register_session "4 session new change author" "$ASSIGNMENT_ID" "Change Author" "$CHANGE_AUTHOR_ID" "$CHANGE_AUTHOR_SESSION" "disposable" "$RUN_ROOT/${CYCLE_SUFFIX}_session_new_change_author.json" 0
    align_session_name "4" "$CHANGE_AUTHOR_SESSION"
    record_diag "4" "OBSERVED" "$CHANGE_AUTHOR_ID active disposable" "Fresh Change Author session for $CYCLE_SUFFIX was recorded in SCTL Git through the adapter boundary." "Continue."
    record_operational_stage "register_align_author_session" "OBSERVED" "$CHANGE_AUTHOR_ID -> $CHANGE_AUTHOR_SESSION" "Change Author session was registered and aligned through the runtime delegate adapter boundary." "Render dispatch."

    write_author_work_order
    send_author_message
    render_author_dispatch
    record_operational_stage "render_dispatch" "OBSERVED" "$SCTL_WORKSPACE/$AUTHOR_PACKET_REL" "Change Author dispatch packet was rendered from committed context." "Inject packet."
    export_full_context "$CYCLE_LABEL" "author_dispatch"
    inject_packet "7 author dispatch inject" "$CHANGE_AUTHOR_SESSION" "$AUTHOR_PACKET_REL" "$CHANGE_AUTHOR_ID"
    record_diag "7" "OBSERVED" "$CHANGE_AUTHOR_SESSION injected" "Change Author packet was injected through adapter using Git-backed packet path." "Continue."
    record_operational_stage "inject_packet" "OBSERVED" "$CHANGE_AUTHOR_SESSION injected" "Change Author packet was injected through the adapter using a Git-backed packet path." "Wait for return."
    capture_session "8 author session capture" "$CHANGE_AUTHOR_SESSION" "$CHANGE_AUTHOR_ID" || true
    record_diag "8" "OBSERVED" "$CHANGE_AUTHOR_SESSION capture attempted" "Author session capture evidence was requested." "Continue."
    wait_for_return "9" "$CHANGE_AUTHOR_ID" "$CHANGE_AUTHOR_SESSION"
    record_operational_stage "wait_for_return" "OBSERVED" "$CHANGE_AUTHOR_ID return packet present" "Change Author return packet and operational report appeared without harness simulation." "Classify return."
    classify_return "10 classify author return" "$CHANGE_AUTHOR_ID" "$RUN_ROOT/${CYCLE_SUFFIX}_author_classify.json"
    record_operational_stage "classify_return" "OBSERVED" "$RUN_ROOT/${CYCLE_SUFFIX}_author_classify.json" "Change Author return was classified and ledgered." "Commit author report to Class B."
    commit_author_report_to_classb
    record_operational_stage "commit_author_report_class_b" "OBSERVED" "$AUTHOR_CLASSB_FILE_REL" "Author operational report was accepted into Class B." "Register reviewer session."

    register_session "12 session new reviewer" "$ASSIGNMENT_ID" "Code Reviewer / QC Engineer" "$REVIEWER_ID" "$REVIEWER_SESSION" "disposable" "$RUN_ROOT/${CYCLE_SUFFIX}_session_new_reviewer.json" 0
    align_session_name "12" "$REVIEWER_SESSION"
    record_diag "12" "OBSERVED" "$REVIEWER_ID active disposable" "Fresh reviewer session for $CYCLE_SUFFIX was recorded in SCTL Git through the adapter boundary." "Continue."
    record_operational_stage "register_align_reviewer_session" "OBSERVED" "$REVIEWER_ID -> $REVIEWER_SESSION" "Reviewer session was registered and aligned through the runtime delegate adapter boundary." "Infer review result after reviewer return."

    write_reviewer_work_order "$AUTHOR_CLASSB_FILE_REL"
    send_reviewer_message
    render_reviewer_dispatch
    export_full_context "$CYCLE_LABEL" "reviewer_dispatch"
    inject_packet "15 reviewer dispatch inject" "$REVIEWER_SESSION" "$REVIEWER_PACKET_REL" "$REVIEWER_ID"
    record_diag "15" "OBSERVED" "$REVIEWER_SESSION injected" "Reviewer packet was injected through adapter." "Continue."
    capture_session "16 reviewer session capture" "$REVIEWER_SESSION" "$REVIEWER_ID" || true
    record_diag "16" "OBSERVED" "$REVIEWER_SESSION capture attempted" "Reviewer session capture evidence was requested." "Continue."
    wait_for_return "17" "$REVIEWER_ID" "$REVIEWER_SESSION"
    classify_return "17 classify reviewer return" "$REVIEWER_ID" "$RUN_ROOT/${CYCLE_SUFFIX}_reviewer_classify.json"
    infer_review_result
    record_operational_stage "infer_review_result" "OBSERVED" "$REVIEW_RESULT" "Reviewer recommendation is available for the final outcome." "Commit final outcome."

    record_final_outcome
    record_operational_stage "commit_final_outcome" "OBSERVED" "$FINAL_CLASSB_FILE" "Final cycle outcome was committed to Class B." "Retire disposable sessions."
    retire_disposable_sessions
    record_operational_stage "retire_disposable_sessions" "OBSERVED" "$CHANGE_AUTHOR_ID and $REVIEWER_ID released" "Disposable logical sessions were released without killing runtime sessions." "Refresh coordinator context."
    coordinator_freshness
    record_operational_stage "refresh_coordinator_context" "OBSERVED" "latest_${LATEST_CLASS_B_CONTEXT} Class B export refreshed" "Coordinator refresh uses fixed latest Class B policy." "Export context after cycle."
    export_full_context "$CYCLE_LABEL" "coordinator_after"
    record_operational_stage "export_context_after" "OBSERVED" "$RUN_ROOT/context_exports/$CYCLE_LABEL/coordinator_after/context.md" "Coordinator-after context export is available for audit." "Append timeline."
    append_cycle_timeline
    record_operational_stage "append_timeline" "OBSERVED" "$TIMELINE row appended for $CYCLE_LABEL" "Cycle summary timeline captures branch, commits, review, Class B, and context export pointers." "Continue."
    cycle_end_artifact_freshness
    coordinator_cycle_complete
   rotate_coordinator_if_due "$cycle"
   render_and_inject_recurring_coordinator_dispatch
   echo "===== END $CYCLE_LABEL ====="
  done
  CYCLE_DIAG_PREFIX=""
  final_audit

  FINAL_STATUS="OBSERVED"
  finish_report "$FINAL_STATUS"
}

main "$@"
