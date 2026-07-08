CLI manual addendum — maintenance wrapper surface



## 1. Maintenance wrapper layer

- Thin layer over SCTL internals. Does not modify internal operations (principle 1).

```
sctl doctor
sctl init-workspace
sctl status
sctl logs [--tail N] [--kind EVENT_PREFIX]
sctl collect-evidence [--out DIR] [--assignment-id A004]
sctl paths [--director-entry-source FILE] [--codebase-repo DIR]
```

Clarification:

- `doctor` aggregates repo status, context state, secret scan, package checksum presence, and telemetry log existence into one `checks[]` envelope. Read-only.
- `init-workspace` ensures the `.strata` layout and bootstraps context Git. Idempotent.
- `status` reports context head, state revisions, and active cycle.
- `logs` reads the telemetry JSONL; `--tail N` (default 50), `--kind` filters by event prefix.
- `collect-evidence` copies context state, Class B files, full `D_trace`, and active sessions into `--out` with a `manifest.json`.
- `paths` reports: package path, workspace path, Director Entry source/controlled paths, target codebase, runtime delegate path.

## 2. Top-level cycle aliases

Canonical aliases for the `cycle` subcommands:

```
sctl entry-path
sctl entry-template [--write]
sctl validate-entry
sctl cycle-start --assignment-id A004 [--file FILE] [--coordinator-id ID] [--no-dispatch]
```

These return identical results to `cycle entry-path`, `cycle template`, `cycle validate-entry`, and `cycle start`.

## 3. Configuration

A CLI harness should support both environment variables and a config file.

```
sctl --config ./sctl.env doctor
```

Where `sctl.env` contains:

```
STRATA_WORKSPACE=/home/operator/sctl-workspaces/A004
CODEBASE_REPO=/home/operator/work/project
TRUNK_BRANCH=main
COORDINATOR_ID=delegated_coordinator_001
RUNTIME_DELEGATE_ROOT=/opt/strata-runtime-delegate
```

Precedence: real `process.env` wins over the config file; CLI flags win over both. The file fills defaults only.

Topic: Scope

- `doctor` checks that `PACKAGE_CHECKSUMS.sha256` exists and is parseable; it does not re-hash every file on each run.
- The wrapper layer does not modify SCTL's internal operations.
