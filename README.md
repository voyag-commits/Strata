# Strata

Strata is a public specification and early implementation package for **context-managed agent operations** in AI-assisted software engineering.

The core idea is simple: agent work should not depend on private chat memory, informal success claims, or one long-running session. Strata separates implementation work from operational continuity by maintaining a dedicated, Git-backed context repository for distilled project state, dispatch records, worker returns, review outcomes, and evidence traces.

Strata is not another agent loop. It is a control plane around agent loops.

## Core Concepts

* **Dedicated Context Git Repository**
  Strata maintains operational context separately from the implementation codebase. This context repository records architecture, current operational state, dispatch artifacts, worker reports, review outcomes, and trace evidence.

* **Deterministic Dispatch Packets**
  Prompts are treated as versioned work orders, not ad hoc chat messages. A dispatch packet includes role, assignment, repository, branch, validation commands, return path, stop conditions, and selected context.

* **Disposable Worker Sessions**
  Coding and review agents can be started fresh for bounded work. Continuity is provided by the context repository, not by private session memory.

* **Structured Worker Returns**
  Completion is reported through Worker Return Packets and operational reports, not chat claims. Returns are classified, ledgered, reviewed, and selectively promoted into operational context.

* **Human-Governed Promotion**
  Strata supports human-governed movement between raw evidence, operational reports, architecture doctrine, and current project state.

* **Trunk-Based AI Development Workflow**
  The current live workflow uses a persistent delegated coordinator with disposable Change Author and Code Reviewer sessions operating on short-lived codebase branches.

## Repository Contents

* **[SPEC.md](SPEC.md)** — conceptual model and operating structure.
* **[NOTES.md](NOTES.md)** — license, scope, patent/governance notes, citation, and changelog.
* **SCTL Core** — Git-backed context and workflow control-plane implementation.
* **Flowmap 02** — live trunk-based disposable-worker cycle evidence and operator methodology.

## Runtime Boundary

Strata core is runtime-agnostic.

It can supervise work performed by different agent runtimes. Codex CLI, WSL, tmux, and local dispatch injection are treated as adapter/runtime paths, not as the identity of the project.

The core contribution is the operating model:

> durable context, deterministic dispatch, structured return, reviewable evidence, and controlled promotion.

## Status

Version: 0.2
License: Apache License 2.0
Author: Yueqian Hou

Desktop and local operator tooling are under development.

