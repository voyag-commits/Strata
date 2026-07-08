# SCTL Live Cycle Operation Guide

## 1. Operational Entry & Director Entry Placement

Start the full cycle via the shell harness, not the kernel CLI alone:

```
flowmaps/flowmap02/live_cycle_harness.sh
```

Director Entry placement: exactly one Markdown file in `.strata/cycles/director_entry/`. The harness auto-detects it. Or pass `--director-entry-source FILE` to copy an external file in. The harness enforces one `.md` file under that directory; stale copies from prior cycles must be removed first.

Required flags: `--assignment-id`, `--package-root`, `--sctl-workspace`, `--codebase-repo`, `--runtime-delegate-root`, `--runtime-delegate-bin`, `--runtime-launch-config`, `--validation-command`. Add `--allow-merge` to authorize merge after green CI.

Launch detached so the harness survives shell return: `setsid bash ...harness.sh <flags> < /dev/null > run.log 2>&1 & disown`.

## 2. Per-Step Operations & Failure Analysis

Read `flowmap02_step_diagnosis.tsv` in the run dir. Each row: `step status observation diagnosis next_action`. Debug order:
- Last `OBSERVED` row marks where the cycle progressed to; the failure is the next step.
- `BLOCKED_*` / `BROKEN_*` = bounded failure with recorded cause; read `diagnosis` + cited log file.
- Silent death (no fail row, process gone) = process-group kill or uncaught exit. Re-run with `bash -x`; inspect trace tail for the exact death line.
- `WARN_*` = non-fatal; confirm benign (e.g., short-vs-full SHA mismatch) before proceeding.

Class A export emits only the latest unique Director Entry (stubs and duplicates filtered). Class B uses latest-2 policy. If context looks empty, inspect `.strata/context/A/` and `.strata/context/B/` in context git.

## 3. Actions & Observations Per Cycle

Watch in sequence: (1) preflight — npm test 47/47, adapter syntax OK; (2) context bootstrap; (3) cycle start — Director Entry → Class A commit; (4) coordinator session registered, dispatch injected into `STRATA-COORDINATOR-A004`; (5) author session `STRATA-CODER-A004` → work order → code commit on branch → return packet at `.strata/returns/A004/change_author_c01/`; (6) reviewer session → `approved`/`denied`; (7) CI runs `--validation-command`; (8) merge gate.

Stop points: `BLOCKED_MERGE_NOT_AUTHORIZED` (add `--allow-merge`); `BROKEN_*` (inspect cited log); return timeout (check the tmux session for a stuck agent).

Read alongside: `CLI manual commands and analysis.md` and `CLI manual addendum maintenance wrapper.md`.

## 4. Reference: Successful Operational Log Paths

Run `run_20260703T134148Z`: review approved, CI passed, merge gated. Relative to workspace root unless noted:

- Run dir: `_test_runs/flowmap02/run_20260703T134148Z/`
- Step diagnosis (primary debug artifact): `_test_runs/flowmap02/run_20260703T134148Z/flowmap02_step_diagnosis.tsv`
- Operational log: `_test_runs/flowmap02/run_20260703T134148Z/flowmap02_operational.log`
- CI log (green): `_test_runs/flowmap02/run_20260703T134148Z/A004_C01_ci.log`
- Coordinator dispatch packet: `.strata/dispatch_outbox/A004/delegated_coordinator_001/N_COORD_CYCLE_A004_2026-07-03T13-41-53-782Z/dispatch_packet.md`
- Author dispatch packet: `.strata/dispatch_outbox/A004/change_author_c01/N_AUTHOR_C01/dispatch_packet.md`
- Reviewer dispatch packet: `.strata/dispatch_outbox/A004/reviewer_c01/N_REVIEW_C01/dispatch_packet.md`
- Author return: `.strata/returns/A004/change_author_c01/packet.json`
- Reviewer return: `.strata/returns/A004/reviewer_c01/packet.json`
- Harness stdout (absolute): `/home/hou16/workspace-sctl-A004/harness_run_20260703T134148Z.log`
