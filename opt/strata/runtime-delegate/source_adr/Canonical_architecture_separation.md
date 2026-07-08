ADR-0610-Architecture Separation

## Canonical architecture separation

### Component 1: SCTL

**Name:** Strata Context Tool Layer
**Type:** deterministic control plane
**Primary interface:** CLI + file artifacts + Git context repository

**Definition:**

```text
SCTL is the deterministic CLI-addressable control plane for Strata context, tools, validation, exports, and evidence records.
```

**Owned resources:**

```text
Git-backed A/B/C context repository
tool registry
schema definitions
action filter rules
context export artifacts
Class D transcript evidence index
tool-run result envelopes
failure artifacts
SCTL configuration
```

**Owned operations:**

```text
parse CLI command
validate input schema
validate path policy
validate caller/action/target authority
read/write Git-backed A/B/C context according to approved command contracts
execute registered tools
render context exports
register/export Class D evidence
write deterministic result envelopes
write failure artifacts
report configured context repo status
```

**Explicit non-ownership:**

```text
role cognition
task interpretation
quality judgment
implementation strategy
incident command decisions
review judgment
worker behavior
tmux session cognition
Codex output semantics
DeepSeek output semantics
routine IC dispatch meaning
```

SCTL may launch or address runtime sessions only through registered runtime tools. Such tools record process/session facts and inject fixed notices; they do not interpret role work.

------

### Component 2: Managed Codex Session Runtime

**Name:** Managed Codex Session Runtime
**Type:** runtime substrate
**Primary interface:** WSL + tmux + Codex CLI process lifecycle

**Definition:**

```text
Managed Codex Session Runtime is the WSL/tmux substrate that creates, names, lists, captures, and addresses role-specific Codex CLI sessions.
```

**Owned resources:**

```text
tmux server
tmux sessions
tmux windows/panes
Codex CLI processes
session names
session launch logs
session capture logs
session status records
```

**Owned operations:**

```text
check WSL runtime
check tmux availability
check Codex CLI availability
create tmux session
launch Codex CLI in tmux
name session using STRATA-{ROLE}-{ASSIGNMENT_ID}
list session status
attach to session
capture pane output
inject short message into session through tmux
terminate session when explicitly requested
```

**Explicit non-ownership:**

```text
A/B/C context authority
Class B acceptance or suspension semantics
report review
worker report content
IC decision-making
reviewer decision-making
director escalation meaning
Git context merge authority
schema validation beyond runtime/session command inputs
```

This component only provides reachable Codex CLI endpoints. It does not define what the role does after receiving a message.

### Component 2 is the primary runtime deliverable

This is the urgent blocker.

```
Managed Codex Session Runtime
```

It must prove:

```
WSL available
tmux available
Codex CLI launchable
role session created
role session named
session can receive short message by tmux
session output/capture can be inspected
session record/evidence written
```

Until this works, L4(reference Playbook)cannot happen.

planned implementation order:

1. Component 2: WSL/tmux/Codex session runtime
2. Component 3: standalone dispatch script with tmux injection
3. Handshake manifest between Component 3 and Component 2
4. SCTL registry entries for runtime/dispatch tools
5. Work Protocol templates aligned to the dispatch/return paths
6. L4 live-loop test using real sessions

------

### Component 3: Dispatch Script Layer

**Name:** Strata Dispatch Script Layer
**Type:** deterministic routing script layer
**Primary interface:** Git update detection + rendered notice + tmux injection

**Definition:**

```text
The Dispatch Script Layer detects configured file/Git events, renders bounded notice messages, and delivers those notices to configured tmux-backed Codex sessions.
```

**Owned resources:**

```text
dispatch templates
delta notice templates
dispatch logs
dispatch evidence directories
target session mapping
Git change scan records
nonce records for dispatch chain
```

**Owned operations:**

```text
detect configured Git/context update
compute changed file list
extract commit SHA
extract report id when available
extract assignment id when available
extract worker id when available
extract nonce when available
render short notice
select target session from routing metadata
inject notice through tmux
write dispatch evidence
write dispatch blocked artifact when target session is unavailable
```

**Notice payload fields:**

```text
commit SHA
changed files
report id
assignment id
worker id
nonce
suggested command options
```

**Explicit non-ownership:**

```text
semantic interpretation of the delta
quality judgment
priority judgment
automatic task planning
automatic Class B suspension for semantic reasons
IC response generation
reviewer response generation
director decision generation
```

This layer mechanically renders and delivers notices. IC handles semantic interpretation after receiving the notice.

------

### Component 4: Work Protocol

**Name:** Strata Work Protocol
**Type:** file and role contract layer
**Primary interface:** bootstrap messages + dispatch packets + report templates + Worker Return Packets

**Definition:**

```text
The Work Protocol defines the file formats, role responsibilities, return packet formats, report templates, and review/suspension procedures used by role sessions.
```

**Owned resources:**

```text
role bootstrap templates
work dispatch packet templates
Worker Return Packet schemas
report templates
reviewer report template
IC delta notice handling procedure
Class B suspension metadata format
director communication request template
```

**Owned operations:**

```text
define role responsibilities
define report structure
define Worker Return Packet required fields
define reviewer traceability checks
define IC suspension decision procedure
define director escalation request structure
define accepted evidence expectations
```

**Explicit non-ownership:**

```text
tmux process lifecycle
Codex process lifecycle
Git merge execution
SCTL action filtering
tool registry implementation
actual role judgment
```

The Work Protocol specifies what role sessions are expected to produce. It does not execute backend operations by itself.

------

## System boundary map

```text
+-------------------------------------------------------------+
|                     Strata Work Protocol                    |
|  role templates | dispatch packet format | return packets   |
|  reviewer report | suspension metadata | escalation format  |
+----------------------------+--------------------------------+
                             |
                             v
+----------------------------+--------------------------------+
|                 Managed Codex Session Runtime               |
|   WSL | tmux | Codex CLI sessions | capture | injection     |
+----------------------------+--------------------------------+
                             ^
                             |
+----------------------------+--------------------------------+
|                  Dispatch Script Layer                      |
| Git delta scan | notice render | target lookup | tmux send   |
+----------------------------+--------------------------------+
                             |
                             v
+----------------------------+--------------------------------+
|          SCTL: Strata Context Tool Layer                    |
| CLI | Git A/B/C context | registry | validation | exports   |
| Class D evidence | result envelopes | failure artifacts     |
+-------------------------------------------------------------+
```

## Authoritative data flows

### Flow A: session launch

```text
operator/SCTL command
-> Managed Codex Session Runtime
-> tmux session created
-> Codex CLI launched
-> session record written
-> result envelope returned
```

### Flow B: dispatch notice

```text
Git/context update
-> Dispatch Script Layer detects delta
-> dispatch notice rendered
-> target IC session resolved
-> tmux injection into STRATA-IC-{assignment_id}
-> dispatch evidence written
```

### Flow C: worker task execution

```text
IC or dispatch packet assigns task
-> Codex role session reads file paths
-> role performs work
-> role writes report / Worker Return Packet
-> SCTL or script scans/validates return artifact
-> Git/Class B/default-entry or suspension workflow applies according to current ADR
```

### Flow D: Class B correction under ADR-0610

```text
worker report commit enters Git-governed Class B
-> Git update dispatch script notifies IC
-> IC inspects semantic quality/priority/staleness/reviewer concern
-> IC records suspension metadata if needed
-> exports exclude suspended entries by default
```

## Final canonical rule

```text
SCTL controls deterministic context/tool authority.
Managed Codex Session Runtime controls WSL/tmux/Codex session reachability.
Dispatch Script Layer controls bounded notice delivery through tmux.
Work Protocol controls role/file/report contracts.
Role sessions perform interpretation and judgment inside their assigned role.
```

This is the clean separation.