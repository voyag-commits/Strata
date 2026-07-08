# ADR 06/26: Runtime Delegate Launch, Registry-Locked Dispatch, and Logical Session Release

## Status

Accepted for the ADR 06/26 surgical patch delivery.

## Supersession scope

This ADR updates the runtime session materialization and session lifecycle portions of the ADR 06/18 SCTL + runtime delegate alignment. It does not replace these existing decisions:

- Director Governing Entry Document remains Class A authority input.
- The Coordinator -> Change Author -> Code Reviewer cycle remains the Flowmap 02 work shape.
- SCTL must not author Coordinator, Change Author, or Reviewer work.
- Class B reports remain structurally committed unless rejected for format, schema, path, safety, or required-field problems.
- The canonical envelope body remains a fixed wrapper around exported context plus a submission template.
- Worker return paths remain SCTL-owned.

## Decision record

### 1. SCTL must launch or resolve runtime sessions through the delegate

Flowmap 02 live acceptance must not depend on manually pre-created tmux targets. The canonical live path is:

```text
SCTL decides that a role turn is needed.
SCTL calls the runtime delegate session-create verb.
The delegate launches or resolves the live tmux-backed runtime session.
The delegate writes the runtime binding registry.
SCTL records the logical session id and resolved runtime session identity.
SCTL uses the delegate registry for dispatch, capture, and return path lookup.
```

The delegate remains the runtime boundary. SCTL must not create tmux sessions directly in the canonical Flowmap 02 path.

### 2. Session-register is diagnostic and compatibility-only

The delegate `session-register` verb remains valid for binding a pre-existing tmux pane during diagnostics, migration, or controlled compatibility testing. It is not the canonical live end-to-end Flowmap 02 acceptance path.

A release acceptance run that uses only `session-register` must be labeled diagnostic unless a later ADR explicitly reauthorizes register-only acceptance.

### 3. Exact runtime role labels are preserved

SCTL role names map to the following runtime labels exactly:

| SCTL role | Runtime role label |
|---|---|
| Delegated Coordinator / Coordinator | `coordinator` |
| Change Author | `coder` |
| Code Reviewer | `reviewer` |

Aliases may be accepted at adapters, but the normalized runtime labels above are the values that should be recorded and sent to the delegate.

### 4. Registry-locked dispatch

There may be many live sessions at the same time. Dispatch must lock onto the correct session through the runtime delegate registry.

SCTL supplies the logical session id to the delegate `dispatch-deliver` verb. The delegate resolves that logical id to the registered runtime tmux target and delivers the packet unchanged. SCTL must not infer dispatch targets from tmux session names or from display heuristics.

### 5. Dispatch delivery belongs to the delegate contract

SCTL owns these actions:

```text
validate context state
commit Class A/Class B state
export context
render the canonical packet body
choose the logical session id
call the delegate contract
record SCTL-side operation logs
wait for worker returns
advance cycle state
```

The delegate owns these actions:

```text
launch or resolve runtime session
maintain the runtime binding registry
resolve logical session id to runtime tmux target
paste/submit packet content into the runtime session
copy packet evidence for SHA256 verification
capture pane output
optionally terminate sessions only when explicitly requested
```

SCTL records the delegate result, but the runtime operational log is the primary evidence for delivery accuracy.

### 6. D_trace is not primary runtime delivery evidence

SCTL may keep packet render artifacts and trace references under the existing D_trace layout for compatibility. Those artifacts are not primary proof of runtime delivery.

The primary delivery evidence is the delegate operational evidence, currently under:

```text
.strata-runtime/evidence/delegate_control/dispatch_delivery/<logical_session_id>/<timestamp>/
```

SCTL records references to that evidence in RUN_ROOT and in SCTL operation logs when available.

### 7. Return paths are keyed by logical session id

Worker return paths remain stable SCTL paths:

```text
.strata/returns/<assignment_id>/<logical_session_id>/
```

Runtime session names are not used as return path keys. Runtime names can contain provider-specific material and can change across implementations. The logical session id is the SCTL-owned return contract.

### 8. Normal Flowmap 02 does not terminate runtime sessions

SCTL registry lifecycle is logical. Normal Flowmap 02 completion must not call delegate `session-terminate` and must not kill tmux/Codex runtime sessions.

Allowed lifecycle states include:

```text
active
released
closed
superseded
```

`released` means SCTL no longer routes normal work to that logical session. It does not mean the runtime process was killed.

The delegate `session-terminate` verb remains available only for explicit operator cleanup, diagnostics, or separately authorized destructive tests. It is not required for acceptance.

### 9. Coordinator persistence and recreation

The Coordinator is semi-persistent:

```text
Coordinator: resolve-or-launch, persistent across cycles 1 through 4.
Change Author: launch a new logical runtime session per cycle.
Code Reviewer: launch a new logical runtime session per cycle.
After return: mark Author/Reviewer logical sessions released/closed; do not kill runtime sessions.
```

After four completed Coordinator -> Author -> Reviewer cycles, SCTL starts a new logical Coordinator session and the delegate launches or resolves a new runtime session for that logical Coordinator. The old Coordinator logical session is marked superseded or released. The old runtime session remains alive unless an explicit cleanup command is issued.

### 10. Failure classification

`MISSING_SESSION_TARGET` after Class A commit and packet render is a runtime materialization or registry-resolution failure. It is not a Director Entry failure and not a canonical envelope-render failure.

Relevant Flowmap 02 failure classes:

| Failure | Boundary |
|---|---|
| `BROKEN_RUNTIME_DELEGATE` | delegate binary or provider setup |
| `BROKEN_DELEGATE_SESSION_CREATE` | delegate could not launch/resolve runtime session |
| `MISSING_SESSION_TARGET` | runtime session not materialized or not present in delegate registry |
| `INJECTION_TARGET_MISMATCH` | delivery used a target not resolved from registry |
| `BROKEN_DELEGATE_DISPATCH_DELIVER` | delegate dispatch delivery failed |
| `BLOCKED_TIMEOUT` | worker did not return files in the assigned logical return path |
| `BROKEN_INVALID_RETURN_PACKET` | return packet exists but is invalid |

### 11. Path containment is a hard safety invariant

SCTL and delegate path segment sanitizers must reject dot-only segments such as:

```text
.
..
...
```

Derived write paths must remain inside their intended roots. This applies to return directories, dispatch packet directories, context trace directories, and runtime evidence directories.

## Implementation requirements

The ADR 06/26 patch implements the following minimum changes:

1. Flowmap 02 harness calls delegate `session-create` for canonical live role materialization.
2. Harness stores delegate-resolved runtime identity into SCTL session metadata.
3. Harness dispatches through delegate `dispatch-deliver` using logical session id, letting the delegate registry resolve the runtime target.
4. Harness marks sessions released/superseded through SCTL registry commands and does not call delegate `session-terminate` during normal Flowmap 02.
5. Delegate `session-create` supports resolve-existing behavior for persistent Coordinator use.
6. Runtime role labels are normalized to `coordinator`, `coder`, and `reviewer`.
7. SCTL and delegate guards reject dot-only path segments.
8. Tests cover dot-segment path rejection and return path containment.

## Acceptance consequences

A clean ADR 06/26 Flowmap 02 acceptance run must show:

```text
Director Markdown accepted as Class A.
Coordinator logical session launched/resolved through delegate session-create.
Delegate registry contains the logical session id and runtime session identity.
Dispatch delivery result references the logical session id and resolved runtime session name.
No normal-flow delegate session-terminate call is present.
Author/Reviewer logical sessions are released/closed after return, with runtime sessions left alive.
Coordinator persists across cycles 1 through 4 and is superseded after the fourth completed cycle.
Worker returns appear under .strata/returns/<assignment_id>/<logical_session_id>/.
Path guard negative tests reject dot-only assignment/session/nonce/target ids.
```

## Remaining compatibility notes

The current delegate contract still includes `session-register` and `session-terminate`. They are valid verbs, but their normal Flowmap 02 role is changed:

- `session-register`: diagnostic/compatibility only.
- `session-terminate`: explicit cleanup/diagnostic only.

The current SCTL package still retains legacy D_trace-compatible paths. In this ADR they are packet trace artifacts, not primary runtime-delivery proof.
