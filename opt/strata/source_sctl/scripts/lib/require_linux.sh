#!/usr/bin/env bash
# Shared guard for SCTL shell/runtime entry points.

sctl_require_linux_execution_environment() {
  local component="${1:-SCTL shell entrypoint}"
  local kernel
  kernel="$(uname -s 2>/dev/null || true)"
  if [ "$kernel" != "Linux" ]; then
    echo "error: $component must execute in a Linux environment; detected: ${kernel:-unknown}" >&2
    exit 2
  fi
  if [ ! -r /proc/version ]; then
    echo "error: $component requires a Linux /proc filesystem" >&2
    exit 2
  fi
}
