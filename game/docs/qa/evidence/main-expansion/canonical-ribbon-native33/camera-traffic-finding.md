# Nearby traffic and the phone chase camera

The native33 export shows separated vehicles and no displayed traffic triangles crossing the camera near plane. It does not reproduce physical vehicle overlap or camera clipping. No camera, headway, traffic visibility, model, road, solver, timing or FOV change is justified by this capture.

## Native evidence

- Runtime fingerprint: `dd1e73b88bbb847e135e36de98670ab98494485d989ca0b955baaa42a5cbcbd5` (frozen33).
- Native browser viewport: 844 × 390; low quality; ordinary driving controls with the opt-in `qaCameraTraffic=1` diagnostics.
- Explicit start: `(-14534.002057443477, -2821.428003884871)`, yaw `2.8001402152800905`, supplied road height `2.863`. The observer used Reset drive start, drove W for 7 seconds, braked for 1.1 seconds, drove W for 5 seconds, and braked for 1.4 seconds.
- Exact exported player pose: `x -14586.159916270839, y 1.148841491307472, z -2674.6582150917366`; speed `0`; road support `0.5988414913074719`; no jump, flight or descent.
- Export clock: `233.0199999999874` gameplay seconds. The game was stopped through normal braking and `paused` was `false` when the native download button was clicked.
- Camera: `(-14583.88289524715, 2.99884149130747, -2681.0656463444116)`; vertical FOV `60`; aspect `2.164102564102564`; near plane `0.3`.
- Original download preserved at `/Users/tharun/Downloads/qa-camera-traffic-1793762729291.json`. Its byte-identical evidence copy is `qa-camera-traffic-1793762729291.json` beside this report. Both SHA256 values are `0a67c20597c56610a4a10d0ffe0479a7fd928b859b308e148b40ded012b4276a`.

| Exported nearby body | Player distance | Aligned bumper gap | Player body overlap / overlap with 0.18 m margin | Eye inside hide volume | Displayed near-plane triangle crossings |
| --- | ---: | ---: | --- | --- | ---: |
| Car #28, 1.735 × 1.525 × 3.995 m | 4.666 m | 0.267 m | false / false | false | 0 of 9,026 triangles |
| Bus #40, 2.5 × 3.3 × 11 m | 13.847 m | 5.131 m* | false / false | false | 0 of 20,230 triangles |
| Truck #21, 2.3 × 3.22 × 8.2 m | 15.882 m | 9.370 m | false / false | false | 0 of 12,876 triangles |

*The bus is 4.682 m to the side in its own frame, so its aligned gap does not describe a same-lane queue. The raw export retains all literal poses, rotations, body sizes and camera matrices for independent review.

The nearest following vehicle is a car, not the truck. Its nominal body remains separated from the player, including the simulation's 0.18 m swept margin. Its mesh reaches forward-camera depths from `0.1895` to `4.4189` m, but none of its triangles intersect the actual near-plane rectangle. A vertex with depth below the near distance alone is therefore not evidence of visible clipping.

Every exported truck vertex is behind the camera: its camera-space forward depth range is `-13.0771` to `-4.7814` m. The bus is also entirely behind the camera (`-12.0297` to `-0.6331` m). Both remain present and visible in the scene. Neither can produce foreground pixels at this exact exported camera pose.

## Relationship to native32

The earlier native32 `10-phone-sized-drive-brake.jpg` shows red nearby-vehicle geometry along the lower edge. Its exact traffic/camera state was not exported. Native33 is a new run with ordinary traffic evolution, so its export cannot retroactively identify that native32 vehicle or prove the earlier eye/body relationship.

Treat the original native32 foreground as legitimate visible nearby geometry unless a synchronized future image and state capture proves a clipping defect. Physical overlap, an eye inside a truck, and a near-plane crossing remain unreproduced hypotheses for that image. The visible foreground alone is not a reason to hide traffic, delete a bus, increase headway, or rewrite chase-camera framing.

## Separate source mechanism and negative control

Current and frozen32 code agree on the relevant behavior:

- `Game.clearCamera` and `insideSolid` check city/active delivery solids. They do not trace ordinary NPC traffic as camera obstacles.
- `Traffic.hideNear` preserves sightline traffic and hides only when the eye point enters the displayed nominal body expanded by 0.1 m. It does not hide a bus merely because the bus crosses the player sightline or the player jumps.
- The actual camera near distance is 0.3 m. At 844 × 390 with a 60-degree vertical FOV, the near-plane half-width is about 0.375 m. This permits a possible lens/body intersection while the eye point remains outside the 0.1 m hide margin.
- NPC movement independently checks nominal vehicle separation in steps no larger than 0.4 m with a 0.18 m margin. Player-following speed approaches zero bumper gap, while ordinary NPC following includes a 1.6 m rest offset.

The source test deliberately places a displayed truck box at a legal 3.9 m aligned bumper gap, with no nominal or 0.18 m player overlap and a clear eye point. The 844/390 lens crosses displayed triangles; changing only aspect to 1 gives zero crossings. This is a meaningful mechanism/control pair. It is not a reproduction of native32 or native33, and it supplies no independent reason to change gameplay.

## Changes and validation

Only development QA observation was added:

- `src/delivery/qa.ts`: `qaCameraTraffic=1` appends diagnostics to the existing 250 ms QA readout, exposes an explicit snapshot download, supports F2 hide/restore, and revokes its download URL on cleanup.
- `src/delivery/qa/camera-traffic-observer.ts`: copies literal player/camera and up to 12 nearby traffic poses. The optional export scans existing displayed matrices and mesh vertices. It never updates scene matrices, computes cached geometry bounds, renders, changes visibility, advances time, or changes controls.
- `tests/v21-fixes/camera-traffic-observer.test.ts`: tests the wide-lens/narrow-lens mechanism and verifies observation does not mutate transforms or geometry caches.

Validation passed: observer tests 2/2; existing delivery QA tests 5/5; `npm run typecheck`; scoped `git diff --check`. The QA entry remains imported only through the existing `main.ts` development gate. The new helper installs no frame loop. Displayed triangle telemetry is geometric evidence, not pixel coverage, GPU timing, device acceptance or full-campaign acceptance.

The current driving camera, gameplay timing and traffic behavior remain unchanged. Road source/profile/cache and release acceptance are outside this finding.

## Additional native orbit observation

Root resumed the same frozen33 game at the unchanged stopped Roadster pose, reset the temporary viewport override to the ordinary 1579 × 1180 browser, hid the QA panels and dragged the actual scene from `(915,590)` to `(1210,590)`. The camera rotated to a front/side view. The queued brown car and blue truck stayed visibly present; the Roadster, normal HUD and night headlight pools remained rendered. `11-native-orbit-night-retained-traffic.png` records that unobstructed view. This is one scoped native orbit observation, not an all-angle visibility or final phone verdict.

The resulting native export is `/Users/tharun/Downloads/qa-camera-traffic-1793765157959.json`, with the byte-identical copy beside this report and SHA256 `a3798d0fe2019d20447916232a644970964e6cd8fa9b7431e39f9067e5963f7e`. At gameplay time `575.4827000001161`, player position and yaw still match the earlier stopped pose. The eye is `(-14592.289592399437, 2.998841491307472, -2671.714226206153)`, aspect `1.338135593220339`. Car22 and truck18 both report visible, no nominal/swept player overlap, no eye inside their hide volume, and zero displayed near-plane triangle crossings. The game was then paused through its normal Pause button. No camera or traffic behavior was changed.
