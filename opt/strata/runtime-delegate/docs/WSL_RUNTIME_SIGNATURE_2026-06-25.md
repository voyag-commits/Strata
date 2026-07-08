# WSL Runtime Signature — 2026-06-25

Confirmed live target shape:

- tmux target: `STRATA-DESKTOP-0625-104113:0.0`
- session name: `STRATA-DESKTOP-0625-104113`
- window/pane: `0.0`
- pane id: `%0`
- pane command: `node`
- window title: `Codex-TUI`
- one Codex agent per tmux session: yes
- default retire policy: `kill-session`
- launcher create command: `/home/hou16/bin/strata-codex-local`
- fleet launcher: `/home/hou16/bin/strata-fleet-launch`
- tmux path: `/usr/bin/tmux`
- Codex path: `/home/hou16/.nvm/versions/node/v22.17.1/bin/codex`

The current target is a runtime instance, not a hard-coded package constant. Bind it with `delegate session-register`.
