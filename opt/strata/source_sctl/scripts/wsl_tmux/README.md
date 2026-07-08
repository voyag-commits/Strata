# SCTL Delegate-Ready Utility Scripts

SCTL does not own runtime delivery. Live runtime operations go directly to the external delegate control surface through its contract verbs:

- `delegate session-register`
- `delegate dispatch-deliver`
- `delegate return-dir`
- `delegate session-capture`
- `delegate session-terminate`
- `delegate session-list`

This directory now keeps only SCTL-owned utilities:

| Script | Purpose |
|---|---|
| `sctl-dispatch-render` | Render and record the canonical SCTL dispatch packet. Delivery is performed by the delegate, not this script. |
| `sctl-git-panel` | Open or print a Git panel command for SCTL/operator inspection. |

Runtime delegate selection uses:

| Variable | Meaning |
|---|---|
| `SCTL_RUNTIME_DELEGATE_ROOT` | Delegate package root; default binary is `$SCTL_RUNTIME_DELEGATE_ROOT/dist/src/cli.js`. |
| `SCTL_RUNTIME_DELEGATE_BIN` | Exact delegate CLI file/binary. Takes precedence over root-derived path. |

One-cycle deprecated aliases are accepted by shared script setup only to ease migration:

- `SCTL_RUNTIME_EDGE_ROOT` -> `SCTL_RUNTIME_DELEGATE_ROOT`
- `SCTL_RUNTIME_EDGE_CLI` -> `SCTL_RUNTIME_DELEGATE_BIN`

SCTL owns context export, dispatch packet rendering, Class A/B commits, worker-return validation, and cycle progression. The delegate owns tmux/Codex runtime binding, packet delivery, capture, and session termination.
