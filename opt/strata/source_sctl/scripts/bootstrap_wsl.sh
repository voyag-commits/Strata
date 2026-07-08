#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$ROOT"

# shellcheck source=scripts/lib/require_linux.sh
source "$ROOT/scripts/lib/require_linux.sh"
sctl_require_linux_execution_environment "SCTL bootstrap"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$HOME/.nvm/nvm.sh"
fi

echo "== Strata WSL bootstrap =="
echo "root: $ROOT"

command -v git >/dev/null 2>&1 || { echo "missing required command: git" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "missing required command: node >= 22" >&2; exit 2; }
command -v npm >/dev/null 2>&1 || { echo "missing required command: npm" >&2; exit 2; }
command -v bash >/dev/null 2>&1 || { echo "missing required command: bash" >&2; exit 2; }

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$node_major" -lt 22 ]; then
  echo "node >= 22 required; found $(node -v)" >&2
  exit 2
fi

echo "node: $(node -v) ($(command -v node))"
echo "npm: $(npm -v) ($(command -v npm))"

echo
echo "== npm test =="
npm test

echo
echo "== secret scan =="
npm run secret-scan

echo
echo "== shell syntax =="
for script in scripts/wsl_tmux/sctl-* scripts/lib/*.sh flowmaps/flowmap02/*.sh; do
  [ -f "$script" ] || continue
  bash -n "$script"
  echo "bash -n ok: $script"
done

echo
echo "== package checksums =="
if [ -f PACKAGE_CHECKSUMS.sha256 ]; then
  sha256sum -c PACKAGE_CHECKSUMS.sha256
else
  echo "PACKAGE_CHECKSUMS.sha256 missing" >&2
  exit 2
fi

echo
echo "bootstrap complete"
