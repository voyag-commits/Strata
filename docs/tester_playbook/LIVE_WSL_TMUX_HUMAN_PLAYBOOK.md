# Live WSL/tmux Human Tester Playbook v0.9.4

## Goal

Prove that SCTL can run the simplified operational loop with real WSL/tmux sessions while staying out of launcher internals.

The test verifies:

```text
SCTL context Git is isolated.
Dispatch envelope is deterministic.
Class C team message carries the task.
Context export carries Class A/B system picture.
Empty context is accepted.
Packet is pasteable into tmux.
Worker return classification is Git-ledgered.
Class B commit increments current_class_b_revision.
Session can be captured and retired.
```

## Roles

Use one human operator role and one worker session role for the first live test.

```text
Human operator: Tooling / Dispatch Operator
Worker role: Reviewer / QC Engineer
Assignment: A_LIVE_001
Worker id: reviewer_live_001
Suggested tmux session: STRATA-REVIEW-A-LIVE-001
```

## Preflight

From WSL:

```bash
cd /path/to/strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime
node --version
npm test
npm run secret-scan
for script in scripts/wsl_tmux/sctl-* flowmaps/flowmap02/*.sh scripts/bootstrap_wsl.sh; do bash -n "$script"; done
```

Optional runtime-edge health check, when the launcher package is available:

```bash
export SCTL_RUNTIME_EDGE_ROOT="/path/to/strata_runtime_edge_launcher_delegate_component2_3_v0_9"
node "$SCTL_RUNTIME_EDGE_ROOT/dist/src/cli.js" provider doctor
```

Create a clean test workspace:

```bash
export SCTL_ROOT="$PWD"
export SCTL_WORKSPACE="$HOME/sctl-live-test-A_LIVE_001"
rm -rf "$SCTL_WORKSPACE"
mkdir -p "$SCTL_WORKSPACE"
```

## Phase 1: bootstrap SCTL context Git

```bash
node src/cli.js --workspace "$SCTL_WORKSPACE" context bootstrap
node src/cli.js --workspace "$SCTL_WORKSPACE" context repo-status
```

Expected:

```text
ok: true
context repo exists at $SCTL_WORKSPACE/.strata/context
status_short is empty or only expected generated files
```

## Phase 2: create or register disposable worker session

No-launch metadata-only test:

```bash
scripts/wsl_tmux/sctl-session-new \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id A_LIVE_001 \
  --role "Reviewer / QC Engineer" \
  --id reviewer_live_001 \
  --session-name STRATA-REVIEW-A-LIVE-001 \
  --no-launch
```

Live launcher test, if runtime-edge or `strata-fleet-launch` is installed:

```bash
scripts/wsl_tmux/sctl-session-new \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id A_LIVE_001 \
  --role "Reviewer / QC Engineer" \
  --id reviewer_live_001 \
  --session-name STRATA-REVIEW-A-LIVE-001
```

Expected:

```text
session record exists in .strata/context/C/sessions/active_sessions.json
session_mode is disposable
loaded_context_epoch equals current_class_b_revision at registration time
```

## Phase 3: create a Class B state file

```bash
node src/cli.js --workspace "$SCTL_WORKSPACE" classb put \
  --id B_A_LIVE_001_READY \
  --title "A_LIVE_001 ready" \
  --assignment-id A_LIVE_001 \
  --agent-id change_author_live_001 \
  --role "Change Author" \
  --summary "Live test change is ready for review." \
  --progress-delta "Prepared the live test state for reviewer." \
  --trunk-integration "No implementation Git was watched by SCTL." \
  --verification "Backend tests passed before live paste." \
  --evidence-detail "Evidence is the dispatch packet, context Git log, and live capture."
```

Expected:

```text
accepted_class_b_revision is present
current_class_b_revision increments to 1
class_b_result has no notice queue
```

## Phase 4: create the Class C team message

```bash
MSG_JSON=$(node src/cli.js --workspace "$SCTL_WORKSPACE" message send \
  --assignment-id A_LIVE_001 \
  --from-role "Change Author" \
  --from-id change_author_live_001 \
  --to-role "Reviewer / QC Engineer" \
  --to-id reviewer_live_001 \
  --message-kind qc_review_request \
  --body "Review the Class B report. Confirm whether the live deterministic dispatch packet is sufficient. Return OPERATIONAL_REPORT_READY if complete." \
  --related-class-b "$SCTL_WORKSPACE/.strata/context/B/b_a_live_001_ready.md")

MSG_FILE=$(printf '%s' "$MSG_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).result.file));')
echo "$MSG_FILE"
```

Expected:

```text
Class C file exists under .strata/context/C/threads/
message has ## Message and ## Requested Handling
```

## Phase 5: render deterministic dispatch

```bash
DISPATCH_JSON=$(scripts/wsl_tmux/sctl-dispatch-render \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id A_LIVE_001 \
  --nonce N1 \
  --from-role "Change Author" \
  --from-id change_author_live_001 \
  --target-role "Reviewer / QC Engineer" \
  --target-id reviewer_live_001 \
  --message-file "$MSG_FILE" \
  --summary "Live review request")

PACKET=$(printf '%s' "$DISPATCH_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).result.outbox.packetMdPath));')
echo "$PACKET"
```

Expected packet content:

```text
# SCTL Dispatch Envelope
# Class C Team Message
# Below is system level full context picture.
# Strata Context Export
empty_context_valid: true
## Class A
## Class B
```

Git-preserved packet snapshot should exist under:

```text
.strata/context/D_trace/dispatch_packets/A_LIVE_001/reviewer_live_001/N1/
```

## Phase 6: inject into tmux

Dry run first:

```bash
scripts/wsl_tmux/sctl-dispatch-inject \
  --session STRATA-REVIEW-A-LIVE-001 \
  --packet "$PACKET" \
  --dry-run
```

Live injection:

```bash
scripts/wsl_tmux/sctl-dispatch-inject \
  --session STRATA-REVIEW-A-LIVE-001 \
  --packet "$PACKET"
```

The adapter also accepts `--file "$PACKET"` for the same Markdown dispatch packet path. Internally, Markdown packet delivery is:

```bash
tmux load-buffer -b strata "$PACKET"
tmux paste-buffer -b strata -t "$SESSION"
tmux send-keys -t "$SESSION" Enter
```

Do not use `--notice` for Markdown dispatch packets. Runtime-edge `dispatch inject --notice` expects JSON notice input, not `dispatch_packet.md`.

Expected:

```text
packet appears in tmux target session
Enter is sent unless --no-enter is used
SCTL does not inspect the chatbox before or after paste
```

## Phase 7: simulate or collect Worker Return Packet

For manual live testing, ask the worker to create an operational report and packet. For a controlled local simulation:

```bash
RET_DIR="$SCTL_WORKSPACE/.strata/returns/A_LIVE_001/reviewer_live_001"
mkdir -p "$RET_DIR"
cat > "$RET_DIR/operational_report.md" <<'REPORT'
# Live Review Operational Report

## Operational Summary

Reviewer completed the live deterministic dispatch review.

## Progress Delta

The worker received the Class C team message and context export.

## Trunk Integration

No implementation Git was watched by SCTL.

## Verification

The dispatch packet was visible and usable in the target session.

## Evidence

Evidence is the packet path, tmux capture, and SCTL context Git log.

## Risks / Blockers

No blocker recorded.

## Next Action

Retire the disposable reviewer session.
REPORT

cat > "$RET_DIR/packet.json" <<JSON
{
  "contract_id": "worker_return_packet.v1",
  "return_id": "RET_A_LIVE_001_REVIEWER_001",
  "assignment_id": "A_LIVE_001",
  "agent_id": "reviewer_live_001",
  "role": "Reviewer / QC Engineer",
  "return_kind": "OPERATIONAL_REPORT_READY",
  "status": "ready",
  "summary": "Live review complete.",
  "nonce": "N1",
  "report_scope": "review_outcome",
  "implementation_repository": "TEMPLATE_ONLY",
  "implementation_commit": null,
  "trunk_branch": "main",
  "short_lived_branch": null,
  "integration_mode": "direct_to_trunk",
  "supersedes_entry_id": null,
  "message_path": null,
  "question_path": null,
  "report_path": "$RET_DIR/operational_report.md",
  "diagnostic_path": null,
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

node src/cli.js --workspace "$SCTL_WORKSPACE" returns classify --packet "$RET_DIR/packet.json"
```

Expected:

```text
routing_decision is OPERATIONAL_REPORT_READY_LEDGERED_NOT_CLASS_B
classification record is under .strata/context/D_trace/return_ledgers/
Class B count does not change automatically
```

## Phase 8: capture and retire session

```bash
scripts/wsl_tmux/sctl-session-capture \
  --session STRATA-REVIEW-A-LIVE-001 \
  --out "$SCTL_WORKSPACE/.strata/evidence/session_captures/STRATA-REVIEW-A-LIVE-001.txt"

scripts/wsl_tmux/sctl-session-retire \
  --workspace "$SCTL_WORKSPACE" \
  --assignment-id A_LIVE_001 \
  --id reviewer_live_001 \
  --session STRATA-REVIEW-A-LIVE-001 \
  --reason "live deterministic dispatch test complete"
```

Use `--kill-tmux` only when you want the adapter to terminate the tmux session.

## Phase 9: acceptance checks

```bash
node src/cli.js --workspace "$SCTL_WORKSPACE" context repo-status
git -C "$SCTL_WORKSPACE/.strata/context" log --oneline --all --decorate
find "$SCTL_WORKSPACE/.strata/context/D_trace" -maxdepth 4 -type f | sort
```

Accept when:

```text
npm test passed before live test
secret scan passed
adapter syntax check passed
dispatch packet was rendered and Git-snapshotted
packet was pasted into tmux without chatbox inspection
Worker Return Packet was classified and ledgered under D_trace
Class B commit and current_class_b_revision behavior are correct
session capture exists
session retirement is recorded
```

Reject or patch when:

```text
adapter stores secrets
adapter reimplements launcher internals
SCTL watches implementation Git
Class C notice merge reappears as required workflow
Dispatch lacks context.export_markdown output
Return classification is not committed into .strata/context Git
```
