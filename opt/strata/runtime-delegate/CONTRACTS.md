# Runtime Delegate Contracts

Implemented contract-native operations:

- `delegate session-register`
- `delegate session-create`
- `delegate dispatch-deliver`
- `delegate return-drop`
- `delegate return-dir`
- `delegate session-capture`
- `delegate session-terminate`
- `delegate session-list`

All contract commands emit JSON. Failure shape is `{ ok, error_code, message, evidence_path, recoverable }`.
