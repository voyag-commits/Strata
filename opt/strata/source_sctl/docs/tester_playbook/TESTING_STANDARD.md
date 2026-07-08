# SCTL Testing Standard v0.9.4

Required backend checks:

- SCTL context Git is isolated under `.strata/context/`.
- Class B reports are strict Markdown files with validated frontmatter and non-empty required sections.
- Class C messages validate as human role-to-role task communication.
- Dispatch render creates deterministic Class C plus context export envelope.
- Dispatch record preserves exact packet Markdown/JSON under `D_trace/dispatch_packets`.
- `context freshness` uses simple revision math.
- Worker Return Packet classification writes ledgers under `D_trace/return_ledgers`.
- Tool registry does not expose runtime/tmux/session launcher tools.
- WSL/tmux scripts remain thin adapters around existing launchers.

Required live checks:

- Launch or identify a tmux session.
- Render a dispatch envelope.
- Dry-run injection command.
- Inject into the session when safe.
- Capture the session output.
- Retire disposable session and verify SCTL session registry.
