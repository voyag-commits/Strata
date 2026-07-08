# Remaining Issues and Open Tasks - ADR 06/26 Patch

## Not completed in this sandbox

1. Full live WSL/tmux Flowmap 02 execution was not run in this environment. The patch was validated with static/package tests and non-live contract tests only.
2. Runtime dispatch accuracy must still be verified on the user's live Windows Terminal/WSL/tmux setup by comparing delegate dispatch evidence packet SHA256 and pasted pane behavior.
3. Provider launch config behavior depends on the local `launcher_delegate.local.json` and local `strata-codex-local` installation.

## Open implementation follow-ups

1. D_trace remains in the package for compatibility as packet trace/render storage. ADR 06/26 treats delegate runtime operational evidence as primary runtime-delivery evidence. A future migration may rename or move trace artifacts to reduce confusion.
2. Coordinator recreation is implemented as logical supersession plus new launch/resolve. A future ledger may be useful to record coordinator generation globally across all Coordinator logical ids.
3. `session-register` remains available for diagnostics. Tester reports must clearly label register-only runs as diagnostic, not canonical live E2E acceptance.
4. `session-terminate` remains available for explicit cleanup. Normal Flowmap 02 must not call it.
5. The package version fields were retained. This delivery is identified by ADR 06/26 docs, patched checksums, and delivery zip SHA256 values.

## Fixed in this delivery

1. SCTL path segment guard rejects dot-only path segments.
2. Delegate path segment guard rejects dot-only path segments.
3. Delegate return path derivation asserts containment under `.strata/returns`.
4. SCTL dispatch outbox derivation asserts containment under the workspace.
5. Flowmap 02 harness uses delegate session-create for canonical launch/resolve rather than requiring manually pre-created tmux targets.
6. Normal Flowmap 02 lifecycle marks sessions released/superseded and does not call delegate session-terminate.
7. Runtime role labels are normalized to `coordinator`, `coder`, and `reviewer`.
8. SCTL session registry records logical id, runtime role, runtime session name, tmux target, delegate binding/evidence fields, and explicit-only termination policy.
