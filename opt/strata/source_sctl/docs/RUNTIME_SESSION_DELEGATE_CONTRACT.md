# Runtime Session Delegate Contract - ADR 06/26 Alignment

Status: ADR 06/26 live Flowmap 02 runtime boundary.

SCTL interacts with the runtime delegate through the eight delegate verbs:

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

Canonical Flowmap 02 acceptance uses `session-create`, `dispatch-deliver`, `return-dir`, `session-capture`, and `session-list`. `session-register` is diagnostic/compatibility-only. `session-terminate` is explicit cleanup/diagnostic-only and is not part of normal Flowmap 02 lifecycle.

## 1. Session launch / resolve

SCTL calls:

```bash
node dist/src/cli.js delegate session-create \
  --workspace <SCTL_WORKSPACE> \
  --assignment-id <assignment_id> \
  --cycle-id <cycle_id> \
  --role coordinator|coder|reviewer \
  --session-id <logical_session_id> \
  --retire-policy explicit-only \
  [--resolve-existing] \
  [--config <launcher_delegate.local.json>]
```

Required output includes:

```json
{
  "ok": true,
  "operation": "session_create",
  "session_id": "change_author_c01",
  "role": "coder",
  "return_dir": ".strata/returns/A001/change_author_c01",
  "tmux_session_name": "STRATA-CODER-A001-CHANGE_AUTHOR_C01",
  "tmux_target": "STRATA-CODER-A001-CHANGE_AUTHOR_C01:0.0",
  "evidence_path": ".strata-runtime/evidence/.../session_register_result.json"
}
```

SCTL records both the logical session id and resolved runtime identity in its session registry. Runtime role labels are exactly:

```text
coordinator
coder
reviewer
```

## 2. Registry-locked dispatch delivery

SCTL calls:

```bash
node dist/src/cli.js delegate dispatch-deliver \
  --workspace <SCTL_WORKSPACE> \
  --session-id <logical_session_id> \
  --packet <dispatch_packet.md> \
  --dispatch-log <RUN_ROOT/operation.json>
```

The delegate resolves the logical session id through its registry and delivers to the registered runtime tmux target. SCTL must not derive the tmux target itself.

The delegate must deliver the packet unchanged and record packet SHA256 evidence. Runtime operational evidence is primary proof of delivery accuracy.

## 3. Return path

Workers submit under the logical return path:

```text
.strata/returns/<assignment_id>/<logical_session_id>/
```

Runtime session names are not return path keys.

## 4. Logical lifecycle

Normal SCTL Flowmap 02 marks logical sessions released, closed, or superseded. It does not call `session-terminate` and does not kill runtime sessions.

`session-terminate` remains an explicit cleanup tool. A binding with `retire_policy: explicit-only` requires the operator to pass a destructive retire policy such as `--retire-policy kill-session` before the delegate will kill a runtime target.

## 5. Failure envelope

All failures are machine-readable:

```json
{
  "ok": false,
  "error_code": "...",
  "message": "...",
  "evidence_path": null,
  "recoverable": true
}
```

## 6. Safety invariant

SCTL and delegate path segment sanitizers reject dot-only path segments such as `.`, `..`, and `...`. Derived return and dispatch paths must stay inside their declared workspace roots.
