# Strata SCTL Kernel Components 1/3/4 v0.9.4 Simplified Runtime

SCTL is a CLI-reachable, Git-backed operational control plane for context, dispatch records, return ledgers, and progress tracking.

This revision reduces engineering surface area. SCTL does **not** launch Codex, hold secrets, inspect chatboxes, watch implementation Git, or replace the existing WSL/tmux launcher stack. It renders deterministic context envelopes and records accepted artifacts in isolated SCTL context Git.

## Core model

```text
SCTL owns: .strata/context/ as an isolated Git repository
Class A: architecture, doctrine, contracts, bootstrap file-pin policy
Class B: strict timestamped operational reports and progress records
Class C: team messages and role-to-role communication
Class D_trace: dispatch packet snapshots, dispatch logs, return ledgers, telemetry, diagnostics
```

Implementation Git remains separate. Runtime delivery is delegated to existing launcher/runtime-edge scripts.

## Deterministic dispatch format

Every SCTL dispatch envelope follows one format:

```text
[Class C team message]

# Below is system level full context picture.

[context.export_markdown output for Class A and Class B]
```

The Class C message says what to do, how to do it, what requires action, and what return artifact is expected. The context export gives the system picture. Empty context is valid.

Dispatch records write both an outbox packet and a Git-preserved packet snapshot:

```text
.strata/dispatch_outbox/<assignment>/<target>/<nonce>/dispatch_packet.md
.strata/context/D_trace/dispatch_packets/<assignment>/<target>/<nonce>/dispatch_packet.md
.strata/context/D_trace/dispatch_log/*.json
.strata/context/D_trace/telemetry/workflow_telemetry.jsonl
```

## Session policy

Most worker sessions are disposable by default:

```text
create session
paste deterministic dispatch envelope
worker completes bounded task
worker submits return envelope/report
capture if needed
retire session
```

Long-running sessions are allowed only as an explicit exception.

## Context freshness math

SCTL uses simple numeric comparison:

```text
current_class_b_revision - loaded_context_epoch = Class B delta
```

Policy:

```text
delta <= 0: no update needed
delta 1-5: export Class B delta context
delta > 5: export full Class A + Class B context
Class A changed: retire session and start a fresh session with full context export
```

Command:

```bash
node src/cli.js context freshness --loaded-context-epoch 7
```

## Main commands

```bash
node src/cli.js context bootstrap
node src/cli.js context export-markdown
node src/cli.js context freshness --loaded-context-epoch 7

node src/cli.js sessions register --assignment-id A001 --role "Reviewer / QC Engineer" --id reviewer_001
node src/cli.js classb put --id B_A001_READY --title "A001 ready" --assignment-id A001 --agent-id change_author_001 --role "Change Author"
node src/cli.js message send --assignment-id A001 --from-role "Change Author" --from-id change_author_001 --to-role "Reviewer / QC Engineer" --to-id reviewer_001 --message-kind qc_review_request --body "Please review." --related-class-b .strata/context/B/b_a001_ready.md
node src/cli.js dispatch record --assignment-id A001 --nonce N1 --target-role "Reviewer / QC Engineer" --target-id reviewer_001 --message-file .strata/context/C/threads/thread_a001/tm.md
node src/cli.js returns classify --packet .strata/returns/A001/change_author_001/packet.json
```

## Thin WSL/tmux adapters

The scripts in `scripts/wsl_tmux/` wrap the existing launcher stack. They do not own secrets or reimplement tmux runtime logic.

```bash
scripts/wsl_tmux/sctl-session-new --assignment-id A001 --role "Reviewer / QC Engineer" --id reviewer_001 --session-name STRATA-REVIEW-A001
scripts/wsl_tmux/sctl-dispatch-render --assignment-id A001 --nonce N1 --target-role "Reviewer / QC Engineer" --target-id reviewer_001 --message-file .strata/context/C/threads/thread_a001/tm.md --summary "Review request"
scripts/wsl_tmux/sctl-dispatch-inject --session STRATA-REVIEW-A001 --packet .strata/dispatch_outbox/A001/reviewer_001/N1/dispatch_packet.md
scripts/wsl_tmux/sctl-session-capture --session STRATA-REVIEW-A001
scripts/wsl_tmux/sctl-session-retire --assignment-id A001 --id reviewer_001 --session STRATA-REVIEW-A001 --kill-tmux
```

For Markdown dispatch packets, `sctl-dispatch-inject` supports `--packet` and `--file`. It opens a visible Windows Terminal tab attached to the target tmux session, waits briefly to avoid racing a newly launched Codex TUI, loads the packet path into tmux with `tmux load-buffer -b strata "$PACKET"`, uses bracketed `tmux paste-buffer -p`, and sends Enter unless `--no-enter` is used. Use `--no-tab` to skip visible tab attachment and `--paste-delay SECONDS` to tune the default 5-second delay. `--notice` is not for Markdown packets; runtime-edge `dispatch inject --notice` expects JSON notice input.

The adapter boundary follows the provided launcher guide: SCTL calls the runtime-edge CLI or `strata-fleet-launch`; the existing launcher owns tmux sessions, visible Windows Terminal tabs, and the BYOR Codex/DeepSeek bridge.

## Verification

```bash
npm test
npm run secret-scan
bash -n scripts/wsl_tmux/*.sh scripts/wsl_tmux/sctl-*
sha256sum -c PACKAGE_CHECKSUMS.sha256
```
