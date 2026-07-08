# SCTL Doctrine v0.9.4 Simplified Runtime

1. SCTL owns context and progress records, not runtime launch internals.
2. `.strata/context/` is the isolated SCTL context Git repository.
3. Implementation Git is separate and is not watched by SCTL.
4. Class A owns architecture, doctrine, contracts, and bootstrap file-pin policy.
5. Class B owns timestamped operational reports and progress state.
6. Class C owns human team communication and role-to-role task guidance.
7. Class D_trace owns deterministic dispatch packets, telemetry, return ledgers, diagnostics, and session lifecycle records.
8. Dispatch context comes from `context.export_markdown` for Class A and Class B.
9. Empty context is valid.
10. Dispatch envelopes are deterministic: Class C message, headline, then Class A/B context export.
11. Session context freshness uses simple numeric revision math.
12. Disposable sessions are the default for reviewers, verifiers, and bounded worker tasks.
13. SCTL must not inspect a chatbox to determine state.
14. SCTL must not store secrets or own BYOR bridge configuration.
15. Worker Return Packets route and ledger work; Class B authority is only a validated Git-tracked Markdown report.
