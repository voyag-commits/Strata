# Runtime Session Delegate Contract

Status: This Delegate Contract serves as a wrapper surface that any operator or caller should ignore the complexity behind contract. 

SCTL interacts with the delegate through eight contract verbs: `session-register`, `session-create`, `dispatch-deliver`, `return-drop`, `return-dir`, `session-capture`, `session-terminate`, `session-list`.

**Installation:** package `strata-runtime-edge-delegate-control-surface` v1.0.0-adr0618 at `~/workspace/runtime-delegates/strata-runtime-edge-delegate-control-surface`, symlinked via `~/bin/strata-runtime-edge-delegate-current`. Binary: `node dist/src/cli.js`. Legacy `strata-runtime-edge-launcher-delegate-component2-3` is demoted fallback only.

**Routing:** SCTL selects the delegate via `SCTL_RUNTIME_DELEGATE_ROOT` and `SCTL_RUNTIME_DELEGATE_BIN`.

**Operations:** Session verbs bind tmux targets and register contract records. Dispatch delivers packets unchanged with SHA256 evidence. Return verbs target `.strata/returns/<assignment_id>/<session_id>/`. Capture reads pane output; terminate retires sessions per `kill-session` policy.

**Failures** are machine-readable: `ok`, `error_code`, `message`, `evidence_path`, `recoverable`. SCTL owns validation, context commits, and cycle progression.

## Addendum: Delegate Wrapping Surface (verified 2026-07-06)

The delegate absorbs three layers of the former desktop-shortcut chain and points at one downstream layer it does not own.

**Wrapped (absorbed into `session-create`):**

1. **Tab-spawn** — `spawnTerminalTab()` (`src/common.ts:211`) runs `wt.exe -w 0 new-tab -- wsl.exe -e bash -c "exec tmux attach -t <session>"`, replacing the `.lnk`→`wt.exe`→`wsl bash -lc` hop. Session name is `JSON.stringify`-quoted; `spawnSync` 10s timeout; result surfaced as `terminal_tab` in the launch record.

2. **tmux session lifecycle** — `launchSession()` (`src/runtime.ts:78`) runs `tmux new-session -d -s <name> -c <cwd> bash -lc <launcher>`, replacing the launcher-script `tmux new-session … "$LAUNCHER"`. `--replace` maps to `kill-session` first; duplicate sessions without `--replace` throw.

3. **tmux cosmetics** — `applyTmuxCosmetics()` (`src/runtime.ts:74`) sets `status on`, `status-position top`, `status-left #[…] WSL/TMUX #[…] session: #S`, renames window `Codex-TUI`. `status-right` is currently hardcoded to `Strata Fleet BYOR DeepSeek` — the one label not yet provider-driven.

**Pointed toward (not owned, invoked via `launcher_command`):**

4. **Launcher resolution** — `resolveLauncherCommand()` (`src/provider.ts:99`) reads `launcher_delegate.local.json` (validated by `readLauncherDelegateConfig`, `provider.ts:77`) and resolves one of three modes: `exec` (direct binary), `shell` (`bash -lc <line>`), or `windows_shortcut` (`cmd.exe /c start "" <path>`). Default config targets `strata-codex-local`.

5. **Launcher binary** — the resolved command (e.g. `strata-codex-local`, `strata-codex-local-glm52`) owns bridge startup + `codex --profile <name>`. The delegate does not touch bridge env (`.env.*`), port layout (38441/38442), or `~/.codex/*.config.toml`; `secret_policy: externalized_no_secret_material_in_package`.

**Evidence trail:** session records → `.strata-runtime/sessions/<session>.json`; launch evidence → `.strata-runtime/evidence/session_launch/<session>/<timestamp>/launch_result.json`. Provider validation → `provider doctor` writes `.strata-runtime/evidence/provider_checks/`.
