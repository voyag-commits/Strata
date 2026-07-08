# ADR-0610: SCTL Simplified Runtime Backend v0.9.4

## Status

Accepted.

## Decision

SCTL dispatch uses a deterministic envelope:

```text
[Class C team message]
# Below is system level full context picture.
[Class A/B context export]
```

`context.export_markdown` is the central source for dispatch context. Empty context is valid.

## Consequences

- Pending context notice merge is no longer part of the active dispatch path.
- Dispatch packet content is preserved under `D_trace/dispatch_packets`.
- Runtime delivery is delegated to WSL/tmux shell adapters and the runtime-edge launcher stack.
- SCTL does not inspect chatboxes.
- Context freshness is evaluated as `current_class_b_revision - loaded_context_epoch`.
