# Operational Diagnosis: R2/R0/R1 Revision

Date: 2026-06-18
Package base: uploaded rollback state `Strata_SCTL_codebase_state_20260616_133626_revised(4).zip`

## Scope

This revision was applied to the rollback/correct-state codebase, not to the corrupted PowerShell-to-WSL quoting branch. The sandbox cannot execute the real WSL/tmux desktop plane, so validation here covers package tests, CLI cycle-entry behavior, shell syntax, and deterministic SCTL context/dispatch artifacts.

## Revisions applied

### R2: Director Governing Entry Document

Implemented the renamed flow:

1. Director writes a Director Entry Document under `.strata/cycles/director_entry/`.
2. SCTL validates only that the selected file is Markdown under the controlled directory.
3. SCTL copies the source text without structural/frontmatter constraints into `.strata/context/A/director_governing_entries/<assignment>/<cycle>_<source>.md`.
4. SCTL commits that file as Class A and records the Class A path, SHA256, and Git commit.
5. SCTL creates the normalized runtime `cycle_entry.json` under Class D trace. The object references the committed Class A Director Entry Document instead of treating the source as an uncommitted manual packet.
6. SCTL records a Coordinator dispatch envelope with `dispatch_kind: DIRECTOR_ENTRY_CONTEXT_COMMIT` after the Class A commit.
7. Coordinator context remains Class A plus latest Class B by export policy.

Key files changed:

- `src/lib/layout.js`
- `src/lib/cycles.js`
- `src/cli.js`
- `tests/cycle_entry_context.test.js`

### R0: Coordinator Work Order must be Class B before Change Author dispatch

Implemented a Class B Coordinator Work Order contract:

- `contract_id: strata.class_b.coordinator_work_order.v1`
- Class B validation supports Coordinator Work Orders separately from operational reports.
- The work order validator requires identity/trace fields, Director Entry Document path/hash, itemized Required Change Items, scope, codebase assignment, acceptance criteria, validation, return contract, evidence, stop/escalation, and merge/completion expectation.
- Flowmap 02 now writes the Change Author Coordinator Work Order directly under `.strata/context/B/`, commits it with `classb commit`, then uses that committed Class B artifact as the Change Author dispatch source.
- The generated Change Author work order no longer emits a vague standalone `Coordinator Work Order / Required Change Items` section. It uses `## Required Change Items` with concrete item fields.

Key files changed:

- `src/lib/classb.js`
- `flowmaps/flowmap02/live_cycle_harness.sh`
- `tests/classb_git_file.test.js`

### R1: timeout and session naming

Implemented:

- `RETURN_TIMEOUT=360`
- Flowmap help/docs updated to 360 seconds.
- Session names changed to the requested operational pattern:
  - `coord-<assignment_id>-C00-S01`
  - `author-<assignment_id>-C01-S01`
  - `reviewer-<assignment_id>-C01-S01`

Key files changed:

- `flowmaps/flowmap02/live_cycle_harness.sh`
- `flowmaps/flowmap02/README.md`

## Additional operator support

`live_cycle_harness.sh` now accepts:

```bash
--director-entry-source FILE
```

If the source path looks like `C:\Users\...\file.md`, the harness converts it to `/mnt/c/Users/.../file.md`, copies it into `.strata/cycles/director_entry/`, and then starts the SCTL Director Entry flow from the controlled copy.

## Validation performed

### 1. Node/unit tests

Command:

```bash
npm test
```

Result:

```text
1..23
# tests 23
# suites 0
# pass 23
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

### 2. Shell syntax

Command:

```bash
bash -n flowmaps/flowmap02/live_cycle_harness.sh
```

Result:

```text
flowmap02 bash syntax ok
```

### 3. Node syntax

Command:

```bash
node --check src/cli.js
node --check src/lib/cycles.js
node --check src/lib/classb.js
```

Result:

```text
node syntax ok
```

### 4. CLI smoke: Director Entry commit and Coordinator dispatch

Command pattern:

```bash
node src/cli.js --workspace <tmp> context bootstrap
node src/cli.js --workspace <tmp> cycle start \
  --assignment-id A_DIRECTOR_ENTRY_617_B2 \
  --coordinator-id delegated_coordinator_001
```

Observed summary:

```json
{
  "ok": true,
  "tool": "sctl.cycle.director_entry.submit.v1",
  "class": "A",
  "dispatch_kind": "DIRECTOR_ENTRY_CONTEXT_COMMIT"
}
```

Observed SCTL Git sequence:

```text
dispatch record A_DIRECTOR_ENTRY_617_B2 ...
cycle entry reference A_DIRECTOR_ENTRY_617_B2 ...
Class A Director Entry Document A_DIRECTOR_ENTRY_617_B2 ...
telemetry context bootstrap
strata context bootstrap
```

## Diagnosis

Original R0 diagnosis remains valid for the rollback state: the old code loaded Director Markdown into the dispatch envelope but did not populate `cycle_entry.json` with a committed Class A document path/hash/commit. This revision fixes that by making the committed Class A Director Entry Document the source of truth for the normalized runtime object.

The `BLOCKED_COORDINATOR_WORK_ORDER_REQUIRED` failure mode was caused by generating an author-facing body/work-order outside committed Class B and then dispatching that uncommitted artifact. This revision fixes that boundary by committing the Coordinator Work Order as Class B before rendering Change Author dispatch.

The PowerShell-to-WSL quoting corruption is not present in the uploaded rollback codebase. I did not apply or inspect the corrupted branch. The new `--director-entry-source` path conversion is intentionally narrow: it converts a supplied Windows path into a WSL `/mnt/<drive>/...` path before copying the Markdown into the controlled SCTL directory. It does not alter the tmux injection quoting plane.

## Remaining live-test requirement

A full operational proof still requires running Flowmap 02 in the real WSL/tmux/launcher environment. The sandbox cannot create visible Windows Terminal/tmux Codex sessions. The next live run should verify:

1. `--director-entry-source "C:\Users\hou16\Downloads\Templates\Director_manual_write617.md"` copies the file into `.strata/cycles/director_entry/`.
2. `cycle_entry.json` references the committed Class A path, SHA256, and Git commit.
3. The Coordinator dispatch is generated after the Class A commit.
4. The first Change Author dispatch uses the committed Class B Coordinator Work Order artifact.
5. Return wait timeout is 360 seconds.
6. tmux session names follow `coord-...`, `author-...`, and `reviewer-...`.
