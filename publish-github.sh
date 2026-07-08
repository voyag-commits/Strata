#!/usr/bin/env bash
# Publish SCTL WSL distro to GitHub: code to repo main, tarballs to a Release.
# Prereq: run `gh auth login` once (or export GITHUB_TOKEN).
set -euo pipefail

# ---- configure these two lines ----
OWNER="${GITHUB_OWNER:-hou16}"          # your GitHub username/org
REPO="${GITHUB_REPO:-sctl-wsl-distro}"  # repo name
ASSETS_DIR="${ASSETS_DIR:-/mnt/c/Users/hou16/Downloads/SCTL_invariant_manuals}"
# -----------------------------------

export PATH="$HOME/.local/bin:$PATH"

cd "$(dirname "$0")"

echo "==> Checking gh auth..."
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }

echo "==> Creating public repo $OWNER/$REPO (if missing)..."
gh repo create "$OWNER/$REPO" --public --source=. --description "SCTL Strata WSL Distro Appliance (edition 2026-07-07) — exact code copy + proven cycle harness" --push 2>/dev/null \
  || { echo "repo may already exist; setting remote and pushing..."; }

# Ensure remote + push main
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/$OWNER/$REPO.git"
fi
git push -u origin main

echo "==> Creating Release (edition 2026-07-07) and uploading tarball assets..."
gh release create "edition-2026-07-07" \
  --repo "$OWNER/$REPO" \
  --title "SCTL WSL Distro — Edition 2026-07-07" \
  --notes "Prebuilt WSL2 rootfs tarballs for the SCTL appliance (edition 2026-07-07).

Includes:
- MyDistro-arm64.tar (~822 MB, aarch64)
- MyDistro-amd64.tar (~789 MB, x86_64)
- install-arm64.ps1 / install-amd64.ps1 (Windows installers)

Verify integrity with the SHA256 checksums in RELEASE_MANIFEST.md.

A proven 3-cycle live run is logged in evidence/ (assignment A_APPLIANCE_20260707T143943Z, result OBSERVED)." \
  "$ASSETS_DIR/MyDistro-arm64.tar" \
  "$ASSETS_DIR/MyDistro-amd64.tar" \
  "$ASSETS_DIR/install-arm64.ps1" \
  "$ASSETS_DIR/install-amd64.ps1"

echo "==> Done. Repo: https://github.com/$OWNER/$REPO"
echo "    Release: https://github.com/$OWNER/$REPO/releases/tag/edition-2026-07-07"
