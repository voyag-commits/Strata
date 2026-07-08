# Tester Playbook: Launcher Delegate Runtime Edge

## L0 package validation

```bash
npm ci
npm test
npm run secret-scan
```

Acceptance:

- tests pass without real API keys.
- secret scan passes.
- config template uses `secret_policy=externalized_no_secret_material_in_package`.

## L1 create local delegate config

```bash
node dist/src/cli.js provider init-template
```

Edit `.strata-runtime/config/launcher_delegate.local.json` to point to your real launcher.

Acceptance:

- config file exists.
- no key or token is present in config.

## L2 provider doctor

```bash
node dist/src/cli.js provider doctor --config .strata-runtime/config/launcher_delegate.local.json
```

Acceptance:

- evidence file is written under `.strata-runtime/evidence/provider_checks/`.
- healthcheck passes for WSL CLI provider.
- if using Windows shortcut mode, `--skip-healthcheck` is allowed for manual-only validation.

## L3 launch tmux session through delegate

```bash
node dist/src/cli.js session launch --role coder --assignment-id A001 --config .strata-runtime/config/launcher_delegate.local.json --replace
```

Acceptance:

- tmux session `STRATA-CODER-A001` exists.
- session record references provider config path.
- pane capture can be created.

## L4 inject runtime-edge notice

```bash
node dist/src/cli.js dispatch inject --notice runtime_edge_notice.json --session STRATA-IC-A001
```

Acceptance:

- message is bounded.
- tmux injection evidence exists.
- unavailable target writes blocked artifact.
