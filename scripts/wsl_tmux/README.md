# WSL/tmux Thin Adapter Scripts

These scripts are intentionally small glue around the existing launcher stack described in the supplied launcher guide.

They do not own Codex launch, DeepSeek bridge process management, secrets, Windows Terminal tab creation, or tmux cosmetics. Those responsibilities remain with:

- `~/bin/strata-codex-local`
- `~/bin/strata-codex-linux-desktop`
- `~/bin/strata-fleet-launch`
- the runtime-edge CLI exposed through `SCTL_RUNTIME_EDGE_CLI`

## Environment variables

| Variable | Meaning |
|---|---|
| `SCTL_ROOT` | SCTL package/workspace root. Defaults to the detected package root. |
| `SCTL_RUNTIME_EDGE_CLI` | Optional runtime-edge CLI path, for example `node /path/to/dist/src/cli.js`. |
| `SCTL_FLEET_LAUNCH` | Optional fleet launcher path. Defaults to `strata-fleet-launch`. |

## Adapter inventory

| Script | Purpose |
|---|---|
| `sctl-session-new` | Register an SCTL session and delegate session creation to runtime-edge CLI or `strata-fleet-launch`. |
| `sctl-dispatch-render` | Render deterministic Class C + context export dispatch envelope. |
| `sctl-dispatch-inject` | Attach a visible Windows Terminal tab to the target tmux session, then paste a Markdown dispatch packet with `tmux load-buffer` and `tmux paste-buffer`. |
| `sctl-session-capture` | Capture a session transcript through runtime-edge CLI or raw tmux capture. |
| `sctl-session-retire` | Retire the session through runtime-edge CLI or raw tmux kill, then record retirement in SCTL. |
| `sctl-fleet-smoke` | Human tester smoke sequence for dry-run and live adapter checks. |

## Design rule

SCTL owns context export, dispatch envelope construction, session metadata, revision math, return validation, and Git-backed records. The launcher/runtime edge owns visible sessions and delivery mechanics.

## Dispatch packet injection

Markdown dispatch packets use a packet path plus the real tmux session name:

```bash
wt.exe -w 0 new-tab -- wsl.exe -e bash -c 'exec tmux attach -t "$SESSION"'
sleep "$PASTE_DELAY"
tmux load-buffer -b strata "$PACKET"
tmux paste-buffer -p -b strata -t "$SESSION"
tmux send-keys -t "$SESSION" Enter
```

The terminal attach step mirrors the launcher/runtime-edge tab popup behavior and is best-effort. The default paste delay is 5 seconds to avoid racing a newly launched Codex TUI; pass `--paste-delay SECONDS` to tune it or `--paste-delay 0` to disable it. Pass `--no-tab` to skip visible tab attachment. `tmux paste-buffer -p` preserves multiline Markdown as bracketed paste when the application supports it.

`sctl-dispatch-inject` supports `--packet` and `--file` for Markdown packet paths. It does not support `--notice` for Markdown packets; runtime-edge `dispatch inject --notice` is reserved for JSON notice input.
