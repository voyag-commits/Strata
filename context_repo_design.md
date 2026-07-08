## Repo 2 – Codebase Git (implementation work)

Path: /home/strata/workspace/codebase · main trunk + disposable per-cycle change/<assignment>/C0n-<short> branches

### Edition policy – branch-isolated, agent-authored, ff-merge-gated

The harness owns branch lifecycle but does not author commits — the Codex/DeepSeek agent does. The harness sequence per cycle
(prepare_codebase_branch, :960):

1. Dirty guard – git status --short; fails BLOCKED_DIRTY_CODEBASE if non-empty, unless --allow-dirty-codebase. The harness refuses to
   start on a dirty working tree.

2. Switch to trunk – git switch main
3. ff-pull – git pull --ff-only; tolerates no-upstream (WARN_LOCAL_MAIN_NO_UPSTREAM) but fails on real pull errors
4. Create/switch change branch – git switch -c change/<assignment>/C0n-<short> main (or switch if it already exists)
5. Agent works – the author agent (Codex) does the actual git add/commit on the change branch. The harness does not touch the index or
   working tree during authorship.

6. Merge (merge_if_authorized, :1163) – git switch main && git merge --ff-only <change> – only if three gates pass: review==approved AND
   ci==passed AND --allow-merge. Non-ff merges are rejected (ff-only). On any gate failure, merge is skipped and the outcome is recorded
   in Class B.

### Removal policy – branch-ref deletion is outcome-blind and per-cycle

- Change branch is force-deleted every cycle end (cleanup_cycle_change_branch, :860): git switch -f main && git branch -D <change>. This
  runs regardless of review/merge outcome (approved, denied, blocked, merged, or not). The diagnostic at :889 states this explicitly.

- Three escape hatches from deletion:
    - --keep-change-branch → FRESHNESS_KEEP_CHANGE_BRANCH=1 → skipped
    - branch not matching change/<assignment>/* → skipped (operator-supplied branches are never touched)
    - branch already absent → skipped

- --delete-branch-after-merge (:1170) adds a second, earlier git branch -d right after the merge succeeds — a redundant -d (safe delete,
  fails if not merged) before the cycle-end -D (force delete). With neither flag, the cycle-end -D still fires.

- Working tree is never reset/cleaned – grep confirms no git reset/clean/restore/checkout -- against the codebase. The harness leaves the
  working tree as the agent left it.

- Merged work persists on main – the commit object survives the branch deletion because ff-merge made main point to it. Unmerged (denied/
  blocked) work's commit object still exists in git's object store, reachable by SHA, but with no ref pointing to it — it becomes
  unreachable and will eventually be GC'd by git's default 2-week prune (the harness does not GC the codebase repo).

Net: codebase git is a trunk + disposable-branch model. The harness creates and force-deletes cycle-owned branches every cycle, outcome-
blind. The implementation commit survives only if merged to main; otherwise it orphaned to object-store-limbo until git's native GC.

## Repo 1 – Context Git (SCTL coordination trace)

Path: /home/strata/workspace/sctl-workspace/.strata/context · single master branch · non-bare · append-only

### Edition policy – append-only, kernel-owned, revision-guarded

The harness never writes to context git directly. All commits are made by the SCTL kernel (node src/cli.js), invoked by the harness as
discrete steps. Each is a forward commit on master — no feature branches, no rebases, no force updates:

- context bootstrap – initializes/updates context git (step 0)
- cycle start – commits the Director Entry to Class A, normalizes a cycle reference object
- classb commit / classb put – commits Class B work orders, author reports, final outcomes (steps 5, 11, 19)
- sessions register / release / retire – commits session lifecycle records to C/sessions/
- dispatch record – commits dispatch packets to D_trace/dispatch_packets/
- cycle exit – commits the terminal exit record

Every classb put/commit is guarded by require_revision_increment (:325), which reads the Class B revision before and after and fails with
BROKEN_REVISION_MATH if it doesn't advance exactly once. This prevents silent double-commits and lost updates.

### Removal policy – never removes tracked content; GC-only

- No git rm, git reset, git clean, or git restore against context git anywhere in the harness (confirmed by grep – empty). Class A
  entries, Class B reports, dispatch packets, session records, and return ledgers are all immutable once committed.

- The only context-git mutation at cycle end is storage compaction, not content deletion (cleanup_context_git, :918): git reflog expire
  --expire=now --all + git gc --prune=now. This packs objects and drops unreachable reflog entries but preserves every reachable commit
  and file. The diagnostic explicitly states it does not delete Class B reports or alter reviewer-outcome semantics.

- One rm -rf exists (:846, in reset_cycle_transient_artifacts): it deletes .strata/returns/<assignment>/* subdirectories. But this path is
  outside context git — .strata/returns/ is sibling to .strata/context/, and git ls-files confirms zero returns files are tracked. So this
  removes untracked transient drop-box files, not git history.

- Cleanliness guard (step 22, :1291): if git status --short is non-empty at run end, the harness fails with BROKEN_SCTL_GIT_DIRTY. This is
  what caught my manual rm of tracked Class B files earlier — the guard treats any uncommitted change as a harness-boundary error.

Net: context git is a strictly append-only, single-branch ledger. Nothing committed is ever removed; only loose objects are GC'd.