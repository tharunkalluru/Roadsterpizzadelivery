# Vehicle lighting repair — 2026-10-30

## Diagnosis

The Roadster had emissive lamp surfaces but no forward light sources. Several NPC car lamps were also hidden inside the bevel beyond their nominal collision footprint. Rotating the camera could reveal their surface intermittently; increasing global night exposure would not repair either cause.

## Changes

- Two Roadster headlights originate just outside the real front light strip, parented to the visual car body. They follow road pitch, steering, takeoff/kickflip and flight, independently of the camera. There is no floating road decal or camera-mounted light.
- Red tail lights remain on. Holding BRAKE while moving forward or stopped makes them brighter. Actual negative velocity enables two separate white reversing lenses. Rear light spill faces behind the bumper, so it does not blow out the car's own paint.
- All 40 ordinary traffic prototypes have exposed white front and red rear surfaces. Separate shared overlays activate only for actual braking/standing queues/dwells or reverse, with a 0.22-second brake hold to avoid frame flicker. Two-wheelers have no invented reverse lamps.
- NPC headlights illuminate the local road through a fixed reusable pool: two sources on Low, three on High, within 65 m and the same approximate elevation. Other NPCs keep visible emissive lamps. Selection uses hysteresis; no per-vehicle real lights, new shadow maps, or per-frame sorting/allocation.
- Both delivery truck variants also have exposed white/red lenses. The fallback truck folds these into its original cab batch and retains the existing 15-mesh budget. The larger enterable truck uses two instanced lamp draws.
- Beams fade with the existing dawn/dusk mood. Low remains readable without bloom. High uses separately calibrated beam gain to avoid excessive HDR bloom washing out white vehicles. Interface materials, physics, traffic timing, camera behavior, and graphics resolution are unchanged.

## Browser checks actually performed

Local isolated QA scenario: `?qaDelivery=1&qaNight=1&qaTrafficOrbit=1&qaTouch=1&q=low` (and `q=high`). These development-only controls use temporary progress and stage ordinary vehicles for inspection; they do not alter the published campaign.

- Low graphics at 800 x 360 landscape: used GO, BRAKE, fresh stopped reverse press, camera orbit, FLY, and day/night switch. Observed red rear lights on staged bus, auto, bike and car; brighter Roadster brake strip and rearward red spill; separate white lenses during actual reverse.
- High graphics at 1280 x 720: inspected the same staged scene. The first check exposed too much bloom on white traffic; reduced the HDR beam gain and captured the corrected scene.
- Daylight QA readout showed `real beams 0+0`; nighttime street readout showed `2+2` on Low / `2+3` on High. Airborne Low readout showed `2+0`, releasing NPC street beams when the player was far above them.
- Desktop W/S stop and Space takeoff worked; diagnostic state showed brake ON while stopped and cleared after release. No browser error log entries were captured at the final check.
- `night-tail-lights.png`, `brake-red-lights.png`, `reverse-white-lights.png`, `high-graphics-night.png`, `daylight-no-road-beams.png`, and `desktop-keyboard-stop.png` document those observations. `camera-orbit-headlights.png` records the earlier side-angle check; subsequent rear-spill tuning did not change the camera or front mounts.

## Automated verification

`npm run check`: 493 current tests, 38/38 portable legacy suites, client/Worker TypeScript and production build. New coverage includes exact visible lamp-source positions across all prototypes, actual traffic braking and bus dwell, independent shared-material states, reverse lamps, full yaw/pitch/roll transforms, fixed pool budget/reuse/release, day/night transitions, delivery truck lens occlusion with its ramp open, and resource disposal.

These are desktop browser compatibility/visual checks and offline regressions. They do not establish physical-phone FPS, battery life or thermal performance. Real lights are bounded and shadowless; they are a local illumination approximation, not an automotive ray-tracing simulation.
