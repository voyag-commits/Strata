<#
.SYNOPSIS
  Install the Strata SCTL appliance WSL distro (amd64) from MyDistro-amd64.tar.
.DESCRIPTION
  Imports the prebuilt amd64 rootfs as a new WSL2 distro named "SCTL-A004-amd64",
  creates the strata user default, and runs first-boot locale generation.
  For x64 Windows hosts only.
.PARAMETER DistroName
  Name for the imported distro. Default: SCTL-A004-amd64
.PARAMETER TarPath
  Path to MyDistro-amd64.tar. Default: same directory as this script.
.PARAMETER InstallDir
  Where to store the distro VHDX. Default: $env:LOCALAPPDATA\WSL\SCTL-A004-amd64
.EXAMPLE
  .\install-amd64.ps1
  .\install-amd64.ps1 -DistroName MyStrata -TarPath C:\tars\MyDistro-amd64.tar
#>
param(
  [string]$DistroName = "SCTL-A004-amd64",
  [string]$TarPath = "",
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"

# Default tar path: same dir as this script
if (-not $TarPath) {
  $TarPath = Join-Path $PSScriptRoot "MyDistro-amd64.tar"
}
if (-not $InstallDir) {
  $InstallDir = Join-Path $env:LOCALAPPDATA "WSL\$DistroName"
}

# Verify arch
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
if ($arch -ne "X64" -and $arch -ne "x64") {
  Write-Warning "This amd64 build is optimized for x64 Windows. Detected arch: $arch"
  Write-Warning "If you are on ARM64 Windows, use install-arm64.ps1 instead."
}

# Verify tar exists
if (-not (Test-Path $TarPath)) {
  Write-Error "Tar file not found: $TarPath"
  exit 1
}

# Verify wsl.exe exists
$wslExe = "wsl.exe"
if (-not (Get-Command $wslExe -ErrorAction SilentlyContinue)) {
  $wslExe = "$env:SystemRoot\System32\wsl.exe"
}
if (-not (Test-Path $wslExe)) {
  Write-Error "wsl.exe not found. Ensure WSL2 is installed."
  exit 1
}

# Check if distro already exists
$existing = & $wslExe -l -q 2>&1 | ForEach-Object { $_.Trim() } | Where-Object { $_ -eq $DistroName }
if ($existing) {
  Write-Warning "Distro '$DistroName' already exists. Uninstalling..."
  & $wslExe --unregister $DistroName
  Start-Sleep -Seconds 2
}

# Create install directory
if (-not (Test-Path $InstallDir)) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Write-Host "===== Importing $DistroName from $TarPath =====" -ForegroundColor Cyan
Write-Host "  Install location: $InstallDir"
Write-Host "  Tar: $TarPath ($([math]::Round((Get-Item $TarPath).Length / 1MB, 1)) MB)"
Write-Host ""

& $wslExe --import $DistroName "$InstallDir" "$TarPath" --version 2
if ($LASTEXITCODE -ne 0) {
  Write-Error "WSL import failed with exit code $LASTEXITCODE"
  exit 1
}

Write-Host "===== Import complete. Running first-boot configuration... =====" -ForegroundColor Cyan

# First-boot: generate locale, verify appliance
$firstBootScript = @'
set -e
export DEBIAN_FRONTEND=noninteractive
# Generate locale
if [ -f /etc/locale.gen ]; then
  sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen
  locale-gen en_US.UTF-8 2>/dev/null || true
  update-locale LANG=en_US.UTF-8 2>/dev/null || true
fi
# Source appliance env
source /etc/profile.d/strata-appliance.sh 2>/dev/null || true
# Verify key components
echo "=== Verification ==="
echo "OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2)"
echo "Arch: $(uname -m)"
echo "Node: $(node --version 2>/dev/null || echo MISSING)"
echo "npm: $(npm --version 2>/dev/null || echo MISSING)"
echo "git: $(git --version 2>/dev/null || echo MISSING)"
echo "tmux: $(tmux -V 2>/dev/null || echo MISSING)"
echo "strata-cycle: $(which strata-cycle 2>/dev/null || echo MISSING)"
echo "volume.js DoD: $(node -e "require('/home/strata/workspace/codebase/src/volume.js').boxVolume(2,3,4)===24 ? console.log('PASS') : process.exit(1)" 2>/dev/null || echo FAIL)"
echo "=== First-boot complete ==="
'@

$encodedScript = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($firstBootScript))

& $wslExe -d $DistroName -u root -- bash -c $firstBootScript

Write-Host ""
Write-Host "===== Installation Complete =====" -ForegroundColor Green
Write-Host "  Distro: $DistroName"
Write-Host "  Default user: strata (set in /etc/wsl.conf)"
Write-Host ""
Write-Host "  To start: wsl -d $DistroName"
Write-Host "  To run a cycle: strata-cycle start --director-entry ~/director_entry/director_governing_entry.md --cycles 3"
Write-Host ""
Write-Host "  NOTE: Before running live cycles, configure the bridge:" -ForegroundColor Yellow
Write-Host "    1. Copy /home/strata/.codex-deepseek/bridge.env.template to bridge.env"
Write-Host "    2. Fill in DEEPSEEK_API_KEY and BRIDGE_AUTH_KEY"
Write-Host "    3. Run: strata-appliance configure-key <YOUR_KEY>"
