# Main expansion — NPC people implementation candidate

Status: **not visually approved**. Iteration 6 passed the independent static anatomy/wardrobe and inspected seated-contact foundation, but its native walking captures failed. Iteration 7 fixes a reproduced invalid-delta animation failure and has producer-inspected actual walking-geometry renders; runtime source is held for fresh native Chrome confirmation and independent review. Historical implementation/counts below are retained as an audit trail and superseded by the latest notes at the end. This is not a claim of photorealism or real-phone FPS.

## Implemented

- One shared human builder serves footpath/static crowds and seated traffic occupants. The current surface is a continuous **native head, neck and body** from CC0 MakeHuman geometry and actual male/female young/child/old morphs. Teen morphology blends child/young. Noses, eye sockets, ears, jaws, mouths, hands and feet are native geometry, replacing skin/hair spheres and disconnected limb segments. Bun/ponytail/helmet attachments follow the head. The `face` content trait is retained for compatibility but does not currently create additional facial morphs beyond age/sex; do not report six arbitrary face IDs as six different production faces.
- Clothed upper bodies retain the anatomical chest, shoulders, arms and waist. Volumetric tunics/wraps replace covered lower-body surfaces; pallu/dupatta strips follow the actual torso and retain its source joint weights. Closed footwear is fitted to the native foot envelope. Shirt pattern/button detail from early candidates is not part of the current native-mesh implementation.
- Explicit male/female teenage categories appear in the spawn mix with narrower builds, intermediate height/head proportions and casual clothes. Schoolchildren, adults and elders have different morphs and scale ranges. Skin, build, hair, height, wardrobe and sleeve variation remain. No per-person celebrity model or texture is loaded.
- Moving footpath walkers, bus boarding/alighting figures and metro transfer walkers use one 17-bone skinned mesh per actor. Knees/ankles flex, arms counter-swing, elbows flex, torso counter-rotates and gait eases to rest. NPC work preserves the service schedule/counts and visibility/pinning policies. The vehicle producer separately aligned bus paths to the real door openings; preserve that integration.
- Station waiting crowds still merge into one stationary batch. Seated station passengers now use full seated human anatomy rather than box legs. Skeletal textures are owned/disposed by figures; geometry remains leased and bounded by the existing cache, including new skin buffers.
- `traffic_models.ts` rider signature is compatible and delegates to `drawSeatedPerson`. `trafficOccupantSpec(r, woman?, driver?)` is exported for the traffic body agent: passengers include life-stage diversity; drivers are restricted to adults. Bike/scooter/auto/bench/pillion seating has joint/contact poses and hands/feet.

## Ownership handoff for traffic/station agents

The NPC agent has finished edits in `traffic_models.ts` imports, `riderSpec`, `passenger`, the new exported `trafficOccupantSpec`, and `rider`. Vehicle body panels, glass, footprints, wheels and lights were not changed.

**Historical handoff, now integrated by the vehicle producer:** the common rider interface supplies full occupants to the revised vehicles, including the former bus sphere-head path. Keep coordinates facing -z. Final human contacts must be reviewed in the actual vehicle captures, not accepted only from the isolated seated gallery. Iteration 6 adds dedicated `rickshawDriver`/`rickshawPassenger` poses for the vehicle producer's lowered auto seats; generic car/bus poses remain unchanged.

Station architecture owner may edit station geometry independently. In `station-life.ts`, human construction/gait changes are confined to actor construction, figure ownership/disposal and per-transfer pose animation; do not remove the existing one-batch waiting crowd optimization or service logic.

## Source and rights

Head topology derives from the already-vendored project's CC0 MakeHuman head. Source SHA-256 was independently rechecked against the official `makehuman/data/3dobjs/base.obj`: `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`. The official source header explicitly identifies CC0. No celebrity assets were copied into NPCs and no MakeHuman application code was reused.

- [Official MakeHuman source/license](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md)
- [Official asset licensing explanation](https://www.makehumancommunity.org/about/license.html)
- Existing notice: `src/delivery/characters/LICENSE-MAKEHUMAN-HEAD.md`.
- Reproduce derivatives with `node scripts/art/derive-npc-head.mjs`. The detailed head has 470 vertices / 982 triangles; the separate already-low-detail static crowd head has 116 vertices / 262 triangles. Facial loops retain a finer clustering grid. Facing -z reverses source winding to keep the front-face material correct.

## Measured geometry budgets

**Retired first-candidate snapshot; not the current iteration's counts.** The same fixed shirt/sari/salwar/burqa/western/schoolboy/elder appearances were generated from HEAD and the first candidate. These are geometry counts, not FPS measurements. Current native body counts and checks are recorded in the iteration sections.

| Category | Baseline full triangles | Candidate full triangles | Baseline static low | Candidate static low |
| --- | ---: | ---: | ---: | ---: |
| Shirt | 3,252 | 2,994 | 532 | 758 |
| Sari | 3,124 | 2,790 | 484 | 766 |
| Salwar | 3,848 | 3,338 | 656 | 882 |
| Burqa | 2,576 | 2,494 | 444 | 670 |
| Western | 3,508 | 2,970 | 580 | 806 |
| Schoolboy | 3,376 | 3,118 | 592 | 818 |
| Elder male | 3,360 | 3,102 | 584 | 810 |
| Elder female | 2,872 | 2,790 | 484 | 766 |

Full human triangle counts are below these baseline examples. Static crowds carry 226–282 additional triangles per person to retain anatomical heads/hands; that cost must be evaluated in the integrated streamed city. The first candidate accidentally retained full detail in the static path; that regression was caught and replaced before handoff.

One articulated cached appearance currently accounts for approximately **1.64–2.12 MiB estimated CPU+GPU mirrored attribute bytes**, including compatibility body/leg buffers and skin buffers. Idle cache still evicts to at most 128 entries **and 16 MiB**; active appearances remain owned. This increases active geometry memory relative to the previous rigid mesh path, although draw submissions are lower. Do not interpret bounded idle cache as proof of no active-memory or GPU regression. The next profiling pass should evaluate whether unused compatibility body/leg buffers can be separated for active walker-only appearances.

No per-person texture/material loads, celebrity GLBs, generated 10 MiB models, new high-cost transparency, new animation clocks or per-frame geometry construction were added. Templates/material batches are shared. Culling/pinning/routing policies were not modified.

## Checks and review fixture

- `node scripts/test-v21-fixes.mjs npc-anatomy`: **4/4 pass** — age diversity/proportions, reflected-face winding/normals, bone weights/knee-elbow movement/shared ownership, complete finite pedestrian/seated geometry and triangle budgets.
- `node scripts/test-v21-fixes.mjs pedestrian-geometry-lifetime`: **5/5 pass**, including 420 retired appearances, final-reference disposal, station/bus leases, and 300 actual walker spawn/removal cycles.
- `npm run typecheck`: **pass** after Root's concurrent underwater import fix. Recheck the integrated tree after later agents finish.

Visual fixture for Root and the independent reviewer (production builders + the actual game traffic material properties):

- `/tests/browser/npc-people.html?view=front`
- `?view=profile`
- `?view=faces`
- `?view=seated`
- `?view=driving`

Drag to orbit; Pause gait allows static joint/silhouette inspection. No render was independently accepted by the producer. Required acceptance evidence: front/profile close-ups, teenager versus child/adult line-up, seated hands/feet against real vehicle contact points, night visibility, full-speed passing pedestrians, boarding/alighting, and no disappearance when the driving camera orbits. The fixture does not substitute for those in-game checks.

Known quality limits: this is untextured anatomical generic human geometry with vertex colors, not skin-scanned humans. Cloth drapes/accessories remain partly simplified, scalp shapes and close-up facial details need independent feedback, and rigid static people have no idle acting. If close-up faces do not meet the user's requested realism, keep iterating or replace the shared face with a separately licensed/approved atlas/model; do not self-approve from successful tests.

## Iterations 2–3 — corrections driven by actual FAIL captures

Producer inspected the actual Root captures `npc-front-candidate.png`, `npc-profile-candidate.png`, `npc-faces-candidate.png`, `npc-seated-candidate.png`, the independent FAIL in `main-expansion-npc-review.md`, and Root's follow-up `npc-front-v2.png`. These failures are valid; passing geometry tests did not establish visual quality.

The old segmented body was replaced with a **continuous CC0 MakeHuman body surface**, retargeted offline using the source CC0 skeletal influences. Shoulder/elbow/waist/knee surfaces now share geometry and normals. The pedestrian gait and static seating deform that surface, rather than separating capped limb pieces. `drawPerson(..., legs=false)` now returns the full continuous body; compatibility `.leg` is null. Metro/station waiting figures and bus transfer figures continue using the same existing counts/service paths.

Heads now derive directly from the official base mesh plus **real CC0 male/female young/child/old morph targets**, rather than merely narrowing a generic masculine head. Teen faces blend young/child morphology. Lip and eyelid loops are retained more finely, the mouth is compressed to a neutral closed seam, source eye centers determine the recessed eye positions, and sclera is smaller and darker. Beard/moustache color is applied to the actual face surface, removing detached facial-hair pieces. These changes still require independent face approval.

Flat sari/dupatta/burqa panels have been removed. Tunics and wrapped garments are closed elliptical volumes with a shaped waist/shoulder silhouette and integrated shallow folds. Sari/dupatta drapes are curved, thickened ribbons conforming to the upper body. There are no large rectangle panels suspended across the chest.

Root's first continuous-body capture exposed a specific wrist retargeting bug: `wrist.L/R` influences were incorrectly using the torso transform while finger influences followed the hand transform, stretching the shared polygons into starfish-like spikes. Iteration 3 maps wrist and finger influences to the same hand frame. The shirt/pants color boundary is now clipped at the hem plane instead of assigning whole intersecting triangles, and the neckline only exposes the central neck, avoiding sawtooth waist borders and skin across the shoulders. Head positions now use actual retargeted body head anchors for each age/sex variant and seating pose.

Shared derivative `src/world/npc-human.json` is approximately **497 KiB** of source JSON for all six morphs, continuous detailed/reduced bodies and detailed/reduced heads; it is not a per-person download. Reproduce it with `node scripts/art/derive-npc-human.mjs` using the official source assets. The derivative records the base/morph SHA-256 values. Source assets explicitly declare CC0; `default_weights.mhw` also declares CC0. Official sources: [base mesh and asset folders](https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data), [macrodetail morphs](https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data/targets/macrodetails), [rig weights](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/rigs/default_weights.mhw). No MakeHuman application code was copied.

Current component topology: detailed continuous body **2,274 triangles**, reduced body **604**; detailed morphological head **2,437**, reduced head **584**, plus bounded eyes/wardrobe. Detailed nearby pedestrians stay under the existing 6,500-triangle acceptance ceiling. Seated traffic occupants use reduced continuous bodies/heads to keep the unchanged car/bus budgets; they remain merged into each vehicle's existing draw. Cached walking geometry shares its position/normal/color/UV attributes with compatibility body geometry instead of retaining a second duplicate copy; only skin buffers are extra. Idle cache ownership/eviction policy remains unchanged.

Latest focused checks after the wrist/hem/anchor corrections: anatomy **4/4 pass**, traffic-vehicle realism **5/5 pass**, including the unchanged bus body **<25,000 triangles** check and the actual rear entrance/floor regression. Global typecheck passed before the latest corrections and is being rechecked. No density, draw-distance, traffic visibility, route timing, new bus door anchor, bus floor or body-panel settings were changed by the NPC iteration.

Re-review must include fresh front/profile/face captures, two gait phases, real car/auto/bike/scooter/bus occupant contacts through `/tests/browser/traffic-vehicles.html`, and day/night driving-distance views. The standalone seated gallery is insufficient to approve vehicle contacts. Root owns the browser captures; an independent agent must issue the next visual verdict.

## Iteration 4 — native closed topology and retained joint influences

**Still awaiting actual v4 render inspection and independent visual acceptance.** Producer opened the independent v3 FAIL report and all seven recorded v3 images, including both gait phases. The severe seated holes, cut neck, exposed tunic underlayers, floating hair and fixed wrapped feet are valid failures.

The V4 source pipeline now reduces the **whole native head/neck/body as one surface**, using quadratic edge collapses and shared collapse replay for all six CC0 morphs. It replaces vertex-grid clustering and the separately cut head/neck shells. Both detailed (4,700 triangles) and reduced (2,300 triangles) native meshes have **zero open boundary edges and zero non-manifold edges**, checked from the actual index data. The original source is also closed. This is a structural check; it cannot certify a convincing pose or material appearance.

Official MakeHuman anatomical influences are now transferred through reduction, retained as four joint weights per vertex, and used directly for **both seating pose matrices and animated skinning**. The x/y coordinate-only arm/leg classifier is removed. Native hip vertices cannot accidentally follow an arm just because they share an x/y range. A private `HumanSkinBatch` carries these influences through the existing colored batching; generic city `Batch` APIs are unchanged. Positions/normals/colors/UVs remain shared between cached body and animated geometry.

Wrapped figures now keep thigh, knee and ankle animation at a modest 62% stride. Their cloth surfaces project weights from nearby native anatomy; the actual foot geometry retains its ankle influences. A new check measures foot displacement between distinct skeletal phases, rather than only checking that bones exist.

Outer tunics/robes replace their covered torso/hip surfaces, preventing cream pants/underbody from drawing through a purple garment. Cloth pose uses the retained influence field. Buns and ponytails begin at an actual morphed scalp sample, share the head binding and overlap their attachment surface. Shirt hems and short sleeve boundaries interpolate positions and weights at their sewn material plane.

Vehicle producer supplied actual controls/supports. Bike driver sole targets use the production pegs at `(±.25, .47, .02)`; scooter drivers use the `.36m` floor. Bike rear passengers use `(±.23, .45, .50)`, scooter rear passengers use `(±.24, .43, .60)` and have the separate `scooterPillion` pose. Fixed support deltas account for person scale. Side-pillion faces outward with both feet on one side. Generic car/bus `auto`/`bench` floor convention is retained. These are geometry/anchor checks; rendered contacts in real vehicles remain required. The NPC producer did not edit vehicle bodies or the bus entrance/floor path.

Derivation: `node scripts/art/derive-npc-human.mjs` exports native source plus joint influences; `scripts/art/reduce-npc-native.py` uses NumPy and `fast-simplification` 0.2.0 on CPU. The [official reduction/replay documentation](https://pyvista.github.io/fast-simplification/) explains shared-topology morph replay and correspondence transfer. No GPU generation was used. `npc-human-v4.json` is approximately 1.41 MiB shared source JSON for both LODs and six morphs, not a per-person model. Body template caches are capped at 40 entries; weighted outfit templates at 64; idle GPU appearance cache retains its existing 16 MiB limit.

Latest focused validation: global typecheck **pass**, anatomy suite **4/4**, new native-pose suite **4/4**, current vehicle suite **9/9**, preserving the existing <25,000 bus and <15,000 car bounds. Native-pose checks cover actual indexed closure, source weight normalization, front-facing production shin/pelvis surfaces in six seated poses, real wrapped-foot displacement, and rear-support positions at varied human scales. The full visual/performance gate is still pending.

Root capture URLs now include `?view=seated`, `?view=seated-side`, `?view=seated-quarter` (all seven seat types), plus `?view=profile&phase=.7` and `?view=profile&phase=3.84` for repeatable held gait phases. Pause holds the pose instead of easing it back to idle. The production gallery material still matches the game's shared traffic material; its glossy response requires visual review rather than being hidden by an altered proof material.

## Iteration 5 — wardrobe repair after producer inspected v4 renders

Producer opened all nine actual v4 PNGs listed in `evidence/main-expansion/npc-captures-v4.json`, fingerprint `da3a46cc6653abed674a3722bb8864cccdce6c41e43716024e0f905cf5c22060`. Anatomy, neck continuity, scalp attachment and stepping improved visibly, but the **wardrobe did not pass**: coat-hem teeth, sawtooth neck/cuff colors and angular protruding seated cloth panels remained. Producer also opened the fifteen specified actual vehicle images (motorbike, scooter, hatch, auto, bus × side/left-side/cabin) from `vehicle-captures-v2.json`. Those views demonstrate the native occupants and their controls/supports, but the elder pillion coat still had the same wardrobe defects.

The wardrobe repair retains the native body and calibrated seat matrices. Replacement masks now clip at exact neck/hem/cuff planes, including interpolated source skin weights. Short tunics use torso/hip/thigh cloth influences, excluding arm, hand, knee and ankle bones; pallu/dupatta drapes follow torso/hip influences. Wrapped long cloth retains a restrained thigh/knee response while feet keep their real ankle animation. Cloth is more finely subdivided, and posed cloth normals now use weighted normal matrices instead of recomputing flat normals on a non-indexed triangle soup. Pallu ribbons project onto the actual morphed torso surface; dupatta ribbons conform to the fitted robe envelope. This addresses the observed detached front/back panels and strong low-poly lap facets without concealing missing anatomy.

Western/teen/school people have actual closed shoe surfaces, replacing the painted bare-toe appearance observed in v4. Their sole bottom retains the same calibrated support point, and the native hidden foot surface is clipped beneath the shoe. Traditional wardrobe retains exposed-foot options. No driver controls, vehicle bodies, service timing, density or visibility policy changed.

Latest checks after the wardrobe changes: typecheck **pass**, anatomy **4/4**, native pose **4/4**, current vehicle suite **9/9**, geometry lifetime **5/5**. Existing per-person/car/bus limits are unchanged. Fresh v5 images must be inspected before handing appearance to the independent reviewer; this report does not self-approve the repairs.

## Iteration 6 — producer-rendered costume and contact correction

Producer opened the actual `npc-faces-v5.png`, `npc-front-v5.png` and `npc-seated-side-v5.png` after Root's rejection. The broad flat garment neckline, torn sari strip, poor shoe shape and detached waist/drape surfaces were valid issues. The face gallery also spaced figures only .46m apart although arms spanned about .60m: the neighbouring woman's bare forearm obscured the blue shirt's upper arm. The gallery now spaces figures .70m apart. An independent production-geometry colour check verifies the long sleeve actually covers both upper arm and forearm, while the short sleeve exposes the forearm.

The current fix preserves the successful native topology and retained joint influences. Material splits use anatomical neck/arm influences and interpolated edge attributes. Fitted native chest/shoulder/sleeve surfaces remain above the waist instead of replacing the entire torso with an elliptical collar shell. Lower tunic/wrap seams project onto the exact native torso, interpolate its barycentric skin weights and use a short transition into the looser cloth. This removes the former shelf at the seated waist. Bind garments are shared in a bounded 32-template cache; posed outfits retain the 64-template cap. An unused face-ID component was removed from the body-template key, avoiding duplicate identical anatomy templates.

Pallu and dupatta surfaces are now **clipped from the actual morphed torso**, offset as a thin inner/outer shell and stitched along every boundary edge. They retain the torso's source skeletal influences instead of relying on a separately projected ribbon or hip-only binding. Thin bands are clipped by separate linear half-planes: the previous absolute-distance mask could discard an entire triangle even when the scarf crossed its interior, creating disconnected islands. Scalp and beard colour boundaries are also clipped; beard colour stops at the jaw instead of extending down the neck. Traditional exposed feet use skin colour. Western shoes use a closed convex envelope of the actual morphed foot, retaining its footprint and calibrated sole support instead of scaling an ellipsoid.

Vehicle producer's auto headroom repair now has dedicated `rickshawDriver`/`rickshawPassenger` poses. Their .76m/.78m hips retain the .33m physical floor via scale-aware sole offsets; driver wrists keep the existing local reach. Generic car/bus `auto`/`bench` poses are unchanged. The vehicle producer owns the lowered seats, steering controls, roof and toe pans; no traffic body/floor/path code was changed by this NPC iteration.

**Actual producer evidence:** all six final images in `evidence/main-expansion/npc-producer-v6/` were opened and inspected: front, profile, faces, seated, seated-side and seated-quarter. `manifest.json` records image hashes, exported geometry hashes, runtime source hashes and renderer settings. These are actual production `drawPerson`/`drawSeatedPerson` Batch positions, split normals and vertex colours, exported by `scripts/art/export-npc-production.ts`, then rendered in existing Blender 4.5.9 LTS **Cycles CPU, two threads, 12 samples** with game roughness .42 and metalness .18. The final images show intact limbs, attached hair, fitted shoulders, continuous sleeve/cloth bands and no former detached waist shelf. Loose skirts/tunics remain simplified; this is not a skin-scanned or photoreal human claim. Offline neutral lighting is a structural producer check, not a substitute for actual Chrome/game visuals or independent approval.

Reproduce the offline check by bundling `scripts/art/export-npc-production.ts` with existing esbuild for Node, running the resulting module with an output directory, then running `/Volumes/Blender/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 2 --python scripts/art/render-npc-production.py -- OUTPUT_DIRECTORY`. Raw final exported geometry remains at `/tmp/roadster-npc-production-v6c`; only the six small PNGs and provenance manifest are stored in the repository.

Final focused checks after all v6 runtime edits: typecheck **pass**, anatomy **4/4**, native pose **6/6**, geometry lifetime **5/5**, current vehicle suite **15/15**. Native-pose adds sleeve coverage and real lowered-auto floor checks. Existing <25,000-triangle bus and <15,000-triangle car limits were not increased. Crowd density, render distance, traffic culling/pinning, movement clocks, service counts and route timing remain outside this iteration. Integrated mobile FPS, night visibility, real-vehicle contacts, both gait phases and actual native Chrome independent appearance review remain required before acceptance. Runtime source was explicitly held for Root's next freeze.

## Iteration 7 — invalid first-delta gait repair

Producer read the independent `main-expansion-npcs-review-v6.md` and actually opened native `npc-profile-v6.png`, `npc-stride-a-v6.png` and `npc-stride-b-v6.png`. The extreme splits, airborne knees, raised arms and stretched wrapped cloth are valid runtime failures. Static anatomy/wardrobe and inspected seated contacts passed that independent review and were preserved: **no body, clothes, seating, material or density change** was made in this repair.

A concrete failure was reproduced before changing the rig. `makeHumanWalkRig.update()` previously applied `amplitude += (target-amplitude)*(1-exp(-10*dt))` without validating `dt`. At first delta **−0.8s**, the new first-five-tick regression fails immediately on the shirt's joint-angle envelope. A negative delta makes that exponential response negative and unbounded, driving amplitude far below zero and allowing many-radian spins. The fixture sampled `performance.now()` after synchronous geometry loading, then subtracted it from the first rAF timestamp, which can predate that sample. This is a credible source of the native first-frame failure; matching safe native captures are still required before claiming the entire browser finding is resolved.

The shared production rig now clamps finite delta to `[0,.05]`, ignores nonfinite delta, bounds amplitude to `[0,1]`, and retains the last finite phase if an invalid phase arrives. The fixture initializes its clock from the first rAF timestamp with delta exactly zero. This protects actual city walkers, bus transfers and metro transfers because all three use the same production rig; route/service/count logic remains unchanged.

The new regression checks **actual deformed body/cloth vertices for the first five ticks**, not just finite bone arrays, for shirt, teenage female, schoolchild, elder, sari and burqa. It covers negative/nonfinite first delta and long hitches; joints stay within a normal walking envelope and all vertices stay near the person. Another test decodes the actual float bone palette used for GPU upload and independently reproduces the shader bind/matrix order. It matches CPU deformation within `1e-6` for separately scaled/rotated people sharing one material, with separately owned textures/palettes. This verifies the CPU/upload contract, **not the GPU execution itself**.

Root can inspect the native same-pose contract using `/tests/browser/npc-people.html?view=profile&phase=.7&cpuReference=1` (also phase `0` and `3.84`). Gold wire is a non-skinned CPU-deformed copy over the native GPU human, sharing each actor's ancestor scale/orientation. The overlay should follow every visible body/cloth surface; a divergent silhouette would require further GPU/bind investigation. This diagnostic is fixture-only and adds no production draw cost.

Producer exported the **actual animated production rig geometry**, not neutral standing geometry, using `applyBoneTransform` plus palette-transformed normals. All three CPU/Blender images in `evidence/main-expansion/npc-producer-v7/` were opened: converged `.7`, converged `3.84`, and the first five ticks beginning with `−.8s`. They show restrained stepping, attached hands/feet and cloth following the body without the former giant splits or panels. Their provenance manifest records exact source/image/geometry hashes and timing. These producer renders still require native Chrome confirmation and independent review.

Latest v7 checks: typecheck **pass**, native-pose **8/8**, geometry lifetime **5/5**. Static geometry and the already-checked anatomy/vehicle budgets were not changed. Integrated real-city animation, boarding/alighting, night visibility, camera views and performance remain part of Root's acceptance gate. Runtime source held for the next native capture.
