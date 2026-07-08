# ADR 06/26 SCTL + Runtime Delegate Delivery Summary

## Scope

This delivery applies the accepted ADR 06/26 runtime delegate launch and logical release decisions to the uploaded SCTL and runtime delegate packages.

## Architecture decisions implemented

1. Canonical Flowmap 02 uses delegate `session-create` to launch or resolve runtime sessions.
2. `session-register` remains diagnostic/compatibility-only.
3. Dispatch delivery is delegate-owned through `dispatch-deliver`; SCTL records the delegate result and does not infer tmux targets.
4. Normal Flowmap 02 lifecycle does not call delegate `session-terminate`.
5. SCTL marks logical sessions released, closed, or superseded and leaves runtime sessions alive.
6. Coordinator is resolve-or-launch persistent across cycles 1-4; after the fourth completed cycle the old Coordinator logical session is superseded and a new Coordinator logical/runtime session is launched or resolved.
7. Author and Reviewer launch fresh logical sessions per cycle and are logically released after return.
8. Return paths are keyed by logical session id.
9. Exact runtime role labels are preserved: `coordinator`, `coder`, `reviewer`.
10. Runtime operational logs are primary delivery evidence. D_trace remains compatibility trace storage, not primary runtime-delivery proof.
11. SCTL and delegate guards reject dot-only path segments and assert key path containment.

## Key SCTL changes

- `flowmaps/flowmap02/live_cycle_harness.sh`
  - Added delegate `session-create` launch/resolve path.
  - Added `--runtime-launch-config` and `--runtime-session-extra-args`.
  - Fixed deprecated `SCTL_RUNTIME_EDGE_*` alias handling.
  - Replaced destructive normal teardown with logical `sessions release`.
  - Retained register-only behavior only as diagnostic compatibility code.

- `src/lib/messages.js` and `src/cli.js`
  - Added runtime-aware session metadata fields.
  - Added `sessions release` command.
  - Mapped legacy `sessions retire` to logical release.

- `src/lib/common.js` and `src/lib/dispatch_outbox.js`
  - Rejected dot-only safe segments.
  - Added dispatch path containment checks.
  - Marked delegate runtime operational logs as primary delivery evidence.

- `tests/path_guard.test.js` and `tests/runtime_delegate_contract.test.js`
  - Added path guard coverage.
  - Updated live harness contract tests for launch/resolve and no destructive termination.

## Key runtime delegate changes

- `src/runtime.ts`
  - Added `resolveExisting` behavior for persistent Coordinator use.
  - Included `session_id` in generated runtime session name to avoid collisions among many live sessions.

- `src/contract_delegate.ts`, `src/cli.ts`, `src/contract_shapes.ts`, `src/tmux_adapter.ts`
  - Added `--resolve-existing` CLI support.
  - Added `explicit-only` retire policy.
  - Required explicit destructive policy for `session-terminate` when binding is explicit-only.
  - Added return path containment checks.

- `src/common.ts`
  - Rejected dot-only path parts and emitted `INVALID_ARGUMENT` contract failures.

- `tests/contract_delegate.test.ts`
  - Added return path guard coverage.
  - Added explicit-only termination behavior coverage.

## Documentation delivered

- `docs/adr/ADR_06_26_RUNTIME_DELEGATE_LAUNCH_AND_LOGICAL_RELEASE.md`
- `docs/tester_playbook/FLOWMAP02_RUNTIME_DELEGATE_LIVE_PLAYBOOK_ADR0626.md`
- `docs/REMAINING_ISSUES_ADR0626.md`
- Updated SCTL `docs/RUNTIME_SESSION_DELEGATE_CONTRACT.md`
- Updated delegate `docs/WSL_DELEGATE_USER_MANUAL.md`
- Updated Flowmap 02 document with ADR 06/26 lifecycle note

## Validation performed in this sandbox

SCTL:

```text
npm test: PASS, 29/29
npm run secret-scan: PASS
shell syntax check: PASS
sha256sum -c PACKAGE_CHECKSUMS.sha256: PASS
negative dispatch dot-segment guard: PASS, non-zero with safe segment error
```

Runtime delegate:

```text
npm test: PASS, 12/12
npm run secret-scan: PASS
sha256sum -c PACKAGE_CHECKSUMS.sha256: PASS
negative return-dir dot-segment guard: PASS, non-zero INVALID_ARGUMENT
```

## Not performed here

A full live WSL/tmux/Windows Terminal Flowmap 02 run was not performed in this sandbox. The package is prepared for that local live run; the updated tester playbook defines the required live evidence checks.

## Remaining issues

See `docs/REMAINING_ISSUES_ADR0626.md` in the SCTL package and delegate package.
