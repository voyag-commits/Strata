# Release Manifest — SCTL WSL Distro (edition 2026-07-07)

WSL2 rootfs tarballs and installers are distributed as **GitHub Release assets**, not tracked in git. This manifest records their checksums and sizes for verification.

## Assets

| Asset | Arch | Size | SHA256 |
|---|---|---|---|
| `MyDistro-arm64.tar` | aarch64 | 861,368,320 B (~822 MB) | `745d31275e0f5967c6a170d68c4c1d30fdda6508374c2e4e21533fb85bd72c31` |
| `MyDistro-amd64.tar` | x86_64 | 826,583,040 B (~789 MB) | `68b5e3883dcf991a10502e708649aeae86f107d512cd282b6161be754cb7a33f` |
| `install-arm64.ps1` | arm64 | 4,467 B | `6f02d1fc64cc3085828c9db1aa16983de017a600b075a81402efc11383eaeb7f` |
| `install-amd64.ps1` | amd64 | 4,538 B | `65997a59fb547570f871734f941f08862f06d5a7d0d8a8edbbf54f534421ed70` |

## Edition

- **Edition date:** 2026-07-07
- **Source distro:** registered WSL2 distro named `SCTL`
- **Tar build timestamps:** arm64 2026-07-07T23:46:06+08:00; amd64 2026-07-07T23:45:40+08:00

## Verification

After downloading a release asset, verify its integrity:

```bash
sha256sum -c <<'CHECKSUM'
745d31275e0f5967c6a170d68c4c1d30fdda6508374c2e4e21533fb85bd72c31  MyDistro-arm64.tar
68b5e3883dcf991a10502e708649aeae86f107d512cd282b6161be754cb7a33f  MyDistro-amd64.tar
CHECKSUM
```

## Proven cycle evidence

A full 3-cycle live run was completed on 2026-07-07 (14:39:43Z → 14:51:30Z, assignment `A_APPLIANCE_20260707T143943Z`, overall result **OBSERVED**). The operational log is committed in `evidence/A_APPLIANCE_20260707T143943Z_operational.log`. See `CHANGELOG_20260707.md` for the verification summary.
