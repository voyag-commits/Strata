# SCTL & Runtime Delegate Control Surface — System & Operational Diagnosis

**Report ID:** SCTL-ADR0618-DIAG-20260625  
**Author:** Automated Tester (harness-driven)  
**Date:** 2026-06-25  
**Target:** SCTL `0.9.5-delegate-contract` + Runtime Delegate `1.0.0-adr0618`  
**Playbook:** `SCTL_delegate_control_surface_human_tester_playbook_ADR0618_20260625.md`  
**Overall Harness Result:** `BLOCKED_COORDINATOR_WORK_ORDER_REQUIRED`  
**Acceptance Status:** **BLOCKED** — 2 critical findings, 2 warnings

---

## 1. Executive Summary

A live Flowmap 02 shell-harness test was executed against the pinned ADR_06_18 package set in WSL. The harness correctly progressed through 14 orchestration steps before halting at the architectural boundary where a human Coordinator must produce a Class B work order — this is **correct boundary enforcement**.

Four deviations from the ADR_06_18 contract were identified:

| # | Severity | Finding | Blocking? |
|---|---|---|---|
| 1 | **Critical** | `BROKEN_RETURN_PATH_GUARD` — path traversal via `safePart()` | Yes |
| 2 | **Critical** | `CANONICAL_ENVELOPE_TITLE_MISSING` — envelope title metadata never rendered | Yes |
| 3 | Warning | `SCTL_NODE` unbound variable in harness | No |
| 4 | Warning | `BROKEN_DEPRECATED_ALIAS_COMPAT` — deprecated env aliases ignored | Conditional |

---

## 2. Package Pin Verification

### 2.1 Artifact Checksums

| Artifact | Expected SHA256 | Actual SHA256 | Match |
|---|---|---|---|
| `strata_sctl_delegate_contract_aligned_adr0618_v0_9_5.zip` | `8f5a3af8...` | `8f5a3af8...` | ✓ |
| `strata_runtime_edge_delegate_control_surface_adr0618_wsl_ready.zip` | `9dd212a7...` | `9dd212a7...` | ✓ |
| `merge_6-25_skeleton_scan.zip` | `9c4f0c36...` | `9c4f0c36...` | ✓ |

### 2.2 Package Identity

| Package | Expected Name | Expected Version | Actual | Match |
|---|---|---|---|---|
| SCTL | `strata-sctl-kernel-components-1-3-4` | `0.9.5-delegate-contract` | `strata-sctl-kernel-components-1-3-4@0.9.5-delegate-contract` | ✓ |
| Delegate | `strata-runtime-edge-delegate-control-surface` | `1.0.0-adr0618` | `strata-runtime-edge-delegate-control-surface@1.0.0-adr0618` | ✓ |

### 2.3 Preflight Tests

| Check | Result |
|---|---|
| SCTL `npm test` | 27/27 pass, 0 failures |
| Delegate `npm test` | 11/11 pass (clean build + test), 0 failures |
| SCTL secret scan | 0 findings |
| Delegate secret scan | 0 findings |
| SCTL shell syntax (`bash -n`) | All scripts parse cleanly |
| Delegate shell syntax | All scripts parse cleanly |

### 2.4 Forbidden Paths (Playbook §5.3)

All five forbidden paths confirmed absent:

| Path | Status |
|---|---|
| `scripts/wsl_tmux/sctl-session-new` | Absent ✓ |
| `scripts/wsl_tmux/sctl-session-retire` | Absent ✓ |
| `scripts/wsl_tmux/sctl-dispatch-inject` | Absent ✓ |
| `scripts/mock_runtime_delegate/` | Absent ✓ |
| `scripts/adr_06_18_e2e_mock_runtime.sh` | Absent ✓ |

---

## 3. T1: Delegate Control-Surface Sanity

### 3.1 Eight Delegate Verbs — PASS

All eight ADR_06_18 verbs confirmed present:

```
session-register     session-create       dispatch-deliver
return-drop          return-dir            session-capture
session-terminate    session-list
```

### 3.2 Tmux Register/Deliver/Capture/Terminate Smoke — PASS

All four delegate operations executed against a disposable tmux session:

| Verb | Result | Evidence |
|---|---|---|
| `session-register` | `ok: true` | Tmux target bound, session ID `delegate_smoke_001` |
| `dispatch-deliver` | `ok: true` | Packet pasted, SHA256 recorded |
| `session-capture` | `ok: true` | 80-line pane capture written |
| `session-terminate` | `ok: true` | Session killed per `kill-session` policy |

### 3.3 Delegate Return-Drop Standalone — PASS

Files copied correctly under `.strata/returns/<id>/return_drop_smoke_001/`. No path escape in normal operation.

---

## 4. Finding 1: `BROKEN_RETURN_PATH_GUARD` — CRITICAL

### 4.1 Failure Signature

**Command:**
```bash
node dist/src/cli.js delegate return-dir \
  --workspace /tmp/sctl-return-guard \
  --assignment-id '..' \
  --session-id '..'
```

**Actual Output (non-zero exit expected):**
```json
{
  "ok": true,
  "operation": "return_dir",
  "assignment_id": "..",
  "session_id": "..",
  "return_dir": ".strata/returns/../..",
  "timestamp": "2026-06-25T14:37:06.147Z"
}
```

**Exit code:** `0` (should be non-zero)

**Expected per playbook §6.2:** Non-zero exit, machine-readable failure or clear error, no `.strata/returns/../..` accepted path.

### 4.2 Root Cause

**File:** `src/common.ts:159`

```typescript
export function safePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}
```

The character class `[^A-Za-z0-9_.-]` explicitly permits `.` (period) — this means `.`, `..`, and any combination of dots pass through completely unchanged.

**Call site:** `src/contract_delegate.ts:44`

```typescript
return `.strata/returns/${safePart(assignmentId)}/${safePart(sessionId)}`;
```

No pre-validation rejects the values `.`, `..`, or any string containing `/` before `safePart()` is called. With `assignmentId='..'` and `sessionId='..'`, the resulting path resolves to `.strata/returns/../..` which escapes the `.strata/returns/` sandbox.

### 4.3 Exploit Vector

An attacker or misconfigured caller can write return files to **any parent directory of `.strata/`**, potentially overwriting configuration, SCTL context files, or even codebase files outside the SCTL workspace.

### 4.4 Required Patch

Three-layer defense:

1. **Pre-validation** (in `contract_delegate.ts` before calling `safePart()`): Reject any `assignmentId` or `sessionId` equal to `.` or `..` or containing `/` or `\`.
2. **`safePart()` hardening** (in `common.ts`): Strip leading/trailing dots, or reject values consisting solely of dots.
3. **Path resolution guard** (in `contract_delegate.ts` after path construction): `path.resolve()` and verify the resolved path begins with `path.resolve(workspace, '.strata/returns/')`.

---

## 5. T2: Single-Cycle Flowmap 02 Live Harness

### 5.1 Run Configuration

| Parameter | Value |
|---|---|
| Assignment ID | `A_FLOWMAP_02_20260625143824` |
| Codebase repo | `/home/hou16/workspace/test-codebase` |
| Trunk branch | `main` |
| Change branch | `change/A_FLOWMAP_02_20260625143824/C01-add-greet-param` |
| Cycles | 1 |
| Return timeout | 60s |
| Merge authorized | Yes (`--allow-merge`) |
| Validation commands | `python3 code/test_hello.py`, `python3 -c 'from code.hello import greet; ...'` |

### 5.2 Step-by-Step Execution Trace

```
2026-06-25T14:39:32Z  FLOWMAP_02_START
2026-06-25T14:39:34Z  preflight.tests             OBSERVED    package tests passed
2026-06-25T14:39:35Z  preflight.adapters          OBSERVED    adapter syntax passed
2026-06-25T14:39:35Z  0                            OBSERVED    context bootstrap ok
2026-06-25T14:39:35Z  0.director_entry_import     OBSERVED    Markdown copied into .strata/cycles/director_entry/
2026-06-25T14:39:36Z  0.cycle_start               OBSERVED    Director Entry → Class A committed
2026-06-25T14:39:36Z  0.git_panel                  OBSERVED    Git panel caller available
2026-06-25T14:39:36Z  1                            OBSERVED    Coordinator session registered
2026-06-25T14:39:37Z  2.coordinator_dispatch       OBSERVED    Envelope delivered to coord-...-C00-S01
2026-06-25T14:39:37Z  21                           OBSERVED    Latest-2 Class B context export
2026-06-25T14:39:37Z  2                            OBSERVED    Coordinator envelope + latest-2 context
2026-06-25T14:39:37Z  coordinator_before_export    OBSERVED    Standalone context export
2026-06-25T14:39:38Z  cycle_01.3.codebase_repo     OBSERVED    Codebase repo set
2026-06-25T14:39:38Z  cycle_01.3.pull              WARN        main has no upstream
2026-06-25T14:39:38Z  cycle_01.3                   OBSERVED    Change branch created
2026-06-25T14:39:38Z  cycle_01.4                   OBSERVED    Author session registered
2026-06-25T14:40:39Z  cycle_01.5                   BLOCKED     Coordinator work order missing after 60s
2026-06-25T14:40:39Z  0 cycle exit                 OBSERVED    architectural_blocker recorded
2026-06-25T14:40:39Z  FLOWMAP_02_END
```

### 5.3 SCTL Context Git History

```
b80b9d7  cycle exit ... architectural_blocker
d5b0e9f  session register ... change_author_c01
0c7104b  session register ... delegated_coordinator_001
dc27bc5  dispatch record ... N_COORD_CYCLE_...
828b777  cycle entry reference ...
a20edfa  Class A Director Entry Document ...
dfb555e  telemetry context bootstrap
cc89689  strata context bootstrap
```

**SCTL context Git:** Clean (no uncommitted changes) ✓  
**Codebase Git:** Clean, on feature branch ✓

### 5.4 Evidence Inventory

| Evidence | Location | Status |
|---|---|---|
| Operational log | `flowmap02_operational.log` | Present |
| Step diagnosis TSV | `flowmap02_step_diagnosis.tsv` | Present |
| Step status JSONL | `flowmap02_step_status.jsonl` | Present |
| Cycle timeline TSV | `cycle_timeline.tsv` | Present (empty — cycle incomplete) |
| Result report | `flowmap02_result.md` | Present |
| Result JSON | `flowmap02_result.json` | Present |
| Coordinator dispatch packet | `D_trace/dispatch_packets/.../dispatch_packet.md` | Present |
| Director Entry (Class A) | `A/director_governing_entries/...` | Present |
| Active sessions (Class C) | `C/sessions/active_sessions.json` | Present |
| Dispatch log | `D_trace/dispatch_log/...` | Present |
| Context state | `D_trace/context_state.json` | Present |
| Context export | `context_exports/cycle_00/coordinator_initial_latest2/context.md` | Present |

---

## 6. Finding 2: `CANONICAL_ENVELOPE_TITLE_MISSING` — CRITICAL

### 6.1 Failure Signature

**Playbook §10 requirement:**
> Each packet has exactly one canonical title: `# Initial task coordination envelope` or `# SCTL Dispatch Envelope`

**Actual dispatch packet first line:**
```
The director has assigned the task definition and authoritative goals, decisions via...
```

No canonical `#` title heading anywhere in the pasted body.

### 6.2 Root Cause

**File:** `Strata/src/lib/dispatch_outbox.js:75-76, 209-211, 225`

The canonical title is computed:
```javascript
function titleForEnvelope(envelopeType) {
  return envelopeType === INITIAL_ENVELOPE_TYPE 
    ? "# Initial task coordination envelope" 
    : "# SCTL Dispatch Envelope";
}
```

But the markdown body construction at line 225 uses only `header` (role-specific prose) instead of `title`:

```javascript
const markdown = [
    header,        // ← role prose, NOT "# SCTL Dispatch Envelope"
    "",
    `assignment_id: ${assignmentId}`,
    ...
].join("\n");
```

The `title` variable is computed but stored only in `packet.envelope_title` metadata (line 243) — never rendered into the pasted markdown body.

### 6.3 Impact

Without the canonical title heading, automated consumers (and human workers) cannot reliably identify the dispatch type from the pasted body. This violates ADR_06_18's simplified dispatch envelope contract which requires the canonical title as the first line of every pasted envelope.

### 6.4 Required Patch

In `dispatch_outbox.js` at ~line 225, change:
```javascript
const markdown = [
    header,
    "",
    `assignment_id: ${assignmentId}`,
```
to:
```javascript
const markdown = [
    title,         // ← canonical "# Initial task coordination envelope" or "# SCTL Dispatch Envelope"
    "",
    header,
    "",
    `assignment_id: ${assignmentId}`,
```

---

## 7. Finding 3: `SCTL_NODE` Unbound Variable — WARNING

### 7.1 Failure Signature

```
/home/hou16/.../live_cycle_harness.sh: line 705: SCTL_NODE: unbound variable
```

### 7.2 Root Cause

**File:** `flowmaps/flowmap02/live_cycle_harness.sh:705`

```bash
_out=("$SCTL_NODE" "$SCTL_RUNTIME_DELEGATE_BIN" delegate "$@")
```

The harness references `$SCTL_NODE` without a default. The adapter common script defines the fallback:

**File:** `scripts/wsl_tmux/_sctl_adapter_common.sh:17`
```bash
SCTL_NODE="${SCTL_NODE:-node}"
```

But the harness never sources `_sctl_adapter_common.sh`. The harness must either:
1. Source the adapter common script, or
2. Define its own `SCTL_NODE="${SCTL_NODE:-node}"` default

### 7.3 Required Patch

Add at or before line 705 of `live_cycle_harness.sh`:
```bash
SCTL_NODE="${SCTL_NODE:-node}"
```

---

## 8. Finding 4: `BROKEN_DEPRECATED_ALIAS_COMPAT` — WARNING

### 8.1 Failure Signature

Setting deprecated env vars:
```bash
export SCTL_RUNTIME_EDGE_ROOT="/path/to/delegate"
export SCTL_RUNTIME_EDGE_CLI="/path/to/delegate/dist/src/cli.js"
```

Harness output:
```
error: SCTL runtime delegate required. Set --runtime-delegate-bin or --runtime-delegate-root.
```

### 8.2 Root Cause

**File:** `flowmaps/flowmap02/live_cycle_harness.sh`

The harness contains zero references to `SCTL_RUNTIME_EDGE_ROOT` or `SCTL_RUNTIME_EDGE_CLI`. The deprecated aliases are simply never checked.

Per playbook §14.1: If the harness reports missing runtime delegate even though `SCTL_RUNTIME_EDGE_*` is set, mark `BROKEN_DEPRECATED_ALIAS_COMPAT`.

### 8.3 Required Patch (if alias compatibility is required)

In the harness variable initialization, add:
```bash
# One-cycle deprecated aliases
if [ -z "$SCTL_RUNTIME_DELEGATE_ROOT" ] && [ -n "$SCTL_RUNTIME_EDGE_ROOT" ]; then
  SCTL_RUNTIME_DELEGATE_ROOT="$SCTL_RUNTIME_EDGE_ROOT"
  echo "WARNING: SCTL_RUNTIME_EDGE_ROOT is deprecated; use SCTL_RUNTIME_DELEGATE_ROOT" >&2
fi
if [ -z "$SCTL_RUNTIME_DELEGATE_BIN" ] && [ -n "$SCTL_RUNTIME_EDGE_CLI" ]; then
  SCTL_RUNTIME_DELEGATE_BIN="$SCTL_RUNTIME_EDGE_CLI"
  echo "WARNING: SCTL_RUNTIME_EDGE_CLI is deprecated; use SCTL_RUNTIME_DELEGATE_BIN" >&2
fi
```

---

## 9. Wrong-Method Tripwire Audit (Playbook §11.4)

| Tripwire | Result |
|---|---|
| Legacy `sctl-session-*` wrappers in evidence | Clean ✓ |
| Mock runtime `mock_runtime` in evidence | Clean ✓ |
| `delegate session-create` called by harness | Clean ✓ |
| `delegate return-drop` called by harness | Clean ✓ |
| SCTL authoring Coordinator work order | Clean ✓ (correctly blocked) |

---

## 10. Architectural Boundary Verification

### 10.1 Ownership Boundaries — Confirmed

| Domain | Owner | Evidence |
|---|---|---|
| Director Entry → Class A commit | SCTL | `A/director_governing_entries/...` committed |
| Cycle start/exit record | SCTL | `D_trace/cycles/active_cycle.json` + exit JSON |
| SCTL context Git | SCTL | 8 clean commits, no dirty state |
| Context export | SCTL | `context_exports/` directory populated |
| Canonical dispatch render/record | SCTL | `D_trace/dispatch_packets/` + `dispatch_log/` |
| Class B structural commit | SCTL | `classb.js` tests pass (structural validation) |
| Return classification | SCTL | `worker_returns.js` tests pass |
| Session metadata | SCTL | `C/sessions/active_sessions.json` |
| Tmux binding | Delegate | `session-register` JSON evidence |
| Packet delivery | Delegate | `dispatch-deliver` JSON evidence |
| Tmux capture | Delegate | `session-capture` JSON evidence |
| Session termination | Delegate | `session-terminate` JSON evidence |
| Implementation code | Codebase Git | Feature branch created, worktree clean |

### 10.2 Coordinator Boundary — Correctly Enforced

Per ADR_06_18 §Coordinator boundary:
> SCTL must not author role work

The harness correctly:
1. Delivered the Director/Class A context envelope to the Coordinator tmux pane
2. Waited 60 seconds for `coordinator_work_order.md` at `.strata/returns/<id>/delegated_coordinator_001/`
3. Raised `BLOCKED_COORDINATOR_WORK_ORDER_REQUIRED` when work order was not produced
4. Did not fabricate, generate, or substitute a work order

This is correct architectural behavior — a human or AI Coordinator must produce the work order.

---

## 11. Cycle State at Block Point

```
context_epoch: 0
class_a_revision: 1
class_b_revision: 0
refresh_required: true (Class A update)
class_b_updates_since_full_refresh: 0
context_update_policy: class_a_full_latest2_class_b_cycle_math
```

| Active Sessions | ID | Role | Mode |
|---|---|---|---|
| Coordinator | `delegated_coordinator_001` | Delegated Coordinator | persistent |
| Author | `change_author_c01` | Change Author | disposable |

**Next step to resume:** A Coordinator must submit `coordinator_work_order.md` to `.strata/returns/A_FLOWMAP_02_20260625143824/delegated_coordinator_001/` for the harness to proceed past the `BLOCKED` boundary.

---

## 12. T4 Negative Path Diagnostics

| Test | Expected Diagnosis | Actual Diagnosis | Pass |
|---|---|---|---|
| Missing Director Entry | `BLOCKED_MISSING_CYCLE_ENTRY` | `BLOCKED_MISSING_CYCLE_ENTRY` | ✓ |
| Missing tmux target | `BROKEN_DELEGATE_SESSION_REGISTER` | `BROKEN_DELEGATE_SESSION_REGISTER` | ✓ |
| Deprecated env aliases | Warn + proceed | `BROKEN_DEPRECATED_ALIAS_COMPAT` (no recognition) | ✗ |

---

## 13. Acceptance Decision

### 13.1 Decision: BLOCKED (per playbook §16.3)

**Blocking findings (must-fix before stable baseline):**

1. **`BROKEN_RETURN_PATH_GUARD`** — Path traversal via `.`/`..` in assignment/session IDs allows escape from `.strata/returns/` sandbox. Affects `common.ts:159` + `contract_delegate.ts:44`.

2. **`CANONICAL_ENVELOPE_TITLE_MISSING`** — ADR_06_18 canonical envelope title computed but never rendered into pasted markdown body. Affects `dispatch_outbox.js:209-225`.

**Non-blocking warnings (documented, fix recommended):**

3. **`SCTL_NODE` unbound** — Harness crashes without manual `export SCTL_NODE=node`. Affects `live_cycle_harness.sh:705`.

4. **`BROKEN_DEPRECATED_ALIAS_COMPAT`** — One-cycle deprecated `SCTL_RUNTIME_EDGE_*` env aliases not recognized.

### 13.2 What Is Correct

- T0 package integrity: all checksums match, all 38 tests pass, 0 secret findings
- T1 delegate verbs: all 8 operational in tmux
- T2 orchestration rail: 14 steps executed, correctly blocking at Coordinator boundary
- Ownership boundaries: SCTL/Delegate/Codebase separation clean
- Wrong-method tripwires: all clean — no legacy wrappers, no session-create, no return-drop
- Negative path guards: missing Director Entry and missing tmux target correctly blocked
- Commit-driven dispatch progression working
- Context export latest-2 Class B policy active
- Session registration/retirement lifecycle functional
- SCTL context Git clean after run

---

## 14. Evidence Archive

```
Path: /home/hou16/sctl-runs/
Primary run:    A_FLOWMAP_02_20260625143824/
Diagnostic runs:
  A_DIAG_20260625144200-no-entry/     (T4.2: missing Director Entry)
  A_DIAG_NOTMUX_20260625144234/       (T4.3: missing tmux target)
  A_DIAG_..._alias/                   (T4.1: deprecated aliases)
```

Key evidence files per run:
- `flowmap02_result.md` — Human-readable result report
- `flowmap02_result.json` — Machine-readable result
- `flowmap02_step_diagnosis.tsv` — Step-by-step diagnosis
- `flowmap02_operational.log` — Full operational log
- `flowmap02_step_status.jsonl` — Structured step status
- `cycle_timeline.tsv` — Cycle timeline
- `context_exports/` — Context export directory

SCTL context: `/home/hou16/sctl-live/A_FLOWMAP_02_20260625143824/.strata/context/`
Codebase: `/home/hou16/workspace/test-codebase/`

---

*End of diagnosis. This report was produced by automated tester execution following `SCTL_delegate_control_surface_human_tester_playbook_ADR0618_20260625.md` tiers T0–T4. No manual file edits, no offline/fixture bypasses, no unapproved skips.*
