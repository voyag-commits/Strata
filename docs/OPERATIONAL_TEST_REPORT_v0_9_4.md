# Operational Test Report v0.9.4

## Test commands run

```bash
npm test
npm run secret-scan
for script in scripts/wsl_tmux/sctl-* flowmaps/flowmap02/*.sh scripts/bootstrap_wsl.sh; do bash -n "$script"; done
scripts/wsl_tmux/sctl-fleet-smoke --workspace <temp-workspace>
```

## Observed result

```text
npm test: 18/18 passed
secret-scan: passed, no findings
adapter syntax check: passed
no-launch adapter smoke: passed and produced deterministic dispatch packet
```

## Covered behavior

```text
strict Class B report validation
invalid Class B denial and error dispatch
deterministic dispatch render and record
Git-preserved dispatch packet snapshots
Class C team message dispatch envelope
simple context freshness math
disposable session retirement
return packet classification
OPERATIONAL_REPORT_READY remains separate from Class B
EVIDENCE_READY/evidence_path/class_b_intake remain retired
tool registry boundary excludes runtime/tmux tools
fixture scene produces team activity Git log
thin adapter smoke exercises session register, Class B, Class C, and dispatch record
```
