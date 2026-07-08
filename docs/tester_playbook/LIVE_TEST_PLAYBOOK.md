# Live Test Playbook v0.9.4

1. Run `npm test`.
2. Run `npm run secret-scan`.
3. Bootstrap context with `node src/cli.js context bootstrap`.
4. Dry-run `scripts/wsl_tmux/sctl-session-new`.
5. Launch one disposable session with the existing launcher stack.
6. Create Class C team message.
7. Render dispatch envelope.
8. Record dispatch envelope.
9. Dry-run injection with `sctl-dispatch-inject`.
10. Inject into target tmux session.
11. Capture session transcript.
12. Classify returned packet.
13. Retire disposable session.
14. Check `.strata/context` Git log.

The live test passes only when packet content, return ledgers, and session lifecycle records are visible in context Git.
