# Explicit face annotations and meal contact review — November 3

The proportional head-height mouth heuristic is removed. Root's native Arjun
review proved that a geometrically near tip could still be aimed at the nose.
The production layer now requires a reviewed, exact-GLB-SHA-bound annotation;
the source data now contains Root's seventeen natively approved annotations,
independently checked against their exact source meshes and native screenshots.
There is no generic mouth or eating fallback for a missing/invalid annotation.

The production-asset viewer exposes Pick Mouth, preview marker/mask, speech
amplitude, explicit approval and Download All Annotations JSON. The native click
raycasts the actual skinned/static visible surface, records exact mesh path,
position count, triangle/barycentrics, Head-local point and sparse lip vertices.
Its temporary local records are distinct from production data. Static Arundhati
can use this explicit route without rewriting its original GLB.

Validation checks asset SHA, mesh/path/count, original triangle membership,
barycentric-to-Head-local reconstruction (2mm tolerance), complete bounded mask
neighborhood/weights, displacement direction and review state. Source Idle0 is
established once before validation, matching the picker. Validation is not a
frame-loop scan. Original GLBs remain unchanged.

The meal has a smaller 32cm carton, a side-edge holding grip, outboard elbow
control and a staged path that withdraws sideways, passes behind the finite lid,
then moves inward to the mouth. This also works when Pushpa's seated mouth is
below the top of the open lid. His palm supports the underside ahead of the
crust, clearing the panel's actual thickness. Hasini's arm and Bhanumathi's
wedding bangles receive wider side grips. Source costume depth is scanned once; hidden books and rigid nail/hand
props do not become torso surfaces. The mouth target follows the explicit native
point. Rigid nails, bangles and clothing remain included in collision review.
These final changes still require Root's fresh native meal review.

## Current contact result: geometric pass; native meal review pending

`scripts/qa/audit-received-pizza-contacts.ts` parses exact source GLBs with
texture bindings stripped in memory only. Against Root's complete 17-record
approved native export it samples all eleven eaters every 1/30s through six
seconds (180 poses each), checks both hands against the pizza, actual edible
tip/face clearance, fingers near the face, and actor triangles against both the
finite lid plane and its real 12mm solid volume.

Current receipt: `evidence/main-expansion/received-pizza-contacts-native17-20261103-v3.json`.
SHA256: `06d6434a420b5c7379e3df30bf74d149ab88b6d144a4687ba464f3541c86ffe0`.
All eleven receivers have zero left/right pizza intrusions, zero full-plane
crossings and zero solid-volume lid intersections. Maximum edible-tip distance
is 22.81mm; minimum pizza/face-plane clearance is 19.72mm; minimum nearby
hand/finger clearance is 13.85mm. No nonfinite vertices; source skin bounds
remain conservative (maximum fraction 0.9322). Original GLB hashes are unchanged.

This is geometric evidence, not native appearance or performance acceptance.
Root accepted Arjun's prior freeze26 front/side bite, opening and held poses;
the subsequent path/grip changes need fresh native review in freeze27.

### Preserved prior failure

Historical receipt: `evidence/main-expansion/received-pizza-contacts-native17-20261103-v2.json`.
Both hands have zero pizza intrusions. Nine recipients have zero interior lid
intersections; **Pushpa and Bhanumathi remain failed** (up to 71 and 31 interior
crossing triangles respectively). Sukumar and Vakeel Saab also retained seven
outer-edge contact triangles, recorded separately from the 3mm-interior check.
The receipt preserves phase and triangle witnesses. Arjun's current sampled
geometry passed. These failures are preserved, not overwritten by the new receipt.

Six actor-performance tests, two explicit-annotation tests, fourteen registry
tests and typecheck passed during this leaf. These controls do not erase the
historical failure or constitute native visual acceptance.

## Bhanumathi baseline appearance issue

Root's native closed proof shows a sharp neck/shoulder skin discontinuity before
any meal or face annotation is active. The original authored Idle0 versus the
new unreceived layer is exactly identical across 27 meshes and 57,464 vertices:
zero changed world coordinates. This is a baseline source/Idle0 appearance
defect, not the new lip/meal layer. No GLB rebuild was attempted.
Receipt: `evidence/main-expansion/bhanumathi-baseline-idle-layer-20261103.json`.
