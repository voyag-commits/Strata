# Strata — A Project State Model for Agent Operations

**Version:** 0.1
**Status:** Public draft
**Author:** Yueqian Hou

## Core Understanding

Strata is not a modified worker runtime and does not attempt to control the internal context management of each worker session.

Strata is an operations-layer model above multiple worker runtime agent sessions. Each spawned agent is operationally equivalent to opening a fresh worker runtime window or session, assigning it a role-scoped task, giving it selected context, and requiring it to return a bounded artifact.

## Architecture Boundary

A Strata-compliant operation layer controls the outer operating protocol:

- which agent is spawned
- what role the agent has
- what task the agent receives
- what context the agent may read
- what output artifact/template the agent must return
- where raw trace is stored
- whether the returned artifact updates Class A or Class B
- whether the project routes forward, blocks, escalates, or completes

The worker runtime (for example, a Codex CLI/window/session, or any equivalent) controls its own internal behavior:

- context window handling
- transcript state
- tool loop
- local reasoning
- command execution
- file edits inside assigned scope

Strata does not patch, replace, or depend on the worker runtime's internal context management.

## Agent Session Model

A spawned worker is treated as a disposable assigned session.

Each agent instance has:

- role
- assigned task
- assigned workspace or path
- selected context package
- required output artifact
- status
- optional Class D trace path

The worker may be a CLI window, an app-server thread, another model/API session, or a manual placeholder during early prototype phases.

## Context Model

Class C (Source) is the immutable source pool. Original imported `.md` and `.txt` files keep their original filenames and are not rewritten.

Class A (Contract) is the mutable active contract. It states what the project is doing, how it is being done, what done means, which Class C pins are binding, and what Director decisions apply.

Class B (Ledger) is the operational ledger. It is the primary project-progress surface and the only context class expected to grow routinely after initialization.

Class D (Trace) is raw diagnostic trace. It contains worker transcripts, logs, tool outputs, and other low-level materials. It is hidden by default and exposed only for diagnostic or reviewer use when needed.

## Operational Flow

The standard Strata loop is:

1. Director initializes or updates Class C and Class A.
2. GM reads Class A, selected Class C pins, and relevant Class B artifacts.
3. GM assigns work to a worker session.
4. The worker session operates independently using its own native context behavior.
5. The worker returns a bounded artifact.
6. The operation layer stores the artifact in Class B or routes it for correction.
7. GM decides the next routing step.
8. Director is asked only when authority-level decision or resource input is required.

## Key Principle

Strata makes each agent session disposable, inspectable, and operationally useful through bounded inputs and outputs.

The core protocol is:

```text
bounded assignment in
bounded artifact out
A/B/C state updated
D trace hidden
GM routes next step
```

The durable project state lives in A/B/C context, not inside any single GM or worker session.

## Conformance

The following invariants are normative. An implementation may be described as Strata-compliant only if it preserves all of them. The keywords MUST, MUST NOT, SHOULD, and MAY are to be interpreted as described in RFC 2119.

**C-1. Four-class layer model.** A compliant implementation MUST organize project state into four typed layers with the semantics defined in *Context Model*: Class C (Source), Class A (Contract), Class B (Ledger), Class D (Trace).

**C-2. Class C immutability.** Class C source items MUST NOT be renamed, normalized, or rewritten by the operation layer or by worker sessions. Original identifiers and contents are preserved.

**C-3. Class A as operating view.** Class A MUST function as an operating contract. It SHOULD reference Class C by identifier, section, or line pin rather than duplicating Class C content.

**C-4. Single-layer growth rule.** After initialization, only Class B is expected to grow routinely. Class C MUST NOT grow except by explicit Director-authored source import. Class A MUST NOT grow except by explicit promotion of decisions or contract changes.

**C-5. Bounded assignment, bounded artifact.** Each worker session MUST receive a bounded assignment package and MUST return a bounded artifact. Worker output that is not captured as a bounded artifact MUST NOT be promoted into Class A or Class B.

**C-6. Human-governed promotion.** Promotion of material into Class A or canonicalization into Class B MUST be governed by a human authority (Director). Workers and the GM MAY produce candidates; candidates MUST NOT enter Class A or canonical Class B without explicit Director approval.

**C-7. Class D access mediation.** Class D MUST NOT be exposed by default on the primary operating surface. Access to specific Class D paths MAY be granted on a per-assignment basis for diagnostic or reviewer use.

**C-8. Worker-runtime non-interference.** A compliant operation layer MUST NOT patch, replace, or depend on the internal context management of the worker runtime it spawns.

Substrate is out of scope. A Strata-compliant implementation MAY use any storage substrate (file system, database, object store, version control system, or other) provided the invariants above are preserved.
