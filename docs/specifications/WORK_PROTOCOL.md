# SCTL Work Protocol v0.9.4

## Operator flow

1. Bootstrap context Git.
2. Register or launch a disposable worker session.
3. Write a Class C team message for the target role.
4. Render or record a deterministic dispatch envelope.
5. Inject the dispatch envelope into the WSL/tmux session.
6. Worker completes the bounded task.
7. Worker submits a Worker Return Packet and report when needed.
8. SCTL classifies the return packet.
9. SCTL commits accepted Class B reports separately.
10. Capture and retire disposable sessions.

## Dispatch rule

```text
Class C task guide first.
Then headline: Below is system level full context picture.
Then Class A/B context export.
```

No chatbox inspection. No pending-notice merge.

## Context update rule

```text
class_b_delta = current_class_b_revision - loaded_context_epoch
```

- `0`: no update required.
- `1-5`: delta export is enough.
- `>5`: full Class A/B export.
- Class A changed: retire session and send full export.
