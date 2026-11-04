# Source-bound detailed-street closure

This is a bounded implementation design, not an installed repair or release approval. It uses the `9413c1f5…` corrected source and the immutable `db6d8f69…` ordinary model for classification. The current `875b620c…` core candidate and its eventual solved replacement require a fresh endpoint/finite-surface inventory before these selections become generator inputs.

## What the existing assessment actually permits

The 300 historical endpoint cases partition into 244 unannotated modeled approaches, 45 connectors touching a positive/bridge annotation, and 11 verified negative-facility connections. At 6.5% necessary graph grade, 275 are compatible with the fixed core anchors, while 25 endpoint cases belong to 20 conflicting anchor components. The 453 changed detailed streets are a mathematical preview, not 453 approved ramps. A positive annotation on an incident arterial does not declare the intersecting side street a bridge.

The compatible unannotated approaches include 134 endpoints at or below 1.2 modeled metres and 96 above it. Treating the latter as generic elevated roads would emit new bridge soffits/parapets/piers and widen some roads to 8.4 metres. That is a separate construction error even if endpoint elevations match.

The existing structural review's 15 complete all-core-arm lowering options are not independent fixes. Its completeness check follows the incident **core** arms, not every tile path to another fixed core anchor. Two concrete counterexamples are:

| Detailed street | Core junction A | Core junction B | Current difference / distance |
| --- | --- | --- | --- |
| `d0bcbe1a-e95_0` | `0ccbfc54-d66`, `16dffd33-695_0/_1`, 1.401122 m | `c50f5448-3f3`, `aa4babfe-ea9_1/_2`, 14.956065 m | 13.554943 m / 11.845674 m |
| `d8e64de7-5e9_0` | `40fb1c9b-0f7`, `16dffd33-695_1/_2`, 1.784843 m | `5243d498-ead`, `aa4babfe-ea9_0/_1`, 15.372927 m | 13.588085 m / 11.853270 m |

Both core families are named Gachibowli–Miyapur Highway. Lowering only junction A to zero makes these already incompatible links worse. Include both families, both detailed links and every intervening/incident arm in one source-classified component before solving. A road name alone does not authorize co-elevation: resolve the local source levels and independent crossings of the high family first.

The local source classification is now retained in `evidence/reported-roads/pjr-connected-apron-classification-9413.json`, SHA-256 `1923456828cbe45758e3d5d029032c63efa4603cd74705c2a08ec326f2c70e0c`. All six relevant arterial families (`16dffd33`, `aa4babfe`, `06d97f13`, `89fff17f`, `6fb8ff9b`, `09e888db`) have no level or bridge/tunnel flag anywhere in their full original sources. The high `aa4babfe` family receives its 19.218 m node datum from the connected PJR flyover `cf8dc5e0` at `15dc64bf-78b`. A new full-source query establishes that this common connector is at source fraction zero, **outside** PJR's declared bridge; its first declared bridge interval begins at fraction `0.013258469`, 18.210 geodesic metres from that node. PJR's later relative levels are 3/2/3; those levels do not establish a surveyed 20.4 m height at the connection. The artifact binds nine full source rows, twelve incident core arms, and both raw-source/model hashes. This supports examining the connected approach jointly; it does not waive later independent crossings or install a flatter ramp.

## Resolve source ambiguity before creating any ramp

The original retained query omitted `subclass`. A new bounded anonymous query of all 31 unique `unknown` detailed-road source IDs (37 endpoint cases) is retained in `evidence/reported-roads/tile-unknown-subclass-source-9413.json`, SHA-256 `fb59486b7bdb0fdb8402b00384a932ce3e8206ed6256450c59690df5db286dad`. All 31 have subtype `road`, class `unknown`, and null subclass/surface. Twenty-nine are TomTom-only with no access rule; two are OSM-derived with a backward-access denial. This does **not** prove that any are steps, that they are motor-vehicle roads, or that they can be deleted.

In particular, `abebcb35-468_0` is a 5.306 m TomTom-only link from the PV flyover's 6.8 m modeled connector to a zero-modeled core connector. `d17394f6-d0c_0` is another 10.323 m PV link; `e03e888d-2cd_0` is an 11.029 m Nallagandla link. Do not turn them into 60–128% slopes, invent a new road bridge, or lower a genuinely ordered independent bridge crossing to satisfy them. They require an explicit source-consistency decision. Unknown class alone is not a rejection rule.

Official Overture documentation distinguishes road subtype (which includes footpaths), unknown class (missing source class), physical connectors, and application-resolved implied access. See [segments and connectors](https://docs.overturemaps.org/guides/transportation/segments-and-connectors/) and [road restrictions](https://docs.overturemaps.org/guides/transportation/roads/). The absence of vertical tags is not a surveyed ground elevation.

## Smallest useful implementation sequence

1. **One joint offline component graph.** Add the selected detailed streets as ordinary constrained variables, not frozen zero-height obstacles, and expose incident unprotected core approaches as variables. Begin with the 20 anchor-conflict components and the 15 structurally complete core candidates; union components through shared roads/nodes before imposing a target. Retain canonical rail, verified underpass, exact local positive/negative source spans, and independent finite crossing headroom. Do not force zero at the next split merely because the detailed pack omitted elevation. Preserve the existing numerical grade/grade-change, all-arm, true-triangle and body-clearance limits.
2. **Prefer removal of generated humps where justified.** On an unprotected, source-unannotated component, minimize deviation from the original detailed-road modeled datum and total elevation variation. The target remains a modeling choice, not a claim of surveyed zero ground. Any old headroom constraint that conflicts with a verified physical connection must be explicitly classified at its actual overlap component; do not add a name-wide waiver.
3. **Only then emit detailed profiles.** Freeze the final solved core. Rerun the complete source-normalized owner/context inventory and all-anchor grade closure, densify offline with the existing tile transport, preserve PRE-height `joinedPavement` widths, and write exact elevation-only `tileProfiles`. The existing runtime stages already support this transaction. No full-city graph or profile interpolation belongs in startup or the tile worker.
4. **Represent grounded construction explicitly where it is still required.** If source-classified, feasible detailed approaches remain above 1.2 m, add small reviewed per-segment construction metadata; do not infer construction from height. Its immutable proof must identify source IDs/intervals, the exact conditioned road input and preserved pre-height pavement width. A grounded interval is an inferred earth-supported approach, never a new bridge declaration. No negative interval may be selected by this mechanism.
5. **Close the physical proof before activation.** Regenerate final L/R footprints after all height/width/construction metadata. Export historical actual triangles for the complete changed core/detailed ID set. Recheck source nodes, all 300 old cases plus newly found cases, all-arm ambiguous connectors, literal owner/context meshes, body/tyre/soffit clearances and known reported drives. Only a complete coherent set can unlock the existing source/profile/cache activation gates.

## Grounded-construction contract if step 4 is necessary

The smallest new contract is a reviewed segment classification on the already resampled road, rather than a generic `isBridge` boolean. Use a finite segment-length array (or equivalent exact arc intervals) whose default is the legacy construction and whose explicit value is `groundedApproach`. Include a release/proof binding. The generator must reject wrong length, non-finite bounds, stale inputs, negative profiles, positive/bridge/tunnel source overlap, canonical-rail conflict and ambiguous ownership. Preserve metadata identically across owner and context copies and through core/cache structured cloning.

Consumer changes must be coordinated:

| Consumer | Required treatment |
| --- | --- |
| `road-pavement.ts` | Preserve the already reviewed pre-height width; no implicit 8.4 m floor on a grounded approach. Keep the original corridor for conservative scenery exclusion. |
| `city.ts` road drawing/support | Keep the same final finite asphalt triangles for render and drive support. Emit a closed earth/retaining skirt to the existing modeled terrain only for the reviewed grounded interval. Do not leave floating asphalt. Clip to real tile ownership, preserve water and genuine crossing clearances. |
| `city.ts` elevated-deck branch | Skip bridge soffit/parapet/pier creation on grounded intervals; do not accidentally skip the asphalt or actual road support. Retaining boundaries must undergo the same finite-road clipping/clearance checks as other walls. |
| `structure-clearance.ts` support planner | Skip pier candidates on grounded intervals. Keep scenery exclusion around both old and new corridors. A blanket global suppression of piers is not acceptable. |
| profile/model/transport binding | Include the classification in exact `ProfileInput` matching, validation, cloning, cache fingerprints and generation-stage equality. Repeated application must remain atomic and idempotent. |
| release exporter/auditor | Observe the actual emitted earth/retaining structure and asphalt; do not substitute an analytic profile for actual triangles or suppress a wall-body failure. |

This contract is intentionally unimplemented until an approved final component actually needs a grounded positive approach. If coherent core lowering removes the positive cases, do not add unused runtime machinery.

## Required negative controls

- A 5 m unknown link between 0 and 6.8 m cannot be accepted by expanding slope limits or by calling it a bridge.
- Lowering one of the two Gachibowli–Miyapur examples alone must remain infeasible.
- A valid unprotected approach can change modeled datum without creating a pier, while an adjacent genuinely declared bridge retains its construction and independent crossing clearance.
- Height changes do not widen a 5.5 m detailed street to 8.4 m; source lane capacity and all full-vehicle passages remain checked.
- A grounded interval cannot erase a real underpass, tunnel or rail crossing, and its retaining wall cannot obstruct another drivable branch.
- Every changed owner/context copy has identical conditioned input and result. Missing, stale or partial metadata prevents the entire stage from installing.

No runtime source, pack, geometry, activation manifest or Site was changed by this design/source audit.
