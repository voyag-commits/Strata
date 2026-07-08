./flowmaps/flowmap02/live_cycle_harness.sh \

  --assignment-id A_FLOWMAP_02_006 \

  --sctl-workspace /home/hou16/sctl-live-test-A_LIVE_001 \

  --codebase-repo /home/hou16/workspace/AAU_MED_EM_ENSEMBLE_HEATMAP_STUDENT_ASSIGNMENT \

  --objective "Implement one small assigned codebase change" \

  --allow-merge



Harness stages:

0. Guard checks

   \- absolute paths only

   \- SCTL workspace exists

   \- Codebase repo exists

   \- package npm tests pass

   \- adapter scripts parse

   \- git status checked

   \- no unexpected dirty state



1. Bootstrap / inspect SCTL context

   \- context bootstrap

   \- read context_state.json

   \- record current Class B revision



2. Register Trunk Coordinator

   \- session new

   \- loaded_context_epoch recorded



3. Prepare codebase branch

   \- switch main

   \- warn if pull has no upstream

   \- create assigned branch

   \- never touch unrelated branches



4. Register disposable Change Author

   \- session new

   \- generate deterministic author envelope

   \- render dispatch

   \- inject dispatch

   \- wait up to 300 seconds for author packet.json



5. Classify author return

   \- returns classify

   \- confirm OPERATIONAL_REPORT_READY

   \- commit accepted author report into Class B

   \- verify Class B revision increments by exactly 1



6. Register disposable Reviewer

   \- session new

   \- generate deterministic reviewer envelope

   \- render dispatch

   \- inject dispatch

   \- wait up to 300 seconds for reviewer packet.json



7. Classify reviewer return

   \- returns classify

   \- read recommendation from report

   \- require approved / denied / blocked



8. CI and merge gate

   \- run declared validation commands on assigned branch

   \- if approved + CI green + --allow-merge, fast-forward merge to main

   \- otherwise stop with report



9. Record final outcome

   \- classb put final outcome

   \- verify Class B revision increments by exactly 1



10. Retire disposable sessions

   \- retire Change Author

   \- retire Reviewer

   \- optional --pause-before-retire for visual inspection



11. Coordinator freshness

   \- read actual loaded_context_epoch from active_sessions.json

   \- run context freshness with actual epoch

   \- export delta/full context based on revision math



12. Final audit report

   \- SCTL Git status

   \- SCTL Git log

   \- Codebase Git branch/merge state

   \- dispatch paths

   \- return ledger paths

   \- Class B files

   \- final result markdown + TSV + JSON



Required timeout behavior

wait_for_return(agent_id, timeout=300 seconds)

if timeout:

Status: BLOCKED_TIMEOUT

Actions:

\- capture session

\- record expected return path

\- record last visible session capture

\- do not classify

\- do not proceed to next role

\- write final report at failed boundary



Final caution: the harness should not hide failure. It should stop at the first unsafe boundary and emit

STATUS: BLOCKED / BROKEN / PARTIAL / OBSERVED

failed step:

command:

stdout/stderr:

expected evidence:

observed evidence:

next action:
