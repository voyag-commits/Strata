# Flowmap 02 - Trunk-Based Disposable Worker Cycle

## Problem definition

Inspect one trunk-based SCTL cycle:

```text
Trunk Coordinator
-> Codebase Git branch
-> fresh Change Author session
-> author dispatch + context export
-> author return + SCTL ledger
-> Class B update
-> fresh Code Reviewer session
-> reviewer dispatch + context export
-> reviewer return + SCTL ledger
-> CI/merge or revision loop
-> retire disposable sessions
-> Coordinator freshness check
```

Acceptance is **not** a `PASS` claim. The tester must produce a full operational log:

```text
command/adapter called
expected method chain
expected evidence path
observed evidence path
failure boundary, if any
diagnosis + next inspection step
```

Status labels:

```text
OBSERVED | WRONG_METHOD | MISSING_EVIDENCE | BROKEN | BLOCKED | NOT_RUN
```

## Variables

```bash
export SCTL="node src/cli.js"
export ASSIGNMENT_ID="A_FLOWMAP_02_001"
export TRUNK_COORDINATOR_ID="trunk_coordinator_001"
export CHANGE_AUTHOR_ID="change_author_001"
export REVIEWER_ID="reviewer_001"
export TRUNK_COORDINATOR_SESSION="SCTL-TC-A-FLOWMAP-02-001"
export CHANGE_AUTHOR_SESSION="SCTL-CA-A-FLOWMAP-02-001"
export REVIEWER_SESSION="SCTL-CR-A-FLOWMAP-02-001"
export CODEBASE_REPO="/path/to/codebase/repo"
export TRUNK_BRANCH="main"
export CHANGE_BRANCH="change/A_FLOWMAP_02_001/small-change"
export NONCE_AUTHOR="N_AUTHOR_1"
export NONCE_REVIEW="N_REVIEW_1"
```

## Execution steps

### 0. Context Git exists

**Call:** `$SCTL context bootstrap`

**Method:** `bootstrap() -> ensureIsolatedContextGit() -> writeContextState() -> gitCommitContext()`

**Watch:** `.strata/context/.git/`; `.strata/context/D_trace/context_state.json`; `git -C .strata/context log --oneline -5`

---

### 1. Trunk Coordinator session is registered

**Call:** `scripts/wsl_tmux/sctl-session-new --assignment-id "$ASSIGNMENT_ID" --role "Trunk Coordinator" --id "$TRUNK_COORDINATOR_ID" --session-name "$TRUNK_COORDINATOR_SESSION" --session-mode long_running`

**Method:** `sctl-session-new -> runtime_edge_cli session launch OR strata-fleet-launch -> sessions register -> registerSession() -> recordTelemetry() -> gitCommitContext()`

**Watch:** `.strata/context/C/sessions/active_sessions.json`; `.strata/context/C/sessions/lifecycle/`; `.strata/context/D_trace/telemetry/`

---

### 2. Coordinator freshness is checked

**Call:** `$SCTL context freshness --loaded-context-epoch 0 --loaded-class-a-revision 0`

**Method:** `contextFreshness()`

**Watch:** stdout freshness result; `.strata/context/D_trace/context_state.json`

---

### 3. Codebase branch exists

**Call:** `cd "$CODEBASE_REPO" && git switch "$TRUNK_BRANCH" && git pull --ff-only || true && git switch -c "$CHANGE_BRANCH" "$TRUNK_BRANCH"`

**Method:** external Codebase Git only; SCTL must not own/watch Codebase Git.

**Watch:** `$CODEBASE_REPO` branch state; trunk base commit.

---

### 4. Change Author session is registered

**Call:** `scripts/wsl_tmux/sctl-session-new --assignment-id "$ASSIGNMENT_ID" --role "Change Author" --id "$CHANGE_AUTHOR_ID" --session-name "$CHANGE_AUTHOR_SESSION" --session-mode disposable`

**Method:** `sctl-session-new -> runtime_edge_cli session launch OR strata-fleet-launch -> sessions register -> registerSession() -> recordTelemetry() -> gitCommitContext()`

**Watch:** `.strata/context/C/sessions/active_sessions.json`

---

### 5. Class C author assignment is created

**Call:** `$SCTL message send --assignment-id "$ASSIGNMENT_ID" --thread-id "THREAD_$ASSIGNMENT_ID" --from-role "Trunk Coordinator" --from-id "$TRUNK_COORDINATOR_ID" --to-role "Change Author" --to-id "$CHANGE_AUTHOR_ID" --message-kind coordination_note --body "Use branch $CHANGE_BRANCH. Return a Worker Return Packet and operational report."`

**Method:** `sendTeamMessage() -> validateTeamMessageFile() -> recordTelemetry() -> gitCommitContext()`

**Watch:** `.strata/context/C/threads/THREAD_<assignment_id>/`

---

### 6. Author dispatch is rendered with context export

**Call:** `scripts/wsl_tmux/sctl-dispatch-render --assignment-id "$ASSIGNMENT_ID" --nonce "$NONCE_AUTHOR" --target-role "Change Author" --target-id "$CHANGE_AUTHOR_ID" --message-file ".strata/context/C/threads/THREAD_$ASSIGNMENT_ID/<message_file>.md" --summary "Flowmap 02 Change Author dispatch"`

**Method:** `sctl-dispatch-render -> dispatch record -> recordDispatch() -> renderDispatchPacket() -> exportMarkdown() -> gitCommitContext()`

**Exact context export call:** `$SCTL context export-markdown --include-classes A,B`

**Watch:** `.strata/context/D_trace/dispatch_packets/<assignment>/<change_author_id>/<nonce>/dispatch_packet.md`; `context_export/context.md`; `.strata/context/D_trace/dispatch_log/`

---

### 7. Author dispatch is injected

**Call:** `scripts/wsl_tmux/sctl-dispatch-inject --session "$CHANGE_AUTHOR_SESSION" --packet ".strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/$NONCE_AUTHOR/dispatch_packet.md"`

**Method:** `sctl-dispatch-inject -> tmux set-buffer -> tmux paste-buffer -> tmux send-keys Enter`

**Watch:** visible tmux/Windows Terminal session; optional `.strata/evidence/session_captures/<session>.txt`

---

### 8. Author return is dropped

**Files:** `.strata/returns/<assignment_id>/<change_author_id>/packet.json`; `.strata/returns/<assignment_id>/<change_author_id>/operational_report.md`

**Method:** external file drop; not chat text.

**Watch:** `.strata/returns/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/`

---

### 9. Author return is classified

**Call:** `$SCTL returns classify --packet ".strata/returns/$ASSIGNMENT_ID/$CHANGE_AUTHOR_ID/packet.json"`

**Method:** `classifyWorkerReturnPacket() -> validateWorkerReturnPacket() -> validateOperationalReportFile() -> appendJsonl() -> gitCommitContext()`

**Watch:** `.strata/context/D_trace/return_ledgers/`; `operational_report_ready_index.jsonl`; `.strata/context/D_trace/return_diagnostics/`

---

### 10. Accepted author report enters Class B

**Call:** `$SCTL classb commit --file ".strata/context/B/<author_report>.md" --message "accept author report for $ASSIGNMENT_ID"`

**Alternative:** `$SCTL classb put --id "B_$ASSIGNMENT_ID_AUTHOR" --title "Author report for $ASSIGNMENT_ID" --assignment-id "$ASSIGNMENT_ID" --agent-id "$CHANGE_AUTHOR_ID" --role "Change Author" --scope actionable_report`

**Method:** `commitClassBFile() OR putClassBFile() -> validateClassBFile() -> incrementClassBState() -> gitCommitContext()`

**Watch:** `.strata/context/B/`; `.strata/context/D_trace/context_state.json`

---

### 11. Code Reviewer session is registered

**Call:** `scripts/wsl_tmux/sctl-session-new --assignment-id "$ASSIGNMENT_ID" --role "Code Reviewer / QC Engineer" --id "$REVIEWER_ID" --session-name "$REVIEWER_SESSION" --session-mode disposable`

**Method:** `sctl-session-new -> runtime_edge_cli session launch OR strata-fleet-launch -> sessions register -> registerSession() -> recordTelemetry() -> gitCommitContext()`

**Watch:** `.strata/context/C/sessions/active_sessions.json`

---

### 12. Class C review request is created

**Call:** `$SCTL message send --assignment-id "$ASSIGNMENT_ID" --thread-id "THREAD_$ASSIGNMENT_ID" --from-role "Trunk Coordinator" --from-id "$TRUNK_COORDINATOR_ID" --to-role "Code Reviewer / QC Engineer" --to-id "$REVIEWER_ID" --message-kind qc_review_request --related-class-b ".strata/context/B/<author_report>.md" --body "Review branch $CHANGE_BRANCH and the author report. Return approval, denial, or blocker with evidence."`

**Method:** `sendTeamMessage() -> validateTeamMessageFile() -> gitCommitContext()`

**Watch:** `.strata/context/C/threads/THREAD_<assignment_id>/`

---

### 13. Reviewer dispatch is rendered with context export

**Call:** `scripts/wsl_tmux/sctl-dispatch-render --assignment-id "$ASSIGNMENT_ID" --nonce "$NONCE_REVIEW" --target-role "Code Reviewer / QC Engineer" --target-id "$REVIEWER_ID" --message-file ".strata/context/C/threads/THREAD_$ASSIGNMENT_ID/<review_message_file>.md" --summary "Flowmap 02 review dispatch"`

**Method:** `sctl-dispatch-render -> dispatch record -> recordDispatch() -> renderDispatchPacket() -> exportMarkdown() -> gitCommitContext()`

**Watch:** `.strata/context/D_trace/dispatch_packets/<assignment>/<reviewer_id>/<nonce>/dispatch_packet.md`; `context_export/context.md`; `.strata/context/D_trace/dispatch_log/`

---

### 14. Reviewer dispatch is injected

**Call:** `scripts/wsl_tmux/sctl-dispatch-inject --session "$REVIEWER_SESSION" --packet ".strata/context/D_trace/dispatch_packets/$ASSIGNMENT_ID/$REVIEWER_ID/$NONCE_REVIEW/dispatch_packet.md"`

**Method:** `sctl-dispatch-inject -> tmux set-buffer -> tmux paste-buffer -> tmux send-keys Enter`

**Watch:** visible reviewer session; optional session capture.

---

### 15. Reviewer return is dropped and classified

**Files:** `.strata/returns/<assignment_id>/<reviewer_id>/packet.json`; `.strata/returns/<assignment_id>/<reviewer_id>/review_report.md`

**Call:** `$SCTL returns classify --packet ".strata/returns/$ASSIGNMENT_ID/$REVIEWER_ID/packet.json"`

**Method:** `classifyWorkerReturnPacket() -> validateWorkerReturnPacket() -> validateOperationalReportFile() -> appendJsonl() -> gitCommitContext()`

**Watch:** `.strata/context/D_trace/return_ledgers/`; `.strata/context/D_trace/return_diagnostics/`

---

### 16A. Approved path: CI and merge

**Call:** `cd "$CODEBASE_REPO" && git switch "$CHANGE_BRANCH" && npm test 2>&1 | tee "/tmp/${ASSIGNMENT_ID}_ci.log" && git switch "$TRUNK_BRANCH" && git merge --ff-only "$CHANGE_BRANCH"`

**Method:** external Codebase Git/CI only; SCTL records outcome but does not own Codebase Git.

**Watch:** `/tmp/<assignment_id>_ci.log`; Codebase Git log.

---

### 16B. Denied once: same author receives denial delta

**Call:** `$SCTL message send ... --message-kind revision_request ...`, then author dispatch render/inject again to the same author session.

**Method:** `sendTeamMessage() -> recordDispatch() -> renderDispatchPacket() -> exportMarkdown() -> sctl-dispatch-inject`

**Watch:** Class C revision request; new dispatch packet; same author session still active.

---

### 16C. Denied more than once: old author retires, fresh author starts

**Call:** `scripts/wsl_tmux/sctl-session-retire --assignment-id "$ASSIGNMENT_ID" --id "$CHANGE_AUTHOR_ID" --session "$CHANGE_AUTHOR_SESSION" --reason "deny_count_gt_1"`, then create fresh author and dispatch full context with denial history.

**Method:** `sctl-session-retire -> retireSession() -> sctl-session-new -> registerSession() -> sctl-dispatch-render -> recordDispatch() -> renderDispatchPacket() -> exportMarkdown() -> sctl-dispatch-inject`

**Watch:** old author retired; new author registered; new dispatch includes denial history.

---

### 17. Final outcome enters Class B

**Call:** `$SCTL classb put --id "B_${ASSIGNMENT_ID}_FINAL" --title "Final review and merge outcome for $ASSIGNMENT_ID" --assignment-id "$ASSIGNMENT_ID" --agent-id "$TRUNK_COORDINATOR_ID" --role "Trunk Coordinator" --scope review_outcome`

**Method:** `putClassBFile() -> validateClassBFile() -> incrementClassBState() -> gitCommitContext()`

**Watch:** `.strata/context/B/B_<assignment_id>_FINAL.md`; `.strata/context/D_trace/context_state.json`

---

### 18. Disposable sessions retire

**Call:** `scripts/wsl_tmux/sctl-session-retire --assignment-id "$ASSIGNMENT_ID" --id "$CHANGE_AUTHOR_ID" --session "$CHANGE_AUTHOR_SESSION" --reason "flowmap_02_cycle_complete"`; repeat for reviewer.

**Method:** `sctl-session-retire -> runtime terminate if enabled -> sessions retire -> retireSession() -> recordTelemetry() -> gitCommitContext()`

**Watch:** `.strata/context/C/sessions/active_sessions.json`; `.strata/context/C/sessions/lifecycle/`

---

### 19. Coordinator freshness is checked after Class B changed

**Call:** `$SCTL context freshness --loaded-context-epoch <coordinator_loaded_epoch> --loaded-class-a-revision <coordinator_loaded_class_a_revision>`

**Method:** `contextFreshness()`

**Policy:** `delta = current_class_b_revision - loaded_context_epoch`; `delta <= 0` no refresh; `1-5` delta export; `>5` full export; Class A changed means recreate coordinator.

**Optional export:** `$SCTL context export-markdown --include-classes A,B --since-class-b-revision <coordinator_loaded_epoch>`

**Watch:** stdout freshness result; context export if generated.

---

### 20. Final SCTL Git audit

**Call:** `git -C .strata/context status --short`; `git -C .strata/context log --oneline -30`

**Method:** external Git inspection of SCTL context Git.

**Watch:** Class C messages; dispatch packets; return ledgers; Class B reports; lifecycle records; context state.

## Coordinator inspection target

Confirm from SCTL Git, not chat memory:

```text
1. one Trunk Coordinator session remains active
2. Change Author was fresh/disposable
3. Reviewer was fresh/disposable
4. Codebase branch was assigned in Class C
5. author dispatch called recordDispatch() -> renderDispatchPacket() -> exportMarkdown()
6. reviewer dispatch called recordDispatch() -> renderDispatchPacket() -> exportMarkdown()
7. author return called classifyWorkerReturnPacket()
8. reviewer return called classifyWorkerReturnPacket()
9. final outcome entered Class B
10. disposable sessions retired
11. coordinator freshness checked after Class B changed
```

## Operational log template

```text
Flowmap: 02 - Trunk-Based Disposable Worker Cycle
Assignment ID:
Tester:
Date:
Codebase repo:
Codebase branch:

Step:
Status label:
Command or adapter called:
Expected method:
Observed evidence path:
Observed result:
Failure boundary if any:
Diagnosis:
Next inspection step:
```

## Final diagnosis template

```text
Overall result: OBSERVED / BROKEN / BLOCKED / PARTIAL

Completed method chain:
- ...

Broken or missing method chain:
- step:
- expected call:
- observed call:
- missing evidence:
- likely cause:
- next diagnostic action:

SCTL Git contains full operational log: yes/no
Codebase Git branch and CI evidence recorded: yes/no
Coordinator state verified from SCTL Git: yes/no
```
