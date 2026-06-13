# Full SCTL Codebase Reproducibility Package Analysis

## Packaging Decision

This package is assembled as the SCTL codebase package, not a live workspace dump.

Included:
- `strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime/`: SCTL CLI source, tests, schemas, templates, docs, WSL/tmux adapter scripts, and empty `.strata` workspace skeleton.
- `flowmaps/flowmap02/`: preserved multicycle Flowmap 02 live operator harness in this repository layout.
- `delivery_docs/`: playbooks and earlier delivery evidence already present in the baseline delivery archive.
- `SOURCE_ARTIFACTS.md`: source archive provenance and dependency boundary.

Excluded by design:
- Live SCTL workspace state such as `/home/hou16/sctl-live-test-A_LIVE_001`.
- The nuclear physics implementation repo `/home/hou16/workspace/AAU_MED_EM_ENSEMBLE_HEATMAP_STUDENT_ASSIGNMENT`.
- Runtime-edge launcher source code. It is an external runtime/session dependency, not SCTL code.
- Flowmap A007 operational logs as source files. They remain in the separate evidence zip referenced in `SOURCE_ARTIFACTS.md`.
- The discarded compact Class B export experiment.

## Interdependent Codebase Boundary

SCTL codebase:
- Owns deterministic context Git operations: Class A, Class B, Class C, D_trace.
- Owns dispatch packet rendering and Git evidence records.
- Owns worker return classification and Class B promotion commands.
- Provides WSL/tmux adapter scripts as the thin transport adapter boundary.

Runtime-edge / launcher:
- Owns session creation and terminal/tab launch behavior.
- Is required for launcher-path live Flowmap tests.
- Is referenced by `SCTL_RUNTIME_EDGE_ROOT` and by `scripts/wsl_tmux/sctl-session-new`.
- Is not bundled as SCTL source in this zip.

Codebase Git under test:
- Owns implementation work branches and commits.
- Is supplied at runtime via `--codebase-repo`.
- Is intentionally not bundled with SCTL.

SCTL workspace Git:
- Owns coordination, dispatch packets, returns, Class B reports, review outcomes, and evidence trace.
- Is supplied at runtime via `--sctl-workspace`.
- Is intentionally not bundled except for the empty skeleton needed to bootstrap tests.

## Reproducibility Entry Points

Package checks:
```bash
cd strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime
npm test
npm run secret-scan
for script in scripts/wsl_tmux/sctl-* flowmaps/flowmap02/*.sh; do bash -n "$script"; done
```

Live Flowmap 02 harness:
```bash
cd strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime
flowmaps/flowmap02/live_cycle_harness.sh \
  --assignment-id A_FLOWMAP_02_REPRO \
  --sctl-workspace /absolute/path/to/SCTL_WORKSPACE \
  --codebase-repo /absolute/path/to/CODEBASE_REPO \
  --runtime-edge-root /absolute/path/to/RUNTIME_EDGE_ROOT \
  --cycles 1 \
  --allow-merge
```

Use real WSL/tmux launcher sessions for live tests. Do not replace this with offline/mock execution when evaluating Flowmap 02.
