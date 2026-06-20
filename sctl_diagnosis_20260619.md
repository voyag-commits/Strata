# SCTL Verification Diagnosis - 2026-06-19

## Summary
Delegate CLI and desktop shortcut launch chains are architecturally identical.
Both invoke same binary (strata-codex-local), same profile (deepseek_bridge), same bridge.
Delegate sessions select gpt-5.5; desktop sessions use deepseek-v4-pro.
Root cause not isolated to launch chain itself.

## Only Delta Between Chains
- Desktop:  tmux new-session ... strata-codex-local  (direct exec)
- Delegate: tmux new-session ... bash -lc strata-codex-local  (login shell wrapper)

.bashrc returns early for non-interactive shells. .profile only loads nvm and PATH.

## Delegate CLI Code Review
- provider.js resolveLauncherCommand(): mode=exec, clean passthrough
- runtime.js launchSession(): constructs tmux command, no model manipulation
- launcher_delegate.local.json: launcher_command=strata-codex-local, args=[], clean
- No model override, config rewriting, or secret injection found

## Harness Execution State
- Run 085519Z (7 iterations): Steps 0-8 OBSERVED, Step 9 BLOCKED_TIMEOUT (model mismatch)
- Run 092214Z: Blocked at step 3 (stale branch). Branch deleted, re-run interrupted

## Unresolved
1. gpt-5.5 model surfacing from identical config
2. Whether bash -lc wrapper creates env delta triggering internal model fallback
3. Whether Codex internally switches models based on provider/context detection

## Recommendation
Compare raw pane captures from both launch types:
  tmux capture-pane -p -t SESSION_NAME -S -50

## Deliverables
sctl_problematic.zip: 518K (git archive at HEAD)