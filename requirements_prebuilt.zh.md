previous changes applied at 0704(July.4th)

1. {reviewer's three outcome lives in the report, not the harness, harness also does not care able the git branch is commited, suspended, or not. This reconcile the issue of complexity and stale file solution
2. **artifact freshness** 



需求0704：a **prebuilt WSL2 appliance** that removes install complexity from the user.

It should ship with SCTL, delegate runtime, bridge service, Node/tmux/git dependencies, harness scripts, verification tools, and known-good configuration already installed and tested.

The WSL distro should expose only a local network API to the Windows desktop app, preferably bound to 127.0.0.1.(or else )

The WSL distro expose request of Deepseek API key only without more(use default: thinking budget/thinking max or high)

The desktop app installer surface handles API-key input, and non-trivial setup

User will rely on wsl's TUI

user will give Director Entry selection(manual CP to WSL path), run start/stop the cycle via one CLI. and user manually use the Coordinator's TUI to seek and obtain returned work. 

The Coordinator stop cycling if Coordinator consider the work is done against initial Director Entry's design doc. 



需求变化0705：

WSL VM is a Linux VM whose CPU architecture follows the host machine.

Therefore, for the prebuilt WSL appliance installer, we need architecture selection.

x64   → WSL Linux x86_64  → amd64 rootfs tar → install sctl-wsl2-linux-amd64.tar
ARM64  → WSL Linux aarch64 → arm64 rootfs tar → install sctl-wsl2-linux-arm64.tar

Installer Flow: 

Windows desktop installer
  ↓
Ask user for DeepSeek API key in normal Windows UI ( If missing key→ WSL CLI asks for it later)
  ↓
Detect CPU architecture
  ↓
Select amd64/arm64 WSL appliance tar
  ↓
wsl --import SCTL ...
  ↓
Pass API key into WSL firstboot/config step
  ↓
Run verification
  ↓
Expose simple start/stop commands

User facing experience:
Install app
Enter API key
Click Install
Open TUI / run start command




## Addendum: Uninstall Procedure (for clean reinstall verification)

**Install footprint (what "uninstall" must remove)**

- **Package:** `~/workspace/runtime-delegates/strata-runtime-edge-delegate-control-surface` (source, `dist/`, `node_modules/`, `MANIFEST.json`, `PACKAGE_CHECKSUMS.sha256`)
- **Symlink:** `~/bin/strata-runtime-edge-delegate-current` → the package dir
- **State dirs (per workspace root, created at runtime):** `.strata-runtime/` containing `config/`, `sessions/`, `session_bindings/`, `evidence/{session_launch,session_capture,dispatch_edge,provider_checks,blocked}/`, `notices/`; plus `.strata/returns/<assignment_id>/<session_id>/`
- **Runtime tmux sessions:** any `STRATA-*` sessions still attached
- **Env vars:** `SCTL_RUNTIME_DELEGATE_ROOT`, `SCTL_RUNTIME_DELEGATE_BIN` (set by SCTL at invoke time, not persisted in shell rc — so nothing to scrub from `.bashrc`)
- **Legacy fallback:** `strata-runtime-edge-launcher-delegate-component2-3` (contract says "demoted fallback only" — remove if present)

**Uninstall procedure**

```
# 1. Kill all delegate-spawned tmux sessions
tmux ls 2>/dev/null | grep -o '^STRATA-[^:]*' | xargs -r -n1 tmux kill-session -t

# 2. Remove the symlink (SCTL routing entrypoint)
rm -f ~/bin/strata-runtime-edge-delegate-current

# 3. Remove the package directory
rm -rf ~/workspace/runtime-delegates/strata-runtime-edge-delegate-control-surface

# 4. Remove runtime state from every workspace that ran the delegate
#    (target workspace root — repeat for each)
rm -rf <workspace>/.strata-runtime <workspace>/.strata

# 5. Remove legacy fallback if present
rm -rf ~/workspace/runtime-delegates/strata-runtime-edge-launcher-delegate-component2-3

# 6. Unset env vars in the current shell (SCTL sets these at invoke)
unset SCTL_RUNTIME_DELEGATE_ROOT SCTL_RUNTIME_DELEGATE_BIN
```

**Clean-install verification (6 checks, in order)**

1. **Package integrity** — `MANIFEST.json` version is `1.0.0-adr0618`; verify no drift:
   ```
   cd ~/workspace/runtime-delegates/strata-runtime-edge-delegate-control-surface
   node -e "console.log(require('./package.json').version)"   # expect 1.0.0-adr0618
   sha256sum -c PACKAGE_CHECKSUMS.sha256                       # all OK (excludes dist/node_modules)
   ```
2. **Build present** — `dist/src/cli.js` exists and runs:
   ```
   node dist/src/cli.js --help | head -1   # expect "Strata Runtime Edge Delegate Control Surface"
   ```
3. **Symlink resolves** — `~/bin/strata-runtime-edge-delegate-current` points at the package dir and target exists (`readlink -f` non-empty).
4. **Empty state** — `session-list` returns zero bindings (proves no leftover runtime state):
   ```
   export SCTL_RUNTIME_DELEGATE_ROOT="$PWD"
   export SCTL_RUNTIME_DELEGATE_BIN="$HOME/bin/strata-runtime-edge-delegate-current"
   node dist/src/cli.js delegate session-list   # expect sessions: []
   ```
   Also confirm no `.strata-runtime/session_bindings/` files and no live `STRATA-*` tmux sessions (`tmux ls | grep STRATA` returns nothing).
5. **Provider config valid** — `provider doctor --skip-healthcheck` returns `ok: true` against the default config.
6. **End-to-end smoke** — run `delegate session-create` (the stock command); expect `ok: true`, a tmux session created, WT tab spawned, then `session-list` shows exactly one binding. Tear down with `session-terminate`.

**Ordering matters:** run checks 1–5 before check 6 — the smoke test creates state, so it must be last (and cleaned up after if you want to re-verify emptiness).

**Scope note:** the delegate writes state into **whatever workspace SCTL points it at** (via `--workspace` or `process.cwd()`), not a single global location. So "clean" means checking each workspace root you intend SCTL to use, not just `~/workspace`.
