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

The ADR 06/26 lifecycle uses `explicit-only` as the default retire policy for SCTL-created bindings. Runtime sessions are not killed by normal Flowmap 02; `kill-session` is an explicit cleanup choice only.

## ADR 06/26 runtime delegate launch patch

The delegate remains the runtime boundary for SCTL. Canonical Flowmap 02 now expects SCTL to call `delegate session-create` to launch or resolve runtime sessions, then deliver packets through `delegate dispatch-deliver` using the logical session id stored in the delegate registry.

`session-register` remains diagnostic/compatibility-only. `session-terminate` remains explicit cleanup only and is not part of normal Flowmap 02 acceptance. Normal SCTL lifecycle should mark sessions released or superseded without killing tmux/Codex runtime sessions.

See:

- `docs/adr/ADR_06_26_RUNTIME_DELEGATE_LAUNCH_AND_LOGICAL_RELEASE.md`
- `tester_playbook/FLOWMAP02_RUNTIME_DELEGATE_LIVE_PLAYBOOK_ADR0626.md`
- `docs/REMAINING_ISSUES_ADR0626.md`
