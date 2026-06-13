# Changelog v0.9.4 Simplified Runtime

## Added

- Deterministic Class C plus Class A/B context dispatch envelope.
- `dispatch render` command for render-only packet generation.
- `context freshness` command for simple revision math.
- Disposable session registration and retirement flow.
- Git-backed dispatch packet snapshots under `D_trace/dispatch_packets`.
- Git-backed return ledgers under `D_trace/return_ledgers`.
- Thin WSL/tmux adapter scripts.
- Detailed human tester playbook.
- Launcher guide copy under `docs/LAUNCHER_GUIDE_PROVIDED.md`.

## Changed

- `context.export_markdown` is now the central dispatch context source.
- Class B validation now rejects invalid statuses, non-integer context epochs, invalid timestamps, and empty required sections.
- Class C remains task communication rather than a context-notice merge mechanism.

## Removed from active path

- Pending context notice merge.
- Implementation Git watching.
- Chatbox inspection assumptions.
