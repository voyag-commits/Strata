#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="/mnt/c/Users/hou16/Downloads/Codex_CLI_agent fleet/_package_patch_v0_9_4_simplified_runtime/strata_sctl_kernel_components_1_3_4_package_v0_9_4_simplified_runtime"
RUNTIME_EDGE_ROOT="/mnt/c/Users/hou16/Downloads/Codex_CLI_agent fleet/strata_runtime_edge_launcher_delegate_component2_3_v0_9/strata_runtime_edge_launcher_delegate_component2_3_v0_9"
SCTL_WORKSPACE="/home/hou16/sctl-live-test-A_LIVE_001"
CODEBASE_REPO="/home/hou16/workspace/AAU_MED_EM_ENSEMBLE_HEATMAP_STUDENT_ASSIGNMENT"

"$PACKAGE_ROOT/scripts/flowmap02/live_cycle_harness.sh" \
  --assignment-id A_FLOWMAP_02_006 \
  --package-root "$PACKAGE_ROOT" \
  --runtime-edge-root "$RUNTIME_EDGE_ROOT" \
  --sctl-workspace "$SCTL_WORKSPACE" \
  --codebase-repo "$CODEBASE_REPO" \
  --short-name sample-uniform-sphere-v3 \
  --objective "Implement one small assigned nuclear-physics simulation codebase change." \
  --return-timeout 300 \
  --allow-merge
