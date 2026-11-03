# Independent metro story-camera and physical-bay review

Reviewer: `/root/metro_independent_review`, separate from the implementation agent. No production source or UI was changed by this reviewer.

## Current verdict

**Current verdict: SCOPED PASS for source/geometry and the reviewed native day/night presentation.** The held correction passes118unique focused checks independently, including all three physical/cadence checks and the32real-source camera cases. Four final frozen19native images were actually opened; the held day/night views show all four passengers and the car without the former opaque obstruction or apparent body clipping. The initial camera-only candidate failed both actual car-body regressions despite passing113focused checks. That failure and exact evidence remain below. Full native event export/Pause/Next continuity remains Root's integrated evidence gate, separate from this feature sign-off and the earlier station-architecture/access review.

## Source review and existing checks

Actually opened the original failed native image `evidence/main-expansion/native-rail-final/metro-night-held-v17.png`: large dark station/train surfaces hide the completed passenger scene. Read the held MetroRide implementation, its types/runtime callback, normal Game camera and production clearance implementation, plus the producer report `main-expansion-metro-story-camera.md`.

The camera search uses a finite set of platform-side eye positions, existing train doors and the existing supported-pad helper. Its selected offsets are stored rather than recalculated by the camera getter. The runtime callback checks current delivery supports, distinguishes unbuilt endpoint tiles from confirmed obstruction, and rejects released module contexts. Existing same-dwell pending retry, immutable bad-platform rejection and manual marked-roof contact behavior remain covered.

Independently executed all 113 focused checks: metro-story-camera2, metro-ride13, story-physical-independent10, story-runtime-independent8, delivery-runtime35, story-actor-camera10, story-mode17, train-story-lighting3 and delivery-module-immersive15. All pass. The source-camera suite includes its32actual-source shots and cached-read check. These results do not prove that the parked car or its travel path clears actual station structures.

Held source hashes at this failing review:

- `src/delivery/modules/metro-ride.ts`: `a5cb13b2ed53c2b9e3f4849ceef751ee9d10249389e9bd2f39808c31122be95a`
- `src/delivery/modules/types.ts`: `d9fb033d85a9621f7ba1ec52bd4c813f3a23df29b15c5463b3510178fc9dd928`
- `src/delivery/runtime.ts`: `1930e6f62b0f91beb8e84fe878493264ba799e45d5c57b32dc89a06f1ff5fe3e`
- `src/game/game.ts`: `2f334cf53add4efb8813f189ef7b93ed680c8f86f31a17813b8369a57f453150`
- `src/game/spatial-safety.ts`: `8c270d48dae6e9140cf52d7864cfb43f6e869218e81d386b8f9aad22602fadce`

## Independently confirmed physical failure

The newly chosen Ameerpet Blue door is at `(-5526.668060379073,13.7,-3213.402852677239)`, producing parking center `(-5531.014395315016,13.7,-3216.3633563347166)`. Camera sightlines clear the four actors, but the car physically intersects the upper-level lift shaft centered at `(-5532.902978741732,-3216.474212310626)`, with axes `(0.5058857292883709,0.8626005036529791)`, bottom0 and top32.6. The source records this as `station_stairs`; it is a lift shaft, not merely a hypothetical pier.

`drawStationLift` renders a2.5×2.5m solid shaft. The independent tests use its strict1.25m half extents, excluding the padded1.35m gameplay proxy, floor-contact surfaces and open stair envelopes. They instantiate the actual `roadster()` body skin, transform its real vertices by the exact selected player pose/yaw and test those vertices against every retained shaft box in the actual tile.

- **Held bay:**325real body vertices are inside the shaft. One example is `(-5531.570209356953,14.556752932071685,-3215.859031581917)`, lift-local along1.204884/side0.838436. This is visible-model penetration, not a padded collider false positive.
- **Actual automatic approach:** using production `stepStoryPose` from the real original roof pose,18body vertices first enter that shaft at frame8, approximately0.45s. The obstruction occurs before the car reaches the final bay.

Permanent reviewer-owned regression: `tests/v21-fixes/metro-story-physical-independent.test.ts`. Before correction, `node scripts/test-v21-fixes.mjs metro-story-physical-independent` reports **0/2pass**. Evidence: `evidence/main-expansion/metro-story-independent-physical-before.log`, `metro-story-independent-exact-body-before.log`, and the passing original camera matrix in `metro-story-independent-camera-before.log`.

## Required bounded correction

Retain real doors, actual supported pads, all four passengers, the marked real rake and immutable station geometry. Validate both the full physical final car pose and its actual automatic roof-to-platform route against current scene solids before accepting a door/bay. A clear face-camera path is insufficient. Choose another existing supported bay or door, or retain a supported intermediate roof waypoint that clears the real structure before descending. Do not remove the lift, weaken collision bounds, invent a platform or change ordinary driving/flight camera timing.

Repeat both independent physical regressions and the focused camera/manual-contact/runtime checks. Root must then record and actually review a new frozen native manual landing → different station → four-person exit → handoff → held viewing → Next sequence by day and night. Frozen18views using the obstructed bay cannot constitute final placement acceptance. Physical-phone FPS, lighting/likeness pixels and complete-game release approval remain separate gates.

## First independent correction recheck

The producer added the read-only `storyPoseClear` context seam, backed by exported production `deliveryStoryPoseClear`. The runtime helper preserves every normal static collider class and current delivery support; ten overlapping body cylinders cover the full4.8×2.3mcar rectangle above tyre-floor contact. Pending streaming remains distinguishable from obstruction. MetroRide checks the final pose and simulates its actual shared platform-story frame with production `stepStoryPose` before selecting a real door/bay. Normal Game and spatial-safety hashes remain unchanged.

This initially took7–67ms in a one-shot producer measurement, so the producer converted it into a cached generator. It advances at most four yielded parking/body/camera operations per active update, stopping after a1.5mssoft deadline. One indivisible query or OS scheduling can exceed that soft deadline; it is not a strict per-frame wall-clock guarantee. Selected plans do not keep searching during the scene.

The independent fixture was bound to the exact production helper, leaving both rendered-skin assertions unchanged. It now permits bounded staged preparation while the actual player stays on the original roof. **3/3independent checks pass:** final body vertices clear retained shaft boxes; all actual StoryDirector entry poses clear them; staged preparation/caching is bounded. The first actual Ameerpet run used190geometry callbacks over49preparation updates, maximum4callbacks/update. Observed desktop Node maximum update1.716ms, total planning39.4ms. Afterward120animation/held frames performed zero additional geometry queries. These are current desktop measurements, not physical-phone FPS or thermal evidence.

Log: `evidence/main-expansion/metro-story-independent-physical-after-staged.log`. The original0/2failure logs remain unchanged. Producer source was still undergoing the full matrix/cancellation recheck at this point; this preliminary green result does not close the native release gate.

## Final held-source recheck

Independently reran the scoped set after the producer held source. **118unique focused checks pass:** metro-story-camera2, independent metro physical3, metro-ride14, earlier independent manual-contact10, independent runtime8, delivery-runtime36, actor-camera10, automatic-story17, train-light3 and immersive-module15. The filename-substring runner includes the new physical file again when selecting `story-physical-independent`; its additional3passes are duplicate execution, not three more unique checks. TypeScript and reviewer-file diff checks also pass.

The real-source camera matrix still frames all four actors and the Roadster, traces actual station triangles to torsos/faces, verifies production Game clearance retains the authored shot, and caches checks through120subsequent frames. The new physical tests continue to use strict rendered lift boxes and real car-body vertices, independently of the helper's conservative proxy. Current-support changes, body corners, missing tiles and released runtime contexts are covered. Staged preparation cancels safely on player movement, train movement/departure and teardown; immutable failed geometry is rejected per dwell, while pending streaming can retry that same station.

Final independent Ameerpet timing under concurrent verification:190geometry callbacks,50preparation updates, maximum4callbacks/update; observed largest update2.171ms and total61.275ms. The soft deadline can be exceeded by an indivisible geometry operation or scheduling, and this changed timing illustrates why it is not a phone-frame guarantee. Confirmed selected scenes do not repeat geometry work during animation/viewing.

Held hashes independently confirmed:

- `src/delivery/modules/metro-ride.ts`: `238cf4150a84a80099cf56d08823ecd49f4491365b3b43f5f7da52a18224f1a8`
- `src/delivery/modules/types.ts`: `4574e258b693012d843db812646cc10d3ac315a9d4240f912698f7e99bec59ab`
- `src/delivery/runtime.ts`: `d9ea5c813aee2995fa76cbfd891e31c30bf980097965064f8bcb9fe0b5db29ca`

The Game and spatial-safety hashes remain exactly those recorded at this review's initial camera-only candidate. No ordinary driving/chase/orbit clearance, station geometry, real-rake contact rule, car physics, passenger exit animation or light-pool count was modified by the physical correction. The replacement door can be farther along the same real rake; it must not be described as always on the original marked coach or only6.5maway. Its bay is still the actual supported platform geometry, and its full roof-to-bay route must clear before commit.

Combined independent evidence: `evidence/main-expansion/metro-story-independent-final-focused.log` and `metro-story-independent-final-typecheck.log`. Root's pending native frozen19snapshot has fingerprint `d1edb8edb0350938516222c695ee3a89240b54302335792ea7a7711f84dab17a` at port4269. Final native day/night exit/handoff/held/Next review is still required; no source-only release approval is implied.

## Final native19 presentation review

Actually opened all four final images under `evidence/main-expansion/native-rail-final/`:

- `metro-roof-ride-day-v19.png`: Roadster visibly supported on the actual train roof, with gameplay controls hidden except Pause.
- `metro-approaching-station-day-v19.png`: the same roof ride approaches an actual covered station with real platform/deck geometry. This image does not depict passenger exit.
- `metro-platform-entry-day-v19.png`: despite the filename, this is **already completed held viewing**, with Next visible. All four passengers, from heads/faces through feet, are visible in the row beside the train. The Roadster is separated from the row; no upper support, car cabin or train body covers the figures, and no apparent body penetration is visible.
- `metro-night-held-v19.png`: the same four-person/car composition remains visible at night, with station diffusers and local illumination. Faces are shaded side profiles and small on screen, but heads, body outlines and distinct clothing remain readable; the former large opaque obstruction is absent. This is presentation readability, not a new celebrity-likeness verdict.

The native held pose reported by Root is `(-4228.6,14.3,-3445.0)` with camera `(-4226,15.4,-3452.7)`. Independently read actual packed station anchors: Begumpet(`st_begumpet`,Blue) is21.14mfrom that held pose. These native images are therefore not mislabeled as the exact original Ameerpet failure reproduction. The original Ameerpet source regression, strict lift/body/route checks and representative32shot matrix remain distinct evidence. The reviewed native build is frozen19, fingerprint `d1edb8edb0350938516222c695ee3a89240b54302335792ea7a7711f84dab17a`; all five held source/host hashes still match.

Root reports observing real QA-stage descent to physical roof contact, riding to a different actual station, automatic platform entry/handoff and indefinite character viewing. The four still images do not independently establish every exit-animation frame or the complete physical event sequence, so this reviewer does not claim direct observation of those missing moments. Root is retaining the event export plus Pause/Resume and Next/loading evidence separately. No exit-motion claim is made for the already-completed `platform-entry` screenshot.

The producer's final `metro-story-camera-held-source.json` also records a42.995mselapsed preparation slice in another desktop matrix case, while retaining the four-operation bound. Its cause is not isolated; an indivisible query, scheduling or garbage collection can exceed the soft deadline. The feature passes functional/geometry/visual review, **not** a hard1.5mswall-time guarantee or hitch-free physical-phone performance gate. No normal camera/physics or station collision class was relaxed to get this result.

**Final scoped sign-off: PASS.** Initial Ameerpet camera obstruction and the independently found physical lift collision are corrected in the held source. Final native ride/approach and day/night held presentation are coherent and clear. Whole-campaign progression, complete event sequencing, real train reversal, exact station-entry survey fidelity and sustained real-phone performance are outside this feature sign-off.
