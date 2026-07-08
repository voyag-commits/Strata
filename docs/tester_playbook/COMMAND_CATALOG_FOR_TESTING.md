# SCTL Command Catalog for Testing v0.9.4

## Backend

```bash
node src/cli.js context bootstrap
node src/cli.js context repo-status
node src/cli.js context export-markdown --include-classes A,B
node src/cli.js context freshness --loaded-context-epoch 7

node src/cli.js sessions register --assignment-id A001 --role "Reviewer / QC Engineer" --id reviewer_001 --session-mode disposable
node src/cli.js sessions retire --assignment-id A001 --id reviewer_001 --reason "complete"

node src/cli.js classb put --id B_A001_READY --title "A001 ready" --assignment-id A001 --agent-id author_001 --role "Change Author"
node src/cli.js classb validate --file .strata/context/B/b_a001_ready.md

node src/cli.js message send --assignment-id A001 --from-role "Change Author" --from-id author_001 --to-role "Reviewer / QC Engineer" --to-id reviewer_001 --message-kind qc_review_request --body "Review this."

node src/cli.js dispatch render --assignment-id A001 --nonce N1 --target-role "Reviewer / QC Engineer" --target-id reviewer_001 --summary "Review request"
node src/cli.js dispatch record --assignment-id A001 --nonce N1 --target-role "Reviewer / QC Engineer" --target-id reviewer_001 --summary "Review request"

node src/cli.js returns classify --packet .strata/returns/A001/reviewer_001/packet.json
node src/cli.js fixtures list-scenes
node src/cli.js fixtures run-scene --name deterministic_dispatch_envelope
```

## WSL/tmux adapters

```bash
scripts/wsl_tmux/sctl-session-new --role "Reviewer / QC Engineer" --assignment-id A001 --id reviewer_001 --no-launch
scripts/wsl_tmux/sctl-dispatch-render --assignment-id A001 --nonce N1 --target-role "Reviewer / QC Engineer" --target-id reviewer_001 --summary "Review request"
scripts/wsl_tmux/sctl-dispatch-inject --session STRATA-IC-FLEET-A --file .strata/dispatch_outbox/A001/reviewer_001/N1/dispatch_packet.md --dry-run
scripts/wsl_tmux/sctl-session-capture --session STRATA-IC-FLEET-A --out .strata/evidence/reviewer_001.txt
scripts/wsl_tmux/sctl-session-retire --session STRATA-IC-FLEET-A --assignment-id A001 --id reviewer_001
scripts/wsl_tmux/sctl-fleet-smoke
```

`sctl-dispatch-inject` accepts `--packet` and `--file` for Markdown dispatch packets. The adapter uses `tmux load-buffer -b strata "$PACKET"`, `tmux paste-buffer -b strata -t "$SESSION"`, then `tmux send-keys -t "$SESSION" Enter` unless `--no-enter` is used. `--notice` is not a Markdown packet flag; runtime-edge `dispatch inject --notice` expects JSON notice input.
