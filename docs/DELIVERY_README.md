# Delivery README v0.9.4 Simplified Runtime

This package delivers the SCTL backend kernel for Components 1/3/4 with the simplified runtime model.

Primary capabilities:

```text
isolated SCTL context Git
strict Class B report validation
Class C team messages
deterministic Class C + Class A/B context dispatch envelopes
Git-preserved dispatch packet snapshots
return classification ledgers under context Git
simple context freshness math
disposable session registry and retirement
thin WSL/tmux shell adapters
human tester playbook
fixture scenes for trunk-based workflows
```

Recommended acceptance commands:

```bash
npm test
npm run secret-scan
sha256sum -c PACKAGE_CHECKSUMS.sha256
```

The WSL/tmux adapters are intentionally thin. They call the existing runtime-edge CLI, `strata-fleet-launch`, or raw tmux commands. Secrets and bridge ownership remain outside SCTL.
