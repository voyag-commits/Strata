# Change Log — 2026-07-07

**Target distro:** `SCTL` (a004-2 prebuilt appliance)
**Harness:** `/opt/strata/source_sctl/flowmaps/flowmap02/live_cycle_harness.sh`
**Wrapper:** `/usr/local/bin/strata-cycle`

## Changes

### 1. Run-start artifact freshness pass
- Added `run_start_artifact_freshness()`, invoked once in `main()` after `call_sctl_git_panel_startpoint`, before cycle-1 coordinator registration.
- Clears stale transient return drop-box dirs (`.strata/returns/<assignment>/*`) and sweeps disposable `STRATA-CODER/REVIEWER-<assignment>-C*` tmux sessions, so a crashed prior run cannot poison cycle 1 via a stale `packet.json` or a duplicate-name session collision.
- Touches neither codebase git nor context-git content/GC (determinism-only). Honors `--no-artifact-freshness`.

### 2. Validation-command default aligned to appliance task
- Replaced legacy A005 Python defaults (`py_compile code/ensemble_core.py`, `sample_uniform_sphere` smoke) with the Node DoD from the appliance Director Entry: `node -e "require('./src/volume.js').boxVolume(2,3,4)===24 || process.exit(1)"`.

### 3. Codebase-git branch-kill removal (L3 boundary)
- Removed `cleanup_cycle_change_branch()` + `branch_is_cycle_owned()` and their call from `cycle_end_artifact_freshness()`.
- Retired `--keep-change-branch` / `FRESHNESS_KEEP_CHANGE_BRANCH` from harness and wrapper.
- Kept `--delete-branch-after-merge` (operator opt-in safe `-d`).
- Branch lifecycle is now agent-owned; the harness no longer force-deletes cycle-owned branches at cycle end.

## Verification
- `bash -n` clean; package tests 48/49 (pre-existing #28 env-bleed only).
- Live 3-cycle run: run-start pass fired; cycle_01 completed author→review→CI (passed); branch survived; no force-delete.

---

## Addendum — Full codebase-git zero-contact removal (same day)

### 4. Removed all codebase-git operations (true zero contact)
- Deleted five functions: `prepare_codebase_branch`, `validation_text` (dead code), `diagnose_return_implementation_ref`, `run_ci_checks`, `merge_if_authorized`.
- Removed all cycle-body call sites: branch prep, both read-only `diagnose` probes, CI checks, and the merge gate — plus their `record_operational_stage` lines.
- `git -C "$CODEBASE_REPO"` count in the harness is now **0** (was 11). The only remaining `CODEBASE_REPO` reference is the preflight filesystem existence check (`[ -d "$CODEBASE_REPO/.git" ]`) and dispatch packet metadata — neither is a git operation.

### 5. Retired codebase-git flags and report fields
- Removed from harness + wrapper: `--allow-merge`/`ALLOW_MERGE`, `--delete-branch-after-merge`/`DELETE_BRANCH_AFTER_MERGE`, `--reuse-branch`/`REUSE_BRANCH`, `--allow-dirty-codebase`/`ALLOW_DIRTY_CODEBASE`, `--validation-command`/`VALIDATION_COMMANDS`.
- Stripped `CI_RESULT`, `MERGE_RESULT`, `CI_LOG`, `PULL_LOG` from globals, `set_cycle_context`, `init_run_root`, `finish_report` (report + JSON), `append_cycle_timeline`, and `write_timeline_header` (dropped the `ci`/`merge` columns).
- `record_final_outcome` now derives `status_word` from `REVIEW_RESULT` (not merge); `--trunk-integration`/`--verification` no longer reference merge/CI.
- `final_audit` dropped the two codebase `git branch --list` / `git log` captures.

### Verification (3-cycle live run)
- `strata-cycle start --director-entry ~/director_entry/director_governing_entry.md --cycles 3`
- Assignment `A_APPLIANCE_20260707T143943Z`: 14:39:43Z → 14:51:30Z, overall result **OBSERVED**.
- All 3 cycles completed (BEGIN/END cycle_01–03); SCTL context Git clean at final audit.
- Live log: 0 codebase-git ops, 0 failures. Each cycle flowed `export_context → register_align_author_session` with no `prepare_branch`/`run_ci`/`merge_if_authorized` step.
- Operational log copied to `SCTL_invariant_manuals/A_APPLIANCE_20260707T143943Z_operational.log`.
