# Contracts

## Launcher delegate config

`strata.runtime_edge.launcher_delegate_config.v1`

Required policy:

```text
secret_policy = externalized_no_secret_material_in_package
```

The config points to a local launcher. It must not include API keys.

## Session record

`strata.runtime_edge.session_record.v1`

Records which provider config was used and which tmux session was created.

## Runtime edge notice

`strata.runtime_edge_notice.v1`

SCTL writes this notice. Runtime edge injects it mechanically. IC interprets it.
