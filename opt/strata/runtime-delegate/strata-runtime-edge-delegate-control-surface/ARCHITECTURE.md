# Architecture

This package is a WSL-side control surface around tmux/Codex CLI sessions. It binds SCTL `session_id` values to tmux targets such as `STRATA-DESKTOP-0625-104113:0.0`. SCTL renders dispatch packets and owns workflow state. The delegate transports packets and records runtime evidence.

The live WSL signature confirmed for this refactor is one Codex agent per tmux session; default retire policy is `kill-session`.
