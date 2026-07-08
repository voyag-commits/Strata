# Migration Notes v0.9.4 Simplified Runtime

## Removed or retired behavior

- Pending Class C context notice merge is no longer the dispatch path.
- Dispatch packets no longer duplicate Class B delta content as a special section.
- SCTL does not inspect chatboxes.
- SCTL does not launch Codex directly.
- Worker Return Packets still cannot use `EVIDENCE_READY`, `evidence_path`, or `class_b_intake`.

## New behavior

- `context.export_markdown` is the central dispatch context source.
- Dispatch envelope is deterministic: Class C team message plus the full context picture headline plus Class A/B export.
- Exact dispatch packet Markdown/JSON is preserved under `.strata/context/D_trace/dispatch_packets/`.
- Return classifications and ledgers are preserved under `.strata/context/D_trace/return_ledgers/`.
- Sessions default to `disposable`.
- Context freshness uses simple revision math: `current_class_b_revision - loaded_context_epoch`.
- WSL/tmux integration is provided through thin shell adapters in `scripts/wsl_tmux/`.
