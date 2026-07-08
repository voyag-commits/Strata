# Flowmap 02 Live Tester Playbook - ADR 06/26 Runtime Delegate Launch Path

## Status

Current tester playbook for the ADR 06/26 runtime delegate launch/resolve patch.

This playbook supersedes the register-only tmux pre-creation procedure for canonical Flowmap 02 live acceptance. Register-only testing remains available as a diagnostic mode.

## 0. Operating model

The live Flowmap 02 rail is:

```text
Director Governing Entry Markdown
-> SCTL Class A commit
-> SCTL context export and canonical packet render
-> delegate session-create launch/resolve
-> delegate dispatch-deliver through registry-locked logical session id
-> worker return files in SCTL logical return path
-> SCTL return classification and Class B commit
-> next role launch/resolve
-> logical session release, no runtime kill
```

SCTL does not create tmux sessions directly. SCTL calls the runtime delegate. The delegate owns runtime session creation/resolution, binding registry, packet delivery, capture, and optional explicit termination.

## 1. Terms

| Term | Meaning |
|---|---|
| `logical_session_id` | SCTL-owned role session id, such as `delegated_coordinator_001`, `change_author_c01`, or `reviewer_c01`. |
| `runtime_session_name` | Delegate-resolved tmux/runtime session name. This is recorded, but it is not the return path key. |
| `runtime_role` | Exact delegate role label: `coordinator`, `coder`, or `reviewer`. |
| `runtime operational log` | Delegate evidence under `.strata-runtime/evidence/...`; primary runtime delivery evidence. |
| `logical release` | SCTL marks a role session released/closed/superseded. Runtime session remains alive. |

## 2. Package pin and local paths

Set explicit paths before the run:

```bash
export ASSIGNMENT_ID="A_FLOWMAP_02_$(date -u +%Y%m%d%H%M%S)"
export PACKAGE_ROOT="$HOME/workspace/strata-sctl-v0.9.5/Strata"
export RUNTIME_DELEGATE_ROOT="$HOME/workspace/runtime-delegates/strata-runtime-edge-delegate-control-surface"
export SCTL_RUNTIME_DELEGATE_ROOT="$RUNTIME_DELEGATE_ROOT"
export SCTL_RUNTIME_DELEGATE_BIN="$RUNTIME_DELEGATE_ROOT/dist/src/cli.js"
export SCTL_RUNTIME_LAUNCH_CONFIG="$HOME/workspace/.strata-runtime/config/launcher_delegate.local.json"
export SCTL_WORKSPACE="$HOME/sctl-live/$ASSIGNMENT_ID"
export CODEBASE_REPO="$HOME/workspace/YOUR_CODEBASE_REPO"
export RUN_ROOT="$HOME/sctl-runs/$ASSIGNMENT_ID"
export TRUNK_BRANCH="main"
export SHORT_NAME="small-controlled-change"
export DIRECTOR_ENTRY_SOURCE="$HOME/sctl-inputs/$ASSIGNMENT_ID/director_governing_entry.md"
export VALIDATION_1="npm test"
mkdir -p "$SCTL_WORKSPACE" "$RUN_ROOT" "$(dirname "$DIRECTOR_ENTRY_SOURCE")"
```

Deprecated aliases may be tested separately, but canonical variables are:

```text
SCTL_RUNTIME_DELEGATE_ROOT
SCTL_RUNTIME_DELEGATE_BIN
```

## 3. Preflight checks

SCTL package:

```bash
cd "$PACKAGE_ROOT"
node -e 'const p=require("./package.json"); console.log(p.name, p.version)'
sha256sum -c PACKAGE_CHECKSUMS.sha256
npm test
npm run secret-scan
find scripts flowmaps -name '*.sh' -type f -print0 | xargs -0 -n1 bash -n
```

Delegate package:

```bash
cd "$RUNTIME_DELEGATE_ROOT"
node -e 'const p=require("./package.json"); console.log(p.name, p.version)'
sha256sum -c PACKAGE_CHECKSUMS.sha256
npm test
npm run secret-scan
node "$SCTL_RUNTIME_DELEGATE_BIN" delegate session-list --workspace "$SCTL_WORKSPACE"
```

Provider config check:

```bash
if [ ! -f "$SCTL_RUNTIME_LAUNCH_CONFIG" ]; then
  node "$SCTL_RUNTIME_DELEGATE_BIN" provider init-template --out "$SCTL_RUNTIME_LAUNCH_CONFIG"
fi
node "$SCTL_RUNTIME_DELEGATE_BIN" provider doctor --config "$SCTL_RUNTIME_LAUNCH_CONFIG"
```

Record Node, npm, git, tmux, delegate binary, and launcher config paths in the run manifest.

## 4. Required negative guard

Run the path guard before live acceptance:

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

Expected: non-zero exit with machine-readable failure.

## 5. Director Entry

The Director Governing Entry Document is opaque Markdown. It must not require semantic headings or frontmatter.

```bash
cat > "$DIRECTOR_ENTRY_SOURCE" <<EOF_DIRECTOR
# Director Governing Entry Document

Assignment: $ASSIGNMENT_ID

Goal:
Run one live Flowmap 02 cycle through SCTL and the runtime delegate launch/resolve path.

Implementation target:
Codebase repository: $CODEBASE_REPO
Trunk branch: $TRUNK_BRANCH
Change branch short name: $SHORT_NAME

Expected change:
Describe the smallest safe codebase change here.

Validation:
- $VALIDATION_1
EOF_DIRECTOR
```

Acceptance: SCTL commits this document into Class A and creates cycle metadata referencing the Class A path, SHA256, Git commit, and contract/runtime id.

## 6. Do not pre-create tmux targets for canonical acceptance

Canonical ADR 06/26 acceptance must use delegate `session-create` launch/resolve.

Do not create these targets manually for the canonical run:

```text
coord-<assignment>-C00-S01
author-<assignment>-C01-S01
reviewer-<assignment>-C01-S01
```

A run that only registers manually pre-created targets is diagnostic. It is not the clean acceptance path.

## 7. Launch the live Flowmap 02 harness

```bash
"$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" \
  --assignment-id "$ASSIGNMENT_ID" \
  --package-root "$PACKAGE_ROOT" \
  --runtime-delegate-root "$RUNTIME_DELEGATE_ROOT" \
  --runtime-delegate-bin "$SCTL_RUNTIME_DELEGATE_BIN" \
  --runtime-launch-config "$SCTL_RUNTIME_LAUNCH_CONFIG" \
  --sctl-workspace "$SCTL_WORKSPACE" \
  --codebase-repo "$CODEBASE_REPO" \
  --director-entry-source "$DIRECTOR_ENTRY_SOURCE" \
  --trunk-branch "$TRUNK_BRANCH" \
  --short-name "$SHORT_NAME" \
  --validation-command "$VALIDATION_1" \
  --cycles 1 \
  --return-timeout 600 \
  --poll-interval 5 \
  --run-root "$RUN_ROOT" \
  --allow-merge
```

Do not use `--allow-merge` unless the tester is authorized to merge the codebase branch.

## 8. Required runtime evidence

After launch, inspect delegate registry state:

```bash
node "$SCTL_RUNTIME_DELEGATE_BIN" delegate session-list --workspace "$SCTL_WORKSPACE" | tee "$RUN_ROOT/final_delegate_session_list.json"
```

Expected logical sessions for one cycle:

| Logical session id | Runtime role | Expected runtime status |
|---|---|---|
| `delegated_coordinator_001` | `coordinator` | active or observed_alive |
| `change_author_c01` | `coder` | created/observed_alive, then SCTL logical release after return |
| `reviewer_c01` | `reviewer` | created/observed_alive, then SCTL logical release after return |

The registry must expose a runtime identity such as `runtime_session_name`, `tmux_session_name`, `tmux_target`, or equivalent delegate binding fields. Dispatch and capture must use the delegate registry resolution rather than synthetic tmux name guesses.

## 9. Dispatch evidence audit

For each dispatch-deliver operation, inspect both harness JSON and delegate evidence:

```bash
find "$RUN_ROOT" -name '*dispatch*deliver*.json' -print | sort
find "$SCTL_WORKSPACE/.strata-runtime/evidence/delegate_control/dispatch_delivery" -type f -name 'dispatch_delivery_result.json' -print | sort
```

Each delegate delivery result should show:

```text
ok: true
session_id: <logical_session_id>
runtime_session_name or tmux_target: present
packet_sha256: present
delivered packet evidence path: present
```

The packet must be delivered unchanged by the delegate. Content correctness is verified by comparing packet SHA256 and the copied dispatch packet evidence.

## 10. Canonical envelope audit

Inspect SCTL packet render artifacts and delegate-delivered packet copies. The pasted packet body must contain:

```text
<fixed role/envelope header>

assignment_id: <assignment_id>

# Below is system level full context picture.

<context export>

# This is the template you use for submission

<role-selected submission template>
```

Only `assignment_id` belongs in the pasted envelope body as metadata. Runtime target, target role, nonce, source path, source SHA, source Git commit, template path, and delivery result belong in operational artifacts.

## 11. Worker return paths

Return paths are keyed by logical session id:

```text
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/delegated_coordinator_001/coordinator_work_order.md
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/change_author_c01/packet.json
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/change_author_c01/operational_report.md
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/reviewer_c01/packet.json
$SCTL_WORKSPACE/.strata/returns/$ASSIGNMENT_ID/reviewer_c01/operational_report.md
```

Do not move files from another return directory to make a run pass. Wrong return path should produce timeout or classification failure.

## 12. Logical release and no runtime kill

Normal Flowmap 02 must not call:

```bash
node "$SCTL_RUNTIME_DELEGATE_BIN" delegate session-terminate ...
```

The normal harness should call SCTL logical release for Author and Reviewer after their returns, and for Coordinator only when superseded after the fourth completed cycle.

Audit:

```bash
if grep -R "delegate session-terminate" "$RUN_ROOT" "$SCTL_WORKSPACE/.strata" 2>/dev/null; then
  echo "WRONG_METHOD: normal Flowmap 02 called destructive runtime termination"
  exit 1
fi
```

`session-terminate` may be tested separately as an explicit cleanup diagnostic. It is not acceptance evidence for the normal cycle.

## 13. Coordinator lifecycle

For four-cycle testing:

```text
Cycle 1: Coordinator logical session delegated_coordinator_001 remains active after recurring dispatch.
Cycle 2: same Coordinator continues.
Cycle 3: same Coordinator continues.
Cycle 4: after completion, old Coordinator logical session is marked superseded/released; a new Coordinator logical session is launched/resolved.
Runtime sessions are not killed automatically.
```

Context feed remains Class A plus latest two Class B reports unless a later ADR changes this policy.

## 14. Failure diagnosis

| Status | Boundary | Meaning |
|---|---|---|
| `BROKEN_RUNTIME_DELEGATE` | delegate preflight | Delegate binary or provider command cannot run. |
| `BROKEN_DELEGATE_SESSION_CREATE` | runtime materialization | Delegate could not launch or resolve the runtime session. |
| `MISSING_SESSION_TARGET` | runtime registry | A logical session was requested but no live registry target was found. |
| `BROKEN_DELEGATE_DISPATCH_DELIVER` | runtime dispatch | Delegate could not deliver packet through the registered target. |
| `INJECTION_TARGET_MISMATCH` | runtime dispatch | Delivery did not use the registry-resolved runtime target. |
| `COORDINATOR_WORK_ORDER_MISSING` | role boundary | Coordinator did not submit required Class B work order. |
| `DISPATCH_PROGRESSION_BYPASS` | SCTL boundary | SCTL launched next role before required committed context existed. |
| `BLOCKED_TIMEOUT` | return path | Worker did not submit files under the assigned logical return path. |
| `BROKEN_INVALID_RETURN_PACKET` | return validation | Return packet exists but is structurally invalid. |
| `WRONG_METHOD_TERMINATE` | lifecycle | Normal Flowmap 02 killed a runtime session. |

## 15. Acceptance decision

Accept as stable ADR 06/26 baseline only if all are true:

```text
SCTL and delegate package checks pass.
Negative path guard rejects dot-only path segments.
Director opaque Markdown is committed into Class A.
Coordinator, Author, and Reviewer are launched/resolved through delegate session-create.
SCTL session metadata records logical session id and delegate-resolved runtime identity.
Dispatch delivery uses delegate dispatch-deliver and references the logical session id.
Delegate runtime operational evidence exists for each delivery.
Worker returns use logical return paths.
SCTL does not author role work.
SCTL does not dispatch next role before required Class A/Class B commit.
Normal Flowmap 02 does not call delegate session-terminate.
SCTL records logical release/closed/superseded state without killing runtime sessions.
SCTL context final state is explainable and clean according to the current package policy.
Codebase Git outcome is recorded and explained.
```
