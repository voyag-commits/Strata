# ADR-0602 — Backend Tool Registry and Class D: Local Transcripts

Status: Proposed
Base version: Strata v0.6 tmux/WSL package
Target version: v0.7 backend CLI kernel hardening
Date: 2026-06-09

## Context

Strata v0.6 introduced the WSL/tmux runtime path, Codex CLI session launch, file-backed Worker Return Packets, review-gated ClassB import, and manual VS Code setup guides.

The next increment must harden the backend as deterministic infrastructure. The backend must be CLI-reachable, schema-governed, auditable, and non-intelligent.

## Decisions

### ADR-0602-D01 — Backend is deterministic infrastructure

Backend is a CLI-reachable deterministic control plane.

It must validate explicit commands, perform deterministic state transitions, and write evidence/result artifacts.

Backend must not infer intent, judge quality, summarize, decide importance, or act as IC, DLO, BOC, reviewer, or worker.

### ADR-0602-D02 — Agents are intelligent callers

DLO, BOC, IC, reviewer, and worker agents remain outside the backend.

Agents may call `strata` CLI commands. Backend validates and executes the requested command contract only.

### ADR-0602-D03 — Backend Tool Registry is adopted

Backend must maintain an indexed tool registry.

Registry path:

```text
.strata/backend/tool_registry/tool_index.json
.strata/backend/tool_registry/schemas/
```

Each entry must define:

```text
tool_id
catalog_index
cli_command
version
input_schema
output_schema
write_paths
read_paths
mutation_gate_policy
idempotency_policy
evidence_paths
permission_labels
```

### ADR-0602-D04 — Tool identity uses semantic versioned names

Public tool identity uses:

```text
domain.action.vN
```

Examples:

```text
session.launch_codex_tmux.v1
classd.export_pdf.v1
returns.scan.v1
report.review.v1
```

Catalog indexes such as `D-004` are registry references only, not public APIs.

### ADR-0602-D05 — Explicit CLI contracts are mandatory

Every backend tool must expose a stable CLI command.

Command pattern:

```text
caller -> strata CLI -> schema validation -> deterministic handler -> artifacts -> JSON result
```

Every state-changing command must write a tool-run result artifact.

### ADR-0602-D06 — Strata session id is backend primary key

Backend session records use Strata session id as the primary key.

Session record path:

```text
.strata/sessions/<strata_session_id>.json
```

Session record must map:

```text
strata_session_id
tmux_session_name
codex_session_id
assignment_id
agent_id
role
cwd
command
created_at
evidence_paths
```

### ADR-0602-D07 — DLO may launch Codex through CLI

DLO may request Codex CLI launch via backend CLI.

Required tool:

```text
session.launch_codex_tmux.v1
```

Backend launches a WSL/tmux session running Codex CLI and records metadata/evidence.

Backend does not evaluate whether the launched work is valid, useful, or complete.

### ADR-0602-D08 — Class D is renamed

Rename:

```text
Class D context
```

to:

```text
Class D: local transcripts
```

Class D is raw local transcript evidence, not curated context.

### ADR-0602-D09 — Class D source is Codex local session storage

Class D source material comes from Codex CLI local session files, expected under:

```text
~/.codex/sessions/
```

Backend may locate, copy, register, checksum, inspect, and export these files.

Backend must not semantically rewrite them.

### ADR-0602-D10 — Class D storage path uses lowercase filesystem naming

Display name:

```text
Class D: local transcripts
```

Filesystem path:

```text
.strata/class_d/local_transcripts/<session_id>/
```

### ADR-0602-D11 — Class D PDF export is a registered backend tool

Add indexed tool:

```text
D-004 classd.export_pdf.v1
```

CLI:

```text
strata classd export-pdf
```

Purpose:

```text
Export one registered Codex local transcript into a human-viewable PDF artifact.
```

The PDF is a view artifact. The copied Codex transcript and checksums remain authoritative evidence.

### ADR-0602-D12 — Class D tool set

Initial Class D registry tools:

```text
D-001 classd.locate_codex_sessions.v1
D-002 classd.register_session.v1
D-003 classd.export_markdown.v1
D-004 classd.export_pdf.v1
D-005 classd.verify_checksums.v1
D-006 classd.inspect.v1
```

### ADR-0602-D13 — Class D export artifacts

Required export directory:

```text
.strata/class_d/local_transcripts/<session_id>/
```

Required artifacts:

```text
codex_source.jsonl
transcript.md
transcript.pdf
metadata.json
checksums.sha256
```

If Codex source format is not JSONL, preserve the native extension and record it in `metadata.json`.

### ADR-0602-D14 — Class D cannot promote to ClassB

Backend must not promote Class D into ClassB.

ClassB remains reviewed, distilled operational knowledge admitted only through reviewer-authorized workflows.

### ADR-0602-D15 — Mutation Gate applies to evidence writes

Mutation Gate is required for durable state/evidence writes, including:

```text
session.launch_codex_tmux.v1
dispatch.create.v1
dispatch.send.v1
returns.classify.v1
report.review.v1
classb.import_reviewed.v1
classd.register_session.v1
classd.export_markdown.v1
classd.export_pdf.v1
```

Read-only commands do not require Mutation Gate.

### ADR-0602-D16 — State-changing tools are idempotent by default

Same tool id, same workspace, same normalized input, and same source checksum must not create duplicate semantic records.

Intentional reruns require:

```text
--reprocess
```

### ADR-0602-D17 — Watch commands are persistent

One-shot commands use `scan`.

Persistent commands use `watch`.

Required distinction:

```text
returns.scan.v1  = one-shot deterministic scan
returns.watch.v1 = persistent polling loop
```

### ADR-0602-D18 — Failure artifacts are mandatory

Every failed state-changing tool must write:

```text
.strata/backend/tool_runs/<tool_run_id>/result.json
```

When applicable, also write:

```text
stderr.txt
stdout.txt
diagnostics.json
```

No silent failure is allowed.

## Consequences

Backend scope for v0.7 is kernel hardening, not manual workflow expansion.

Implementation priorities:

```text
1. Backend Tool Registry
2. CLI schema contracts
3. session.launch_codex_tmux.v1 hardening
4. Class D: local transcripts registry/export tools
5. classd.export_pdf.v1
6. idempotent returns.scan
7. real returns.watch
8. workspace-root path discipline
9. failure artifact standardization
```

## Non-goals

```text
No backend intelligence
No backend summarization
No automatic ClassD-to-ClassB promotion
No new manual VS Code workflow features
No Windows GUI/UIA expansion in this ADR
```
