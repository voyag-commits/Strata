# SCTL Architecture v0.9.4 Simplified Runtime

## Purpose

SCTL records coordination, validates reports, exports context, and maintains a clean Git timeline of team progress. The system is intentionally small: it owns durable context and trace artifacts, not live chat memory or runtime process management.

## Boundary

```text
SCTL context Git: .strata/context/
Implementation Git: managed by product development outside SCTL
Runtime edge: existing WSL/tmux launcher stack and runtime-edge CLI
BYOR bridge: local launcher owns secrets, provider config, and bridge process
```

SCTL backend tests use fixture/template paths. Real runtime tests use thin shell adapters that call the existing launcher stack.

## Context classes

| Class | Content | Authority |
|---|---|---|
| A | Architecture, doctrine, contracts, bootstrap file-pin policy | Git-tracked Markdown |
| B | Timestamped operational reports, review outcomes, defect records | Strict validated Git-tracked Markdown |
| C | Team messages and role-to-role communication | Validated Git-tracked Markdown |
| D_trace | Dispatch packet snapshots, dispatch logs, return ledgers, telemetry, diagnostics | Git-tracked trace artifacts |

Class C context notices are retired in this simplified revision. Context freshness is handled by revision math and context export, not notice merging.

## Full flow map

```text
Director / Coordinator
  -> defines bounded assignment
  -> Tooling / Dispatch Operator registers target session metadata
  -> SCTL renders deterministic dispatch envelope
       -> Class C team message
       -> headline: Below is system level full context picture.
       -> context.export_markdown output for Class A and Class B
  -> SCTL records dispatch packet in outbox and D_trace Git snapshot
  -> thin WSL/tmux adapter pastes packet into target session
  -> worker completes bounded task
  -> worker submits Worker Return Packet and operational report when needed
  -> SCTL classifies return packet
       -> valid OPERATIONAL_REPORT_READY is ledgered in D_trace/return_ledgers
       -> invalid return/report is routed to D_trace diagnostics and error dispatch
  -> Tooling / Dispatch Operator commits durable progress as Class B when appropriate
  -> Class B commit increments current_class_b_revision
  -> next dispatch uses simple freshness math
       -> no update, Class B delta export, or full Class A/B export
  -> disposable worker session is captured and retired
```

## Deterministic dispatch envelope

```text
# SCTL Dispatch Envelope
metadata

# Class C Team Message
message body
requested handling

# Below is system level full context picture.

# Strata Context Export
Class A files
Class B files or delta files
Context State
```

Empty context is valid. The dispatch is invalid only when required envelope metadata or target information is missing.

## Git evidence model

Each accepted dispatch records:

```text
.strata/dispatch_outbox/<assignment>/<target>/<nonce>/dispatch_packet.md
.strata/context/D_trace/dispatch_packets/<assignment>/<target>/<nonce>/dispatch_packet.md
.strata/context/D_trace/dispatch_packets/<assignment>/<target>/<nonce>/context_export/context.md
.strata/context/D_trace/dispatch_log/*.json
.strata/context/D_trace/telemetry/workflow_telemetry.jsonl
```

Each Worker Return Packet classification records:

```text
.strata/context/D_trace/return_ledgers/*.json
.strata/context/D_trace/return_ledgers/*_index.jsonl
.strata/context/D_trace/return_diagnostics/*.json
.strata/context/D_trace/coordination_threads/*.json
```

## Runtime integration

```text
scripts/wsl_tmux/*
  -> node src/cli.js for SCTL context/dispatch/validation
  -> runtime-edge CLI when SCTL_RUNTIME_EDGE_ROOT is set
  -> strata-fleet-launch when available
  -> tmux load-buffer/paste-buffer/send-keys for Markdown packet injection
```

The scripts are adapters. They must stay thin and replaceable.
