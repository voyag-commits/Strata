CLI manual instructions and analysis



## Canonical SCTL cycle-start commands

## 1. Kernel / SCTL CLI layer- Use the low-level command when you want to test only SCTL’s cycle entry behavior

This command starts the SCTL cycle itself:

```
sctl --workspace "$SCTL_WORKSPACE" cycle start \
  --assignment-id A004 \
  --file "$SCTL_WORKSPACE/.strata/cycles/director_entry/director_governing_entry.md" \
  --codebase-repo "$CODEBASE_REPO" \
  --trunk-branch main \
  --coordinator-id delegated_coordinator_001
```

This command does the **SCTL-internal start**:

```
Director Entry -> Class A commit -> cycle trace -> coordinator dispatch packet
```

It does **not** by itself run the complete live harness loop: runtime session launch, dispatch injection, session capture, Author return, Reviewer return, Class B promotion, CI, merge, coordinator refresh, final evidence collection.

## 2. End-to-end harness layer for a full operational run

The full wrapper is the shell harness:

```
flowmaps/flowmap02/live_cycle_harness.sh
```

That harness wraps the low-level SCTL command. Internally, it eventually calls:

```
node "$PACKAGE_ROOT/src/cli.js" --workspace "$SCTL_WORKSPACE" cycle start \
  --assignment-id "$ASSIGNMENT_ID" \
  --file "$CYCLE_ENTRY_FILE" \
  --coordinator-id "$TRUNK_COORDINATOR_ID" \
  --codebase-repo "$CODEBASE_REPO" \
  --trunk-branch "$TRUNK_BRANCH" \
  --change-branch "$initial_change_branch" \
  --short-name "$BASE_SHORT_NAME"
```

Clarification: 

command [sctl cycle start] is the **standard kernel launch command for the cycle**, while:

command: [flowmaps/flowmap02/live_cycle_harness.sh] is the **end-to-end operational wrapper** that calls `sctl cycle start` as one step.

Topic: Analysis_(this part is implemented)

Regarding standard practices, A maintenance-grade CLI manual should have exactly these sections and these following practices are implemented to SCTL. 

```
1. What this CLI owns
2. What this CLI does not own
3. Directory model
4. Install from clean machine
5. Configure paths
6. Run preflight
7. Initialize workspace
8. Create/import Director Entry
9. Start cycle
10. Monitor status
11. Classify returns
12. Promote Class B
13. Collect evidence
14. Troubleshooting
15. Version/checksum validation
```

Therefore, maintenance wrapper layer:

```
sctl doctor
sctl init-workspace
sctl entry-path
sctl entry-template --write
sctl validate-entry
sctl cycle-start
sctl status
sctl logs
sctl collect-evidence
```

## Configuration practice

A CLI harness should support both environment variables and a config file.

Example:

```
sctl --config ./sctl.env doctor
```

Where `sctl.env` contains:

```
SCTL_WORKSPACE=/home/operator/sctl-workspaces/A004
CODEBASE_REPO=/home/operator/work/project
TRUNK_BRANCH=main
COORDINATOR_ID=delegated_coordinator_001
RUNTIME_DELEGATE_ROOT=/opt/strata-runtime-delegate
```

## Path practice

SCTL should expose path-setting CLI: 

```
SCTL package path: read-only source package.
SCTL workspace path
Director Entry source path: external input path, optional.
Director Entry controlled path: copied into .strata/cycles/director_entry/.
Target codebase location: The target codebase is the project SCTL is operating on, but not treating it as SCTL's internal state.
Runtime delegate path: external launcher
```

principle 1: The introduction of CLI harness surface does not modify the SCTL's internal operations.



