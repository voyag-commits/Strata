---
contract_id: strata.class_b.coordinator_work_order.v1
class: B
status: ready
submission_path: <submission_path>
assignment_id: <assignment_id>
cycle_id: <cycle_id>
work_order_id: <work_order_id>
coordinator_id: <coordinator_id>
target_role: Change Author
target_session_mode: disposable
dispatch_required: true
director_entry_document_path: <director_entry_document_path>
director_entry_document_sha256: <director_entry_document_sha256>
created_at: <ISO-8601>
---

# Coordinator Work Order

## Objective

<One-sentence operational objective.>

## Required Change Items

Each item is a bounded implementation instruction. Do not add unrelated changes.

1. **Change item:** <specific code/work delta>
   - Target area/files: <known files/modules, or "Coordinator has not narrowed this further">
   - Required action: <exact required action>
   - Acceptance condition: <observable pass condition>
   - Evidence required: <test output, changed file list, command result, or explanation>

## General Work Rules

- Inspect relevant files before editing.
- Create or checkout the assigned branch from the base branch.
- Implement only the Required Change Items above.
- Do not change unrelated workflow, architecture, templates, or test harness files unless explicitly listed above.
- If an item cannot be completed as written, stop and report the blocker instead of inventing scope.

## Scope

In scope:
- <item>

Out of scope:
- <item>

Files/modules likely relevant:
- <path or module>

## Codebase Assignment

Codebase repo: <codebase_repo>  
Base branch: <trunk_branch>  
Assigned branch: <change_branch>

## Acceptance Criteria

- <observable acceptance condition>
- <observable acceptance condition>

## Validation

Run:
- `<command>`

Record exact output or failure reason.

## Return Contract

Submit the completed work order as a single Markdown file at exactly the `submission_path` shown in the frontmatter above.
Do not create a directory, and do not append a sub-file such as `packet.json` or `operational_report.md` to that path.
The harness polls `submission_path` as a flat file (`[ -f ]`); writing it as a directory will cause the cycle to block.

Schema: `strata.class_b.coordinator_work_order.v1`

## Evidence Required

- Changed files
- Branch name
- Validation command output
- Known failures or blockers

## Stop / Escalation Conditions

- Validation command is unclear
- Scope exceeds this work order
- Requirement conflicts with code or Class A context
- Architecture authority is needed

## Merge / Completion Expectation

Author does not merge unless authorized. Author returns branch/report for review. Reviewer or authorized merge operator handles merge.
