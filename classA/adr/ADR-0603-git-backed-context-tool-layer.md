# ADR-0603 - Git-backed A/B/C Context Store and Strata Context Tool Layer

Status: Accepted
Date: 2026-06-09
Base version: Strata v0.6 tmux/WSL package
Target version: Strata v0.7 context/tool kernel hardening
Amends: ADR-0602 - Backend Tool Registry and Class D: Local Transcripts
Supersedes: ADR-0602-D15, the broad Mutation Gate rule

## 1. Context

ADR-0602 established that the Strata backend must be deterministic, CLI-reachable, schema-governed, auditable, and non-intelligent. It also defined an indexed backend tool registry and Class D local transcript tools.

After further review, the previous term "backend" is too broad and risks implying an orchestrator, agent brain, or custom state machine. The corrected system purpose is narrower:

```text
stable Class A/B/C context management
stable context export/copy for future context supply
indexed tool execution through stable CLI contracts
runtime adapters for tools such as tmux/Codex/Class D export
```

Git is a natural existing substrate for part of this problem because it already provides version history, diffs, reversibility, branching, merge review, tags, copyability, and integrity through object hashes. Therefore, Strata should not duplicate Git's storage/versioning role with a custom state machine.

## 2. Decision summary

This ADR locks the following approved design:

```text
Git = durable reversible A/B/C context store
Strata Context Tool Layer = deterministic CLI, validator, action filter, tool index, exporter, runtime adapter
Agents = proposal authors and tool callers
Humans/reviewers = judgment authority
Class D = raw local transcript evidence, outside A/B/C authority
```

The previous broad Mutation Gate model is replaced by:

```text
proposal workflow + schema/path validator + action filter wrapper + reviewer authority + Git merge
```

The validator may reject invalid structure, unsafe path access, missing metadata, invalid checksums, duplicate semantic identifiers, or disallowed branch/path targets. It must not judge content quality, importance, usefulness, or intent.

## 3. Terms

### 3.1 Strata Context Tool Layer

The component formerly called "backend" is renamed to:

```text
Strata Context Tool Layer
```

Short name:

```text
SCTL
```

Definition:

```text
SCTL is a deterministic CLI-addressable layer for A/B/C context management and indexed tool execution.
```

SCTL is not an agent, reviewer, worker, DLO, BOC, IC, workflow brain, or quality judge.

### 3.2 Context classes

```text
Class A = base/source context
Class B = accepted operational context with timing index
Class C = task/file-pin context
Class D = local raw transcript evidence
```

Only Class A/B/C are authoritative context stores.

Class D is evidence. It must not be automatically promoted into Class B.

## 4. Decisions

### ADR-0603-D01 - Rename backend to Strata Context Tool Layer

Status: Accepted

The architecture term "backend" is replaced by "Strata Context Tool Layer" where precision matters.

The word "backend" may still be used informally, but it must not imply a state machine, orchestrator, or intelligent actor.

SCTL responsibilities:

```text
parse stable CLI commands
validate schemas and paths
apply action filter wrapper
call Git for A/B/C proposal/merge/revert operations
run indexed tools
render context exports
write tool-run evidence
operate runtime adapters such as tmux/Codex/Class D tools
return minimal deterministic JSON results
```

SCTL non-responsibilities:

```text
infer intent
judge quality
summarize as authority
decide importance
approve its own content
act as IC, DLO, BOC, reviewer, or worker
manage a complex workflow state machine
```

### ADR-0603-D02 - Git-backed A/B/C context store

Status: Accepted

Class A/B/C authoritative context is stored as plain files in a local Git repository.

Git provides:

```text
history
diff
revert
branching
merge review
commit identity
copy/export substrate
integrity through object hashes
```

Git does not provide Strata schema, authority, action filtering, context export rendering, indexed tool execution, or review semantics. Those remain SCTL responsibilities.

### ADR-0603-D03 - Proposal workflow replaces hard Mutation Gate

Status: Accepted

A/B/C content changes use this workflow:

```text
agent writes proposed context change
Git records it
validator checks schema/path/policy
human/reviewer approves if needed
approved change merges into authoritative A/B/C branch
```

This replaces the prior idea of a broad Mutation Gate that directly rejects content through hard templates.

The validator filters format and policy. The human/reviewer remains the judgment authority for content.

### ADR-0603-D04 - Mutation Gate is retired as a broad evidence/action gate

Status: Accepted

ADR-0602-D15 is superseded.

SCTL must not require a broad Mutation Gate for normal evidence writes, runtime records, Class D transcript exports, tool-run logs, diagnostics, watcher files, or A/B/C read-only exports.

The replacement is:

```text
schema/path validator
+ action filter wrapper
+ proposal/review/merge workflow
```

The replacement applies only to A/B/C context authority boundaries.

### ADR-0603-D05 - Validator scope is limited

Status: Accepted

The validator may reject a proposal or command for deterministic reasons only:

```text
invalid schema
invalid required fields
invalid path target
attempted write outside allowed proposal area
attempted write into authoritative merged context by unauthorized caller
missing or invalid checksum
duplicate semantic id
wrong branch target
malformed timing index
malformed file pin
malformed Class B entry metadata
```

The validator must not reject based on subjective content quality, importance, usefulness, interpretation, or inferred intent.

### ADR-0603-D06 - Action filter wrapper is adopted

Status: Accepted

SCTL uses a simple action filter wrapper instead of a broad permission engine.

The action filter answers only:

```text
Is this caller allowed to perform this action on this target?
```

Required blocked actions:

```text
worker approving own proposal
worker merging a proposal into authoritative A/B/C context
worker touching already-merged authoritative context directly
any agent writing directly to authoritative context/main without allowed authority action
Class D material being written into Class B without a reviewed Class B entry
```

Required allowed actions:

```text
worker or agent proposing context changes in an assigned proposal area
worker or agent validating own proposal
IC and reviewer working inside assigned proposal branches/worktrees
IC and reviewer pushing forward tasks inside assigned branches/worktrees
DLO/BOC/IC calling indexed non-authority tools
IC or reviewer requesting revision
IC or reviewer rejecting a proposal
reviewer approving or marking a proposal review-ready inside the proposal workflow
Human Director performing final merge into authoritative A/B/C context
```

Review approval, IC task-forwarding, and branch/worktree work are not final authority. Final merge into authoritative A/B/C context remains reserved for the Human Director.

The action filter must not evaluate content quality.

### ADR-0603-D07 - Agent-facing authority CLI surface

Status: Accepted

Authority actions must be exposed through stable Strata CLI commands rather than raw Git commands.

Initial authority CLI surface:

```text
strata context propose
strata context validate
strata context diff
strata context review-request
strata context approve
strata context reject
strata context request-revision
strata context merge
strata context revert
```

Agents may use Git to author proposal changes inside assigned branches or worktrees, but authoritative actions must go through SCTL. Final merge into authoritative A/B/C context must be performed by the Human Director through the SCTL authority surface.

### ADR-0603-D08 - Proposed changes may be Git-recorded before approval

Status: Accepted

It is valid for an agent to write and commit proposed A/B/C context changes before approval, provided the writes are not to the authoritative merged context area.

Preservation and reversibility are required:

```text
every proposal action is recorded in Git
proposal history is inspectable
proposal can be diffed
proposal can be abandoned or superseded
approved proposal can be merged into authoritative context
merged change can be reverted through Git
```

### ADR-0603-D09 - A/B/C export is not mutation-gated

Status: Accepted

Exporting A/B/C context is a read/render action for human review. It is not mutation-gated.

Export tools must not create files or directories inside authoritative Class A, Class B, or Class C stores.

Exports are view artifacts, not authoritative context records, unless a separate explicit context-import or context-registration command is later approved.

### ADR-0603-D10 - Unified A/B/C context export tools

Status: Accepted

The following indexed tools are required:

```text
context.export_markdown.v1
context.export_pdf.v1
```

These replace separate per-class export tools unless future evidence shows separate tools are necessary.

Purpose:

```text
Render selected A/B/C context into a formatted Markdown or PDF export for human review and downstream context supply.
```

Recommended CLI:

```text
strata context export-markdown --scope <scope> --out <path>
strata context export-pdf --scope <scope> --out <path>
```

### ADR-0603-D11 - A/B/C export ordering

Status: Accepted

Merged A/B/C export order is fixed:

```text
1. Class A context
2. Class C context for file pins
3. Class B context with timing index
```

Rationale:

```text
Class A gives base/source context.
Class C gives task/file-pin context.
Class B gives accepted operational context in time-aware order.
```

The export renderer must not summarize or reinterpret A/B/C content unless it is rendering already-authored content into a fixed format.

### ADR-0603-D12 - Tool execution remains an indexed stable surface

Status: Accepted

Git cannot replace indexed tool execution.

SCTL must retain a tool registry for stable agent use.

Required registry concepts:

```text
tool_id
version
CLI command
input schema
output schema
stable rendering behavior
read path policy
write path policy
evidence/result path
```

Examples:

```text
context.export_markdown.v1
context.export_pdf.v1
classd.export_markdown.v1
classd.export_pdf.v1
session.launch_codex_tmux.v1
returns.scan.v1
returns.watch.v1
```

### ADR-0603-D13 - Runtime actions remain SCTL tools

Status: Accepted

Git cannot replace runtime actions.

SCTL retains indexed runtime tools for:

```text
launching Codex in tmux
recording minimal session metadata
capturing terminal evidence when requested
locating Codex local session files
copying Class D local transcript source
rendering Class D Markdown/PDF view artifacts
running validators
running export renderers
running diagnostics or secret scans where approved
```

These tools do not modify authoritative A/B/C context unless explicitly designed and approved as A/B/C context actions.

### ADR-0603-D14 - Minimal deterministic result envelope

Status: Accepted

Result envelopes must be stable but minimal.

Minimum result shape:

```json
{
  "ok": true,
  "tool_id": "context.export_pdf.v1",
  "tool_run_id": "...",
  "result_path": "...",
  "evidence_paths": [],
  "errors": []
}
```

Rules:

```text
machine-readable JSON is the stable agent-facing output
human diagnostics may be written to stderr or evidence files
nested result schemas may be tool-specific, but must not be required for all tools
```

### ADR-0603-D15 - Idempotency is limited to semantic duplicate prevention

Status: Accepted

SCTL must avoid duplicate semantic records, but it must not implement a heavy global state machine.

Required duplicate checks:

```text
same Class B entry id cannot be imported twice into authoritative Class B
same Class C file pin id cannot be registered twice in the same authoritative scope
same proposal id cannot be merged twice
same raw Class D transcript source checksum should not be registered under conflicting identity
same Worker Return Packet should not create duplicate report candidates
```

Allowed:

```text
new proposal commit history
new export artifacts for the same context, if export id differs
rerun of read-only validation
rerun of export rendering
```

### ADR-0603-D16 - Review decisions dispatch fixed messages to original worker

Status: Accepted

For the review outcomes:

```text
rejected
needs_revision
```

SCTL must automatically dispatch a fixed message to the original worker chatbox or dispatch channel when that channel is known from proposal metadata.

This is allowed because:

```text
the reviewer made the decision
SCTL uses a fixed template
SCTL routes mechanically from proposal metadata
SCTL does not judge the content
```

Required commands:

```text
strata context reject --proposal <id> --reviewer <id> --reason-file <path>
strata context request-revision --proposal <id> --reviewer <id> --reason-file <path>
```

Required fixed message for needs revision:

```text
REVIEW_DECISION: NEEDS_REVISION

Proposal: <proposal_id>
Affected file(s): <paths>
Reviewer note: <reason_file_path>
Required action: revise the proposal and resubmit through the assigned return/proposal path.
Do not treat this chat message as the deliverable. Return revised files through the assigned path.
```

Required fixed message for rejection:

```text
REVIEW_DECISION: REJECTED

Proposal: <proposal_id>
Affected file(s): <paths>
Reviewer note: <reason_file_path>
Required action: stop work on this proposal unless a new dispatch is issued.
Do not treat this chat message as the deliverable.
```

If no original worker chatbox or dispatch channel is known, SCTL must write a dispatch-needed artifact and return a non-silent warning in the result envelope.

### ADR-0603-D17 - Class D remains outside A/B/C Git authority

Status: Accepted

Class D remains raw local transcript evidence.

Class D is not authoritative A/B/C context and must not be stored as accepted Class B without a reviewer-authored Class B entry.

Class D tools remain indexed SCTL tools:

```text
classd.locate_codex_sessions.v1
classd.register_session.v1
classd.export_markdown.v1
classd.export_pdf.v1
classd.verify_checksums.v1
classd.inspect.v1
```

The copied raw Codex local session source remains authoritative for Class D. Markdown/PDF outputs are view artifacts.

### ADR-0603-D18 - No direct content judgment by SCTL

Status: Accepted

SCTL must not judge whether a proposal is correct, useful, important, strategically aligned, or complete.

SCTL may only:

```text
validate structure
validate paths
validate schema
validate duplicate ids/checksums
validate caller/action/target rules
render deterministic exports
record explicit reviewer decisions
route fixed messages from explicit reviewer decisions
```

### ADR-0603-D19 - Repository path is install-environment configured

Status: Accepted

The exact local Git repository path for A/B/C context is not hard-coded by this ADR.

The repository path is a configured placeholder determined by the backend/SCTL installation environment.

Required configuration concept:

```text
context_repo_path = <install-environment-specific local path>
```

The path may be inside `.strata/`, inside a dedicated backend data directory, or another local path selected during installation, provided it is explicitly configured and discoverable through SCTL.

SCTL must expose the resolved path through an inspection command, for example:

```text
strata context repo-status
```

Recommended branch naming remains:

```text
authoritative branch: context/main
proposal branch pattern: proposal/<caller_id>/<change_id>
```

These branch names are accepted as defaults, but implementations may map them through configuration if the install environment requires different names. The authoritative/proposal distinction is mandatory even if exact names differ.

### ADR-0603-D20 - Approval and merge are separate actions

Status: Accepted

Approval and merge are separate actions.

```text
approve / review-ready = records review status and prepares a proposal for Human Director review
merge = final authoritative write into A/B/C context
```

Rationale:

```text
separating approval from merge avoids accidental authoritative writes
reviewers and IC can push tasks forward inside assigned branches/worktrees
Human Director receives export/diff evidence before final merge
final merge remains a deliberate human authority action
```

Approval must not automatically merge.

The A/B/C export tools exist specifically to provide the Human Director with a stable review artifact before final merge:

```text
context.export_markdown.v1
context.export_pdf.v1
```

### ADR-0603-D21 - Final merge authority is Human Director

Status: Accepted

Final merge into authoritative A/B/C context is reserved for the Human Director.

IC and reviewer may have broad working permissions inside assigned proposal branches, worktrees, and task areas. They may validate, review, request revision, reject, approve/review-ready, and otherwise push the task forward within that assigned area.

They must not perform final merge into authoritative A/B/C context.

Required rule:

```text
Only Human Director may execute the final context merge action that updates authoritative A/B/C context.
```

SCTL must enforce this through the action filter wrapper.

The export tool is part of this authority model: it produces a stable A/B/C human-review package so the Human Director can inspect the proposed state before performing final merge.

## 5. Practical Git/SCTL division

### Git replaces

```text
custom context history ledger
custom context diff system
custom rollback store
custom snapshot system
custom copy/archive substrate for A/B/C context
```

### Git does not replace

```text
schema validation
action filter wrapper
stable Strata CLI contracts
context Markdown/PDF rendering
tool registry and indexed execution
runtime actions
semantic duplicate checks
review outcome semantics
fixed dispatch messages
minimal result envelopes
```

## 6. Required initial CLI surface

```text
strata context propose
strata context validate
strata context diff
strata context review-request
strata context approve
strata context reject
strata context request-revision
strata context merge
strata context revert
strata context export-markdown
strata context export-pdf
strata context repo-status
strata tools list
strata tools inspect
strata tools run
```

## 7. Required proposal metadata

Each proposal must include metadata sufficient for validation, review, dispatch, and merge.

Minimum proposal metadata:

```text
proposal_id
proposal_branch
assigned_worktree, if used
caller_id
caller_role
origin_worker_id
origin_worker_session_id, if available
origin_dispatch_channel, if available
created_at
base_commit
changed_paths
context_classes_touched
intended_action
review_status
reviewer_id, if reviewed
reviewed_at, if reviewed
reason_file, if rejected or needs_revision
validation_result_path
```

## 8. Export artifact location

Recommended export location:

```text
.strata/exports/context/<export_id>/
```

Required artifacts for context export:

```text
context.md, for Markdown export
context.pdf, for PDF export
manifest.json
source_index.json
checksums.sha256
```

The export directory must not be inside authoritative Class A/B/C stores.

## 9. Consequences

SCTL becomes smaller than the previous backend concept.

Implementation should prioritize:

```text
1. Create Git-backed A/B/C context store model.
2. Implement schema/path validator.
3. Implement action filter wrapper.
4. Implement proposal/review/merge CLI surface with Human Director final merge.
5. Implement context.export_markdown.v1 and context.export_pdf.v1 for Human Director review.
6. Keep tool registry as the stable indexed tool surface.
7. Keep Class D transcript export separate from A/B/C context.
8. Remove or replace broad Mutation Gate logic.
9. Avoid custom workflow state machines.
```

## 10. Non-goals

```text
No backend intelligence
No backend quality judgment
No backend semantic promotion from Class D to Class B
No broad Mutation Gate for all evidence writes
No custom replacement for Git history/diff/revert
No complex assignment lifecycle state machine
No direct worker merge into authoritative A/B/C context
No IC or reviewer final merge into authoritative A/B/C context
No automatic worker approval of own work
No export writes inside authoritative A/B/C stores
```

## 11. Acceptance checks for v0.7

```text
SCTL uses Git for A/B/C context history through an install-environment configured context repository path.
Agent can create a proposal change without touching authoritative context directly.
Validator rejects malformed A/B/C files.
Validator rejects disallowed path touches.
Worker cannot approve own proposal.
Worker cannot merge into authoritative context.
Worker cannot write directly to authoritative merged context.
Reviewer or IC can reject and trigger fixed worker dispatch.
Reviewer or IC can request revision and trigger fixed worker dispatch.
IC and reviewer can work inside assigned branches/worktrees without final merge authority.
Only Human Director can final-merge into authoritative A/B/C context.
context.export_markdown.v1 renders A, then C file pins, then B timing index.
context.export_pdf.v1 renders the same sequence into PDF.
Exports do not write inside authoritative A/B/C stores.
Class D export remains separate from A/B/C context.
Minimal JSON result envelope is returned by indexed tools.
Duplicate semantic ClassB/ClassC/proposal records are blocked.
```
