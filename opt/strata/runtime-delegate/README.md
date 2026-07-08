# Strata Runtime Edge Delegate Control Surface

This package is the WSL/tmux/Codex runtime delegate control surface for ADR_06_18 SCTL integration. It exposes contract-native commands under `strata-runtime-edge delegate ...` and keeps SCTL orchestration outside the runtime adapter.

## Install in WSL

```bash
npm install
npm test
npm run build
npm run secret-scan
```

Optionally link the CLI:

```bash
npm link
```

## Main live path

```bash
strata-runtime-edge delegate session-register \
  --assignment-id A_FLOWMAP_02_LIVE_DEFAULT_001 \
  --cycle-id CYCLE_001 \
  --role "Delegated Coordinator" \
  --session-id delegated_coordinator_001 \
  --workspace "$PWD" \
  --tmux-target STRATA-DESKTOP-0625-104113:0.0

strata-runtime-edge delegate dispatch-deliver \
  --session-id delegated_coordinator_001 \
  --packet /path/to/dispatch_packet.md
```

The delegate stores bindings under `.strata-runtime/session_bindings/`, evidence under `.strata-runtime/evidence/delegate_control/`, and return products only under `.strata/returns/<assignment_id>/<session_id>/`.

See `USER_MANUAL.md` for the concise operator manual and `docs/REFACTOR_NOTES.md` for implementation notes.
