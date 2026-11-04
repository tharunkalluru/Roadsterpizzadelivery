# Independent Anandbagh negative-profile control classification

This review distinguishes generated approaches from the existing canonical underpass interior. It approves no height change or new underpass. The current necessary subsets remain infeasible under the existing 15 cm budget.

Receipt: `docs/qa/evidence/reported-roads/anandbagh-fold-controls-independent-9413-20261103.json`, SHA256 `43c22f6f8fbb084e0f5a735bfb427ec1621f1deadcabdc3276221f9a03a3718f`.

Inputs remain bound to core model `be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7`, actual L/R `5697db58a197b3037e10c77e48cdb64dd16890b0cd5ad15a09ad1d119a95176a`, approved source generation 9413, the exact official source records and primary's necessary-subset v2 evidence. No source/model/profile/LP/manifest is modified.

## Independent checks

The road cross-sections come from the actual held L/R footprints. Shapely forms the union of each pair of literal pavement triangles, then measures its distance to all 816 canonical staged railway profiles. Controls touching an adjacent quad within 4.2 m of a railway remain frozen. This is independent geometry code, rather than a call to the solver's distance routine. Its classification agrees with every rail flag present in primary's per-control evidence.

Control source fractions are independently projected onto the approved corrected source geometry, preserving the corresponding official full-source fractions and rejecting a distant competing branch. Projection residuals are subnanometre for these held controls; fractions agree with primary's records within `1e-8`.

Both roads are the existing source-confirmed Anand Bagh underpass. Source negative/tunnel ranges verify the facility, not measured metric depth. Neither raw source profile supplies a surveyed elevation array.

| Road | Endpoints | Canonical rail controls | Other tagged tunnel approaches | Exterior generated/recovery controls |
|---|---:|---:|---:|---:|
| `28b00d08-4ff_1` | 2 | 8 | 20 | 38 |
| `01ceee91-29b_0` | 2 | 8 | 20 | 40 |

The existing `-6.5 m` floor controls fall within the canonical rail set. Preserve all endpoints, those canonical controls and the existing negative floor exactly. Generated controls inside the source tunnel range remain distinguishable from the canonical rail interior; their metric approach values are estimates. This distinction is a classification, not permission to change the profile without a feasible bounded candidate.

## Exact remaining failures

- `28b00d08-4ff_1`: control 14 at model arc `39.24507398744244 m`, official source fraction `0.5053442180453717`, Y `-6.241989164205602 m`, is a generated tunnel approach outside the actual finite rail corridor. Control 15 at arc `43.21447146120241 m`, Y `-6.5 m`, is an immutable canonical rail/floor control. Primary's necessary subset violates the unchanged smoothness bound at control 15 even with the full allowed 15 cm adjustment. Do not silently move the floor or exceed the budget.
- `01ceee91-29b_0`: controls 29/30 at arcs `99.55905000684469 / 99.74871204898194 m`, source fractions `0.29511637237150284 / 0.2956787606713159`, are generated exterior recovery controls, outside the source negative interval and actual rail corridor. They are also outside the currently released fold/recovery window. The literal triangle's `0.032433735912515874 m` perpendicular run carries `0.012328032738921468 m` height difference, exceeding primary's `0.0032271567232953296 m` bound. The existing selected window cannot fix that fixed segment.

Primary's 153/144 fold rows and the two necessary-subset failures remain open. A legitimate next candidate may investigate only identified generated approaches, with explicit finite windows and all original source/endpoints/rail/floor protections. It must independently pass actual geometry, full vehicle contacts, grade/smoothness and crossing headroom. This review does not enlarge the 15 cm policy, flatten the real underpass, treat negative signs as a new survey, or waive a body intersection.

## Reproduce

```sh
PYTHONPATH=/tmp/road-xz-qualifier-deps python3 scripts/qa/classify-anandbagh-fold-controls-independent.py --output /tmp/NEW-anandbagh-control-review.json
```
