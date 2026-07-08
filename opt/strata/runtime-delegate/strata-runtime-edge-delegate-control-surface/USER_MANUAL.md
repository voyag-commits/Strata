# WSL Delegate Control Surface Manual

The delegate control surface is the runtime adapter between SCTL and a Codex CLI session running inside WSL/tmux. SCTL remains the authority for Director input, Class A/B commits, context export, canonical dispatch envelope rendering, return ingestion, and cycle progression. The delegate only performs mechanical runtime operations.

Contract boundary:

1. `delegate session-register` or `delegate session-create` creates a contract session record. For the current WSL path, prefer `session-register` to bind an existing Codex tmux pane, for example `STRATA-DESKTOP-0625-104113:0.0`, to an SCTL `session_id` such as `delegated_coordinator_001`.
2. `delegate dispatch-deliver` reads an SCTL-rendered `dispatch_packet.md`, computes SHA256, stores evidence, and pastes the packet unchanged into the registered tmux target. The delegate does not render or edit the envelope body.
3. `delegate return-drop` copies prepared return files under `.strata/returns/<assignment_id>/<session_id>/` for mock or tester flows. In live Codex use, Codex may write there directly; SCTL validates and ingests afterward.

Useful live commands:

```bash
strata-runtime-edge delegate session-register --assignment-id A_FLOWMAP_02_LIVE_DEFAULT_001 --cycle-id CYCLE_001 --role "Delegated Coordinator" --session-id delegated_coordinator_001 --tmux-target STRATA-DESKTOP-0625-104113:0.0 --workspace "$PWD"
strata-runtime-edge delegate dispatch-deliver --session-id delegated_coordinator_001 --packet dispatch_packet.md --workspace "$PWD"
strata-runtime-edge delegate session-capture --session-id delegated_coordinator_001 --lines 80 --workspace "$PWD"
strata-runtime-edge delegate session-terminate --session-id delegated_coordinator_001 --retire-policy kill-session --workspace "$PWD"
```

This surface exists in WSL because tmux, Codex CLI, dispatch paste, capture, and safe session retirement all execute inside Linux. Windows may be used for editing, but WSL is the authoritative live runtime.
