## ADR-0610-delta-backend

### 1. BOC standing session becomes optional / non-default

Default loop should not require a separate BOC LLM session.

Reason: if BOC cannot interpret meaning, a standing BOC session mostly adds an extra hop.

New default:

```text
Git update → script renders delta notice → IC chatbox
```

BOC remains only as a role boundary for mechanical operations, using the exact canonical definition already accepted.

------

### 2. Worker reports default-enter Class B

Worker report commits enter Git-governed Class B by default.

No pre-approval gate by default.

------

### 3. Suspension is the correction mechanism

Class B entries are not deleted or blocked up front. They are suspended after entry if needed.

Suspension is Git-tracked metadata.

Exports exclude suspended entries by default.

------

### 4. IC owns semantic suspension

IC may suspend for meaning, quality, priority, stale context, or reviewer concern.

Scripts/backend may suspend only for deterministic validation failures.

------

### 5. Git update routes directly to IC

When Git context changes, an automated script should compute the delta and drop a short notice to IC.

The notice should include only:

```text
commit SHA
changed files
report id
assignment id
worker id
nonce
suggested command options
```

------

### Therefore, Backend/scripts replace routine BOC dispatch

Routine dispatch should be script/CLI-based.

BOC is not needed as a separate middleman unless a future workflow proves the operational load requires it.