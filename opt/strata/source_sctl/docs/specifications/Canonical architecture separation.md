# Canonical Architecture Separation v0.9.4

```text
Component 1: SCTL context kernel
  - isolated context Git
  - Class A/B validation and export
  - context freshness math

Component 3: communication / dispatch preparation
  - Class C team messages
  - deterministic dispatch envelope
  - dispatch packet snapshots under context Git

Component 4: returns / trace / fixture testing
  - Worker Return Packet validation
  - operational report validation
  - D_trace return ledgers and diagnostics
  - trunk-based fixture scenes

Runtime edge / launcher stack
  - WSL/tmux session launch
  - Windows Terminal tabs
  - paste injection
  - capture and terminate
  - BYOR bridge/secrets
```

SCTL calls the runtime edge through scripts. It does not reimplement runtime mechanics.
