# Strata Notes

## License

This repository is licensed under the Apache License 2.0. See `LICENSE`.

The npm package metadata uses the SPDX identifier `Apache-2.0` to match the root license.

## Scope

Strata defines and prototypes context-managed agent operations:

- Git-backed operational context
- deterministic dispatch packets
- disposable worker and reviewer sessions
- structured worker returns
- human-governed promotion into durable context
- evidence traces for review and replay

Runtime adapters such as WSL, tmux, Codex CLI, and launcher/runtime-edge are transport paths. They are not the project identity.

## Patent And Governance Notes

This repository is currently a public engineering and governance artifact. Patent, trademark, and downstream governance questions should be reviewed before any production or commercial release.

Operational state changes should remain reviewable through Git, structured reports, and evidence artifacts rather than private session memory.

## Citation

Author: Yueqian Hou

Suggested citation:

```text
Hou, Yueqian. Strata: Context-managed agent operations for AI-assisted software engineering. 2026.
```

## Changelog

- v0.2: Added SCTL v0.9.4 reproducibility package, Flowmap 02 live evidence, WSL/tmux adapter scripts, CI workflow, and WSL bootstrap command.
- v0.1: Initial public conceptual specification.
