# Source Artifacts And Checksums

Assembled from preserved local artifacts:

| Artifact | Role | SHA256 |
| --- | --- | --- |
| `_deliveries/strata_sctl_kernel_components_1_3_4_package_v0_9_4_delivery_20260613_151301.zip` | Baseline SCTL delivery package, docs, tests, adapters | `3B188E7CD2B6BB5561FFE2BCF09B113AC8FC80F3AB733387A2C89F4AF3E0AAA2` |
| `_deliveries/flowmap02_harness_multicycle_patch_20260613T122730Z.zip` | Preserved Flowmap 02 multicycle harness overlay | `67EEB46C866B3C13AD5ED15ECC03D901FE5D778BE5458A50C18FA5CE2B99DA01` |
| `_deliveries/flowmap02_A007_three_cycle_run_20260613T121734Z_logs.zip` | External evidence archive for accepted A007 run; referenced, not bundled as source | `0C76023B27466C645FA8251C8B2F511519DE76C484714D7C02F80E998ABF4FA0` |
| `strata_runtime_edge_launcher_delegate_component2_3_v0_9.zip` | External runtime-edge launcher source dependency; referenced, not bundled as SCTL source | `246FFA85FB7B7C3D15B54663EBB0CF9910EB4A314981986843CF7D09CE05C679` |

Assembly notes:
- The baseline SCTL package was expanded first.
- The preserved multicycle Flowmap 02 harness was copied into `flowmaps/flowmap02/` for this repository layout.
- No files from the discarded compact Class B export experiment were used.
