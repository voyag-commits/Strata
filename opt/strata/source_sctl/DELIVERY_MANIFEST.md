# SCTL Kernel Delivery Manifest — A004

**Package:** strata-sctl-kernel-components-1-3-4
**Version:** 0.9.5-delegate-contract
**Delivery date:** 2026-07-04
**Assignment:** A004

## Kernel Boundary

SCTL owns context Git, Class A/B commits, dispatch packet rendering, worker-return validation, cycle progression, and the Flowmap 02 harness orchestration logic. Everything behind the runtime delegate contract (tmux, Codex CLI, DeepSeek bridge, launcher stack) is external and not included in this package.

## Package Contents

| Directory | Purpose | Files |
|---|---|---|
| `src/` | Kernel CLI + 19 library modules | 20 |
| `templates/` | Dispatch envelope, work order, return packet, report templates | 14 |
| `schemas/` | JSON schemas for Class B, Class C, dispatch, return, context state, telemetry | 6 |
| `tests/` | 47 kernel tests (context, classb, dispatch, returns, maintenance, boundary) | 11 |
| `flowmaps/` | Flowmap 02 harness + run scripts + design docs | 6 |
| `scripts/` | WSL bootstrap, linux guard, delegate adapter thin-scripts | 15 |
| `docs/` | Architecture, contracts, runbooks, tester playbooks, ADRs | 31 |
| `.github/` | CI workflow | 1 |
| Root | LICENSE, SPEC.md, README.md, NOTES.md, package.json, examples | 10 |

**Total:** 114 source files. All checksums verified (see `PACKAGE_CHECKSUMS.sha256`).

## Delegate Contract Surface (External — Not in Package)

The kernel calls eight delegate verbs via the adapter scripts in `scripts/wsl_tmux/`. These scripts are thin shells that invoke an external delegate binary (`$SCTL_RUNTIME_DELEGATE_BIN`). The delegate owns tmux/Codex runtime binding, packet paste-delivery, session capture, and session kill.

## Verification

- `npm test`: 47/47 pass
- `bash -n flowmaps/flowmap02/live_cycle_harness.sh`: syntax OK
- `node src/cli.js --help`: CLI executable
- `sha256sum -c PACKAGE_CHECKSUMS.sha256`: all OK

## Patches Applied This Delivery

1. `src/lib/export.js` — Class A export emits only latest unique Director Entry (filters stubs + duplicates)
2. `flowmaps/flowmap02/live_cycle_harness.sh` `infer_review_result` — five reviewer outcomes (approved/rejected/suspended/needs_rework/issue_found); no hard-fail on unrecognized text; only `approved` gates merge
3. `flowmaps/flowmap02/live_cycle_harness.sh` `prepare_codebase_branch` — removed `BLOCKED_BRANCH_EXISTS` hard-fail; switches to existing branch
4. `flowmaps/flowmap02/live_cycle_harness.sh` `reset_cycle_transient_artifacts` — pre-next-cycle reset of transient return files (called after reviewer, before next cycle); never touches Class B git history
5. `templates/work_products/coordinator_work_order.template.md` — Return Contract: flat file, no directory
6. `templates/packets/worker_return_packet.operational_report_ready.template.json` — fixed `<role_instance>` → `<role_instance_id>`, added `packet_path`, added `_submission_note`
7. `src/lib/dispatch_outbox.js` — initial coordinator header: "author a work order, do NOT implement code"
