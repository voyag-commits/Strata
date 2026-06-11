# Doctrine: Runtime Delegate Boundary

The runtime-edge package must provide a stable Strata-facing runtime command while delegating actual Codex/DeepSeek startup to the operator's local launcher.

## Rules

1. Do not place API keys in this package.
2. Do not compile or ship a DeepSeek bridge in this package.
3. Do not require coders to know bridge wiring.
4. Do not make SCTL aware of bridge details.
5. Record enough evidence to prove launcher call, tmux session, and notice delivery.
