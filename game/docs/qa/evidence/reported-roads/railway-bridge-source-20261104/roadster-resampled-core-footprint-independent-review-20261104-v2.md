# Independent resampled core footprint review

All 32 resampled centerlines preserve their old paths. All 147 old vertices appear exactly and in order among 997 new controls; added points lie on their bracketed old segments with maximum residual 9.095e-13 m. All road fields except pts/elev remain unchanged, including nominal width and lane count.

**The footprints are measurably different.** Recomputed cross-sections change 27 of the 32 strip polygon unions. Total added area is 131.929974 m² and removed area is 4.583921 m². Five roads remain equivalent within the stated numerical tolerances.

Hafeezpet to KPHB Road (`b58696ab-7de_0`) has the largest change: new L/R points move up to 4.353534 m from old linear interpolation, and retained old-vertex edges move up to 2.515249 m. Its strip adds 102.118447 m² and removes 1.910360 m², giving 104.028807 m² symmetric difference (2.685463% of old area). Boundary discrete Hausdorff distance is 2.751005 m.

No nominal width or lane-count reduction was found. Each new cross-section length equals nominal road width within 2.070e-12 m. Actual usable width and vehicle capacity were not tested; orientation-dependent projected-width differences do not establish a capacity regression. Changed physical support still requires fresh clearance and vehicle checks.

Separate junction caps, fans and joins were not supplied. The union comparison covers the literal L/R span triangles only. No cap equality, global geometry, runtime, native or release approval is claimed.

## Per-road comparison

| Road | Old → new controls | Edge delta m | Added m² | Removed m² | Symmetric difference m² |
| --- | ---: | ---: | ---: | ---: | ---: |
| `b58696ab-7de_0` | 10 → 135 | 4.353534 | 102.118447 | 1.910360 | 104.028807 |
| `68640954-01c_0` | 4 → 14 | 0.942387 | 6.372734 | 0.818616 | 7.191350 |
| `32aff194-9eb_0` | 4 → 14 | 1.091139 | 6.265403 | 0.801360 | 7.066763 |
| `c4ba04e8-e09_0` | 10 → 60 | 0.422105 | 2.939467 | 0.048832 | 2.988300 |
| `6b6a0ce1-e3b_1` | 5 → 40 | 0.398965 | 2.140942 | 0.011350 | 2.152292 |
| `05498b19-5b6_0` | 5 → 60 | 0.715204 | 2.021875 | 0.080048 | 2.101923 |
| `1f1fb6e4-96b_0` | 6 → 54 | 0.247595 | 1.251099 | 0.003224 | 1.254323 |
| `3d9aa836-1ed_0` | 3 → 9 | 0.673401 | 1.092051 | 0.041676 | 1.133727 |
| `32a507e4-5aa_0` | 6 → 27 | 0.418809 | 1.059484 | 0.070497 | 1.129981 |
| `dc0863d0-7bd_0` | 4 → 20 | 0.522393 | 1.024531 | 0.022539 | 1.047070 |
| `8c1a8114-76e_0` | 7 → 64 | 0.427490 | 0.951619 | 0.047163 | 0.998783 |
| `1f5fa9b1-c69_0` | 8 → 38 | 0.328538 | 0.971057 | 0.022776 | 0.993833 |
| `d95cc878-ba1_0` | 4 → 21 | 0.446501 | 0.917360 | 0.055243 | 0.972603 |
| `1b18a8b5-0c9_0` | 3 → 19 | 0.374550 | 0.811450 | 0.008457 | 0.819907 |
| `23b2a161-305_0` | 8 → 42 | 0.206422 | 0.639647 | 0.008461 | 0.648108 |
| `be8a637e-7d1_0` | 4 → 25 | 0.387358 | 0.433410 | 0.018119 | 0.451529 |
| `9a295069-94d_1` | 5 → 20 | 0.234279 | 0.191470 | 0.185095 | 0.376565 |
| `63b6ecd9-48a_3` | 5 → 17 | 0.139085 | 0.066676 | 0.219636 | 0.286312 |
| `fc2c430b-b68_0` | 4 → 40 | 0.182467 | 0.254039 | 0.002861 | 0.256900 |
| `fb942a33-fec_2` | 3 → 40 | 0.037843 | 0.005550 | 0.172949 | 0.178499 |
| `0b0d0d3b-967_1` | 4 → 21 | 0.090842 | 0.060427 | 0.021957 | 0.082384 |
| `0ea90a50-997_0` | 4 → 32 | 0.097544 | 0.070643 | 0.001317 | 0.071960 |
| `4c5f6856-b6e_0` | 5 → 31 | 0.098808 | 0.068589 | 0.001445 | 0.070034 |
| `12cf788f-45b_0` | 4 → 45 | 0.144410 | 0.057239 | 0.005294 | 0.062533 |
| `67c354a6-4ae_0` | 4 → 26 | 0.134808 | 0.057452 | 0.002819 | 0.060271 |
| `c517838c-067_0` | 5 → 27 | 0.137606 | 0.047444 | 0.001736 | 0.049180 |
| `d24d2209-179_0` | 3 → 14 | 0.088491 | 0.039869 | 0.000091 | 0.039959 |
| `f9ca4507-643_1` | 2 → 6 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `f9ca4507-643_0` | 2 → 4 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `ac12b38b-d3e_0` | 2 → 6 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `cfdfba4a-fac_0` | 2 → 13 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |
| `95b71ab7-702_0` | 2 → 13 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |

## Bound inputs

| Input | SHA-256 |
| --- | --- |
| `/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/model-be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7.json` | `be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7` |
| `/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/footprints-5697db58a197b3037e10c77e48cdb64dd16890b0cd5ad15a09ad1d119a95176a.json` | `5697db58a197b3037e10c77e48cdb64dd16890b0cd5ad15a09ad1d119a95176a` |
| `/tmp/source-9413-researched-rail-facilities-world-v1.json` | `939084750f6d0c3a8acf92acff8feb378fde06c11c96b98128d711394c23945f` |
| `/tmp/source-9413-researched-rail-facilities-world-footprints-v1.json` | `be92dcc01938888de2f947965e006d4c20162e9f462b793ad4d6c4eac99acd33` |

## Receipts

- [Machine-readable review](/tmp/roadster-resampled-core-footprint-independent-review-20261104-v2.json) — SHA-256 `e09568614c88728309322b7de08eab347360d6cc87d2214789544d03373a1bdb`.
- [lineage](/tmp/roadster-resampled-footprint-lineage-independent-20261104.json) — SHA-256 `2fcfaf101af1d1f2ffad2119017d5d128e24e9a2454e7fb38966e1d3976edb0d`.
- [union](/tmp/roadster-resampled-footprint-union-independent-20261104-v2.json) — SHA-256 `e87c8d99235126a94cdf03c3d2242e9342fe39b8453ae77b9753c5db5aa252b6`.
- [lineageGenerator](/tmp/roadster-resampled-footprint-lineage-independent-20261104.py) — SHA-256 `63cb181c96fce390845ff734087fc85200ab09b0fbecea9efaa3f211f955c6fe`.

Polygon unions use floating-point GEOS operations without snapping or simplification. Hausdorff results are discrete boundary measurements. All geometry checks were confined to the 32 resampled roads.
