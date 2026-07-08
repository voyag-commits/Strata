#!/usr/bin/env bash
set -euo pipefail

source /etc/profile.d/strata-appliance.sh 2>/dev/null || true

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "OK: $*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
  pass "command $1"
}

need_cmd node
need_cmd npm
need_cmd tmux
need_cmd git
need_cmd curl
need_cmd python3
need_cmd sctl
need_cmd strata-appliance
need_cmd strata-cycle

if ! command -v codex >/dev/null 2>&1; then
  fail "codex is not installed in the WSL distro"
fi
pass "codex command present: $(command -v codex)"

[ -f "$STRATA_PACKAGE_ROOT/src/cli.js" ] || fail "missing SCTL package root"
[ -f "$SCTL_RUNTIME_DELEGATE_BIN" ] || fail "missing delegate bin"
[ -f "$SCTL_RUNTIME_LAUNCH_CONFIG" ] || fail "missing launcher config"
[ -f "$STRATA_CODEX_BRIDGE_DIR/dist/src/index.js" ] || fail "missing bridge dist entry"
pass "appliance files"

env -u STRATA_WORKSPACE -u SCTL_WORKSPACE -u CODEBASE_REPO \
  node "$STRATA_PACKAGE_ROOT/src/cli.js" doctor --workspace "$STRATA_WORKSPACE" >/tmp/strata_appliance_sctl_doctor.json
pass "sctl doctor"

node "$SCTL_RUNTIME_DELEGATE_BIN" provider doctor --config "$SCTL_RUNTIME_LAUNCH_CONFIG" --workspace "$STRATA_WORKSPACE" --skip-healthcheck >/tmp/strata_appliance_provider_doctor.json
pass "delegate provider config"

"$STRATA_CODEX_LAUNCHER" --bridge-config >/tmp/strata_appliance_bridge_config.txt
grep -q '^thinking_budget=12000$' /tmp/strata_appliance_bridge_config.txt || fail "bridge thinking budget is not default 12000"
pass "bridge config defaults"

"$STRATA_CODEX_LAUNCHER" --bridge-healthcheck >/tmp/strata_appliance_bridge_health.txt
pass "bridge health"

strata-appliance start-api >/tmp/strata_appliance_api_start.txt
curl -fsS --noproxy "localhost,127.0.0.1,::1" "http://127.0.0.1:${STRATA_APPLIANCE_API_PORT}/health" >/tmp/strata_appliance_api_health.json
grep -q '"bound_host": "127.0.0.1"' /tmp/strata_appliance_api_health.json || fail "API is not reporting localhost binding"
pass "local API health"

echo "Strata appliance verification passed."
