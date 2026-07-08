# WSL Runtime Delegate User Manual - ADR 06/26

## Canonical Flowmap 02 use

SCTL uses the delegate as the runtime session boundary. The canonical live path launches or resolves runtime sessions through `delegate session-create`, dispatches through `delegate dispatch-deliver`, and leaves runtime sessions alive after SCTL logical release.

## Session launch / resolve

```bash
node dist/src/cli.js delegate session-create \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id "$ASSIGNMENT_ID" \
  --cycle-id "$CYCLE_ID" \
  --role coordinator \
  --session-id delegated_coordinator_001 \
  --retire-policy explicit-only \
  --resolve-existing \
  --config "$SCTL_RUNTIME_LAUNCH_CONFIG"
```

Use exact runtime role labels:

```text
coordinator
coder
reviewer
```

`--resolve-existing` is intended for persistent Coordinator use. Change Author and Code Reviewer normally launch fresh logical sessions per cycle.

## Dispatch

```bash
node dist/src/cli.js delegate dispatch-deliver \
  --workspace "$SCTL_WORKSPACE" \
  --session-id delegated_coordinator_001 \
  --packet dispatch_packet.md \
  --dispatch-log "$RUN_ROOT/coordinator_dispatch_deliver.json"
```

The delegate resolves `--session-id` through the registry and uses the bound tmux target. Dispatch evidence is written under `.strata-runtime/evidence/delegate_control/dispatch_delivery/...` and includes packet SHA256 evidence.

## Returns

Return paths use logical session ids:

```text
.strata/returns/<assignment_id>/<logical_session_id>/
```

Use `return-dir` to query the path:

```bash
node dist/src/cli.js delegate return-dir \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id "$ASSIGNMENT_ID" \
  --session-id change_author_c01
```

## Logical release vs runtime termination

Normal Flowmap 02 does not call `session-terminate`. SCTL releases logical sessions in its registry and leaves tmux/Codex runtime sessions alive.

Explicit cleanup is still possible, but it must be an operator action:

```bash
node dist/src/cli.js delegate session-terminate \
  --workspace "$SCTL_WORKSPACE" \
  --session-id change_author_c01 \
  --retire-policy kill-session
```

Bindings created with `--retire-policy explicit-only` will not use a destructive default.

## Diagnostic register mode

`session-register` remains available to bind a pre-existing tmux target. Register-only runs are diagnostic unless a later ADR authorizes them as acceptance.
