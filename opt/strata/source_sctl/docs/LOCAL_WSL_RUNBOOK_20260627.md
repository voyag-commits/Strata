# Local WSL Flowmap 02 Runbook - 2026-06-27

Purpose: keep the local Strata / SCTL delegate-alignment paths and run command in one durable place.

## Fixed Local Paths

Package root:

```text
/home/strata/workspace/strata-director-entry-delegate-alignment/Strata
```

Live run root:

```text
/home/strata/strata-live-run
```

SCTL workspace:

```text
/home/strata/strata-live-run/sctl-workspace
```

Codebase repo placeholder:

```text
/home/strata/strata-live-run/codebase
```

Director Entry source:

```text
/home/strata/strata-live-run/director_entry/director_governing_entry.md
```

Runtime delegate root placeholder:

```text
/home/strata/strata-live-run/runtime-delegate
```

Runtime delegate binary default:

```text
/home/strata/strata-live-run/runtime-delegate/dist/src/cli.js
```

Runtime launch config:

```text
/home/strata/strata-live-run/launcher_delegate.local.json
```

Bridge source:

```text
/home/strata/strata/bridge/bridge
```

Launcher:

```text
/home/strata/bin/strata-codex-local
```

Codex CLI copied for WSL execution:

```text
/home/strata/bin/codex
```

Codex DeepSeek profile:

```text
/home/strata/.codex/deepseek_bridge.config.toml
```

Bridge env file:

```text
/home/strata/strata/bridge/bridge/.env
```

## Current State

The WSL package bootstrap passes:

```bash
cd /home/strata/workspace/strata-director-entry-delegate-alignment/Strata
./scripts/bootstrap_wsl.sh
```

Validated on 2026-06-27:

```text
npm test: 35/35 passed
secret scan: clean
shell syntax: ok
package checksums: ok
```

Runtime delegate package from `runtime_clone_packages/delegate_exact_runtime_clone_20260626.tar.gz` has been copied into:

```text
/home/strata/strata-live-run/runtime-delegate
```

Delegate CLI smoke check passes:

```bash
node /home/strata/strata-live-run/runtime-delegate/dist/src/cli.js \
  delegate session-list \
  --workspace /home/strata/strata-live-run/sctl-workspace
```

Expected result:

```text
ok: true
operation: session_list
sessions: []
```

DeepSeek bridge setup package from WeChat has been unpacked into:

```text
/home/strata/strata-live-run/deepseek_bridge_setup_package
```

It contains launcher/profile/env-template files only. The full bridge source is still taken from runtime clone `payload/bridge`.

Local bridge source was installed and validated:

```bash
cd /home/strata/strata/bridge/bridge
npm ci
npm test
```

Validated on 2026-06-27:

```text
bridge npm test: 34/34 passed
bridge health: ok
model: deepseek-v4-pro
thinking: true
reasoning_effort: max
thinking_budget: 12000
```

Local launcher and provider config were validated:

```bash
/home/strata/bin/strata-codex-local --version
node /home/strata/strata-live-run/runtime-delegate/dist/src/cli.js \
  provider doctor \
  --workspace /home/strata/strata-live-run/sctl-workspace \
  --config /home/strata/strata-live-run/launcher_delegate.local.json
```

Expected result:

```text
strata-codex-local --version: codex-cli 0.142.3
provider doctor: ok true
```

Important: `/home/strata/strata/bridge/bridge/.env` now contains a local `DEEPSEEK_API_KEY` and generated `BRIDGE_AUTH_KEY`. Do not print this file and do not commit it.

DeepSeek bridge live call was validated:

```text
POST http://127.0.0.1:38441/v1/responses
model: deepseek-v4-pro
status: 200
assistant output: OK
```

Because the DeepSeek key was transmitted manually during setup, rotate it later if this environment will be used beyond local testing.

## Local Run Script

Use this wrapper for the local machine:

```bash
cd /home/strata/workspace/strata-director-entry-delegate-alignment/Strata
./flowmaps/flowmap02/run_local_delegate_alignment.sh
```

The wrapper is intentionally parameter-based. Override any path with env vars:

```bash
SCTL_RUNTIME_DELEGATE_ROOT=/absolute/path/to/runtime-delegate \
SCTL_RUNTIME_DELEGATE_BIN=/absolute/path/to/runtime-delegate/dist/src/cli.js \
CODEBASE_REPO=/absolute/path/to/real/codebase \
DIRECTOR_ENTRY_SOURCE=/absolute/path/to/director_governing_entry.md \
VALIDATION_COMMAND="npm test" \
ALLOW_MERGE=1 \
./flowmaps/flowmap02/run_local_delegate_alignment.sh
```

## Validation Command

`VALIDATION_COMMAND` means the command the harness runs inside the codebase repo after the Change Author returns and before merge.

Temporary local smoke default:

```bash
git status --short
```

Replace it with the real project check once known, for example:

```bash
npm test
pytest
python3 -m py_compile path/to/file.py
```

## Required Before Real Live Cycle

The real live cycle still needs:

```text
1. CODEBASE_REPO pointing to the real implementation Git repo.
2. DIRECTOR_ENTRY_SOURCE containing the actual Director Entry markdown if the starter template is insufficient.
3. VALIDATION_COMMAND replaced with the real project validation command if available.
4. ALLOW_MERGE=1 only when merge authority is confirmed.
5. Optional but recommended: rotate the DeepSeek key after local validation.
```

Note: the runtime clone package contains the delegate CLI we need, but its exact restore scripts are intentionally pinned to `/home/hou16`. Do not run `restore.sh` directly on this machine. Use the copied delegate root above and create local `/home/strata` launcher config instead.

## Expected Operational Stages

The harness now emits these stage labels in order:

```text
load_director_entry
validate_director_entry
bind_director_entry_to_bootstrap_context
bootstrap_context
register_align_coordinator_session
export_context
prepare_branch
register_align_author_session
render_dispatch
inject_packet
wait_for_return
classify_return
commit_author_report_class_b
register_align_reviewer_session
infer_review_result
run_ci
merge_if_authorized
commit_final_outcome
retire_disposable_sessions
refresh_coordinator_context
export_context_after
append_timeline
final_audit
```
