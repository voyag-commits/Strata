# SCTL v0.9.4 Human Test Report

## Environment

- Date:
- OS / WSL distro:
- Node version:
- tmux version:
- Runtime-edge CLI path:
- Launcher used:

## Backend verification

```text
npm test:
npm run secret-scan:
sha256sum -c PACKAGE_CHECKSUMS.sha256:
```

## Live session verification

```text
session created:
dispatch rendered:
dispatch injected:
worker returned packet:
return classified:
session captured:
session retired:
```

## Evidence paths

```text
.strata/context/D_trace/dispatch_packets/...
.strata/context/D_trace/return_ledgers/...
.strata/context/C/sessions/lifecycle/...
.strata/evidence/...
```

## Result

```text
accepted / rejected / accepted with notes
```
