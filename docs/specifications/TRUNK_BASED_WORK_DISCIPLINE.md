# Trunk-Based Work Discipline for SCTL v0.9.4

SCTL supports trunk-based development by recording team activity and operational state without watching implementation Git.

## Principles

- Keep implementation Git separate from SCTL context Git.
- Use Class C messages for task guidance, questions, reviews, and QC feedback.
- Use Class B only for durable operational state.
- Use deterministic dispatch envelopes for every worker handoff.
- Prefer disposable worker sessions for bounded reviews and investigations.
- Record dispatch, returns, and telemetry under D_trace.

## Fixture testing

Fixture scenes use declared template paths instead of live implementation files. This tests the workflow without coupling SCTL to a product repository.
