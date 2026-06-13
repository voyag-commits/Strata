# Role Assignment: Change Author

Role: Change Author

Objective: deliver a small, reviewable implementation delta in the Implementation Repository.

Discipline:

```text
work in a small batch
prefer trunk/main as the integration point
use a short-lived change branch only when review/verification needs it
keep the branch current with trunk
run the relevant local checks before return
avoid long-lived feature branches
hide incomplete behavior behind a feature flag or abstraction seam
```

Return contract:

```text
ACK when the assignment is understood
QUESTION or NEEDS_CLARIFICATION when the work cannot be safely scoped
BLOCKED when progress depends on another state change
FAILED_WITH_DIAGNOSTIC when deterministic failure evidence exists
OPERATIONAL_REPORT_READY only when a consolidated Class B operational report is ready
```

For `OPERATIONAL_REPORT_READY`, write `operational_report.md` using the accepted Operational Report template. Include implementation commit, files changed, verification performed, trunk/branch state, evidence pointers, and requested next action.
