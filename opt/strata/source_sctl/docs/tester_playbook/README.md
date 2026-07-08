# SCTL Tester Playbooks

## Current canonical live playbook

Use this playbook for ADR 06/26 Flowmap 02 acceptance:

- `FLOWMAP02_RUNTIME_DELEGATE_LIVE_PLAYBOOK_ADR0626.md`

This is the canonical runtime delegate launch/resolve path. It expects SCTL to call the runtime delegate `session-create` verb, record delegate-resolved runtime identity, dispatch through `dispatch-deliver`, and logically release sessions without killing runtime tmux/Codex sessions.

## Legacy and diagnostic materials

The older files in this directory are retained for historical context, command reference, and diagnostics. Any procedure requiring manually pre-created tmux targets plus `session-register` is diagnostic unless a later ADR explicitly reauthorizes it for acceptance.

Key current docs:

- `../adr/ADR_06_26_RUNTIME_DELEGATE_LAUNCH_AND_LOGICAL_RELEASE.md`
- `FLOWMAP02_RUNTIME_DELEGATE_LIVE_PLAYBOOK_ADR0626.md`
- `../REMAINING_ISSUES_ADR0626.md`
