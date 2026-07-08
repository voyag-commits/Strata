# SCTL Prebuilt WSL Appliance — Command Manual

Target reader: you are at the WSL command line of the imported `SCTL` distro (default user `strata`) and want copy-paste commands to operate and manually verify the appliance.

All commands below are meant to be run **inside the SCTL distro** unless marked `(from Windows)`. The distro is self-contained: SCTL kernel, delegate runtime, DeepSeek bridge, Node/tmux/git/curl/python3, Codex, harness scripts, and known-good config all live inside `/opt/strata` and `/home/strata`. The only external dependency is network access to `https://api.deepseek.com`.

---

## 0. Entering the distro

From a Windows terminal (PowerShell, Windows Terminal, cmd):

```powershell
wsl -d SCTL                       # drop into strata's bash (default user)
wsl -d SCTL --user strata         # explicit
wsl -d SCTL -- whoami             # one-off command, no shell
```

Once inside, the appliance profile is auto-sourced by login shells. If you are in a non-login shell, source it manually:

```bash
source /etc/profile.d/strata-appliance.sh
source /etc/profile.d/strata-runtime-codex-bridge.sh
```

Confirm the environment is wired:

```bash
strata-appliance status           # key/api/bridge status, no secrets printed
echo "$STRATA_PACKAGE_ROOT"       # /opt/strata/source_sctl
echo "$STRATA_WORKSPACE"          # /home/strata/workspace/sctl-workspace
echo "$CODEBASE_REPO"             # /home/strata/workspace/codebase
```

---

## 1. Key paths reference

| Purpose | Path |
|---|---|
| Appliance root | `/opt/strata` |
| SCTL kernel source | `/opt/strata/source_sctl` |
| Runtime delegate | `/opt/strata/runtime-delegate` |
| DeepSeek bridge (prebuilt) | `/opt/strata/bridge` |
| Appliance bin (verify, selftest agent) | `/opt/strata/appliance/bin` |
| Appliance API server | `/opt/strata/appliance/appliance_api_server.mjs` |
| Bridge env (DeepSeek key + bridge auth) | `/home/strata/.codex-deepseek/bridge.env` |
| Codex profile config | `/home/strata/.codex/deepseek_bridge.config.toml` |
| Bridge log | `/home/strata/.codex-deepseek/wsl-bridge.log` |
| Bridge error log | `/home/strata/.codex-deepseek/wsl-bridge.err` |
| Bridge pid | `/home/strata/.codex-deepseek/wsl-bridge.pid` |
| Director Entry inbox | `/home/strata/director_entry/` |
| Controlled Director Entry (harness) | `$STRATA_WORKSPACE/.strata/cycles/director_entry/` |
| SCTL workspace | `/home/strata/workspace/sctl-workspace` |
| SCTL context git | `$STRATA_WORKSPACE/.strata/context` |
| Class B context | `$STRATA_WORKSPACE/.strata/context/B/` |
| Class A context | `$STRATA_WORKSPACE/.strata/context/A/` |
| Dispatch outbox | `$STRATA_WORKSPACE/.strata/dispatch_outbox/` |
| Returns (worker return packets) | `$STRATA_WORKSPACE/.strata/returns/` |
| Codebase repo (implementation git) | `/home/strata/workspace/codebase` |
| Launcher config (production) | `/home/strata/workspace/codebase/.strata-runtime/config/launcher_delegate.local.json` |
| Run outputs | `/home/strata/workspace/runs/` |
| Appliance profile | `/etc/profile.d/strata-appliance.sh` |
| Bridge profile | `/etc/profile.d/strata-runtime-codex-bridge.sh` |
| WSL config | `/etc/wsl.conf` |

---

## 2. strata-appliance — appliance control

`strata-appliance` is the top-level appliance wrapper. Subcommands:

```
configure-key [KEY]    Store the DeepSeek API key and ensure local bridge auth.
status                 Show key/API/bridge status without printing secrets.
bridge-config          Show current bridge defaults.
start-api              Start local-only appliance API on 127.0.0.1.
stop-api               Stop local API.
api-health             Query local API /health.
verify                 Run appliance verification.
acceptance-run [N]     Run deterministic full-cycle appliance acceptance.
```

### 2.1 Status (first thing to run)

```bash
strata-appliance status
```

Expect `key_configured=yes`, `bridge=running` (or `stopped`), `bridge_port=38449` (or your configured port), `api=stopped|running`.

### 2.2 Configure the DeepSeek API key

```bash
strata-appliance configure-key "sk-..."        # pass the key inline
# or, to be prompted / set directly in the env file:
strata-appliance configure-key
```

This writes `DEEPSEEK_API_KEY` into `/home/strata/.codex-deepseek/bridge.env` and ensures a `BRIDGE_AUTH_KEY` exists. The file is `chmod 600`, owned by `strata`.

Verify the key works against the real upstream (bypassing the bridge):

```bash
set -a; . /home/strata/.codex-deepseek/bridge.env; set +a
curl -sS -m 60 --noproxy "localhost,127.0.0.1,::1" \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST "https://api.deepseek.com/v1/chat/completions" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"Reply with exactly PONG"}],"max_tokens":10}'
curl -sS -m 30 -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  "https://api.deepseek.com/v1/models"
```

### 2.3 Bridge config and health

```bash
strata-appliance bridge-config                 # prints port, model, thinking, key status
/home/strata/bin/strata-codex-local --bridge-healthcheck   # starts bridge if not running
/home/strata/bin/strata-codex-local --bridge-config        # same as above, no start
```

The bridge is started on demand by the launcher (`/home/strata/bin/strata-codex-local`). To test a real model round-trip through the bridge:

```bash
set -a; . /home/strata/.codex-deepseek/bridge.env; set +a
curl -sS -m 120 --noproxy "localhost,127.0.0.1,::1" \
  -H "Authorization: Bearer $BRIDGE_AUTH_KEY" \
  -H "Content-Type: application/json" \
  -X POST "http://127.0.0.1:$PORT/v1/responses" \
  -d '{"model":"deepseek-v4-pro","input":"Reply with exactly the word PONG and nothing else.","reasoning":{"effort":"low"}}'
```

Watch live bridge traffic:

```bash
tail -f /home/strata/.codex-deepseek/wsl-bridge.err   # JSON access + request.converted events
grep "POST /v1/responses" /home/strata/.codex-deepseek/wsl-bridge.err | wc -l   # request count
```

### 2.4 Local appliance API (optional, 127.0.0.1 only)

```bash
strata-appliance start-api          # starts on 127.0.0.1:8765
strata-appliance api-health         # GET /health
strata-appliance stop-api
```

### 2.5 Appliance verification

```bash
strata-appliance verify
```

Runs: command presence (node/npm/tmux/git/curl/python3/sctl/strata-appliance/strata-cycle/codex), appliance files, sctl doctor, delegate provider config, bridge config defaults, bridge health, local API health. Exits 0 on success.

### 2.6 Acceptance run (deterministic self-test, NOT a live model cycle)

```bash
strata-appliance acceptance-run 3 A_APPLIANCE_ACCEPTANCE_CLIENT_001
```

> Note: this uses the deterministic `strata-cycle-selftest-agent` stub worker, **not** the real Codex/DeepSeek path. It validates harness plumbing (dispatch, returns, git, merge, class B) in seconds. It does **not** prove model inference. Use `strata-cycle start` (section 3) for a real model-backed cycle.

---

## 3. strata-cycle — live cycle operation (real Codex/DeepSeek)

This is the operator entry point for a real, model-backed trunk-based disposable-worker cycle.

```
start --director-entry FILE [--assignment-id ID] [--cycles N] [--background]
      [--return-timeout SECONDS] [--poll-interval SECONDS] [--paste-delay SECONDS]
      [--validation-command CMD] [--allow-merge] [--skip-npm-test] [--skip-adapter-syntax]
stop [--assignment-id ID]
status
```

### 3.1 Status / stop

```bash
strata-cycle status
strata-cycle stop --assignment-id A_LIVE_001
```

### 3.2 Prepare a Director Entry

The harness requires exactly one `.md` file in the controlled inbox. The simplest workflow: author your entry in the home inbox and let the harness copy it in.

```bash
# edit your governing entry
$EDITOR /home/strata/director_entry/director_governing_entry.md
# keep exactly one .md here (remove stale copies from prior cycles)
ls /home/strata/director_entry/*.md
```

A minimal Director Entry template:

```markdown
# Director Entry

## Objective
<one concrete codebase change to implement>

## Scope
- <single commit on the assigned change branch>
- <no new dependencies>

## Definition Of Done
- <observable acceptance criteria>
- <the change is committed on the change branch and returned via the operational report>
```

To copy a Director Entry from Windows into the distro (manual `cp`):

```bash
# from Windows path (inside WSL, /mnt/c maps to C:\)
cp "/mnt/c/Users/hou16/Downloads/my_director_entry.md" /home/strata/director_entry/director_governing_entry.md
```

### 3.3 Start a real live cycle (foreground)

```bash
strata-cycle start \
  --director-entry /home/strata/director_entry/director_governing_entry.md \
  --assignment-id A_LIVE_001 \
  --cycles 1 \
  --return-timeout 360 \
  --poll-interval 5 \
  --paste-delay 5 \
  --validation-command "node -e \"require('./src/volume.js')\"" \
  --allow-merge
```

> Important: always pass `--validation-command` matching your actual codebase. The harness default references `code/ensemble_core.py` and `numpy`, which do not exist in the appliance's blank codebase and will break CI. Match the validation command to whatever the Director Entry asks the author to produce.

### 3.4 Start a real live cycle (background, survives shell return)

```bash
setsid bash -c '
source /etc/profile.d/strata-appliance.sh 2>/dev/null || true
strata-cycle start \
  --director-entry /home/strata/director_entry/director_governing_entry.md \
  --assignment-id A_LIVE_001 \
  --cycles 1 \
  --return-timeout 360 \
  --poll-interval 5 \
  --paste-delay 5 \
  --validation-command "node -e \"require('./src/volume.js')\"" \
  --allow-merge
' < /dev/null > /home/strata/workspace/runs/A_LIVE_001.log 2>&1 &
disown
```

### 3.5 Watch a running cycle

> **Important — tmux sessions are disposable.** The harness creates `STRATA-COORDINATOR-...`, `STRATA-CODER-...`, and `STRATA-REVIEWER-...` tmux sessions only while a cycle is running. Author and reviewer sessions are **retired (killed) after each cycle ends**; the coordinator session is retired when its generation rotates. Therefore `tmux ls` and `tmux capture-pane -t <name>` only work **during a live cycle**. Once the cycle exits, those sessions no longer exist (you will get `can't find session: STRATA-CODER-...`). For after-the-fact inspection, use the durable capture files in section 3.5b.

**While a cycle is running** (check with `strata-cycle status` first):

```bash
# harness stdout (background runs)
tail -f /home/strata/workspace/runs/A_LIVE_001.log

# operational log + step diagnosis (in the timestamped run dir)
RUN=$(ls -td /home/strata/workspace/runs/A_LIVE_001_* | head -1)
tail -f "$RUN/flowmap02_operational.log"
tail -f "$RUN/flowmap02_step_diagnosis.tsv"

# list currently-alive delegate tmux sessions (only while running)
tmux ls

# attach to watch a live delegate session interactively (detach with Ctrl-b d)
tmux attach -t STRATA-COORDINATOR-A_LIVE_001
tmux attach -t STRATA-CODER-A_LIVE_001
tmux attach -t STRATA-REVIEWER-A_LIVE_001

# capture a live session pane to stdout (non-interactive; only while running)
tmux capture-pane -t STRATA-COORDINATOR-A_LIVE_001 -p | tail -40
tmux capture-pane -t STRATA-CODER-A_LIVE_001 -p | tail -40
tmux capture-pane -t STRATA-REVIEWER-A_LIVE_001 -p | tail -40

# real model traffic (live POST /v1/responses calls to DeepSeek)
tail -f /home/strata/.codex-deepseek/wsl-bridge.err
```

### 3.5b Inspect delegate sessions after a cycle has ended

Because disposable tmux sessions are gone after the cycle, read the **durable captures** the harness saved during the run:

```bash
# per-session capture snapshots (saved by the harness at capture time)
ls -la "$STRATA_WORKSPACE/.strata/evidence/session_captures/"
cat "$STRATA_WORKSPACE/.strata/evidence/session_captures/STRATA-CODER-A_LIVE_001.txt"
cat "$STRATA_WORKSPACE/.strata/evidence/session_captures/STRATA-REVIEWER-A_LIVE_001.txt"

# timestamped pane captures (delegate_control evidence)
find "$STRATA_WORKSPACE/.strata-runtime/evidence/delegate_control/session_capture" -name pane_capture.txt | sort
cat "$STRATA_WORKSPACE/.strata-runtime/evidence/delegate_control/session_capture/change_author_c01/<timestamp>/pane_capture.txt"

# the capture step logs in the run dir (point to the evidence paths)
RUN=$(ls -td /home/strata/workspace/runs/A_LIVE_001_* | head -1)
cat "$RUN/C01_8_author_session_capture.log"
cat "$RUN/C01_16_reviewer_session_capture.log"
```

If you need a live tmux session to persist for manual debugging, do **not** rely on the harness's disposable sessions — instead start your own tmux session and run `strata-cycle start` inside it, or re-run a cycle and capture with `tmux capture-pane` while it is still running.

### 3.6 Read the result of a finished cycle

```bash
RUN=$(ls -td /home/strata/workspace/runs/A_LIVE_001_* | head -1)
cat "$RUN/flowmap02_result.json"        # machine-readable summary
cat "$RUN/flowmap02_result.md"          # human-readable report
cat "$RUN/flowmap02_step_diagnosis.tsv" # per-step status/observation/diagnosis/next_action
cat "$RUN/cycle_timeline.tsv"           # cycle -> branch/commit/review/ci/merge
ls -la "$RUN"                           # all artifacts (ci log, dispatch renders, classb commits, ...)
```

### 3.7 Inspect the model's actual work

```bash
# codebase git history (the implementation work)
git -C /home/strata/workspace/codebase log --oneline --all
git -C /home/strata/workspace/codebase show <commit>
git -C /home/strata/workspace/codebase diff main..<change-branch>

# SCTL context git (coordination/dispatch/reports trace)
git -C /home/strata/workspace/sctl-workspace/.strata/context log --oneline -10
```

### 3.8 Copy run artifacts out to Windows

```bash
RUN=$(ls -td /home/strata/workspace/runs/A_LIVE_001_* | head -1)
cp "$RUN/flowmap02_operational.log" /mnt/c/Users/hou16/Downloads/
cp "$RUN/flowmap02_result.json"      /mnt/c/Users/hou16/Downloads/
cp "$RUN/flowmap02_step_diagnosis.tsv" /mnt/c/Users/hou16/Downloads/
```

---

## 4. sctl — kernel CLI (manual verification primitives)

`sctl` is the SCTL kernel. Most operators use `strata-cycle` for full cycles, but `sctl` exposes every primitive for manual inspection and verification. All commands return a JSON result envelope (`contract_id: strata.sctl.result_envelope.v1`) unless noted.

```
help
context bootstrap [--workspace DIR]
context repo-status [--workspace DIR]
context put --class A|C --id ID --title TITLE --body TEXT
context export-markdown [--out DIR] [--include-classes A,B] [--since-class-b-revision N] [--class-b-latest N]
context freshness --loaded-context-epoch N [--loaded-class-a-revision N]
cycle entry-path
cycle template [--write]
cycle validate-entry
cycle submit --assignment-id A001 [--file FILE] [--cycle-id ID] [--coordinator-id ID] [--no-dispatch]
cycle start  --assignment-id A001 [--file FILE] [--cycle-id ID] [--coordinator-id ID] [--no-dispatch]
cycle exit --cycle-id ID --reason complete|architectural_blocker|manual_stop [--summary TEXT] [--evidence FILE]
coordinator context-policy --assignment-id A001 [--coordinator-id delegated_coordinator_001]
coordinator cycle-complete --assignment-id A001 [--coordinator-id delegated_coordinator_001] [--cycle-id CYCLE_ID]
coordinator recreate-record --assignment-id A001 [--coordinator-id delegated_coordinator_001]
panel git [--repo sctl|codebase] [--codebase-repo DIR] [--tool lazygit|gitk|git-status] [--print-command]
sessions register --assignment-id A001 --role ROLE --id ID [--session-name NAME] [--runtime-session-name NAME] [--runtime-role ROLE] [--session-mode disposable|long_running]
sessions release --assignment-id A001 --id ID [--reason TEXT] [--status released|closed|superseded]
sessions retire --assignment-id A001 --id ID [--reason TEXT]
sessions list
classb put --id B1 --title TITLE --assignment-id A001 --agent-id ID --role ROLE [--scope actionable_report]
classb validate --file .strata/context/B/B1.md
classb commit --file .strata/context/B/B1.md [--message TEXT]
classb ingest-return --source FILE [--id B1] [--message TEXT]
classb list
message send --assignment-id A001 --thread-id T --from-role R --from-id I --to-role R --to-id I --message-kind KIND --body TEXT [--related-class-b FILE]
message validate --file FILE
dispatch render --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID [--envelope-type TYPE] [--template-path FILE] [--class-b-latest 2] [--out FILE]
dispatch record --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID [--envelope-type TYPE] [--template-path FILE] [--class-b-latest 2] [--declared-file TEMPLATE:path]
dispatch record-injection --dispatch-log FILE --result-file FILE
dispatch test-delegate --assignment-id A001 --nonce N1 --target-role ROLE --target-id ID [--target-session TMUX] [--template-path FILE]
returns classify --packet FILE
flowmap inspect --assignment-id A001 --target-id ID --nonce N1
fixtures list-scenes
fixtures run-scene --name direct_to_trunk_small_change
tools list
tools inspect --tool TOOL_ID
protocol list-templates
protocol template --name dispatch_packet
secret-scan
```

Maintenance wrapper (thin layer over internals; does not modify SCTL operations):

```
doctor
init-workspace
status
logs [--tail N] [--kind EVENT_PREFIX]
collect-evidence [--out DIR] [--assignment-id A001]
paths [--director-entry-source FILE] [--codebase-repo DIR]
```

### 4.1 Common manual verification commands

```bash
# workspace health
sctl doctor --workspace "$STRATA_WORKSPACE"
sctl status
sctl paths

# context state
sctl context repo-status --workspace "$STRATA_WORKSPACE"
sctl context export-markdown --out /tmp/context_export --include-classes A,B --class-b-latest 2

# director entry handling
sctl cycle entry-path                       # prints the controlled entry path
sctl cycle template --write                 # writes a template entry
sctl cycle validate-entry                   # validates the entry in the inbox

# class B context
sctl classb list
sctl classb validate --file "$STRATA_WORKSPACE/.strata/context/B/<file>.md"

# sessions
sctl sessions list

# returns
sctl returns classify --packet "$STRATA_WORKSPACE/.strata/returns/A001/change_author_c01/packet.json"

# secret scan over the workspace
sctl secret-scan

# evidence collection
sctl collect-evidence --out /tmp/evidence --assignment-id A_LIVE_001
sctl logs --tail 50 --kind workflow
```

### 4.2 Reading the context git directly

```bash
# SCTL coordination trace
git -C "$STRATA_WORKSPACE/.strata/context" log --oneline -20
git -C "$STRATA_WORKSPACE/.strata/context" show HEAD

# Class A (director entries) and Class B (reports/work orders)
ls -la "$STRATA_WORKSPACE/.strata/context/A/"
ls -la "$STRATA_WORKSPACE/.strata/context/B/"

# dispatch packets (D_trace)
ls -la "$STRATA_WORKSPACE/.strata/context/D_trace/dispatch_packets/"
```

---

## 5. tmux adapter scripts (runtime delegate boundary)

Location: `/opt/strata/source_sctl/scripts/wsl_tmux/`. These are invoked by the harness; you rarely call them by hand, but they are useful for manual inspection.

```
sctl-session-new      --assignment-id A001 --role ROLE --id ID [--session-name TMUX] [--session-mode disposable|long_running] [--cycle-id CYCLE] [--resolve-existing] [--no-launch]
sctl-dispatch-render  (renders a dispatch packet)
sctl-dispatch-inject  --assignment-id A001 --id logical_session_id --session RUNTIME_SESSION --packet dispatch_packet.md [--no-enter] [--paste-delay SECONDS]
sctl-session-capture  --assignment-id A001 --id ID --session TMUX --out FILE [--lines N]
sctl-session-list     [--workspace DIR]
sctl-session-retire   (retire a disposable session)
sctl-return-dir       --assignment-id A001 --id logical_session_id
sctl-return-drop      --assignment-id A001 --id logical_session_id --file packet.json [--file report.md]
sctl-git-panel        [--repo sctl|codebase] [--tool git-status]
```

Examples:

```bash
AD=/opt/strata/source_sctl/scripts/wsl_tmux
$AD/sctl-session-list --workspace "$STRATA_WORKSPACE"
$AD/sctl-return-dir --assignment-id A_LIVE_001 --id change_author_c01
tmux ls
tmux capture-pane -t STRATA-CODER-A_LIVE_001 -p | tail -40
```

---

## 6. Manual verification recipes

### 6.1 "Is the appliance healthy?"

```bash
strata-appliance status
strata-appliance verify
sctl doctor --workspace "$STRATA_WORKSPACE"
```

### 6.2 "Is the DeepSeek key valid and is the bridge reaching upstream?"

```bash
set -a; . /home/strata/.codex-deepseek/bridge.env; set +a
# direct upstream
curl -sS -m 60 --noproxy "localhost,127.0.0.1,::1" \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  "https://api.deepseek.com/v1/models"
# through the local bridge
/home/strata/bin/strata-codex-local --bridge-healthcheck
curl -sS -m 120 --noproxy "localhost,127.0.0.1,::1" \
  -H "Authorization: Bearer $BRIDGE_AUTH_KEY" -H "Content-Type: application/json" \
  -X POST "http://127.0.0.1:$PORT/v1/responses" \
  -d '{"model":"deepseek-v4-pro","input":"Reply with exactly PONG.","reasoning":{"effort":"low"}}'
```

### 6.3 "What did the last cycle produce?"

```bash
RUN=$(ls -td /home/strata/workspace/runs/A_LIVE_* 2>/dev/null | head -1)
echo "run dir: $RUN"
cat "$RUN/flowmap02_result.json"
cat "$RUN/cycle_timeline.tsv"
cat "$RUN/flowmap02_step_diagnosis.tsv" | tail -15
git -C /home/strata/workspace/codebase log --oneline --all
```

### 6.4 "Copy a Director Entry from Windows and run a cycle"

```bash
cp "/mnt/c/Users/hou16/Downloads/my_entry.md" /home/strata/director_entry/director_governing_entry.md
# ensure exactly one .md in the inbox
ls /home/strata/director_entry/*.md
strata-cycle start \
  --director-entry /home/strata/director_entry/director_governing_entry.md \
  --assignment-id A_LIVE_002 --cycles 1 --allow-merge \
  --validation-command "node -e \"require('./src/volume.js')\""
```

### 6.5 "Stop everything and clean up"

```bash
strata-cycle stop --assignment-id A_LIVE_001
strata-appliance stop-api
pkill -f "bridge/dist/src/index.js"        # stop the bridge
tmux kill-server                           # kill leftover delegate sessions
```

---

## 7. Troubleshooting

- **`bridge=stopped` and requests return `Unauthorized`**: a stale bridge may be holding the port with an old `BRIDGE_AUTH_KEY`. Kill it and let the launcher restart: `pkill -f "bridge/dist/src/index.js"; /home/strata/bin/strata-codex-local --bridge-healthcheck`.
- **`EADDRINUSE 127.0.0.1:38441`**: another process (possibly a Windows-side bridge under mirrored WSL networking) owns the port. Either stop the other process or change `PORT=` in `/home/strata/.codex-deepseek/bridge.env` and the `base_url` port in `/home/strata/.codex/deepseek_bridge.config.toml`, then restart the bridge.
- **CI fails with `No such file or directory: 'code/ensemble_core.py'`**: the harness used its stale default validation command. Re-run with `--validation-command` matching your actual codebase.
- **`BLOCKED_AMBIGUOUS_CYCLE_ENTRY`**: more than one `.md` in the Director Entry inbox. Remove stale copies: `ls /home/strata/director_entry/*.md` then keep only one.
- **`can't find session: STRATA-CODER-...` / `can't find pane: ...`**: the cycle already ended and its disposable tmux sessions were retired. `tmux capture-pane`/`tmux attach` only work **while a cycle is running**. For after-the-fact inspection, read the durable capture files in `$STRATA_WORKSPACE/.strata/evidence/session_captures/` and `$STRATA_WORKSPACE/.strata-runtime/evidence/delegate_control/session_capture/` (see section 3.5b).
- **Return timeout / stuck agent**: while the cycle is still running, inspect the live tmux session (`tmux capture-pane -t STRATA-CODER-... -p`); check the bridge log for upstream errors; verify the DeepSeek key is valid.
- **`Permission denied` writing evidence under `.strata-runtime`**: the image shipped some root-owned dirs. Fix with `sudo chown -R strata:strata /home/strata/workspace/sctl-workspace/.strata-runtime`.
- **`wsl: Failed to translate '\\wsl.localhost\...'`**: a cosmetic WSL interop warning when your Windows `HOME`/`USERPROFILE` is inside a WSL path; it does not affect commands.

---

## 8. Quick reference card

```bash
# enter
wsl -d SCTL                                    # from Windows

# health
strata-appliance status
strata-appliance verify
sctl doctor --workspace "$STRATA_WORKSPACE"

# key + bridge
strata-appliance configure-key "sk-..."
/home/strata/bin/strata-codex-local --bridge-healthcheck

# live cycle
strata-cycle status
strata-cycle start --director-entry ~/director_entry/director_governing_entry.md \
  --assignment-id A_LIVE_001 --cycles 1 --allow-merge \
  --validation-command "node -e \"require('./src/volume.js')\""
strata-cycle stop --assignment-id A_LIVE_001

# inspect
RUN=$(ls -td /home/strata/workspace/runs/A_LIVE_001_* | head -1)
cat "$RUN/flowmap02_result.json"
cat "$RUN/flowmap02_step_diagnosis.tsv"
git -C /home/strata/workspace/codebase log --oneline --all
tmux ls

# copy out
cp "$RUN/flowmap02_operational.log" /mnt/c/Users/hou16/Downloads/
```
