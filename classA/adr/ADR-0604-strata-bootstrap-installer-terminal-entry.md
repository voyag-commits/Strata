# ADR-0604 — Strata Bootstrap Installer and Terminal Entry

Status: Accepted
Date: 2026-06-09
Depends on: ADR-0603

## Decision

Strata will use a **Strata Bootstrap Installer** as the first installable app package.

The installer creates a **Strata Terminal Shortcut** that opens Windows Terminal into WSL and attaches to a tmux-backed **Strata Console**.

No explicit GUI is required for this phase.

## Naming

```text
Strata Bootstrap Installer
Strata Terminal Shortcut
Strata Console
Strata Context Tool Layer (SCTL)
```

## Runtime Model

Windows is the launcher/supervisor.

WSL is the authoritative runtime for:

```text
SCTL
Git-backed A/B/C context store
tool registry
tmux sessions
Codex CLI sessions
Class D local transcripts
exports
```

## Required Entry Flow

```text
User double-clicks Strata Terminal Shortcut
  -> Windows Terminal opens
  -> WSL starts
  -> tmux attaches or creates strata-main
  -> Strata Console appears
```

## Installer Scope

The installer may:

```text
check WSL
check distro
check Git / Node / tmux
install or bootstrap SCTL
create config
initialize workspace
create shortcuts
run strata doctor
```

The installer must not implement governance logic.

## Non-goals

```text
No GUI app
No workflow state machine
No backend agent brain
No Windows-side authoritative runtime
```

## Consequence

The frontend for this phase is the terminal entrypoint. GUI work is deferred until SCTL, Git-backed context management, and agent-loop operations are stable.
