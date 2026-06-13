# WSL/tmux Thin Adapter Notes

The adapter scripts in `scripts/wsl_tmux/` are command glue. They call SCTL CLI for context/dispatch/validation and delegate live session work to tmux or the existing runtime-edge launcher stack.

## Environment

```bash
export SCTL_ROOT=/path/to/strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime
export SCTL_WORKSPACE=/path/to/test/workspace
export SCTL_RUNTIME_EDGE_ROOT="/path/to/strata_runtime_edge_launcher_delegate_component2_3_v0_9"
```

`SCTL_RUNTIME_EDGE_ROOT` is optional. When it is missing, the adapters either use direct tmux commands or register SCTL metadata only.

## Scripts

| Script | Purpose |
|---|---|
| `sctl-session-new` | Optionally calls runtime-edge or `strata-fleet-launch`, then registers SCTL session metadata. |
| `sctl-dispatch-render` | Calls `sctl dispatch record` and produces the deterministic dispatch envelope. |
| `sctl-dispatch-inject` | Opens a visible Windows Terminal tab attached to the target tmux session, then pastes `dispatch_packet.md` with `tmux load-buffer`, `tmux paste-buffer`, and optional `tmux send-keys Enter`. |
| `sctl-session-capture` | Captures a tmux pane or delegates to runtime-edge capture. |
| `sctl-session-retire` | Terminates runtime/tmux when requested and records session retirement in SCTL. |
| `sctl-fleet-smoke` | Runs a local no-launch SCTL smoke path and produces a dispatch packet. |

## Boundary

The scripts do not own:

```text
Codex launch
DeepSeek bridge
secret handling
provider config
Windows Terminal tab creation
tmux status cosmetics
implementation Git scanning
```

Those responsibilities remain with the launcher/runtime-edge system.

## Markdown dispatch packet delivery

For SCTL-rendered Markdown dispatch packets, the adapter supports `--packet` and `--file` as equivalent payload flags. It translates the packet path and real tmux session name into:

```bash
wt.exe -w 0 new-tab -- wsl.exe -e bash -c 'exec tmux attach -t "$SESSION"'
sleep "$PASTE_DELAY"
tmux load-buffer -b strata "$PACKET"
tmux paste-buffer -p -b strata -t "$SESSION"
tmux send-keys -t "$SESSION" Enter
```

The terminal tab step mirrors runtime-edge `spawnTerminalTab(sessionName)` and is best-effort. The default paste delay is 5 seconds to avoid racing a newly launched Codex TUI; use `--paste-delay SECONDS` to tune it or `--paste-delay 0` to disable it. Use `--no-tab` to suppress visible tab attachment. `tmux paste-buffer -p` preserves multiline Markdown as bracketed paste when the application supports it.

`--notice` is not supported for Markdown packets. Runtime-edge `dispatch inject --notice` expects JSON notice input, not `dispatch_packet.md`.
