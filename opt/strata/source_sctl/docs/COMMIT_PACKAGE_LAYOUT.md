# SCTL v0.9.4 Reproducibility Commit Layout

This commit is organized for GitHub review and replay rather than as a live SCTL workspace dump.

## Top-Level Folders

- `schemas/`: JSON schemas for SCTL context state, dispatch packets, Class B, Class C, telemetry, and worker returns.
- `src/`: SCTL CLI and library implementation.
- `tests/`: Node test suite for context, dispatch, Class B, Class C, tool boundaries, and worker returns.
- `docs/`: architecture, contracts, tester playbooks, package provenance, and verification results.
- `scripts/`: WSL/tmux adapter scripts for launcher/session/dispatch transport.
- `flowmaps/`: Flowmap 02 doctrine, decision notes, and the live multicycle operator harness.
- `examples/`: operational evidence from the A007 Flowmap 02 run plus packaged codebase snapshots.
- `templates/`: runtime templates loaded by the CLI and tests.

## Snapshot Artifacts

The requested codebase snapshot zip is committed under:

`examples/snapshots/strata_sctl_full_codebase_repro_package_20260613_224233.zip`

The pinned patched-adapter package is also retained for provenance under:

`examples/snapshots/strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime_patched_adapter.zip`

## Operational Evidence

Meaningful A007 live run logs are committed under:

`examples/operational_logs/flowmap02_A007/`

The most useful entry points are:

- `cycle_timeline.tsv`
- `flowmap02_result.md`
- `flowmap02_step_diagnosis.tsv`
- `flowmap02_operational.log`
- `final_sctl_git_log.txt`
- `final_codebase_log.txt`
