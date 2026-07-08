#!/usr/bin/env bash
set -euo pipefail

adapter_dir() {
  local src="${BASH_SOURCE[0]}"
  while [ -h "$src" ]; do
    local dir
    dir="$(cd -P "$(dirname "$src")" >/dev/null 2>&1 && pwd)"
    src="$(readlink "$src")"
    [[ "$src" != /* ]] && src="$dir/$src"
  done
  cd -P "$(dirname "$src")" >/dev/null 2>&1 && pwd
}

SCTL_ADAPTER_DIR="${SCTL_ADAPTER_DIR:-$(adapter_dir)}"
SCTL_ROOT="${SCTL_ROOT:-$(cd "$SCTL_ADAPTER_DIR/../.." >/dev/null 2>&1 && pwd)}"
SCTL_NODE="${SCTL_NODE:-node}"
SCTL_CLI="${SCTL_CLI:-$SCTL_ROOT/src/cli.js}"
SCTL_WORKSPACE="${SCTL_WORKSPACE:-$(pwd)}"
SCTL_RUNTIME_DELEGATE_ROOT="${SCTL_RUNTIME_DELEGATE_ROOT:-}"
SCTL_RUNTIME_DELEGATE_BIN="${SCTL_RUNTIME_DELEGATE_BIN:-}"

if [ -z "$SCTL_RUNTIME_DELEGATE_ROOT" ] && [ -n "${SCTL_RUNTIME_EDGE_ROOT:-}" ]; then
  SCTL_RUNTIME_DELEGATE_ROOT="$SCTL_RUNTIME_EDGE_ROOT"
  echo "warning: SCTL_RUNTIME_EDGE_ROOT is deprecated; use SCTL_RUNTIME_DELEGATE_ROOT" >&2
fi
if [ -z "$SCTL_RUNTIME_DELEGATE_BIN" ] && [ -n "${SCTL_RUNTIME_EDGE_CLI:-}" ]; then
  SCTL_RUNTIME_DELEGATE_BIN="$SCTL_RUNTIME_EDGE_CLI"
  echo "warning: SCTL_RUNTIME_EDGE_CLI is deprecated; use SCTL_RUNTIME_DELEGATE_BIN" >&2
fi
if [ -z "$SCTL_RUNTIME_DELEGATE_BIN" ] && [ -n "$SCTL_RUNTIME_DELEGATE_ROOT" ]; then
  SCTL_RUNTIME_DELEGATE_BIN="$SCTL_RUNTIME_DELEGATE_ROOT/dist/src/cli.js"
fi

# shellcheck source=../lib/require_linux.sh
source "$SCTL_ROOT/scripts/lib/require_linux.sh"
sctl_require_linux_execution_environment "SCTL runtime delegate adapter"

usage_error() {
  echo "error: $*" >&2
  exit 2
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || usage_error "required command not found: $1"
}

sctl() {
  "$SCTL_NODE" "$SCTL_CLI" --workspace "$SCTL_WORKSPACE" "$@"
}

require_runtime_delegate_bin() {
  [ -n "$SCTL_RUNTIME_DELEGATE_BIN" ] || usage_error "SCTL_RUNTIME_DELEGATE_BIN or SCTL_RUNTIME_DELEGATE_ROOT is required"
  [ -f "$SCTL_RUNTIME_DELEGATE_BIN" ] || command -v "$SCTL_RUNTIME_DELEGATE_BIN" >/dev/null 2>&1 || usage_error "runtime delegate binary not found: $SCTL_RUNTIME_DELEGATE_BIN"
}

delegate() {
  require_runtime_delegate_bin
  if [ -f "$SCTL_RUNTIME_DELEGATE_BIN" ]; then
    case "$SCTL_RUNTIME_DELEGATE_BIN" in
      *.js) "$SCTL_NODE" "$SCTL_RUNTIME_DELEGATE_BIN" delegate "$@" ;;
      *) "$SCTL_RUNTIME_DELEGATE_BIN" delegate "$@" ;;
    esac
  else
    "$SCTL_RUNTIME_DELEGATE_BIN" delegate "$@"
  fi
}

runtime_role_for_sctl() {
  local role_lc
  role_lc="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$role_lc" in
    *coord*) printf 'coordinator' ;;
    *change*author*|*author*) printf 'coder' ;;
    *review*|*qc*) printf 'reviewer' ;;
    *) printf '%s' "$1" ;;
  esac
}

json_get() {
  local file="$1" path_expr="$2"
  "$SCTL_NODE" -e '
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

json_line() {
  printf '%s\n' "$1"
}
