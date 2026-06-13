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

runtime_edge_cli() {
  if [ -n "${SCTL_RUNTIME_EDGE_ROOT:-}" ]; then
    "$SCTL_NODE" "$SCTL_RUNTIME_EDGE_ROOT/dist/src/cli.js" "$@"
  elif [ -n "${SCTL_RUNTIME_EDGE_CLI:-}" ]; then
    "$SCTL_RUNTIME_EDGE_CLI" "$@"
  else
    return 127
  fi
}

json_line() {
  printf '%s\n' "$1"
}
