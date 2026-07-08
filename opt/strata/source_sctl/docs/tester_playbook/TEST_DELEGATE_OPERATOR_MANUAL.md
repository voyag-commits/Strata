# Test Delegate Operator Manual

Purpose: define the operational boundary, required environment, and reporting rules for a human operator running the Flowmap 02 live delegate harness.

This manual is for live WSL/tmux delegate tests driven by:

```bash
flowmaps/flowmap02/live_cycle_harness.sh
```

## Boundary

The operator owns test execution and evidence reporting. The operator does not own worker runtime behavior, implementation correctness, or completion claims from chat text.

Treat these as separate systems:

- **SCTL package repo:** contains the harness, SCTL CLI, docs, schemas, and test artifacts.
- **SCTL workspace:** per-run operational context under `.strata/`; this is the durable context Git repository for the run.
- **Codebase repo:** implementation Git repository under test; this is where worker branches and merges happen.
- **Runtime edge:** launcher/tmux adapter path that starts, captures, injects, and retires live sessions.

Do not collapse these paths into one mental model. If a path is ambiguous, stop before launching.

## Visible Terminal Ownership

Only one component should open a human-visible terminal attachment for a worker session.

The runtime launcher path may open a visible Windows Terminal tab through `spawnTerminalTab(sessionName)` in the runtime-edge package. The SCTL dispatch adapter can also open an attach tab through `strata-runtime-edge delegate dispatch-deliver`.

For live delegate automation, the launcher-owned session tab is the primary visible surface. Dispatch injection should paste into the existing tmux session without opening another attach tab. Use `--open-inject-tab` only when a diagnostic run explicitly needs a fresh attach tab.

If duplicate tabs appear, check these code paths:

- runtime-edge `spawnTerminalTab(sessionName)`
- SCTL adapter `strata-runtime-edge delegate dispatch-deliver`
- harness `inject_packet()` passing or omitting `--no-tab`

Duplicate visible tabs are an operator UX defect, not additional worker sessions by themselves. Confirm actual live sessions with `tmux list-sessions`.

## Delegated Coordinator Duties

The Delegated Coordinator is a routing and gatekeeping role. It gives bounded envelopes, tracks project goals and phase state, records decisions, and decides the next action for Change Author or Reviewer sessions. It does not perform Change Author implementation or Code Reviewer judgment.

In live harness tests, deterministic shell code replaces many mechanical coordinator operations. This is a hard constraint layer for repeatable testing, not a replacement for the coordinator's semantic role.

The harness owns:

- command order
- path selection
- branch creation
- dispatch rendering
- dispatch injection
- return waiting
- return classification calls
- CI and merge gate execution
- evidence capture
- final audit mechanics

The coordinator role still owns the flexible contents and routing intent carried inside envelopes:

- understanding project goal and current phase from exported context
- choosing or receiving the next bounded assignment
- deciding whether to route to Change Author, Reviewer, or human Director
- deciding whether a boundary should terminate the run and report upward
- preserving the distinction between implementation work, review work, and operating-control work

The practical model is:

```text
deterministic harness = hard operational rails
coordinator session = phase-aware routing and envelope intent
worker sessions = flexible implementation or review inside bounded assignment
human Director = authority for policy, scope, and continuation decisions
```

Allowed coordinator operations:

- evaluate context freshness before dispatch
- prepare author and reviewer work orders
- send Class C team messages
- render deterministic dispatch packets
- inject packets into assigned sessions
- wait for bounded Worker Return Packets
- classify returns through SCTL
- promote accepted author reports into Class B when appropriate
- parse reviewer recommendation as approved, denied, or blocked
- run declared validation commands after reviewer approval
- perform ff-only merge only when approval, validation, and `--allow-merge` are all present
- record final outcome as Class B
- retire disposable sessions
- run final SCTL/codebase Git audits

Forbidden coordinator operations unless explicitly authorized by a test playbook:

- editing implementation files as the Change Author
- substituting its own review judgment for the Reviewer return
- treating chat text as completion without return files
- modifying worker return packets to make them pass
- silently continuing past a failed CI, invalid return, dirty SCTL context Git, or non-ff merge boundary

## Required Inputs

Before a live run, record these exact values:

```text
ASSIGNMENT_ID=<unique assignment id>
PACKAGE_ROOT=<absolute path to Strata package repo>
SCTL_WORKSPACE=<absolute WSL path for this test run>
CODEBASE_REPO=<absolute WSL path to implementation Git repo>
SCTL_RUNTIME_DELEGATE_ROOT=<absolute WSL or /mnt/c path to runtime-edge package>
ENVELOPE_TEMPLATE_FILE=<absolute path to Envelope Template.txt>
TRUNK_BRANCH=main
COORDINATOR_WORK_ORDER_REQUIRED_CHANGE_ITEMS=<exact implementation delta for Change Author>
CYCLE_COUNT=<integer>
RETURN_TIMEOUT=<seconds>
```

Use a fresh `ASSIGNMENT_ID` for each full automation attempt unless the test objective is explicitly to resume a prior failed run.

The Change Author dispatch must contain a `Coordinator Work Order / Required Change Items`. Generic wording such as "implement one small codebase change" is not sufficient for non-diagnostic live tests. If the coordinator cannot state the exact intended implementation delta, stop and route to the human Director for scope clarification.

## Preflight Checklist

Run or verify:

```bash
command -v node
command -v npm
command -v git
command -v python3
command -v tmux
test -f "$PACKAGE_ROOT/src/cli.js"
test -f "$ENVELOPE_TEMPLATE_FILE"
test -f "$SCTL_RUNTIME_DELEGATE_ROOT/dist/src/cli.js"
test -d "$CODEBASE_REPO/.git"
git -C "$CODEBASE_REPO" status --short --branch
```

The codebase repo should be clean before the run unless the test is explicitly about dirty-worktree handling.

If `main` has no upstream, record `WARN_LOCAL_MAIN_NO_UPSTREAM`. This is not automatically fatal; it means the run is validating against local trunk freshness, not remote freshness.

## Launch Command Pattern

Use explicit absolute paths and a concrete timeout:

```bash
SCTL_RUNTIME_DELEGATE_ROOT="$SCTL_RUNTIME_DELEGATE_ROOT" \
"$PACKAGE_ROOT/flowmaps/flowmap02/live_cycle_harness.sh" \
  --assignment-id "$ASSIGNMENT_ID" \
  --package-root "$PACKAGE_ROOT" \
  --runtime-edge-root "$SCTL_RUNTIME_DELEGATE_ROOT" \
  --sctl-workspace "$SCTL_WORKSPACE" \
  --codebase-repo "$CODEBASE_REPO" \
  --short-name "$SHORT_NAME" \
  --objective "$OBJECTIVE" \
  --specific-change-request "$COORDINATOR_WORK_ORDER_REQUIRED_CHANGE_ITEMS" \
  --cycles "$CYCLE_COUNT" \
  --return-timeout "$RETURN_TIMEOUT" \
  --allow-merge
```

For slow live workers, use `--return-timeout 500` or higher. A timeout is a real result, not a failed assertion to hide.

## Evidence Rules

The harness result is authoritative for the run boundary.

Required evidence to preserve:

- `flowmap02_result.md`
- `flowmap02_result.json`
- `flowmap02_step_diagnosis.tsv`
- `flowmap02_step_status.jsonl`
- `cycle_timeline.tsv`
- `flowmap02_operational.log`
- SCTL workspace `.strata/context` Git log and status
- Codebase Git branch, commit, and status
- Worker return packet and operational report paths when present

If a worker produces files after the harness exits, report that as a **post-timeout observation**. Do not rewrite the run outcome as completed.

## Completion Criteria

A full cycle is complete only when these gates are observed for that cycle:

1. Change Author return packet exists and classifies as `OPERATIONAL_REPORT_READY`.
2. Change Author operational report is accepted into Class B when appropriate.
3. Reviewer return packet exists and classifies as `OPERATIONAL_REPORT_READY`.
4. Reviewer recommendation is parsed as `approved`, `denied`, or `blocked`.
5. If approved, declared validation commands pass.
6. If approved and validation passes, ff-only merge is performed only when `--allow-merge` is supplied.
7. Final outcome Class B entry is recorded.
8. Disposable author/reviewer sessions are retired.
9. Final SCTL context Git status is clean.

## Breaking Boundaries

Stop and report the exact boundary when any of these occur:

- Missing required path or command.
- Codebase repo is dirty and `--allow-dirty-codebase` was not explicitly intended.
- Branch already exists and `--reuse-branch` was not explicitly intended.
- Worker return packet missing at timeout.
- Return packet exists but SCTL classification is not `ok: true`.
- Operational report is missing or invalid.
- Reviewer result cannot be parsed.
- CI or validation command fails.
- Merge is not ff-only.
- SCTL context Git is dirty at final audit.

Use the harness status names when available, for example `BLOCKED_TIMEOUT`, `BROKEN_CI_FAILED`, or `BROKEN_SCTL_GIT_DIRTY`.

## Post-Run Reporting

Report:

- assignment id
- cycle count requested and cycle count completed
- final harness status
- run root
- SCTL workspace
- codebase branch and commit state
- exact breaking boundary if incomplete
- whether any return artifacts appeared after timeout
- recommended next action

Do not claim completion from chat text. Completion requires the files and gates above.
