# Strata Runtime Edge Package v0.9: Launcher Delegate / BYOR Provider

This package is Component 2 plus the runtime-edge part of Component 3. It now uses a **launcher delegate** instead of embedding or compiling the Codex/DeepSeek bridge.

## Professional terminology

- **Launcher delegate**: a stable Strata-facing entrypoint that delegates real process startup to a locally installed launcher.
- **Runtime adapter stub**: the package-side placeholder that records evidence and calls the configured provider.
- **BYOR provider**: Bring Your Own Runtime; the operator supplies the working local launcher.
- **Externalized secret boundary**: API keys and bridge details remain inside the local launcher environment, not inside this package.

## Boundary

This package does:

- validate the local launcher delegate config.
- call your already-working WSL or desktop launcher.
- create tmux sessions around that delegated command when configured for WSL CLI use.
- inject bounded runtime-edge notices into tmux sessions.
- write runtime evidence.

This package does not:

- contain API keys.
- contain or build a DeepSeek bridge.
- contain a pinned Codex binary.
- own SCTL context authority.
- interpret worker/IC output.

## Typical setup

```bash
npm ci
npm run build
node dist/src/cli.js provider init-template
```

Edit `.strata-runtime/config/launcher_delegate.local.json` so `launcher_command` points to your known-good local launcher.

Preferred WSL CLI form:

```json
{
  "contract_id": "strata.runtime_edge.launcher_delegate_config.v1",
  "provider_name": "local_codex_deepseek_launcher",
  "mode": "exec",
  "launcher_command": "/home/<you>/bin/strata-codex-local",
  "launcher_args": [],
  "working_directory": null,
  "healthcheck_args": ["--version"],
  "env_passthrough": ["PATH", "HOME", "USER", "WSL_DISTRO_NAME"],
  "secret_policy": "externalized_no_secret_material_in_package"
}
```

Windows shortcut form is available for manual-provider testing:

```json
{
  "contract_id": "strata.runtime_edge.launcher_delegate_config.v1",
  "provider_name": "desktop_codex_shortcut",
  "mode": "windows_shortcut",
  "launcher_command": "C:\\Users\\<you>\\Desktop\\Strata Codex CLI.lnk",
  "launcher_args": [],
  "working_directory": null,
  "healthcheck_args": [],
  "env_passthrough": ["PATH"],
  "secret_policy": "externalized_no_secret_material_in_package"
}
```

For full tmux capture, prefer a WSL command that starts Codex CLI inside the tmux session. A Windows `.lnk` may open an external window that cannot be captured by tmux.

## Commands

```bash
node dist/src/cli.js provider doctor --config .strata-runtime/config/launcher_delegate.local.json
node dist/src/cli.js session launch --role coder --assignment-id A001 --config .strata-runtime/config/launcher_delegate.local.json
node dist/src/cli.js dispatch inject --notice runtime_edge_notice.json --session STRATA-IC-A001
```
