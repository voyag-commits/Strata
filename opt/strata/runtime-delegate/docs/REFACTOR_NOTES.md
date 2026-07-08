# Refactor Notes

## Completed

- Repaired package layout into `src/`, `tests/`, and `scripts/`.
- Added normalized delegate control-surface commands:
  - `delegate session-register`
  - `delegate session-create`
  - `delegate dispatch-deliver`
  - `delegate return-drop`
  - `delegate return-dir`
  - `delegate session-capture`
  - `delegate session-terminate`
  - `delegate session-list`
- Added tmux target metadata binding records under `.strata-runtime/session_bindings/`.
- Kept old notice rendering/injection as legacy utilities outside the ADR_06_18 path.
- Removed delegate-side canonical envelope rendering from the contract dispatch path.
- Added fake-tmux regression coverage for WSL/tmux boundary calls.
- Verified return-drop path discipline under `.strata/returns/<assignment_id>/<session_id>/`.
- Verified machine-readable failure shape through `ContractError` and top-level CLI catch.

## WSL runtime check binding

Current confirmed live target:

```text
STRATA-DESKTOP-0625-104113:0.0
```

The confirmed layout is one Codex agent per tmux session, so the default retire policy is `kill-session`.
