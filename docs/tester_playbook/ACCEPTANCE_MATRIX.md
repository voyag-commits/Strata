# Acceptance Matrix v0.9.4

| Area | Acceptance condition |
|---|---|
| Context Git | `.strata/context` is isolated and has commits for context, dispatch, returns, and telemetry |
| Class A | Update increments Class A revision and requires full fresh dispatch for existing sessions |
| Class B | Invalid status, invalid timestamp, non-integer epoch, and empty sections are rejected |
| Class C | Team messages validate and serve as task guidance |
| Dispatch | Envelope is Class C message + headline + Class A/B context export |
| Empty context | Dispatch remains valid when Class A/B contain no files |
| Packet evidence | Exact dispatch Markdown/JSON is committed under `D_trace/dispatch_packets` |
| Freshness | `current_class_b_revision - loaded_context_epoch` controls update policy |
| Returns | Return classifications and ledgers are committed under `D_trace/return_ledgers` |
| Runtime edge | WSL/tmux scripts delegate to existing launcher stack and remain thin |
| Disposable sessions | Register, capture, and retire flow works |
| Security | Secret scan passes |
