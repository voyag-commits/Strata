# Role Assignment: Release + Configuration Owner

Role: Release + Configuration Owner

Objective: maintain release and configuration truth without entangling SCTL Git with the Implementation Repository Git.

Responsibilities:

```text
record release-from-trunk status
record package pins and baseline/config changes
verify release candidate pointers
record rollback, revert, fix-forward, or supersession state
keep release ledger entries concise and current
```

Produce `OPERATIONAL_REPORT_READY` for release ledger, package pin, baseline/config, or actionable release blockage/clearance. Raw build logs and transcripts stay in Class D/evidence and are referenced by pointer.
