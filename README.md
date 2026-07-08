# SCTL — Strata WSL Distro Appliance

A self-contained WSL2 appliance for running the Strata SCTL (Strata Control / Trunk Loop) live cycle harness with a Codex/DeepSeek-backed disposable-worker model. This repository contains the **exact code copy** extracted read-only from the registered `SCTL` WSL2 distro (edition 2026-07-07), plus the operator manuals, packaging acceptance checklist, and proven-cycle evidence.

The two large rootfs tarballs (~822 MB arm64, ~789 MB amd64) are **not** tracked in git — they are distributed as [GitHub Release assets](./RELEASE_MANIFEST.md).

---

## What is in this repo

```
.
├── opt/strata/                      # appliance code (exact copy from /opt/strata in SCTL)
│   ├── source_sctl/                 # SCTL kernel (CLI, flowmaps, lib, scripts, tests)
│   ├── runtime-delegate/            # runtime delegate control surface (compiled dist + source)
│   ├── bridge/                      # DeepSeek Responses bridge (source + dist; node_modules excluded)
│   └── appliance/                   # appliance API server + verify scripts + bin wrappers
├── usr/local/bin/                   # operator-facing CLI wrappers
│   ├── strata-cycle                 #   live cycle harness wrapper (the main entry point)
│   ├── strata-appliance             #   appliance control (key/bridge/api/verify)
│   ├── strata-tui                   #   TUI launcher
│   ├── strata-delegate-clean        #   delegate state cleanup
│   ├── strata-delegate-clean-check  #   cleanup verification
│   └── sctl                         #   kernel CLI shim
├── etc/
│   ├── profile.d/strata-appliance.sh          # appliance env wiring (sourced on login)
│   ├── profile.d/strata-runtime-codex-bridge.sh
│   └── wsl.conf                               # WSL2 distro config (default user strata)
├── home/strata/
│   ├── bin/                         # launcher scripts (strata-codex-local, automation)
│   ├── director_entry/              # Director Entry inbox (operator-authored governing entry)
│   ├── .codex/                      # codex config (non-secret: config.toml, bridge config, skills)
│   └── .codex-deepseek/             # bridge env TEMPLATE only (bridge.env is gitignored)
├── docs/adr0626/                    # runtime delegate design ADRs
├── evidence/                        # proven-cycle operational log
├── manual.md                        # full command manual (start here)
├── install-arm64.ps1                # Windows installer (arm64) — also a Release asset
├── install-amd64.ps1                # Windows installer (amd64) — also a Release asset
├── CHANGELOG_20260707.md            # edition change log + verification
├── packaging_acceptance_checklist.md
├── context_repo_design.md
├── cli_manual_addendum.md
├── cli_manual_commands_and_analysis.md
├── live_cycle_operation_guide.md
├── prompt_engineering_optimization.md
├── requirements_prebuilt.zh.md
└── RELEASE_MANIFEST.md              # tarball checksums + edition info
```

## The main cycle command

Once the distro is imported and the DeepSeek key is configured, the entire live cycle harness is driven by one wrapper command:

```bash
strata-cycle start --director-entry ~/director_entry/director_governing_entry.md --cycles 3
```

This runs a real, model-backed trunk-based disposable-worker cycle: Director Entry → Class A commit → coordinator dispatch → author session → reviewer session → Class B promotion → cycle exit. See `manual.md` §3 for the full parameter surface.

## Proven cycle

A full 3-cycle run was completed on 2026-07-07 and is logged in `evidence/A_APPLIANCE_20260707T143943Z_operational.log`:

- Assignment: `A_APPLIANCE_20260707T143943Z`
- Window: 14:39:43Z → 14:51:30Z
- Result: **OBSERVED** (all 3 cycles BEGIN/END; SCTL context Git clean at final audit)
- 0 codebase-git operations (zero-contact harness, per `CHANGELOG_20260707.md`)

## Installing the distro (from a Release)

1. Download `MyDistro-<arch>.tar` and `install-<arch>.ps1` from the GitHub Release (see `RELEASE_MANIFEST.md` for checksums).
2. In PowerShell, from the directory containing both files:

   ```powershell
   .\install-arm64.ps1        # on ARM64 Windows (Snapdragon X, Surface Pro X)
   .\install-amd64.ps1        # on x64 Windows
   ```

   This imports the tar as a WSL2 distro named `SCTL-A004-<arch>`, creates the `strata` default user, and runs first-boot verification.

3. Enter the distro and configure the DeepSeek key:

   ```bash
   wsl -d SCTL-A004-arm64
   strata-appliance configure-key "sk-..."   # or run with no arg to be prompted
   strata-appliance status                   # expect key_configured=yes
   ```

4. Run a cycle:

   ```bash
   strata-cycle start --director-entry ~/director_entry/director_governing_entry.md --cycles 3
   ```

## Repository provenance

- **Source:** read-only `tar` extraction from the registered `SCTL` WSL2 distro (edition 2026-07-07). No file inside the distro was modified during extraction.
- **Exclusions:** regenerable `node_modules/`, runtime state (sqlite logs, history, sessions), and secrets (`bridge.env`, bridge pid/log/trace). A sanitized `bridge.env.template` is provided.
- **Total code size:** ~3.6 MB (well under the 80 MB target).
- **Secret scan:** clean — all `DEEPSEEK_API_KEY`/`BRIDGE_AUTH_KEY` references are env-var *names* in code, not values. Test fixtures use clearly-redacted fake keys.

## Layout note

The `opt/`, `usr/`, `etc/`, and `home/` trees mirror their absolute paths inside the distro (`/opt/strata`, `/usr/local/bin`, `/etc/profile.d`, `/home/strata`). This makes the repo a faithful filesystem snapshot of the appliance's code, suitable for inspection, audit, and rebuild.
