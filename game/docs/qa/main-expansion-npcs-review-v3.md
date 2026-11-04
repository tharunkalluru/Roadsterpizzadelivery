# Independent NPC review — iteration 3

Reviewer: `npc_people_independent_review`, separate from the producer. **Verdict: FAIL — do not release iteration 3.**

This verdict is based on actually opening all seven Root-supplied production-render PNGs below, not on the producer's description or passing geometry tests. The captures came from immutable feature QA build `5ec3ceb7403c9d92539d1e547ff9a09ff838ba20cc0a3b6333ca6a49457670d0`, captured as a build on `2026-11-02T20:39:32.408Z`. No browser, implementation, public asset, approval registry or deployment was changed by this reviewer.

## Blocking findings and concrete repairs

1. **Seated anatomy is visibly broken.** In `npc-seated-v3.png`, the left, center-right and right figures have large background-colored openings across the crotch/knees and most of the visible lower-leg/shin surfaces. The sari figure has a detached-looking gap between the upper garment and wrapped lap. These are substantial failures even before adding a vehicle. Preserve the anatomical joint correspondence when bending the mesh; inspect the seat retarget, triangle winding, normals and any face-removal mask. Do not conceal missing limbs with a bus panel or a seat. Recheck a complete seated body from front, both sides and three-quarter before checking actual seats and controls.

   Source risk: `poseBody()` in `src/world/human-body.ts` chooses arm/leg transforms using rest-coordinate thresholds rather than retained anatomical bone influences. Its arm branch includes lateral pelvis coordinates (`abs(x) > .16`, `.71 < y < 1.40`), which can incorrectly move hip vertices with an arm. This is a plausible cause to investigate, not a visually proven sole cause. A compact per-vertex joint/influence map from the CC0 source would avoid ambiguous coordinate-only classification.

2. **Clothing still has broken surface patches and intersections.** The close-up purple salwar has large cream islands through its front/hip, jagged shoulder/upper-sleeve edges and visible intersecting forms across its chest. The elder's cream tunic has darker irregular patches. Pale triangular patches remain on the blue and red trousers and below shirt chests; they read as holes or incorrectly exposed underlayers. The front line-up and driving-distance view still show these defects. Fit the closed garment outside each actual body morph and build, and remove covered underbody faces where appropriate. Resolve coincident/intersecting body and garment surfaces rather than hiding them with another panel or color. Shirt hems should remain a continuous sewn boundary throughout the walk.

3. **Head/neck/collar continuity remains visibly unfinished.** `npc-faces-v3.png` shows pointed head-base shapes, black stem-like gaps beneath the purple and red figures' chins, pale collar wedges detached from the neckline and an exposed horizontal skin strip above the blue shirt. The elder's beard terminates in an unnaturally triangular blue-gray patch. Join the actual head-base/neck surfaces to the correct body neck ring for each morph, blend their normals, and give the collar a fitted opening. Do not use a floating collar strip to cover a disconnected head or a sharp cone as a neck. A front-only repositioning is insufficient: inspect profile and three-quarter as well.

4. **Several hair accessories float off the head.** The profile shows a clear gap between the elder woman's gray bun and her head and between the teenage female's ponytail and scalp. Attach these to the actual morphed scalp/nape or add the connecting hair volume; inspect after head rotation and walking deformation.

5. **Wrapped walkers do not demonstrate a believable step cycle.** Between gait phases A and B, unwrapped figures change leg/foot poses, while the sari, elder-female and burqa lower silhouettes and feet remain effectively fixed. The inspected source explicitly disables thigh/knee/ankle animation for `wrapped` figures and assigns their lower vertices to hips. Keep the garment silhouette controlled, but retain modest foot/leg stepping under it and enough lower-cloth motion to avoid a sliding column. Validate this with separated side-view stride phases or a short real-player video. Two stills alone do not prove an entire cycle.

## Improvements that are visible

- The extreme starfish wrist/finger spikes from iteration 2 are no longer present in the standing front/profile views.
- Standing shoulders, elbows, waist and knees generally read as connected continuous forms instead of the separate capped primitive pieces in iteration 1.
- Faces now have smaller recessed eyes and a closed mouth. Female, broad male, elderly and child/youth silhouettes are more distinct. The demonstrated demographic range is a useful improvement; integration must still show that range in ordinary street traffic.
- Curved wrapped garments are a better foundation than the original large flat cardboard panels.

These improvements do not override the remaining mesh and continuity failures. The verdict is not a demand for skin-scanned photorealism; the current visible defects prevent accepting even a coherent, believable stylized 3D person.

## Pending integration evidence

Root has not yet supplied iteration-3 actual car/bus/scooter contact or night gameplay captures. Those checks are **unproven**, not additional observed failures. The standalone seated view cannot prove hips on cushions, feet on floor/pegs, hands on controls, or roof clearance. After the blockers are corrected, inspect actual production vehicle occupants, two gait phases including wrapped clothing, a close face/profile view, and day/night driving-distance output. Check the NPC material response too: the current shared glossy traffic-style material makes cloth/skin look like shiny mannequin surfaces.

Retain the established geometry, disposal, draw and memory budgets. The nine-figure detailed line-up shows 44,149 rendered triangles versus the iteration-1 capture's 26,924; this is a measured increase in the fixture, not a phone FPS result. It requires the separate integrated performance gate. Do not relax the bus or pedestrian budget simply to make the new anatomy tests pass.

## Evidence actually opened

Paths below are relative to `docs/qa/evidence/main-expansion/`.

| PNG | SHA-256 |
| --- | --- |
| `npc-front-v3.png` | `a2aa82c0a4ceb33cfbc6597d82e67e1d9d28906cba3374db3c47fac1094ae8bd` |
| `npc-profile-v3.png` | `4491c0a5ea603f4cf8aab76ace5aafdc7422fbb2660d83c461fed78f111daff4` |
| `npc-faces-v3.png` | `18906f0dd0c61502817305fe704dc9ddd2c7752c46018b0b1681e5304bffa94d` |
| `npc-seated-v3.png` | `784d2e907f1c9a67454ff8fdba85d01353f288bb534c59bf4b40de124227b402` |
| `npc-driving-v3.png` | `b9127dfc5956d17cca38b47179d415d800b1444fb2b044827c02e5b3cfdced08` |
| `npc-gait-phase-a-v3.png` | `a2aa82c0a4ceb33cfbc6597d82e67e1d9d28906cba3374db3c47fac1094ae8bd` |
| `npc-gait-phase-b-v3.png` | `f797885f89b603fe851accc02f6aeac74f562bf3f9783648da33ee21e823d7f5` |

Gait phase A is byte-identical to the front capture and is counted as the same image, not a third independent gait sample. Phase B is distinct. The source inspection covered `human-body.ts`, `human-anatomy.ts`, `human-gait.ts`, `people.ts` and the production review harness.
