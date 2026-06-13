# Flowmap 02 Live Operator Harness

This harness is based on the observed A005/A006 operational logs. It replaces manual operator typing for Flowmap 02 live cycles while preserving bounded failure reporting.

It has no dry-run mode.

## Main file

```text
scripts/flowmap02/live_cycle_harness.sh
```

Install it under the SCTL package root at:

```text
<PACKAGE_ROOT>/scripts/flowmap02/live_cycle_harness.sh
```

or run it from any location with `--package-root /absolute/path/to/PACKAGE_ROOT`.

## Canonical run command

```bash
scripts/flowmap02/live_cycle_harness.sh \
  --assignment-id A_FLOWMAP_02_007 \
  --package-root "/mnt/c/Users/hou16/Downloads/Codex_CLI_agent fleet/_package_patch_v0_9_4_simplified_runtime/strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime" \
  --runtime-edge-root "/mnt/c/Users/hou16/Downloads/Codex_CLI_agent fleet/strata_runtime_edge_launcher_delegate_component2_3_v0_9/strata_runtime_edge_launcher_delegate_component2_3_v0_9" \
  --envelope-template "/mnt/c/Users/hou16/Downloads/Envelope Template.txt" \
  --sctl-workspace /home/hou16/sctl-live-test-A_LIVE_001 \
  --codebase-repo /home/hou16/workspace/AAU_MED_EM_ENSEMBLE_HEATMAP_STUDENT_ASSIGNMENT \
  --short-name sample-uniform-sphere-mc \
  --objective "Implement one small assigned nuclear-physics simulation codebase change." \
  --cycles 3 \
  --allow-merge
```

## Important behavior

- Waits up to 300 seconds for the Change Author return packet.
- Waits up to 300 seconds for the Reviewer return packet.
- Stops with `BLOCKED_TIMEOUT` if a return packet does not appear.
- Treats `git pull --ff-only` with no upstream as a warning, not a hard failure.
- Blocks merge unless `--allow-merge` is supplied.
- Uses one long-running Delegated Coordinator session and fresh disposable author/reviewer pairs per cycle.
- Uses the recommended session names:
  - `TBD-DC-<assignment_id>`
  - `TBD-CA-<assignment_id>-C01`, `TBD-CA-<assignment_id>-C02`, ...
  - `TBD-CR-<assignment_id>-C01`, `TBD-CR-<assignment_id>-C02`, ...
- Uses the actual registered Delegated Coordinator `loaded_context_epoch` for cycle freshness checks.
- Writes standalone full-context exports under `<RUN_ROOT>/context_exports/<cycle>/<label>/context.md`.
- Diagnoses each worker return packet's `implementation_repository` and `implementation_commit` against the assigned Codebase Git branch head.
- Does not delete successful change branches unless `--delete-branch-after-merge` is supplied.
- Writes a markdown result, TSV diagnosis, JSON result, JSONL step status, and raw operational log.

## Output files

The default output root is:

```text
<PACKAGE_ROOT>/_test_runs/flowmap02/run_<UTC>/
```

Key files:

```text
flowmap02_operational.log
flowmap02_step_diagnosis.tsv
flowmap02_step_status.jsonl
cycle_timeline.tsv
flowmap02_result.md
flowmap02_result.json
<assignment_id>_ci.log
<assignment_id>_pull.log
context_exports/cycle_01/coordinator_before/context.md
context_exports/cycle_01/author_dispatch/context.md
context_exports/cycle_01/reviewer_dispatch/context.md
context_exports/cycle_01/coordinator_after/context.md
```

`cycle_timeline.tsv` is the one-screen cycle summary. Columns:

```text
cycle | branch | author_commit | reviewer_commit | review | ci | merge | class_b_author | class_b_outcome | context_before | context_after
```

## Default validation commands

If no `--validation-command` is supplied, the harness uses the A005 validation commands:

```bash
python3 -m py_compile code/ensemble_core.py
python3 -c "import sys, numpy as np; sys.path.insert(0, 'code'); from ensemble_core import sample_uniform_sphere; pts=sample_uniform_sphere(200, 3.0, 123, recenter=False); assert pts.shape == (200, 3), pts.shape; assert np.all(np.linalg.norm(pts, axis=1) <= 3.0 + 1e-12); print('sample_uniform_sphere smoke passed')"
```

For a different assignment, pass explicit validation commands:

```bash
--validation-command "python3 -m py_compile code/ensemble_core.py" \
--validation-command "python3 tests/smoke_test.py"
```

## Failure statuses

Expected bounded statuses include:

```text
OBSERVED
WARN_LOCAL_MAIN_NO_UPSTREAM
BLOCKED_TIMEOUT
BLOCKED_BRANCH_EXISTS
BLOCKED_DIRTY_CODEBASE
BLOCKED_MERGE_NOT_AUTHORIZED
BROKEN_PACKAGE_TESTS
BROKEN_DISPATCH_RENDER
BROKEN_DISPATCH_INJECT
BROKEN_RETURN_CLASSIFY
BROKEN_CI_FAILED
BROKEN_MERGE_FAILED
BROKEN_REVISION_MATH
```

The tester should inspect `flowmap02_result.md` first, then the TSV row for the failed boundary.
