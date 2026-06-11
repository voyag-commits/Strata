# Acceptance Matrix

| ID | Requirement | Evidence |
|---|---|---|
| RTE-D-001 | package has no embedded API key/bridge | secret scan + source inspection |
| RTE-D-002 | config template externalizes secret boundary | provider config |
| RTE-D-003 | local launcher can be healthchecked | provider doctor |
| RTE-D-004 | tmux session launches delegated command | session launch evidence |
| RTE-D-005 | session name is stable | unit test / session name |
| RTE-D-006 | runtime-edge notice dry-run works without tmux | unit test |
| RTE-D-007 | real notice injection writes tmux evidence | dispatch inject |
