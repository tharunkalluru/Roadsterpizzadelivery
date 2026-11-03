# Metro story camera: actual interchange obstruction repair

Current status: the camera-only pass was insufficient. Independent review found the selected Ameerpet bay and its approach penetrating an actual upper lift shaft. The held correction now validates the whole Roadster and its complete authored approach, and stages preparation across bounded updates. **118 scoped tests pass**, including the independent actual rendered-body endpoint, swept-route and preparation-cadence regressions. Native frozen 19 day/night acceptance remains Root's gate.

The frozen 17 native phone image at `evidence/main-expansion/native-rail-final/metro-night-held-v17.png` showed the completed Vakeel Saab scene behind large dark station/train surfaces. Only clipped heads were visible. This was a presentation blocker after genuine manual roof boarding, not a reason to weaken the boarding or collision gates.

## Exact source-based reproduction

The reported held player pose (-5534.4, 14.3, -3221.9) matches the existing Ameerpet Blue parking bay within 0.022 m. Building the actual packed tile `-6_-4` with production road grades and station geometry reproduces the old camera using unchanged production `clearCameraPosition`:

- Actual platform: `st_ameerpet:blue`, deck 12.5 m, floor 13.7 m, travel direction -1.
- Old subject: (-5531.480122, 14.75, -3218.074183).
- Old requested eye: (-5530.942851, 15.35, -3214.529985).
- Production clearance result: (-5527.525305, 17.25, -3218.673701), matching the rounded native camera (-5527.5, 17.2, -3218.7).

Neither endpoint is inside a solid. Their connecting line crosses the real upper interchange support obstacle centered at (-5532.902979, -3216.474212), radius 1.35 m, top 32.6 m. The short-ray camera fallback then moves the view toward the train and station structures. No duplicate generic station building was found at this target. The exact native reproduction initially failed the new real-camera regression before the repair.

## Bounded change

MetroRide tries twelve eye-level candidates in the existing platform strip: along ±3.3/±4.3 m and outward 1.4/1.1/1.8 m relative to the final passenger row. At the real door selection stage it checks the center camera path, all four exiting faces, all four final torso/face paths, and the planned parked Roadster volume. The selected camera offsets are cached; getters and animation frames do not repeat this search.

At the precise failing door, there is no suitable nearby shot that also clears the car and whole standing row. The existing real-door fallback tries other actual doors on the same marked rake. The initial camera-only version selected a neighboring door whose bay penetrated a real upper lift; that version is explicitly rejected. The final selector requires a physically clear bay and approach before accepting a clear shot. It selects an existing fully supported bay rather than moving/removing a support, inventing a platform, accepting an obstructed view, or creating a distant tiny-character shot. All 32 representative source cases selected the original bounded 3.3 m along / 1.4 m outward shot once a suitable actual door was chosen.

The optional read-only context callback uses production camera clearance and the runtime's current delivery support list, independent of Game's previous-frame cached collision options. An unbuilt endpoint tile returns an explicit pending result; MetroRide retries the same dwell when it becomes ready. Only confirmed immutable obstruction can reject a station for that dwell. Released module callbacks fail closed.

The second read-only callback, `storyPoseClear`, is bound to exported production helper `deliveryStoryPoseClear`. Ten overlapping 1.2 m radius cylinders at no more than 0.5 m longitudinal spacing cover the full 4.8×2.3 m Roadster rectangle, including corners. Their vertical range is floor+0.10…1.80 m, retaining ordinary tyre-floor support below the body. All original static collider classes and current scene solids remain active. The tighter longitudinal sampling preserves full coverage without incorrectly widening the car into a legitimate nearby track guard.

For each actual door, the final pose is checked first. A rejected endpoint immediately prunes that candidate. The route then uses actual `stepStoryPose` and the same shared platform frame as the live story, including turning, lateral roof exit and lowering. Up to 361 poses/18 simulated seconds are checked per door. No unchecked partial bay is used. This simulation is cold preparation, not a second gameplay clock.

Preparation is a cached generator, limited to four yielded parking/volume/camera checks per active update and a 1.5 ms target work budget. The marked real roof remains the story target until the complete plan is committed. Train departure/movement, player movement, pending streaming and teardown invalidate or retry the plan safely. Confirmed immutable failures retain the existing per-dwell rejection. Passenger exit timing starts unchanged only after commit; no cold checks repeat during the exit or held scene.

Production changes are confined to MetroRide and these tiny types/runtime callback seams. The Game camera implementation, normal chase/orbit behavior, manual rail support gates, actual rail route/stop selection, passenger exit distances/stagger/timing, actor assets, platform geometry, collision bodies, pooled light count and handoff timing were not changed by this repair.

## Verification

Current focused log: `evidence/main-expansion/metro-story-camera-physical-focused.log`. Held hashes and measured source-case metrics: `evidence/main-expansion/metro-story-camera-held-source.json`. The older `metro-story-camera-focused.log` remains the passing 113-test camera-only result and does not certify physical bay acceptance.

**118 focused tests pass**, TypeScript passes, and `git diff --check` passes. The run includes the new source-camera matrix, independent exact production-body endpoint/swept-route/cadence tests, and existing MetroRide, delivery runtime, story actor camera, automatic story, independent physical contact/runtime, train-light and immersive-module regressions.

New and strengthened checks cover:

- The exact old native camera result from the real Ameerpet source tile and unchanged clearance code.
- Actual production Game.updateCamera retaining the new authored eye/subject despite a previously dragged orbit.
- 32 shots across Ameerpet Blue/Red, HITEC City, Madhapur, MGBS Red/Green and Parade Grounds Blue/Green, both travel directions and front/rear reference coach positions.
- Clear actor-centered paths throughout the actual staggered passenger exit; all four heads remain in the landscape frame.
- All four standing feet-to-head silhouettes and the parked Roadster's full corner bounds fit a 932×430 landscape camera.
- Actual emitted station triangle rays to every final torso and face; real collision volumes; Roadster cabin clearance.
- No repeated geometry probes during 120 subsequent animation/held frames.
- Current support additions/removals take effect before Game updates its camera options; stale contexts are rejected.
- Pending streaming retries the same real station, while existing immutable-bad-platform rate limiting remains intact.
- Independent actual Roadster skin vertices no longer intersect the strict rendered 2.5 m lift shaft at either the final bay or any actual StoryDirector approach pose. The original 325-vertex endpoint penetration and frame-8 route penetration remain preserved failure evidence in the independent report.
- Preparation has at most four clearance callbacks per active update, keeps the original marked roof while incomplete, cancels after train departure or a changed player pose, and releases completely on teardown.
- The physical-volume callback covers a body corner obstacle, current support additions/removals, pending geometry and a released module context, while preserving tyre-floor contact.

## Preparation timing limits

The exact native Ameerpet source case measured 85 pose and 14 camera queries across 26 preparation updates in the final combined run: 23.36 ms total work and a largest 1.583 ms elapsed update. The independent negative-direction/initial-roof-yaw fixture measured 190 total clearance callbacks across 49 updates, at most four per update, largest 1.716 ms and 39.4 ms total on desktop Node. All 120 subsequent retained frames performed zero further preparation queries.

The budget is a target checked between indivisible operations, not a hard elapsed-time guarantee. The final combined suite recorded a 42.99 ms elapsed outlier elsewhere in the 32-shot matrix, despite the four-call count bound; an earlier isolated matrix run's largest slice was 5.52 ms. Scheduling, allocation or an indivisible query may exceed the target, and the specific outlier cause was not established. These are desktop preparation measurements, not physical-phone FPS, thermal or sustained-performance evidence. The cold work is staged rather than charged to one arrival frame; further profiling should use native active-frame evidence before making a performance claim.

The actual geometry check intentionally permits a slim open stair handrail post to cross an isolated lower-leg ray on some upper platforms. It still requires full screen framing and unobstructed torso/face triangles. This is ordinary minor foreground structure, separate from the original opaque scene obstruction. No production triangle/renderer scan was added.

These offline checks do not approve final face pixels, likeness, night exposure or end-to-end native interaction. Root owns the separate frozen 19 day/night replay of actual manual boarding → different station → passenger exit → physical handoff → retained viewing → Next. The original frozen 17 screenshot and failed physical-bay evidence remain unchanged.

## Held fingerprints

```json
{
  "src/delivery/modules/metro-ride.ts": "238cf4150a84a80099cf56d08823ecd49f4491365b3b43f5f7da52a18224f1a8",
  "src/delivery/modules/types.ts": "4574e258b693012d843db812646cc10d3ac315a9d4240f912698f7e99bec59ab",
  "src/delivery/runtime.ts": "d9ea5c813aee2995fa76cbfd891e31c30bf980097965064f8bcb9fe0b5db29ca",
  "src/game/game.ts": "2f334cf53add4efb8813f189ef7b93ed680c8f86f31a17813b8369a57f453150",
  "src/game/spatial-safety.ts": "8c270d48dae6e9140cf52d7864cfb43f6e869218e81d386b8f9aad22602fadce",
  "tests/v21-fixes/metro-story-camera.test.ts": "ed59b10ae30655f9148527c6838000bad8ea27608b892bf6bd8e33551be5ebb1",
  "tests/v21-fixes/metro-story-physical-independent.test.ts": "983841b31df91d428fa6c22196f9175b33e495c82ddc4afb564d61a78e9a3ea5",
  "tests/v21-fixes/metro-ride.test.ts": "9fc5aea73d0a87ed082dcc6d9269026c3f74550c2050976ac49dbdbbdcd9ea8b",
  "tests/v21-fixes/delivery-runtime.test.ts": "25a4d2c099350d4d2ddf22deb1437f6df03fa4c62cb348b2cc8fbf5b92345cdf"
}
```

Production source is held for Root's independent native replay. No browser or publication action was performed by this producer.
