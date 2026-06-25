# SCTL & Runtime Delegate Control Surface Human Tester Playbook

**Target release:** SCTL `0.9.5-delegate-contract` + runtime delegate `1.0.0-adr0618`  
**Date:** 2026-06-25  
**Test mode:** live WSL/tmux, shell-harness-driven  
**Primary executor:** `Strata/flowmaps/flowmap02/live_cycle_harness.sh`  
**Result standard:** evidence-based operational diagnosis, not a bare `PASS` claim

---

## 0. Purpose

This playbook standardizes how a human tester operates and diagnoses the SCTL + runtime delegate control surface.

The tester does **not** manually replay the old Flowmap 02 sequence step by step. The shell harness now owns the deterministic operational rail. The human tester prepares pinned packages, live WSL/tmux sessions, a Director Governing Entry Markdown file, a clean codebase repo, and validation commands; then the tester runs the harness and audits the evidence it produces.

Acceptance means:

```text
correct command boundary
correct delegate/SCTL ownership split
correct evidence path
correct return path
correct Class A / Class B / D_trace commits
correct live WSL/tmux behavior
correct diagnosis when the run blocks or breaks
```

Acceptance does **not** mean:

```text
worker said it is done in chat
shell script exited without inspecting evidence
manual file edits made the cycle look complete
fixture/offline/dry-run result was treated as live Flowmap 02 evidence
```

---

## 1. Architectural anchors and precedence

Use the documents by release order when interpreting a disputed behavior.

| Order | Anchor | Scope | Tester rule |
|---:|---|---|---|
| 1 | `FLOWMAP_02_TRUNK_BASED_DISPOSABLE_WORKER_CYCLE.md` | Original live proof target and evidence vocabulary | Use it for the observed worker-cycle shape, status labels, and evidence logging discipline. |
| 2 | `ADR_06_16 SCTL Coordinator Cycle, Manual Entry, Context Feed, and Operational Trace Policy.md` | Coordinator lifecycle, Class B policy, live-test policy | Use it for cycle definition, coordinator recreation after four completed cycles, latest-two Class B context feed, and structural Class B auto-commit. |
| 3 | `ADR_06_18_simplification& dispatch envelope consolidation.md` | Latest bounded addendum | Use it as the latest authority for Director Governing Entry, canonical envelope, Coordinator boundary, commit-driven dispatch, and tester entry-point policy. |
| 4 | `Runtime Session Delegate Contract.md` | Delegate verb contract | Use it for the eight delegate verbs and machine-readable failure envelope. |
| 5 | `sctl_delegate_contract_alignment_report.md` | Package alignment result | Use it to confirm current SCTL package decisions after ADR_06_18. |

Conflict rule:

```text
ADR_06_18 overrides older material only in its bounded scope:
Director entry, dispatch envelope, Coordinator boundary, and tester entry point.
ADR_06_16 remains active for cycle lifecycle, Class B commit policy, coordinator persistence, and live-test policy.
FLOWMAP_02 remains active as the live proof target and evidence-reporting model.
```

---

## 2. Package pin

The tester must pin the exact package and source files before the run. Do not test from an ambiguous extracted folder.

### 2.1 Uploaded artifact pins

| Artifact | Expected SHA256 |
|---|---|
| `strata_sctl_delegate_contract_aligned_adr0618_v0_9_5(1).zip` | `8f5a3af8b270228c6263a2b2bd2e2166c1da2c3ba092b7ac447bea1fea84e6b0` |
| `strata_runtime_edge_delegate_control_surface_adr0618_wsl_ready(2).zip` | `9dd212a735fccb2ff522ddfa4e333bae10583b9fed79ec1b77648ad6607e058a` |
| `merge_6-25_skeleton_scan.zip` | `9c4f0c36a341ad1c447c0cc6afcbdd0f8d54d6a834cdae6644d84919398af948` |
| `FLOWMAP_02_TRUNK_BASED_DISPOSABLE_WORKER_CYCLE(5).md` | `557284e0458b1c4bc1a816cb3b9449a7720f6c43a17b786f6317530ac581c310` |
| `ADR_06_16 SCTL Coordinator Cycle, Manual Entry, Context Feed, and Operational Trace Policy(6).md` | `5148a0fe3ebcd72339594a26bd44e24d089812dfc5771109f076cc963d59e347` |
| `ADR_06_18_simplification& dispatch envelope consolidation(2).md` | `0a10390a88bbeacf4600c48b947d5944f206291cfb1876cd87dd14630c96293f` |

Verification command from the folder containing the uploaded files:

```bash
sha256sum \
  'strata_sctl_delegate_contract_aligned_adr0618_v0_9_5(1).zip' \
  'strata_runtime_edge_delegate_control_surface_adr0618_wsl_ready(2).zip' \
  'merge_6-25_skeleton_scan.zip' \
  'FLOWMAP_02_TRUNK_BASED_DISPOSABLE_WORKER_CYCLE(5).md' \
  'ADR_06_16 SCTL Coordinator Cycle, Manual Entry, Context Feed, and Operational Trace Policy(6).md' \
  'ADR_06_18_simplification& dispatch envelope consolidation(2).md'
```

If the local package has been patched after extraction, record the patch commit or patch hash. Do not compare a patched tree to the frozen zip without saying it is patched.

### 2.2 SCTL package pin

Expected package:

```text
Package root: Strata/
package.json name: strata-sctl-kernel-components-1-3-4
package.json version: 0.9.5-delegate-contract
```

Pinned files:

| File | Role in test |
|---|---|
| `Strata/package.json` | SCTL package version, npm scripts, baseline command names. |
| `Strata/PACKAGE_CHECKSUMS.sha256` | Package reproducibility check. |
| `Strata/src/cli.js` | SCTL CLI entry point. |
| `Strata/flowmaps/flowmap02/live_cycle_harness.sh` | Authoritative live Flowmap 02 shell executor. Do not randomly edit it to operate the workflow. |
| `Strata/scripts/wsl_tmux/sctl-dispatch-render` | Canonical dispatch render adapter called by the harness. |
| `Strata/scripts/wsl_tmux/_sctl_adapter_common.sh` | Shared adapter environment and path behavior. |
| `Strata/scripts/wsl_tmux/sctl-git-panel` | Visible SCTL Git panel caller. |
| `Strata/src/lib/cycles.js` | Director Entry commit, cycle start/exit, coordinator lifecycle. |
| `Strata/src/lib/dispatch_outbox.js` | Canonical envelope render/record and dispatch metadata policy. |
| `Strata/src/lib/worker_returns.js` | Worker Return Packet classification. |
| `Strata/src/lib/classb.js` | Class B validation and commit behavior. |
| `Strata/src/lib/context.js` | Context state, Class A/B revision, context Git commit. |
| `Strata/src/lib/export.js` | Class A/B context export. |
| `Strata/src/lib/messages.js` | Class C messaging support; not the canonical envelope source after ADR_06_18 unless used by a specific command. |
| `Strata/src/lib/flowmap.js` | Flowmap inspection logic. |
| `Strata/src/lib/panel.js` | SCTL Git panel command. |
| `Strata/src/lib/reports.js` | Operational report validation helpers. |
| `Strata/src/lib/layout.js` | SCTL workspace layout. |
| `Strata/schemas/*.schema.json` | Structural validation contracts. |
| `Strata/templates/work_products/coordinator_work_order.template.md` | Coordinator work-product template appended to Coordinator envelope. |
| `Strata/templates/packets/worker_return_packet.operational_report_ready.template.json` | Worker Return Packet template for author/reviewer returns. |
| `Strata/templates/reports/operational_report.template.md` | Change Author operational report template. |
| `Strata/templates/reports/review_outcome.template.md` | Reviewer report template. |
| `Strata/templates/dispatch/deterministic_dispatch_envelope.template.md` | Canonical envelope shape reference. |
| `Strata/docs/RUNTIME_SESSION_DELEGATE_CONTRACT.md` | Local copy of runtime delegate contract. |
| `Strata/docs/tester_playbook/*` | Prior tester materials; current playbook supersedes the operating sequence but preserves useful diagnostics. |

Files that should **not** exist in the ADR_06_18 SCTL live path:

```text
Strata/scripts/wsl_tmux/sctl-session-new
Strata/scripts/wsl_tmux/sctl-session-retire
Strata/scripts/wsl_tmux/sctl-dispatch-inject
Strata/scripts/mock_runtime_delegate/
Strata/scripts/adr_06_18_e2e_mock_runtime.sh
```

If any of those are reintroduced as active live Flowmap 02 paths, mark `WRONG_METHOD` unless the patch explicitly changes the architecture and cites a newer ADR.

### 2.3 Delegate package pin

Expected package:

```text
Package root: strata-runtime-edge-delegate-control-surface/
package.json name: strata-runtime-edge-delegate-control-surface
package.json version: 1.0.0-adr0618
binary: node dist/src/cli.js
```

Pinned files:

| File | Role in test |
|---|---|
| `package.json` | Delegate version and npm scripts. |
| `PACKAGE_CHECKSUMS.sha256` | Delegate reproducibility check. |
| `dist/src/cli.js` | Runtime delegate binary used by SCTL harness. |
| `src/cli.ts` | Source CLI command mapping. |
| `src/contract_delegate.ts` | ADR_06_18 delegate verbs implementation. |
| `src/contract_shapes.ts` | Contract result/failure shape. |
| `src/session_registry.ts` | Session binding registry. |
| `src/tmux_adapter.ts` | tmux target display, paste, capture, terminate operations. |
| `src/runtime.ts` | Delegate-owned session-create implementation; not called by SCTL Flowmap 02 harness. |
| `src/common.ts` | Path and safe segment helpers. Guard this file for path traversal issues. |
| `tests/contract_delegate.test.ts` | Source tests. |
| `dist/tests/contract_delegate.test.js` | Shipped dist tests. |
| `docs/WSL_DELEGATE_USER_MANUAL.md` | Delegate local operation manual. |
| `docs/WSL_RUNTIME_SIGNATURE_2026-06-25.md` | Runtime signature evidence. |
| `tester_playbook/ACCEPTANCE_MATRIX.md` | Delegate standalone acceptance matrix. |

### 2.4 Skeleton scan pin

The uploaded skeleton scan reports:

```text
Target: merge_6-25 extracted package set
Files processed: 143
Skeletons extracted: 55
Total symbols: 614
Languages: JavaScript, TypeScript, Shell
Unsupported files logged: Markdown, JSON, TXT docs/templates/manifests
```

Use the skeleton scan for file/symbol discovery only. It is not executable evidence and does not replace package tests, checksums, or live WSL/tmux smoke behavior.

---

## 3. Definitions

| Term | Meaning |
|---|---|
| `PACKAGE_ROOT` | Absolute path to the extracted `Strata/` SCTL package. |
| `RUNTIME_DELEGATE_ROOT` | Absolute path to `strata-runtime-edge-delegate-control-surface/`. |
| `SCTL_RUNTIME_DELEGATE_BIN` | Usually `$RUNTIME_DELEGATE_ROOT/dist/src/cli.js`. |
| `SCTL_WORKSPACE` | Per-run SCTL operating workspace containing `.strata/`. It should not be the package root. |
| `CODEBASE_REPO` | Implementation Git repo under test. SCTL does not own this repo. |
| `RUN_ROOT` | Harness output directory containing logs, JSON, TSV, CI logs, and final report. Prefer an explicit path outside the package root. |
| `Director Governing Entry Document` | Human-authored Markdown input committed into Class A by SCTL. SCTL validates Markdown/path, not semantic formatting. |
| `Coordinator Work Order` | Coordinator-authored Class B work product. SCTL/harness must not invent it. |
| `Dispatch packet` | Canonical envelope plus context export plus submission template, recorded under SCTL `D_trace`. |
| `Return path` | `.strata/returns/<assignment_id>/<session_id>/`. SCTL owns this path. Workers drop files here. |
| `Worker Return Packet` | `packet.json` submitted by Change Author or Reviewer. |
| `Operational report` | Markdown report submitted with the return packet. |
| `SCTL Git` | `.strata/context/.git`; stores coordination, context, reports, dispatch, telemetry, ledgers. |
| `Codebase Git` | Implementation repo; stores branch, code changes, CI/validation, merge. |

---

## 4. Acceptance tiers

Run the tiers in order.

| Tier | Name | Required for release acceptance? | Purpose |
|---:|---|---:|---|
| T0 | Package and architecture pin | Yes | Proves the tester is running the expected package and boundary. |
| T1 | Delegate control-surface sanity | Yes | Proves delegate verbs, tmux binding, and return path guards. |
| T2 | Single-cycle Flowmap 02 live harness | Yes | Proves end-to-end SCTL/delegate live behavior through shell harness. |
| T3 | Four-cycle coordinator lifecycle | Required if coordinator lifecycle is under test | Proves coordinator recreation threshold and latest-two Class B context. |
| T4 | Fault diagnosis / negative cases | Required before stable baseline | Proves tester can classify known failure boundaries. |
| T5 | Final acceptance report | Yes | Produces durable release decision evidence. |

Minimum stable baseline:

```text
T0 PASS
T1 PASS
T2 overall_result OBSERVED
no WRONG_METHOD
no missing required evidence
no unapproved skip/override
SCTL context Git clean
Codebase Git outcome explained
negative path guards pass
```

---

## 5. T0: package and architecture pin

### 5.1 Record local paths

Create a run manifest before running the harness.

```bash
export ASSIGNMENT_ID="A_FLOWMAP_02_$(date -u +%Y%m%d%H%M%S)"
export PACKAGE_ROOT="$HOME/workspace/strata-sctl-v0.9.5/Strata"
export RUNTIME_DELEGATE_ROOT="$HOME/workspace/runtime-delegates/strata-runtime-edge-delegate-control-surface"
export SCTL_RUNTIME_DELEGATE_ROOT="$RUNTIME_DELEGATE_ROOT"
export SCTL_RUNTIME_DELEGATE_BIN="$RUNTIME_DELEGATE_ROOT/dist/src/cli.js"
export SCTL_WORKSPACE="$HOME/sctl-live/$ASSIGNMENT_ID"
export CODEBASE_REPO="$HOME/workspace/YOUR_CODEBASE_REPO"
export RUN_ROOT="$HOME/sctl-runs/$ASSIGNMENT_ID"
export TRUNK_BRANCH="main"
export SHORT_NAME="small-controlled-change"
export DIRECTOR_ENTRY_SOURCE="$HOME/sctl-inputs/$ASSIGNMENT_ID/director_governing_entry.md"
mkdir -p "$(dirname "$DIRECTOR_ENTRY_SOURCE")" "$SCTL_WORKSPACE" "$RUN_ROOT"
```

Write the manifest:

```bash
cat > "$RUN_ROOT/run_manifest.env" <<EOF_MANIFEST
ASSIGNMENT_ID=$ASSIGNMENT_ID
PACKAGE_ROOT=$PACKAGE_ROOT
RUNTIME_DELEGATE_ROOT=$RUNTIME_DELEGATE_ROOT
SCTL_RUNTIME_DELEGATE_BIN=$SCTL_RUNTIME_DELEGATE_BIN
SCTL_WORKSPACE=$SCTL_WORKSPACE
CODEBASE_REPO=$CODEBASE_REPO
RUN_ROOT=$RUN_ROOT
TRUNK_BRANCH=$TRUNK_BRANCH
SHORT_NAME=$SHORT_NAME
DIRECTOR_ENTRY_SOURCE=$DIRECTOR_ENTRY_SOURCE
EOF_MANIFEST
```

### 5.2 Verify package identity

SCTL:

```bash
cd "$PACKAGE_ROOT"
node -e 'const p=require("./package.json"); console.log(p.name, p.version)'
sha256sum -c PACKAGE_CHECKSUMS.sha256
npm test
npm run secret-scan
find scripts flowmaps -name '*.sh' -type f -print0 | xargs -0 -n1 bash -n
```

Expected:

```text
strata-sctl-kernel-components-1-3-4 0.9.5-delegate-contract
PACKAGE_CHECKSUMS.sha256: all listed files OK
npm test: pass
secret scan: pass
shell syntax: pass
```

Delegate:

```bash
cd "$RUNTIME_DELEGATE_ROOT"
node -e 'const p=require("./package.json"); console.log(p.name, p.version)'
sha256sum -c PACKAGE_CHECKSUMS.sha256
npm test
npm run secret-scan
node dist/src/cli.js delegate session-list --workspace "$SCTL_WORKSPACE"
```

Expected:

```text
strata-runtime-edge-delegate-control-surface 1.0.0-adr0618
PACKAGE_CHECKSUMS.sha256: all listed files OK
npm test: pass
secret scan: pass
session-list returns JSON, not shell crash
```

If `npm test` fails because dependencies are not installed, run:

```bash
npm install
npm test
```

Do not mark source tests accepted until they pass in the local WSL environment.

### 5.3 Verify removed/forbidden live paths

```bash
cd "$PACKAGE_ROOT"
for forbidden in \
  scripts/wsl_tmux/sctl-session-new \
  scripts/wsl_tmux/sctl-session-retire \
  scripts/wsl_tmux/sctl-dispatch-inject \
  scripts/mock_runtime_delegate \
  scripts/adr_06_18_e2e_mock_runtime.sh
 do
  if [ -e "$forbidden" ]; then
    echo "WRONG_METHOD: forbidden live/mock path exists: $forbidden"
    exit 1
  fi
 done
```

Expected: no output and exit 0.

### 5.4 Verify canonical harness help

```bash
bash "$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" --help | sed -n '1,180p'
```

Expected help includes:

```text
--runtime-delegate-root
--runtime-delegate-bin
--director-entry-source
--cycle-entry-dir
--validation-command
--return-timeout
--allow-merge
--cycles
```

Expected help does **not** claim that Flowmap 02 acceptance is offline or dry-run.

---

## 6. T1: delegate control-surface sanity

This tier tests the delegate by itself. It does not replace the SCTL Flowmap 02 harness.

### 6.1 Confirm the eight delegate verbs

```bash
node "$SCTL_RUNTIME_DELEGATE_BIN" delegate --help
```

Expected verbs:

```text
session-register
session-create
dispatch-deliver
return-drop
return-dir
session-capture
session-terminate
session-list
```

### 6.2 Negative path guard: return directory must not escape `.strata/returns`

This is a required merge guard.

```bash
set +e
node "$SCTL_RUNTIME_DELEGATE_BIN" delegate return-dir \
  --workspace /tmp/sctl-return-guard \
  --assignment-id '..' \
  --session-id '..' > "$RUN_ROOT/negative_return_dir.json" 2>&1
status=$?
set -e
cat "$RUN_ROOT/negative_return_dir.json"
if [ "$status" -eq 0 ]; then
  echo "BROKEN_RETURN_PATH_GUARD: dot-dot assignment/session id was accepted"
  exit 1
fi
```

Expected after guard patch:

```text
non-zero exit
machine-readable failure or clear error
no .strata/returns/../.. accepted path
```

If the command returns `ok: true` with `.strata/returns/../..`, reject the package as a stable baseline until the delegate path segment guard is patched.

### 6.3 Delegate tmux register/deliver/capture/terminate smoke

Create a scratch tmux session:

```bash
export DELEGATE_SMOKE_SESSION="sctl-delegate-smoke-$ASSIGNMENT_ID"
export DELEGATE_SMOKE_ID="delegate_smoke_001"
tmux kill-session -t "$DELEGATE_SMOKE_SESSION" 2>/dev/null || true
tmux new-session -d -s "$DELEGATE_SMOKE_SESSION" 'bash --noprofile --norc'
tmux list-sessions | grep "$DELEGATE_SMOKE_SESSION"
```

Create a minimal packet:

```bash
mkdir -p "$SCTL_WORKSPACE/.strata/test_packets"
cat > "$SCTL_WORKSPACE/.strata/test_packets/delegate_smoke_packet.md" <<EOF_PACKET
# SCTL Dispatch Envelope

assignment_id: $ASSIGNMENT_ID

Use this packet only for delegate smoke testing.

# Below is system level full context picture.

Smoke context.

# This is the template you use for submission

Do not submit production work from this smoke packet.
EOF_PACKET
```

Register, deliver, capture, terminate:

```bash
node "$SCTL_RUNTIME_DELEGATE_BIN" delegate session-register \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id "$ASSIGNMENT_ID" \
  --cycle-id "CYCLE_SMOKE" \
  --role "Delegate Smoke" \
  --session-id "$DELEGATE_SMOKE_ID" \
  --tmux-target "$DELEGATE_SMOKE_SESSION" \
  --retire-policy kill-session | tee "$RUN_ROOT/delegate_smoke_register.json"

node "$SCTL_RUNTIME_DELEGATE_BIN" delegate dispatch-deliver \
  --workspace "$SCTL_WORKSPACE" \
  --session-id "$DELEGATE_SMOKE_ID" \
  --packet "$SCTL_WORKSPACE/.strata/test_packets/delegate_smoke_packet.md" | tee "$RUN_ROOT/delegate_smoke_deliver.json"

node "$SCTL_RUNTIME_DELEGATE_BIN" delegate session-capture \
  --workspace "$SCTL_WORKSPACE" \
  --session-id "$DELEGATE_SMOKE_ID" \
  --lines 80 | tee "$RUN_ROOT/delegate_smoke_capture.json"

node "$SCTL_RUNTIME_DELEGATE_BIN" delegate session-terminate \
  --workspace "$SCTL_WORKSPACE" \
  --session-id "$DELEGATE_SMOKE_ID" \
  --retire-policy kill-session | tee "$RUN_ROOT/delegate_smoke_terminate.json"
```

Expected:

```text
register ok
packet delivered into tmux target
capture evidence exists
termination ok
machine-readable JSON includes ok/error_code/message shape
```

### 6.4 Delegate `return-drop` standalone behavior

This tests the delegate verb only. The SCTL Flowmap 02 harness should not require delegate `return-drop`; live workers drop return files directly into the SCTL-owned return path.

```bash
mkdir -p "$RUN_ROOT/return_drop_src"
printf '{"packet_contract":"worker_return_packet.v1","return_kind":"OPERATIONAL_REPORT_READY"}\n' > "$RUN_ROOT/return_drop_src/packet.json"
printf '# Delegate return-drop smoke\n\nSmoke only.\n' > "$RUN_ROOT/return_drop_src/operational_report.md"

node "$SCTL_RUNTIME_DELEGATE_BIN" delegate return-drop \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id "$ASSIGNMENT_ID" \
  --session-id "return_drop_smoke_001" \
  --file "$RUN_ROOT/return_drop_src/packet.json" \
  --file "$RUN_ROOT/return_drop_src/operational_report.md" | tee "$RUN_ROOT/delegate_return_drop_smoke.json"

find "$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/return_drop_smoke_001" -maxdepth 1 -type f -print
```

Expected:

```text
files copied only under .strata/returns/<assignment_id>/return_drop_smoke_001/
source sha/evidence preserved in delegate result
no path escape
```

---

## 7. Live Flowmap 02 preparation

### 7.1 Create the Director Governing Entry Document

ADR_06_18 says SCTL validates only Markdown-file validity for the Director-facing input. The tester should still write a clear entry so the Coordinator can act.

```bash
mkdir -p "$(dirname "$DIRECTOR_ENTRY_SOURCE")"
cat > "$DIRECTOR_ENTRY_SOURCE" <<EOF_DIRECTOR
# Director Governing Entry Document

Assignment: $ASSIGNMENT_ID

Goal:
Perform one bounded trunk-based disposable worker cycle through SCTL and the runtime delegate control surface.

Authority:
The shell harness owns deterministic operation order. The Coordinator owns the work order. SCTL must not invent role work.

Implementation target:
Codebase repository: $CODEBASE_REPO
Trunk branch: $TRUNK_BRANCH
Change branch short name: $SHORT_NAME

Expected change:
Describe the smallest safe codebase change the Change Author should make.

Validation expectation:
List the exact validation commands supplied to the harness.

Stop conditions:
- Missing codebase path.
- Unclear implementation scope.
- Worker cannot produce files in the assigned return path.
- Reviewer blocks or denies.
- Validation or merge fails.
EOF_DIRECTOR

test -s "$DIRECTOR_ENTRY_SOURCE"
case "$DIRECTOR_ENTRY_SOURCE" in *.md) echo "Director Entry Markdown: ok" ;; *) echo "Director Entry must be .md"; exit 1 ;; esac
```

Do not add machine-only envelope metadata into this document. SCTL will commit it as Class A and create a normalized reference object.

### 7.2 Select explicit validation commands

The harness has legacy default validation commands for a sample Python/numpy codebase. For any other codebase, pass explicit validation commands.

Examples:

```bash
export VALIDATION_1="npm test"
export VALIDATION_2="npm run lint"
```

or:

```bash
export VALIDATION_1="python3 -m pytest"
export VALIDATION_2="python3 -m py_compile path/to/file.py"
```

Acceptance rule:

```text
A live merge-authorized run must use validation commands that are meaningful for the selected CODEBASE_REPO.
If the harness defaults are used against an unrelated repo, mark the run PARTIAL or BROKEN_CI_CONFIG.
```

### 7.3 Ensure Codebase Git is ready

```bash
cd "$CODEBASE_REPO"
git status --short --branch
git switch "$TRUNK_BRANCH"
git status --short
```

Expected:

```text
clean worktree unless --allow-dirty-codebase is explicitly part of the test
trunk branch exists
remote freshness known, or WARN_LOCAL_MAIN_NO_UPSTREAM will be recorded
```

If the worktree is dirty, stop unless the test objective is dirty-worktree diagnosis.

### 7.4 Pre-create live tmux targets

The SCTL Flowmap 02 harness uses delegate `session-register`. It does not call delegate `session-create`. Therefore, the tmux targets expected by the harness must exist before the harness registers them.

For one cycle, expected targets are:

```text
coord-<ASSIGNMENT_ID>-C00-S01
author-<ASSIGNMENT_ID>-C01-S01
reviewer-<ASSIGNMENT_ID>-C01-S01
```

For four cycles, also create:

```text
author-<ASSIGNMENT_ID>-C02-S01
reviewer-<ASSIGNMENT_ID>-C02-S01
author-<ASSIGNMENT_ID>-C03-S01
reviewer-<ASSIGNMENT_ID>-C03-S01
author-<ASSIGNMENT_ID>-C04-S01
reviewer-<ASSIGNMENT_ID>-C04-S01
```

Minimal shell-session setup for infrastructure testing:

```bash
for s in \
  "coord-${ASSIGNMENT_ID}-C00-S01" \
  "author-${ASSIGNMENT_ID}-C01-S01" \
  "reviewer-${ASSIGNMENT_ID}-C01-S01"
 do
  tmux kill-session -t "$s" 2>/dev/null || true
  tmux new-session -d -s "$s" 'bash --noprofile --norc'
 done

tmux list-sessions | grep "$ASSIGNMENT_ID"
```

Production live worker setup:

```text
Use the local Codex/TUI/worker launcher normally used in WSL.
The visible tmux session names must match the harness target names above.
The harness will paste canonical SCTL packets into those sessions.
The worker must produce return files at the paths shown in the envelope template.
```

If a target is missing, delegate `session-register` should fail with a tmux target error. Diagnose this as a runtime setup failure, not an SCTL context failure.

---

## 8. T2: single-cycle Flowmap 02 live harness

### 8.1 Launch command

Use explicit absolute paths.

```bash
mkdir -p "$RUN_ROOT"

"$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" \
  --assignment-id "$ASSIGNMENT_ID" \
  --package-root "$PACKAGE_ROOT" \
  --runtime-delegate-root "$RUNTIME_DELEGATE_ROOT" \
  --runtime-delegate-bin "$SCTL_RUNTIME_DELEGATE_BIN" \
  --sctl-workspace "$SCTL_WORKSPACE" \
  --codebase-repo "$CODEBASE_REPO" \
  --director-entry-source "$DIRECTOR_ENTRY_SOURCE" \
  --trunk-branch "$TRUNK_BRANCH" \
  --short-name "$SHORT_NAME" \
  --validation-command "$VALIDATION_1" \
  --validation-command "$VALIDATION_2" \
  --cycles 1 \
  --return-timeout 600 \
  --poll-interval 5 \
  --run-root "$RUN_ROOT" \
  --allow-merge
```

Use `--allow-merge` only when the tester is authorized to merge the codebase branch after reviewer approval and green validation. Without `--allow-merge`, an approved+green run must block at the merge authority boundary.

### 8.2 Options that reduce acceptance strength

| Option | Use | Acceptance impact |
|---|---|---|
| `--skip-npm-test` | Speeds repeated diagnostics | Not valid for release acceptance unless T0 already passed in the same package tree. |
| `--skip-adapter-syntax` | Speeds repeated diagnostics | Not valid for release acceptance unless T0 shell syntax already passed. |
| `--review-result approved|denied|blocked` | Tests downstream branch without relying on reviewer wording | Mark as `PARTIAL_REVIEW_OVERRIDE`; not clean live reviewer acceptance. |
| `--reuse-branch` | Continue a failed run or test branch reuse | Mark as resumed/diagnostic unless reuse is the explicit test objective. |
| `--allow-dirty-codebase` | Dirty-worktree diagnosis | Not clean release acceptance. |
| `--open-inject-tab` | Visual injection troubleshooting | Acceptable diagnostic note; duplicate tabs are UX evidence, not extra sessions. |
| `--pause-before-retire` | Human visual inspection before teardown | Acceptable if the pause and continuation are recorded. |

### 8.3 Monitor the run

The harness prints `RUN_ROOT`. In another terminal:

```bash
tail -f "$RUN_ROOT/flowmap02_operational.log"
```

Useful live inspections:

```bash
tmux list-sessions | grep "$ASSIGNMENT_ID" || true
find "$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID" -maxdepth 3 -type f -print 2>/dev/null || true
git -C "$SCTL_WORKSPACE/.strata/context" log --oneline -10 2>/dev/null || true
git -C "$CODEBASE_REPO" status --short --branch
```

The tester may watch the tmux panes, but must not convert chat output into completion. Completion requires files.

### 8.4 Required worker return files

Coordinator work order:

```text
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/delegated_coordinator_001/coordinator_work_order.md
```

Change Author return for cycle 1:

```text
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/change_author_c01/packet.json
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/change_author_c01/operational_report.md
```

Reviewer return for cycle 1:

```text
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/reviewer_c01/packet.json
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/reviewer_c01/operational_report.md
```

or:

```text
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/reviewer_c01/review_report.md
```

The harness waits for `packet.json` plus one report file. If the worker submits via chat or wrong directory, the correct result is `BLOCKED_TIMEOUT` or return-classification failure.

---

## 9. Expected harness evidence map

The harness writes both machine-readable and human-readable evidence. The tester should treat `RUN_ROOT` and `.strata/context` as the primary audit surface.

### 9.1 Global result files

| Evidence | Expected path |
|---|---|
| Full operational log | `$RUN_ROOT/flowmap02_operational.log` |
| Human result report | `$RUN_ROOT/flowmap02_result.md` |
| Machine result JSON | `$RUN_ROOT/flowmap02_result.json` |
| Step diagnosis TSV | `$RUN_ROOT/flowmap02_step_diagnosis.tsv` |
| Step status JSONL | `$RUN_ROOT/flowmap02_step_status.jsonl` |
| Cycle timeline | `$RUN_ROOT/cycle_timeline.tsv` |
| Context exports | `$RUN_ROOT/context_exports/` |
| CI log | `$RUN_ROOT/${ASSIGNMENT_ID}_C01_ci.log` |
| Pull log | `$RUN_ROOT/${ASSIGNMENT_ID}_C01_pull.log` |

Quick view:

```bash
sed -n '1,220p' "$RUN_ROOT/flowmap02_result.md"
python3 -m json.tool "$RUN_ROOT/flowmap02_result.json" | sed -n '1,220p'
column -t -s $'\t' "$RUN_ROOT/flowmap02_step_diagnosis.tsv" | sed -n '1,220p'
```

### 9.2 Step-to-evidence map

| Harness phase | Expected method boundary | Primary evidence |
|---|---|---|
| Preflight | package tests, adapter syntax, delegate `session-list` | `$RUN_ROOT/preflight_delegate_session_list.json`, npm output in log |
| Context bootstrap | SCTL owns `.strata/context` | `$RUN_ROOT/context_bootstrap.json`, `$SCTL_WORKSPACE/.strata/context/.git` |
| Director Entry start | Markdown committed into Class A, normalized cycle object created | `$RUN_ROOT/cycle_entry_start.json`, Class A path under `.strata/context/A/`, cycle telemetry |
| Coordinator register | delegate binds existing tmux target; SCTL records metadata | `$RUN_ROOT/session_new_delegated_coordinator.json`, `.strata/context/C/sessions/active_sessions.json` |
| Initial Coordinator dispatch | canonical initial envelope delivered through delegate | dispatch packet under `.strata/context/D_trace/dispatch_packets/`, delegate deliver JSON |
| Codebase branch | Codebase Git only | `$RUN_ROOT/${ASSIGNMENT_ID}_C01_pull.log`, `git -C $CODEBASE_REPO branch/log` |
| Change Author register | fresh disposable author target bound | `$RUN_ROOT/C01_session_new_change_author.json`, active sessions JSON |
| Coordinator work order | Coordinator-authored Class B work order required | `.strata/returns/$ASSIGNMENT_ID/delegated_coordinator_001/coordinator_work_order.md`, `$RUN_ROOT/C01_coordinator_work_order_classb_commit.json` |
| Author dispatch render | SCTL canonical envelope and context export | `$RUN_ROOT/C01_author_dispatch_render.json`, `.strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/change_author_c01/N_AUTHOR_C01/dispatch_packet.md` |
| Author dispatch deliver | delegate `dispatch-deliver`, not old SCTL inject wrapper | `$RUN_ROOT/C01_7_author_dispatch_deliver_delegate_dispatch-deliver.json` or matching label JSON |
| Author capture | delegate `session-capture` attempted | `$RUN_ROOT/C01_8_author_delegate_session-capture_delegate_session-capture.json` or matching label JSON |
| Author return wait/classify | worker file drop, SCTL `returns classify` | return files, `$RUN_ROOT/C01_author_classify.json`, `D_trace/return_ledgers/` |
| Author Class B commit | structurally valid report accepted | `$RUN_ROOT/C01_author_classb_commit.json`, `.strata/context/B/` |
| Reviewer register | fresh disposable reviewer target bound | `$RUN_ROOT/C01_session_new_reviewer.json` |
| Reviewer dispatch render/deliver | canonical envelope from Class B context | `$RUN_ROOT/C01_review_dispatch_render.json`, reviewer dispatch packet |
| Reviewer return/classify | reviewer files and classification | `$RUN_ROOT/C01_reviewer_classify.json`, return ledgers |
| Review result parse | approved/denied/blocked extracted or override recorded | step diagnosis row `17.review_result` |
| CI and merge | Codebase Git validation and ff-only merge if authorized | CI log, codebase Git log, step diagnosis rows `18A.ci`, `18A.merge` |
| Final Class B outcome | final review/merge outcome committed | `$RUN_ROOT/C01_final_outcome_classb_put.json`, `.strata/context/B/` |
| Disposable retirement | delegate terminate + SCTL retire | delegate terminate JSON, SCTL retire JSON, lifecycle records |
| Coordinator freshness | latest-two Class B context export | `$RUN_ROOT/context_exports/cycle_01/coordinator_refresh_latest2/context.md` |
| Recurring Coordinator dispatch | Class B context envelope for next decision | `$RUN_ROOT/C01_coordinator_dispatch_render.json`, dispatch packet |
| Cycle complete | coordinator count updated; recreate if due | `$RUN_ROOT/C01_coordinator_cycle_complete.json` |
| Final audit | SCTL Git clean and evidence visible | `$RUN_ROOT/final_sctl_git_status.txt`, `final_sctl_git_log.txt`, dispatch/ledger/classb file listings |

File names containing spaces in labels are normalized by the harness using label substitutions. If a listed exact file name differs, use `find "$RUN_ROOT" -type f | sort` and match by phase label.

---

## 10. Canonical envelope audit

ADR_06_18 requires the pasted envelope body to be minimal. It must contain:

```text
# Initial task coordination envelope
or
# SCTL Dispatch Envelope

assignment_id: <assignment_id>

# Below is system level full context picture.

<context export>

# This is the template you use for submission

<role-selected submission template>
```

Inspect packets:

```bash
find "$SCTL_WORKSPACE/.strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID" -name dispatch_packet.md -print | sort > "$RUN_ROOT/dispatch_packet_list.txt"
cat "$RUN_ROOT/dispatch_packet_list.txt"

while IFS= read -r packet; do
  echo "===== $packet ====="
  grep -nE '# Initial task coordination envelope|# SCTL Dispatch Envelope|assignment_id:|# Below is system level full context picture.|# This is the template you use for submission' "$packet"
done < "$RUN_ROOT/dispatch_packet_list.txt"
```

Expected:

```text
each packet has exactly one canonical title
each packet has assignment_id
each packet has context picture heading
each packet has submission template heading
```

Metadata that should be preserved outside the pasted body:

```text
target_role
target_session
trigger
source context class/path/SHA/Git commit
nonce
template path
dispatch packet path
injection result
```

Inspect render JSON and dispatch logs for this metadata:

```bash
find "$SCTL_WORKSPACE/.strata/context/D_trace" -path '*dispatch*' -type f | sort | sed -n '1,160p'
find "$RUN_ROOT" -name '*dispatch_render.json' -o -name '*dispatch-deliver*.json' | sort
```

If the body is role-specific ad hoc prose without the context picture and submission template, mark `WRONG_METHOD_CANONICAL_ENVELOPE`.

---

## 11. Ownership boundary checks

### 11.1 SCTL must own

```text
Director Entry commit into Class A
cycle start and cycle exit record
SCTL context Git
context export
canonical dispatch render/record
Class B structural validation/commit
return classification and ledgers
session metadata in SCTL context
final outcome Class B record
coordinator lifecycle/freshness state
```

Evidence locations:

```bash
find "$SCTL_WORKSPACE/.strata/context/A" -type f -print 2>/dev/null || true
find "$SCTL_WORKSPACE/.strata/context/B" -type f -print 2>/dev/null || true
find "$SCTL_WORKSPACE/.strata/context/C" -type f -print 2>/dev/null || true
find "$SCTL_WORKSPACE/.strata/context/D_trace" -maxdepth 4 -type f -print 2>/dev/null | sort | sed -n '1,240p'
git -C "$SCTL_WORKSPACE/.strata/context" log --oneline -30
```

### 11.2 Delegate must own

```text
existing tmux target binding through session-register
packet delivery through dispatch-deliver
tmux pane capture through session-capture
session termination through session-terminate
delegate evidence for each verb
machine-readable failure envelope
```

Evidence locations:

```bash
find "$RUN_ROOT" -name '*delegate*.json' -print | sort
python3 -m json.tool "$RUN_ROOT/preflight_delegate_session_list.json" | sed -n '1,200p'
```

### 11.3 Codebase Git must own

```text
implementation branch
implementation commits
validation command execution
ff-only merge
branch cleanup if requested
```

Evidence commands:

```bash
git -C "$CODEBASE_REPO" status --short --branch
git -C "$CODEBASE_REPO" log --oneline --decorate -20
git -C "$CODEBASE_REPO" branch --list
sed -n '1,220p' "$RUN_ROOT/${ASSIGNMENT_ID}_C01_ci.log" 2>/dev/null || true
```

### 11.4 Wrong-method tripwires

Run after the harness:

```bash
if grep -R "sctl-session-new\|sctl-session-retire\|sctl-dispatch-inject\|mock_runtime" "$RUN_ROOT" "$SCTL_WORKSPACE/.strata/context" 2>/dev/null; then
  echo "WRONG_METHOD: legacy/mock wrapper appears in live evidence"
  exit 1
fi

if grep -R "delegate session-create" "$RUN_ROOT/flowmap02_operational.log" 2>/dev/null; then
  echo "WRONG_METHOD: SCTL Flowmap 02 harness called session-create"
  exit 1
fi

if grep -R "delegate return-drop" "$RUN_ROOT/flowmap02_operational.log" 2>/dev/null; then
  echo "WRONG_METHOD: SCTL Flowmap 02 harness used delegate return-drop instead of SCTL-owned return path"
  exit 1
fi
```

Expected: no tripwire output.

---

## 12. Diagnosis matrix

Use the harness status label first. Do not rename failures into generic pass/fail terms.

| Status / symptom | Boundary | Meaning | Next diagnostic action |
|---|---|---|---|
| `BLOCKED_MISSING_PACKAGE_ROOT` | preflight | SCTL package root is wrong | Check `PACKAGE_ROOT`, ensure `src/cli.js` exists. |
| `BLOCKED_MISSING_SCTL_CLI` | preflight | `src/cli.js` missing | Wrong extraction path or corrupt package. |
| `BLOCKED_MISSING_RENDERER` | preflight | `sctl-dispatch-render` missing | Wrong SCTL package or bad merge. |
| `BROKEN_RUNTIME_DELEGATE` | preflight delegate | Delegate binary cannot run `session-list` | Check `SCTL_RUNTIME_DELEGATE_BIN`, Node, package build. |
| `BROKEN_PACKAGE_TESTS` | preflight | SCTL `npm test` failed | Stop; inspect package tests before live run. |
| `BROKEN_ADAPTER_SYNTAX` | preflight | shell syntax failed | Stop; inspect changed shell scripts. |
| `BROKEN_CONTEXT_BOOTSTRAP` | SCTL context | `.strata/context` cannot bootstrap | Check workspace permissions and Git availability. |
| `BLOCKED_MISSING_CYCLE_ENTRY_SOURCE` | Director Entry | source Markdown missing | Create the Director Governing Entry Markdown. |
| `BLOCKED_DIRECTOR_ENTRY_SOURCE_FORMAT` | Director Entry | not Markdown | Use `.md`. ADR_06_18 does not require more structure. |
| `BLOCKED_CYCLE_ENTRY_PATH` | Director Entry | explicit file outside controlled inbox | Use `--director-entry-source` or place file under `.strata/cycles/director_entry`. |
| `BLOCKED_AMBIGUOUS_CYCLE_ENTRY` | Director Entry | more than one Markdown inbox file | Keep exactly one Director Entry file. |
| `BROKEN_CYCLE_START` | Class A/cycle start | SCTL could not commit Class A or create cycle object | Inspect `$RUN_ROOT/cycle_entry_start.json`. |
| `BROKEN_DELEGATE_SESSION_REGISTER` | delegate/tmux | tmux target missing or not displayable | Run `tmux list-sessions`; pre-create exact target. |
| `BROKEN_SCTL_SESSION_METADATA` | SCTL session registry | delegate bound tmux but SCTL metadata failed | Inspect SCTL sessions register JSON and active sessions file. |
| `BLOCKED_DIRTY_CODEBASE` | Codebase Git | worktree dirty | Commit/stash/clean or rerun with explicit diagnostic flag. |
| `WARN_LOCAL_MAIN_NO_UPSTREAM` | Codebase Git | trunk has no upstream | Allowed if local trunk freshness is acceptable; record it. |
| `BROKEN_PULL` | Codebase Git | `git pull --ff-only` failed | Resolve remote/trunk state. |
| `BLOCKED_BRANCH_EXISTS` | Codebase Git | change branch already exists | Use new `--short-name` or deliberate `--reuse-branch`. |
| `BROKEN_BRANCH_CREATE` | Codebase Git | branch creation failed | Check trunk exists and branch name is safe. |
| `BLOCKED_COORDINATOR_WORK_ORDER_REQUIRED` | Coordinator boundary | SCTL/harness refused to author work order | Inspect Coordinator tmux pane and return path. This is correct boundary enforcement. |
| `BROKEN_COORDINATOR_WORK_ORDER_COMMIT` | Class B | Coordinator work order was not structurally valid Class B | Inspect schema/required sections and commit JSON. |
| `BROKEN_DISPATCH_RENDER` | SCTL dispatch | canonical author packet failed to render | Inspect `sctl-dispatch-render`, `dispatch_outbox.js`, context export. |
| `MISSING_DISPATCH_PACKET` | SCTL dispatch | render JSON exists but packet missing | Inspect D_trace dispatch packet path and workspace layout. |
| `BROKEN_DELEGATE_DISPATCH_DELIVER` | delegate/tmux | packet not pasted into target | Inspect delegate deliver JSON, tmux target, packet path. |
| `BLOCKED_TIMEOUT` | worker return | worker did not submit files in time | Inspect delegate capture, tmux pane, return path, envelope submission path. |
| `BROKEN_RETURN_CLASSIFY` | SCTL return classifier | `returns classify` crashed or rejected path | Inspect packet JSON shape and report path. |
| `BROKEN_INVALID_RETURN_PACKET` | worker return schema | packet exists but is invalid | Compare with worker return template. Do not edit silently. |
| `BLOCKED_UNEXPECTED_RETURN_KIND` | worker return routing | return kind is not `OPERATIONAL_REPORT_READY` | Route according to return kind; do not force Class B commit. |
| `WARN_RETURN_IMPLEMENTATION_REF_MISMATCH` | worker evidence | packet repo/commit does not match branch head | Inspect worker checkout, branch head, and reported commit. For stable acceptance, explain or fix. |
| `BROKEN_CLASSB_AUTHOR_COMMIT` | Class B | author report not structurally valid | Inspect Class B schema and report template. |
| `BROKEN_REVIEW_DISPATCH_RENDER` | reviewer dispatch | canonical reviewer packet failed | Inspect related Class B source and render JSON. |
| `BLOCKED_REVIEW_RESULT_UNKNOWN` | reviewer report | no approved/denied/blocked signal | Require explicit recommendation or diagnostic `--review-result`. |
| `BROKEN_CI_FAILED` | Codebase validation | declared validation commands failed | Inspect CI log; return to author/revision path. |
| `BLOCKED_MERGE_NOT_AUTHORIZED` | merge authority | reviewer approved and CI passed, but `--allow-merge` absent | Rerun only if merge authority is granted. |
| `BROKEN_MERGE_FAILED` | Codebase merge | ff-only merge failed | Inspect branch divergence and merge policy. |
| `BROKEN_FINAL_CLASSB_PUT` | SCTL final report | final outcome failed Class B write | Inspect classb put args and schema. |
| `BROKEN_DELEGATE_TERMINATE_AUTHOR` | delegate teardown | author tmux termination failed | Inspect target and retire policy. |
| `BROKEN_SCTL_RETIRE_AUTHOR` | SCTL lifecycle | SCTL retire record failed | Inspect session metadata. |
| `BROKEN_DELEGATE_TERMINATE_REVIEWER` | delegate teardown | reviewer tmux termination failed | Inspect target and retire policy. |
| `BROKEN_SCTL_RETIRE_REVIEWER` | SCTL lifecycle | SCTL retire record failed | Inspect session metadata. |
| `BROKEN_COORDINATOR_EXPORT` | context export | latest-two Class B export failed | Inspect context state and Class B files. |
| `BROKEN_COORDINATOR_CYCLE_COUNT` | coordinator lifecycle | cycle-complete record failed | Inspect coordinator state path. |
| `BROKEN_SCTL_GIT_DIRTY` | final audit | `.strata/context` has uncommitted files | Inspect dirty files; SCTL should commit operational evidence. |

---

## 13. T3: four-cycle coordinator lifecycle acceptance

Run this tier when validating ADR_06_16 coordinator persistence and ADR_06_18 recurring Coordinator dispatch behavior.

Pre-create tmux targets:

```bash
for s in "coord-${ASSIGNMENT_ID}-C00-S01"; do
  tmux kill-session -t "$s" 2>/dev/null || true
  tmux new-session -d -s "$s" 'bash --noprofile --norc'
done

for c in 01 02 03 04; do
  for role in author reviewer; do
    s="${role}-${ASSIGNMENT_ID}-C${c}-S01"
    tmux kill-session -t "$s" 2>/dev/null || true
    tmux new-session -d -s "$s" 'bash --noprofile --norc'
  done
done
```

Launch with four cycles:

```bash
"$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" \
  --assignment-id "$ASSIGNMENT_ID" \
  --package-root "$PACKAGE_ROOT" \
  --runtime-delegate-root "$RUNTIME_DELEGATE_ROOT" \
  --runtime-delegate-bin "$SCTL_RUNTIME_DELEGATE_BIN" \
  --sctl-workspace "$SCTL_WORKSPACE" \
  --codebase-repo "$CODEBASE_REPO" \
  --director-entry-source "$DIRECTOR_ENTRY_SOURCE" \
  --trunk-branch "$TRUNK_BRANCH" \
  --short-name "$SHORT_NAME" \
  --validation-command "$VALIDATION_1" \
  --validation-command "$VALIDATION_2" \
  --cycles 4 \
  --return-timeout 900 \
  --poll-interval 5 \
  --run-root "$RUN_ROOT" \
  --allow-merge
```

Expected lifecycle evidence:

```bash
cat "$RUN_ROOT/cycle_timeline.tsv"
find "$RUN_ROOT" -name '*coordinator_cycle_complete.json' -print | sort
find "$RUN_ROOT" -name '*coordinator_recreate*' -print | sort
find "$RUN_ROOT/context_exports" -path '*coordinator*latest2*' -type f -print | sort
```

Acceptance:

```text
Coordinator is not recreated after every cycle.
Coordinator cycle count increments per completed coordinator -> author -> reviewer cycle.
Recreation is required after four completed cycles, before next coordinator work.
Context refresh uses Class A plus latest two Class B reports, not unbounded Class B history.
Disposable author/reviewer sessions retire each cycle.
```

If four-cycle testing is too expensive for the release gate, record it as deferred with rationale. Do not imply coordinator lifecycle was live-verified if only one cycle ran.

---

## 14. T4: required fault/negative diagnostics

### 14.1 Deprecated env alias guard

The canonical environment variables are:

```text
SCTL_RUNTIME_DELEGATE_ROOT
SCTL_RUNTIME_DELEGATE_BIN
```

The one-cycle deprecated aliases are:

```text
SCTL_RUNTIME_EDGE_ROOT
SCTL_RUNTIME_EDGE_CLI
```

Test only the alias path in a separate diagnostic run. Do not mix canonical and deprecated variables.

```bash
unset SCTL_RUNTIME_DELEGATE_ROOT SCTL_RUNTIME_DELEGATE_BIN
export SCTL_RUNTIME_EDGE_ROOT="$RUNTIME_DELEGATE_ROOT"
export SCTL_RUNTIME_EDGE_CLI="$RUNTIME_DELEGATE_ROOT/dist/src/cli.js"

set +e
"$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" \
  --assignment-id "${ASSIGNMENT_ID}_ALIAS" \
  --package-root "$PACKAGE_ROOT" \
  --sctl-workspace "$SCTL_WORKSPACE-alias" \
  --codebase-repo "$CODEBASE_REPO" \
  --director-entry-source "$DIRECTOR_ENTRY_SOURCE" \
  --validation-command "$VALIDATION_1" \
  --return-timeout 1 \
  --run-root "$RUN_ROOT-alias" > "$RUN_ROOT/alias_guard.log" 2>&1
status=$?
set -e
cat "$RUN_ROOT/alias_guard.log" | sed -n '1,120p'
```

Expected after alias patch:

```text
harness recognizes deprecated env alias
warning says SCTL_RUNTIME_EDGE_* is deprecated; use SCTL_RUNTIME_DELEGATE_*
run proceeds past delegate-binary validation until the next expected live boundary
```

If the harness reports missing runtime delegate even though `SCTL_RUNTIME_EDGE_*` is set, mark `BROKEN_DEPRECATED_ALIAS_COMPAT`.

### 14.2 Missing Director Entry

```bash
set +e
"$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" \
  --assignment-id "${ASSIGNMENT_ID}_NO_ENTRY" \
  --package-root "$PACKAGE_ROOT" \
  --runtime-delegate-root "$RUNTIME_DELEGATE_ROOT" \
  --runtime-delegate-bin "$SCTL_RUNTIME_DELEGATE_BIN" \
  --sctl-workspace "$SCTL_WORKSPACE-no-entry" \
  --codebase-repo "$CODEBASE_REPO" \
  --cycle-entry-dir "$SCTL_WORKSPACE-no-entry/.strata/cycles/director_entry" \
  --validation-command "$VALIDATION_1" \
  --return-timeout 1 \
  --run-root "$RUN_ROOT-no-entry"
status=$?
set -e
[ "$status" -ne 0 ] || { echo "BROKEN: missing Director Entry did not block"; exit 1; }
```

Expected: `BLOCKED_MISSING_CYCLE_ENTRY` or equivalent bounded failure.

### 14.3 Missing tmux target

Run with a fresh assignment but do not create the Coordinator tmux target.

Expected: `BROKEN_DELEGATE_SESSION_REGISTER` with delegate tmux target evidence.

### 14.4 Wrong return path

Let a worker write files outside:

```text
.strata/returns/<assignment_id>/<wrong_agent_id>/
```

Expected: harness waits for the assigned return path and eventually records `BLOCKED_TIMEOUT`. The tester must not move files to make the run pass unless the objective is post-timeout manual recovery.

### 14.5 Invalid return packet

Put invalid JSON at the correct return path.

Expected: `BROKEN_RETURN_CLASSIFY` or `BROKEN_INVALID_RETURN_PACKET`.

### 14.6 Reviewer result missing

Reviewer submits a structurally valid report without `approved`, `denied`, or `blocked`.

Expected: `BLOCKED_REVIEW_RESULT_UNKNOWN`.

---

## 15. Final audit commands

After every T2/T3 run:

```bash
printf '%s\n' '--- result ---'
sed -n '1,260p' "$RUN_ROOT/flowmap02_result.md"

printf '%s\n' '--- status json ---'
python3 -m json.tool "$RUN_ROOT/flowmap02_result.json" | sed -n '1,260p'

printf '%s\n' '--- step diagnosis ---'
column -t -s $'\t' "$RUN_ROOT/flowmap02_step_diagnosis.tsv" | sed -n '1,260p'

printf '%s\n' '--- SCTL context status/log ---'
git -C "$SCTL_WORKSPACE/.strata/context" status --short
git -C "$SCTL_WORKSPACE/.strata/context" log --oneline -30

printf '%s\n' '--- Codebase status/log ---'
git -C "$CODEBASE_REPO" status --short --branch
git -C "$CODEBASE_REPO" log --oneline --decorate -20

printf '%s\n' '--- dispatch packets ---'
find "$SCTL_WORKSPACE/.strata/context/D_trace/dispatch_packets" -type f -name dispatch_packet.md -print | sort

printf '%s\n' '--- return ledgers ---'
find "$SCTL_WORKSPACE/.strata/context/D_trace/return_ledgers" -type f -print | sort

printf '%s\n' '--- Class B files ---'
find "$SCTL_WORKSPACE/.strata/context/B" -type f -print | sort
```

Archive run evidence:

```bash
mkdir -p "$HOME/sctl-archives"
tar -czf "$HOME/sctl-archives/${ASSIGNMENT_ID}_flowmap02_evidence.tgz" \
  -C "$(dirname "$RUN_ROOT")" "$(basename "$RUN_ROOT")" \
  -C "$SCTL_WORKSPACE" .strata
sha256sum "$HOME/sctl-archives/${ASSIGNMENT_ID}_flowmap02_evidence.tgz" | tee "$RUN_ROOT/evidence_archive_sha256.txt"
```

---

## 16. Acceptance decision rules

### 16.1 Accept as stable baseline

All must be true:

```text
T0 package pin passed.
T1 delegate sanity passed.
negative return path guard passed.
Flowmap 02 harness overall_result is OBSERVED.
No WRONG_METHOD tripwire fired.
No unsupported skip/override was used.
Coordinator work order came from Coordinator return path and was committed as Class B.
Author return classified as OPERATIONAL_REPORT_READY.
Author report entered Class B.
Reviewer return classified as OPERATIONAL_REPORT_READY.
Reviewer recommendation is approved, denied, or blocked.
If approved: declared validation commands ran.
If approved + validation passed + --allow-merge: ff-only merge result is recorded.
Final outcome entered Class B.
Disposable sessions retired.
Coordinator freshness/latest-two context export is present.
SCTL context Git final status is clean.
Codebase Git outcome is recorded and explained.
```

### 16.2 Accept with notes

Allowed only when:

```text
core SCTL/delegate boundary was observed
run reached final outcome or a known non-merge outcome
warnings are recorded and explained
no safety/path/ownership guard failed
```

Typical examples:

```text
WARN_LOCAL_MAIN_NO_UPSTREAM with local-trunk acceptance.
WARN_RETURN_IMPLEMENTATION_REF_MISMATCH explained by post-merge commit movement.
--open-inject-tab used for visual diagnosis.
T3 deferred because release target only requires one-cycle contract acceptance.
```

### 16.3 Reject / block merge

Reject if any are true:

```text
T0 checks fail without approved patch explanation.
negative return path guard accepts `.` or `..`.
deprecated alias compatibility is required and fails.
SCTL Flowmap 02 calls session-create, return-drop, legacy sctl-session-* wrappers, or mock runtime.
Director Entry is bypassed.
SCTL authors Coordinator Work Order.
SCTL dispatches Change Author before a valid Coordinator Work Order Class B commit.
canonical envelope headings are missing.
worker return files are missing or manually moved to pass.
return classification fails.
Class B commit policy rejects structurally valid report based on semantic disagreement.
CI fails and merge still occurs.
merge occurs without reviewer approval or --allow-merge.
SCTL context Git is dirty after final audit.
```

---

## 17. Architecture issue triage

When an issue appears architectural, anchor it to the release-order documents.

| Issue type | Anchor | Decision |
|---|---|---|
| Tester wants to manually run Flowmap 02 steps instead of harness | ADR_06_18 tester entry point | Use safe CLI/harness entry point; do not randomly edit shell harness scripts. |
| Director input has no rigid fields | ADR_06_18 Director Governing Entry | Markdown validity only unless later Class A policy changes. |
| Harness waits for Coordinator work order instead of making one | ADR_06_18 Coordinator boundary | Correct. SCTL must not author role work. |
| SCTL dispatches only after Class A/B commit | ADR_06_18 dispatch progression | Correct. Commit-driven progression. |
| Class B report is wrong but structurally valid | ADR_06_16 Class B policy | Commit as evidence; correct/supersede later. Do not delete like bad code. |
| Coordinator is not recreated every cycle | ADR_06_16 coordinator lifecycle | Correct. Recreate after four completed cycles. |
| Context export includes only latest two Class B reports | ADR_06_16 context feed | Correct unless coordinator fresh recreation path requires Class A + latest two Class B. |
| Offline/dry-run result claimed as acceptance | FLOWMAP_02 and ADR_06_16 live-test policy | Reject as acceptance. It can test mechanics only. |
| SCTL does not own Codebase Git branch correctness | FLOWMAP_02 policy | Correct. Codebase Git owns implementation. SCTL records evidence. |
| Delegate handles tmux paste/capture/terminate | Runtime Session Delegate Contract | Correct. SCTL records/uses delegate evidence. |
| SCTL harness does not call `session-create` | ADR_06_18/alignment boundary | Correct. Existing live tmux targets are registered; session creation is delegate standalone/precondition if used. |
| SCTL harness does not call delegate `return-drop` | ADR_06_18 return path ownership/alignment | Correct for current Flowmap 02. Workers drop files into SCTL-owned return paths. |

---

## 18. Tester report template

Use this template for the final human report.

```text
# SCTL + Runtime Delegate Control Surface Test Report

Tester:
Date/time UTC:
Host / WSL distro:
Node version:
npm version:
git version:
tmux version:

## Package pins

SCTL package root:
SCTL package name/version:
SCTL zip SHA256:
SCTL PACKAGE_CHECKSUMS result:

Delegate package root:
Delegate package name/version:
Delegate zip SHA256:
Delegate PACKAGE_CHECKSUMS result:

Skeleton scan SHA256:
ADR anchors used:
- FLOWMAP_02:
- ADR_06_16:
- ADR_06_18:

## Run inputs

ASSIGNMENT_ID:
SCTL_WORKSPACE:
CODEBASE_REPO:
TRUNK_BRANCH:
SHORT_NAME:
RUN_ROOT:
DIRECTOR_ENTRY_SOURCE:
Validation commands:
- 
- 
Cycles requested:
Return timeout:
Merge authorized: yes/no
Options reducing acceptance strength:

## T0 package/architecture pin

SCTL npm test:
SCTL secret scan:
SCTL shell syntax:
Delegate npm test:
Delegate secret scan:
Forbidden legacy/mock paths absent: yes/no

## T1 delegate sanity

Eight verbs present: yes/no
Negative return path guard: pass/fail
Delegate tmux smoke: pass/fail
Delegate return-drop standalone: pass/fail/not-run

## T2 Flowmap 02 harness

Harness overall_result:
Result report:
Result JSON:
Step diagnosis TSV:
Operational log:
Cycle timeline:

## Evidence checks

Director Entry committed to Class A: yes/no/path
Coordinator work order came from return path: yes/no/path
Coordinator work order committed as Class B: yes/no/path
Author dispatch packet: path
Author return packet: path
Author report: path
Author classification result: OPERATIONAL_REPORT_READY / other
Author Class B file: path
Reviewer dispatch packet: path
Reviewer return packet: path
Reviewer report: path
Reviewer classification result: OPERATIONAL_REPORT_READY / other
Reviewer recommendation: approved/denied/blocked/unknown
CI log: path/result
Merge result: merged/not merged/reason
Final Class B outcome: path
Disposable sessions retired: yes/no
Coordinator latest-two context export: yes/no/path
SCTL context Git clean: yes/no
Codebase Git status explained: yes/no

## Wrong-method checks

Legacy/mock wrappers in evidence: yes/no
SCTL called session-create: yes/no
SCTL called return-drop: yes/no
Manual movement/editing of return files: yes/no

## Failure boundary if incomplete

Status label:
Boundary:
Observed evidence:
Diagnosis:
Next inspection step:

## Acceptance decision

Overall: accepted / accepted with notes / rejected / blocked
Reason:
Required patch before merge:
Evidence archive path:
Evidence archive SHA256:
```

---

## 19. One-page operator checklist

Use this only after reading the full playbook.

```bash
# 1. Pin paths.
export ASSIGNMENT_ID="A_FLOWMAP_02_$(date -u +%Y%m%d%H%M%S)"
export PACKAGE_ROOT="$HOME/workspace/strata-sctl-v0.9.5/Strata"
export RUNTIME_DELEGATE_ROOT="$HOME/workspace/runtime-delegates/strata-runtime-edge-delegate-control-surface"
export SCTL_RUNTIME_DELEGATE_BIN="$RUNTIME_DELEGATE_ROOT/dist/src/cli.js"
export SCTL_WORKSPACE="$HOME/sctl-live/$ASSIGNMENT_ID"
export CODEBASE_REPO="$HOME/workspace/YOUR_CODEBASE_REPO"
export RUN_ROOT="$HOME/sctl-runs/$ASSIGNMENT_ID"
export TRUNK_BRANCH="main"
export SHORT_NAME="small-controlled-change"
export DIRECTOR_ENTRY_SOURCE="$HOME/sctl-inputs/$ASSIGNMENT_ID/director_governing_entry.md"
export VALIDATION_1="npm test"
export VALIDATION_2="npm run lint"
mkdir -p "$SCTL_WORKSPACE" "$RUN_ROOT" "$(dirname "$DIRECTOR_ENTRY_SOURCE")"

# 2. Verify packages.
cd "$PACKAGE_ROOT" && npm test && npm run secret-scan && sha256sum -c PACKAGE_CHECKSUMS.sha256
cd "$RUNTIME_DELEGATE_ROOT" && npm test && npm run secret-scan && sha256sum -c PACKAGE_CHECKSUMS.sha256

# 3. Write Director Entry Markdown.
cat > "$DIRECTOR_ENTRY_SOURCE" <<EOF_DIRECTOR
# Director Governing Entry Document

Assignment: $ASSIGNMENT_ID

Goal:
Run one live Flowmap 02 shell-harness cycle through SCTL and runtime delegate.

Expected change:
Describe the bounded codebase change here.

Validation:
- $VALIDATION_1
- $VALIDATION_2
EOF_DIRECTOR

# 4. Pre-create tmux targets expected by the harness.
for s in "coord-${ASSIGNMENT_ID}-C00-S01" "author-${ASSIGNMENT_ID}-C01-S01" "reviewer-${ASSIGNMENT_ID}-C01-S01"; do
  tmux kill-session -t "$s" 2>/dev/null || true
  tmux new-session -d -s "$s" 'bash --noprofile --norc'
done

# 5. Run the harness.
"$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" \
  --assignment-id "$ASSIGNMENT_ID" \
  --package-root "$PACKAGE_ROOT" \
  --runtime-delegate-root "$RUNTIME_DELEGATE_ROOT" \
  --runtime-delegate-bin "$SCTL_RUNTIME_DELEGATE_BIN" \
  --sctl-workspace "$SCTL_WORKSPACE" \
  --codebase-repo "$CODEBASE_REPO" \
  --director-entry-source "$DIRECTOR_ENTRY_SOURCE" \
  --trunk-branch "$TRUNK_BRANCH" \
  --short-name "$SHORT_NAME" \
  --validation-command "$VALIDATION_1" \
  --validation-command "$VALIDATION_2" \
  --cycles 1 \
  --return-timeout 600 \
  --poll-interval 5 \
  --run-root "$RUN_ROOT" \
  --allow-merge

# 6. Audit.
sed -n '1,260p' "$RUN_ROOT/flowmap02_result.md"
column -t -s $'\t' "$RUN_ROOT/flowmap02_step_diagnosis.tsv" | sed -n '1,260p'
git -C "$SCTL_WORKSPACE/.strata/context" status --short
git -C "$SCTL_WORKSPACE/.strata/context" log --oneline -30
```

---

## 20. Final rule

The shell harness is the operating rail. The human tester is the evidence auditor and boundary diagnostician.

A result is acceptable only when the script-driven cycle produces the expected SCTL Git, delegate JSON, tmux, return-path, Class B, CI/merge, and final audit evidence without crossing the ADR_06_18 Coordinator/SCTL/delegate boundary.
