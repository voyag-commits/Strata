#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_ROOT="${PACKAGE_ROOT:-/home/strata/workspace/strata-director-entry-delegate-alignment/Strata}"
LIVE_ROOT="${STRATA_LIVE_ROOT:-/home/strata/strata-live-run}"
SCTL_WORKSPACE="${SCTL_WORKSPACE:-$LIVE_ROOT/sctl-workspace}"
CODEBASE_REPO="${CODEBASE_REPO:-$LIVE_ROOT/codebase}"
DIRECTOR_ENTRY_SOURCE="${DIRECTOR_ENTRY_SOURCE:-$LIVE_ROOT/director_entry/director_governing_entry.md}"
SCTL_RUNTIME_DELEGATE_ROOT="${SCTL_RUNTIME_DELEGATE_ROOT:-$LIVE_ROOT/runtime-delegate}"
SCTL_RUNTIME_DELEGATE_BIN="${SCTL_RUNTIME_DELEGATE_BIN:-$SCTL_RUNTIME_DELEGATE_ROOT/dist/src/cli.js}"
SCTL_RUNTIME_LAUNCH_CONFIG="${SCTL_RUNTIME_LAUNCH_CONFIG:-$LIVE_ROOT/launcher_delegate.local.json}"
ASSIGNMENT_ID="${ASSIGNMENT_ID:-A_DELEGATE_ALIGNMENT_LOCAL_001}"
SHORT_NAME="${SHORT_NAME:-director-entry-delegate-alignment}"
CYCLES="${CYCLES:-1}"
RETURN_TIMEOUT="${RETURN_TIMEOUT:-360}"
POLL_INTERVAL="${POLL_INTERVAL:-5}"
PASTE_DELAY="${PASTE_DELAY:-20}"
VALIDATION_COMMAND="${VALIDATION_COMMAND:-git status --short}"
ALLOW_MERGE="${ALLOW_MERGE:-0}"

missing=0

require_file() {
  local label="$1" file="$2"
  if [ ! -f "$file" ]; then
    printf 'missing %s: %s\n' "$label" "$file" >&2
    missing=1
  fi
}

require_dir() {
  local label="$1" dir="$2"
  if [ ! -d "$dir" ]; then
    printf 'missing %s: %s\n' "$label" "$dir" >&2
    missing=1
  fi
}

mkdir -p "$SCTL_WORKSPACE" "$(dirname "$DIRECTOR_ENTRY_SOURCE")" "$LIVE_ROOT"

require_file "harness" "$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh"
require_file "Director Entry source" "$DIRECTOR_ENTRY_SOURCE"
require_file "runtime launch config" "$SCTL_RUNTIME_LAUNCH_CONFIG"
require_dir "Codebase Git repo" "$CODEBASE_REPO/.git"

if [ ! -f "$SCTL_RUNTIME_DELEGATE_BIN" ] && ! command -v "$SCTL_RUNTIME_DELEGATE_BIN" >/dev/null 2>&1; then
  printf 'missing runtime delegate binary: %s\n' "$SCTL_RUNTIME_DELEGATE_BIN" >&2
  printf 'set SCTL_RUNTIME_DELEGATE_ROOT or SCTL_RUNTIME_DELEGATE_BIN before running the live cycle\n' >&2
  missing=1
fi

if [ "$missing" -ne 0 ]; then
  printf '\nLocal paths are recorded in docs/LOCAL_WSL_RUNBOOK_20260627.md\n' >&2
  exit 2
fi

args=(
  "$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh"
  --assignment-id "$ASSIGNMENT_ID"
  --package-root "$PACKAGE_ROOT"
  --runtime-delegate-root "$SCTL_RUNTIME_DELEGATE_ROOT"
  --runtime-delegate-bin "$SCTL_RUNTIME_DELEGATE_BIN"
  --runtime-launch-config "$SCTL_RUNTIME_LAUNCH_CONFIG"
  --sctl-workspace "$SCTL_WORKSPACE"
  --codebase-repo "$CODEBASE_REPO"
  --director-entry-source "$DIRECTOR_ENTRY_SOURCE"
  --short-name "$SHORT_NAME"
  --cycles "$CYCLES"
  --return-timeout "$RETURN_TIMEOUT"
  --poll-interval "$POLL_INTERVAL"
  --paste-delay "$PASTE_DELAY"
  --validation-command "$VALIDATION_COMMAND"
)

if [ "$ALLOW_MERGE" = "1" ]; then
  args+=(--allow-merge)
fi

exec "${args[@]}"
