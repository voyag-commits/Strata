# Architecture: Launcher Delegate Runtime Edge

## Pattern

This package uses the **adapter/facade pattern**. Strata sees one stable runtime command. The real Codex/DeepSeek bridge launcher remains an external local provider.

```text
Strata runtime-edge CLI
-> launcher delegate config
-> local WSL command or desktop shortcut
-> your existing Codex CLI + DeepSeek bridge runtime
```

## Why this is preferable

- avoids storing API keys in generated packages.
- avoids rebuilding a bridge in every package iteration.
- preserves the operator's tuned desktop/WSL launcher.
- keeps the coder workflow one-call/simple.
- keeps Component 2 separate from SCTL.

## Evidence ownership

The package records provider config path, provider name, delegate mode, launch command summary, tmux result, session record, capture logs, and dispatch evidence. It does not inspect or expose secrets inside the local launcher.
