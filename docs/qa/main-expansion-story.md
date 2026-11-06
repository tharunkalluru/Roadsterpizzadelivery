# Automatic story implementation and acceptance

Baseline: private fourteen-level main, commit `9a01bd6`. Implementation is on `codex/story-realism-main`; the retired Version21 project is not a release target.

## Implemented behavior

- The existing carrier selection and physical jump-grab remain the pickup mechanism. Scene-only content never presents a manual drop/dive/handover button.
- `StoryDirector` separates driving, playing, character viewing and transition. Capturing input does not set the simulation-blocking dialog flag. Actual scene modules, trains, traffic, character animation and support carry continue updating. Pause, background, portrait and actual dialogs still stop active simulation normally.
- Each module supplies an authored local story waypoint. Ordinary scenes require nearby horizontal/vertical arrival; the truck has its own rear entrance and ramp sequence. Ram requires a genuine grounded landing on any coach of the marked rake; metro boarding remains the existing actual-rake roof/departure/next-station gate. Flying near a roof cannot start either ride.
- Truck motion aligns behind the real ramp, waits for it to open, crosses the rear boundary on its actual rising floor, enters the aisle, stops and uses the existing physical handoff. Train motion proceeds toward the customer along the existing coach sequence. Metro leaves the roof laterally before lowering onto the actual next-station platform, avoiding a diagonal path through the coach side.
- Generic street scenes use their actual handoff points; Jessie rolls alongside; Sukumar finishes at the authored parking angle; Salaar enters through the sliding front gates rather than capturing a side-wall approach. Devara descends at the existing bounded water scene and remains underwater after placement until Next.
- The runtime requires both the module's physical action gate and convergence to its authored waypoint before automatically handing over. Movement is bounded by active seconds; long background time cannot produce a catch-up teleport. Wheels roll during scripted travel, and actual support pitch is retained.
- Cinematic presentation hides the HUD, map, speed, navigation, pickup hint, target ring and driving controls. Pause remains available; Next appears only after completion. An input sampled just before capture is consumed so a queued Jump/Fly cannot leak into the new sequence.
- Completed modules, actual character instances and their occupied support/train remain alive indefinitely. Progress completes once. Next directly clears the old interaction and calls the existing atomic relocation/loading path for a real ground-level main road near the following delivery. Candidate main roads are 1.25–1.75km from its configured destination; actual safe placement remains bounded to550m and must validate a clear40m drive. Moving train/metro targets are resolved through their existing live services.
- Loading now awaits the current next-scene character preparation in addition to city/view readiness. Explicit Retry works while the game clock is paused, and stale relocation requests still cannot overwrite a newer choice. Failed loads preserve earned progress.
- Final delivery first holds its actual scene. Next opens the existing restaurant grand-opening presentation; Explore then returns to free roaming. The optional old scripted-call architecture is retained for historical content tests; the fourteen-level scene-only campaign uses automatic stories.

## Checks completed before independent acceptance

- `story-mode.test.ts`:16 groups exercise all14 current mechanics, physical passes, indefinite viewing, Devara staying submerged, manual train/metro gates, real next-station progression, coach-side clearance before platform descent, invalid coordinates and bounded hitch motion.
- `delivery-runtime.test.ts`:33 groups, including an automatic actual-runtime completion/scene-retention/single-Next/progress-preserving relocation regression. Existing legacy call, route, retry and completed-scenery contracts remain covered.
- `scene-preparation.test.ts`:11 groups, including current-priority loading and paused-clock Retry without duplicate work.
- `delivery-ui.test.ts`:21 groups, including a nonblocking scene view with Next only after completion and the retained opaque Samsung-safe dialog treatment.
- Existing map relocation tests were updated with the new current-character preparation adapter. The source-road railway-opening test now checks the real local context tile after the long-road streaming fix. The single-rake lifecycle fixture explicitly excludes random ambient services so valid independent turnout reservations cannot make its controlled timing assertion nondeterministic; multi-train conflict suites remain separate.

The full current/legacy suite must run again against the final integrated source after remaining art/vehicle iterations. Focused tests are not visual acceptance.

## Observed native gameplay, interim snapshot

Immutable assisted scene build `/tmp/roadster-final-frozen-qa-main-story-1`, fingerprint `68d70cde38a7de4c578312b26ba9f3e27fbde02b378b96c240011941e697e5e5`, contained the first story implementation and existing15 approved avatars. Chrome testing explicitly used Prepare order and Stage at scene approach, so it is **assisted scene evidence**, not proof of a normal pickup or full campaign.

Observed: the Roadster entered through the container ramp, completed the actual handoff, retained Pushpa visibly inside the occupied moving truck for several minutes, and exposed only Pause/Next. Pause/Resume retained the scene and restored Next. Next immediately relocated to Wellington Road for level2 and returned the normal HUD and carrier pickup state, without requiring an old-location exit. The later final-position/wheel/input refinements require a fresh native pass.

## Required remaining gates

Independent story source/visual review, native normal jump-grab and travel, all14 scene completion/view/Next checks, real manually controlled train and metro landings, failed loading Retry, final restaurant flow, landscape/touch/desktop/background compatibility, and final-source performance observations. No physical-phone FPS/heat/battery result is established by these fixtures or desktop observations.
