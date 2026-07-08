# SCTL Contracts v0.9.4 Simplified Runtime

## Class B report

Class B authority is a validated Markdown report under `.strata/context/B/` plus the SCTL context Git commit.

Required frontmatter before commit:

```yaml
contract_id: strata.class_b.file.v1
class: B
id: <id>
title: <title>
scope: actionable_report
assignment_id: <assignment_id>
agent_id: <sender_id>
role: <sender_role>
status: ready
evidence: included
loaded_context_epoch: <current_class_b_revision visible to sender>
created_at: <ISO-8601>
```

SCTL adds these fields when it accepts the Class B file:

```yaml
accepted_class_b_revision: <integer>
accepted_at: <ISO-8601>
```

Required sections must exist and must not be empty:

```text
## Operational Summary
## Progress Delta
## Trunk Integration
## Verification
## Evidence
## Risks / Blockers
## Next Action
```

Validation enforces frontmatter presence, known enum values, ISO timestamps, numeric context fields, path location, and non-empty sections. Invalid Class B submissions create a denied result and an error dispatch. The invalid report file remains outside the accepted Class B commit.

## Class C team message

Class C team messages are human role-to-role communication artifacts. They are not a second context system.

Required frontmatter:

```yaml
contract_id: strata.class_c.team_message.v1
class: C
message_id: <message_id>
thread_id: <thread_id>
assignment_id: <assignment_id>
from_role: <role>
from_id: <id>
to_role: <role>
to_id: <id>
message_kind: qc_review_request
status: open
requires_response: true
related_class_b: .strata/context/B/<report>.md
created_at: <ISO-8601>
```

Required sections:

```text
## Message
## Requested Handling
```

## Dispatch envelope

Canonical form:

```text
[Class C team message]

# Below is system level full context picture.

[context.export_markdown output]
```

The export includes Class A and Class B by default. Empty context is valid.

Dispatch packet contract:

```json
{
  "contract_id": "strata.dispatch.packet.v2_deterministic_context_export",
  "dispatch_format": "deterministic_class_c_plus_context_export_v1",
  "runtime_delivery": "paste_only_deterministic_envelope_ready",
  "dispatch_to_git_is_primary_evidence": true,
  "chatbox_inspection_required": false,
  "session_policy": "disposable_by_default"
}
```

## Worker Return Packet

Accepted return kinds:

```text
ACK
QUESTION
OPERATIONAL_REPORT_READY
BLOCKED
FAILED_WITH_DIAGNOSTIC
NEEDS_CLARIFICATION
PARTIAL_STATUS
```

`OPERATIONAL_REPORT_READY` requires a mechanically valid operational report file. Worker Return Packets are routing and ledger artifacts. Class B updates happen through strict Class B report commits.

Retired fields:

```text
EVIDENCE_READY
evidence_path
class_b_intake
```

Evidence belongs inside operational reports and Class B report sections.
