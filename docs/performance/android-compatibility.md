# Android compatibility investigation — 2026-10-28

Status: complete visible Android delivery passed on `index-aXuXXhTQ.js`; C7B focused checks passed; final BJIR Low and mkht0607 High/input/app-return follow-ups passed. Emulator testing is complete; physical-phone performance remains unverified. This report separates completed interactions from blocked attempts. Emulator rendering and host frame rate are not physical-phone GPU, thermal, battery or sustained-FPS evidence.

## Test environments and builds

- Existing agent-created AVD `Roadster_Pixel_7a_Test`, Android 17 / API 37.1 experimental Google APIs Play Store 16 KB ARM64 image, 4 GB guest RAM, 1080 × 2400, 420 dpi, Chrome 149.0.7827.5. Serial `emulator-5554`.
- Host GPU first, then emulator software renderer `-gpu swiftshader`, without wiping guest data. Baseline Version 21 was also tested in the same AVD.
- Optimized Worker preview `http://127.0.0.1:4199/`. First completed control tests used `assets/index-BDTOTrVh.js` (ready 07:13:59 UTC). Later memory-admission investigation used `assets/index-Q_e-PGZb.js` (ready 07:27:59 UTC).
- Untouched Version 21 baseline at `http://127.0.0.1:4201/?area=RTC%20X%20Roads&q=low`.
- Android input was exclusively agent-owned; native touchscreen input and visible hit-tested CDP touch events only. JavaScript reads were diagnostics. No simulation stepping, teleport, hidden-state mutation or autopilot.

## Completed visible interactions on the existing AVD

| Interaction | Actual observation |
| --- | --- |
| Portrait launch | Landscape gate and Enter Full Screen Mode button appeared. Gameplay controls were blocked. |
| Enter fullscreen | Native button tap entered fullscreen and changed viewport to landscape, 914 × 411 CSS px. |
| Title / area selection | Play and the public RTC X Roads popular-area button reached the loading screen, then a centered swipe offer. |
| Swipe acceptance | Native swipe accepted Pizza Hut order, showing 79 m to pickup and 426 m after pickup. |
| Blocking tip | Got it dismissed the driving tip before control use. |
| GO | Held for 3 s; pickup distance changed 79 → 48 m; HUD reported 84 km/h. |
| BRAKE | Held for 2.5 s and stopped. |
| Pickup approach | Contextual Collect pizza appeared. Collection and handover were not completed in this emulator run. |
| Pause / Resume | Public pause and resume buttons worked. |
| Fullscreen exit | Returned from fullscreen without a page crash. |
| Background / return | Home → Android Settings → Chrome produced a document-hidden transition and returned to the retained session. |

The HUD/control events above are compatibility observations, not successful 3D gameplay proof: the host-rendered AVD showed a flat purple world during these actions. Steering, map-close, JUMP, FLY/LAND, complete collection and delivery were not yet accepted in this AVD run.

Original screenshots are in `output/playwright/android/`: `02-portrait-gate.png`, `04-fullscreen-landscape.png`, `09-final-title.png`, `10-final-area.png`, `11-order-accepted.png`, `12-driving-hud.png`, `13-go-held.png`, `15-pause.png`, `16-exit-fullscreen.png`. Filenames from earlier setup attempts do not imply a pass; images 05–08 were captured around preview rebuild/cached-404 failures and are not final-build results.

## Environment rendering failure and baseline control

The optimized scene issued more than 500 draw calls with a visible canvas, active game state and a non-lost WebGL context, but the host-rendered Android 17 AVD displayed a flat purple world and blocky text-shadow artifacts. The untouched Version 21 baseline reproduced the same purple-world output (`17-baseline-version21.png`, `18-baseline-loaded.png`, `19-baseline-driving.png`). Desktop Chrome rendered the world correctly. This comparison points to this experimental emulator graphics environment; it does not establish a new optimization regression or certify that real Samsung rendering is fixed.

The AVD was restarted with software rendering and guest data preserved. No other AVD or user app was stopped. The emulator's crash-report mode was disabled to avoid an obstructing native consent dialog; no crash report was submitted. Software mode reached asset preparation, but the optimized high-quality initial area then hit the application memory-admission issue below.

## Application memory-admission issue identified

At 07:29 and again after Retry at 07:30 UTC, RTC X Roads initial preparation reached the generic streets-could-not-load panel. Read-only world diagnostics showed:

- active budget 402,653,184 B (384 MiB), staged budget 100,663,296 B, overlap reserve 100,663,296 B;
- active bytes 497,769,656 B, 9 active tiles, 65,306,736 B decoded cache;
- 15 admission failures, no staged/pending tiles after failure;
- failure entries for `0_1`, `1_-1`, `1_0`: **This area exceeds the available city memory budget. Try another area.**

The exception stack entered the admission branch, rather than a fetch or structured-clone error. These exact diagnostics were handed to the coordinator for correction and revalidation. `23-software-retry.png` records the failed attempt. Default settings were Auto (`localStorage` settings absent), but this AVD selected high quality (`lowQ=false`). The high-quality initial-area path must be included in follow-up testing.

## Console evidence and exclusions

`output/playwright/android/console-events.ndjson` contains timestamped console/Runtime/Log events. AudioContext gesture warnings and unsupported `KHR_parallel_shader_compile` warnings were observed. No application console errors or unhandled exceptions were captured during the successful final-bundle stable-software delivery round (07:48–08:01 UTC). Earlier preview-404 failures during rebuild were setup failures, not application defects. A diagnostic script's `renderer.getClearColor()` call without its required target caused one evaluation TypeError; exclude that deliberate inspection mistake from product-console findings.

## Stable Android follow-up setup

A new isolated `Roadster_Android15_Compat` AVD is being prepared from Google's Android 15 / API 35 Google APIs ARM64 image, preserving all existing AVDs. The official current command-line tools revision 23 invokes an x86-only native `android` executable on this ARM Mac and failed with Bad CPU type. The installer was switched to official Java-based revision 19; archives were verified against SHA1 values in Google's repository metadata. No third-party APK source or new service account is involved.

Stable Android 15 was installed and `Roadster_Android15_Compat` created successfully, without altering existing AVDs. Chrome is 124.0.6367.219, bundled in the official system image. Host GPU reproduced the purple world. Restarting this new AVD with SwiftShader resolved it: `34-api35-software-offer.png` shows the Roadster, roads, shops, buildings and flyover in the 3D scene. WebGL reports ANGLE with a SwiftShader Vulkan device. This software-rendering success is compatibility evidence, not phone GPU speed.

On final bundle `assets/index-aXuXXhTQ.js` (ready 07:42:15 UTC), RTC X Roads completed initial preparation in about 10 seconds, Auto chose Low, active bytes were 102,981,980 B, and admission failures were zero. The preceding memory-admission failure is resolved on this tested Auto path. Explicit High remains a separate acceptance case.

Visible software-rendered controls tested from 07:48 UTC: native swipe acceptance; blocking tips; GO and BRAKE/reverse; simultaneous two-finger GO+left and GO+right; moving JUMP (airborne `y=3.675`, `jumpActive=true`, JUMPING label), FLY/LAND including a completed ground landing at `y=0.55`; minimap opening, zoom in/out and Close map; Pause; Back to the road recovery; Android Home → Settings → Chrome. Returning from Settings required the portrait gate again, Enter Full Screen Mode restored landscape and the paused session resumed. The HUD stayed opaque and speed remained centered at the bottom.

An explicit pickup was completed at 07:56:33 UTC by holding the visible COLLECT PIZZA button. The order changed from `toPickup` to `toDrop`, and the HUD displayed “Pizza collected! Garam garam.” and a customer destination. Screenshots `51-api35-pickup-ground.png`, `52-api35-collected.png` (tip after collection), `53-api35-pizza-in-car.png` record this transition. Customer handover completed at 08:00:54 UTC after holding the visible HAND OVER PIZZA button from 08:00:46. The Delivered tutorial appeared, the reward was +230 coins, and the HUD then showed 730 coins and Level 1 · 1/3. Stop requests was tapped, producing Accept orders OFF and free roam. This is explicit completion evidence, not an inference from zero metres or an E press. Screenshots `59-api35-handover-button.png`, `60-api35-delivery-result.png` (Delivered tip), `61-api35-delivered-coins.png` (reward plus next offer), `62-api35-orders-off.png` (730 coins / Level 1 · 1/3 / OFF) record the sequence.

The customer approach landed on a nearby rooftop. The visible “On a roof? Glide down to the street” recovery button was used, after which the car returned to ground height and HAND OVER PIZZA became available. This tested the existing public recovery flow. It did not silently reposition the player through developer state.

The stable API35 AVD uses 2 GB guest RAM, 4 virtual CPU cores and the Pixel 7a 1080 × 2400 / 420 dpi profile. These are emulator configuration values, not an emulation of Pixel 7a processor speed. The final visible software-rendered round ran from 07:48–08:01 UTC, with earlier host-renderer/portrait/fullscreen compatibility checks from 07:44. Setup and paused periods are not counted as active gameplay.

At 08:01:28 UTC the completed-delivery session was paused, with no held touch input, to permit the coordinator preview rebuild. ## Focused validation after the coordinator rebuild

Bundle `assets/index-C7BHzbGQ.js`, tileworker `tileworker-DlLUFAI1.js`, was verified after cache-disabled reload at 08:03 UTC. Progress persisted (730 coins, Level 1 · 1/3, Accept orders OFF). The complete delivery above used the preceding bundle and is not falsely attributed to this later build.

- **Auto/Low initial preparation:** public RTC X Roads selection at 08:03:40, ready by 08:03:49; zero failures, active bytes 138,748,476 B, 879 installation jobs, largest recorded installation batch 6.1 ms. Original `64-C7B-low-near-detail.png` shows nearby road markings, shops, flyover and Roadster rendered correctly.
- **Explicit High initial preparation:** selected High through visible Settings, without a URL quality override; automatic reload, portrait/fullscreen, Play and public RTC X Roads selection were exercised. Ready by 08:05:29 after selection at 08:05:02; `lowQ=false`, `graphicsReady=true`, 8 active tiles, 396,427,724 active B, zero admission failures. `66-C7B-high-load.png` shows the complete High scene and intact opaque HUD. This proves compatibility/load completion, not sustained High FPS on a physical phone.
- **Compact landscape:** temporary Android `wm size 1080x1920` produced 696 × 412 CSS px after system insets. The right-aligned minimap was 140 × 140 with an 18 px right gap. FLY and JUMP remained above GO; BRAKE and GO were both 72 px tall, with separate non-overlapping rectangles. Map open/close and GO/BRAKE worked at this viewport. `67-C7B-compact-pause.png`, `68-C7B-compact-hud.png`, `69-C7B-compact-map.png` preserve originals. Physical screen size was restored with `wm size reset` at 08:06:28; density was never changed.

- **Final app return:** at 08:07:31, Android Settings was foreground and `document.hidden=true`; the paused player position was retained. Chrome returned through the portrait gate, fullscreen restored landscape, Resume restored the visible High scene, GO/BRAKE responded, and JUMP became airborne with `jumpActive=true`, `y=3.675` and the JUMPING label. `70-C7B-background-settings.png`, `71-C7B-high-return-jump.png`, `final-background-state.json` preserve evidence.
- **Independent settings:** visible 120 FPS, 90 FPS and 60 FPS selections worked. At 120 selected, quality remained High and adaptiveResolution remained false in persisted settings. This checks selection/state independence; the AVD's 60 Hz display and software renderer do not demonstrate 90/120 FPS capability. Auto and 60 FPS were restored at 08:08:39.
- **Console:** zero product errors or unhandled exceptions were captured in the C7B focused run. Six warning events were recorded, covering the AudioContext gesture requirement and unsupported parallel-shader-compilation extension. `C7B-console-events.json` contains the filtered events.

No touch is held between commands; gesture scripts always send touchEnd in a finally block. The final page was at the blocking portrait gate after restoring Auto, with no gameplay input active. Temporary physical-size override was reset, density stayed 420, and only the agent-created game tab/AVD and its port mappings were closed at cleanup. Existing AVDs, user tabs, progress and Android Studio projects were preserved.

## Scope and remaining evidence gaps

The valid visible 3D Android round covered 07:48–08:01 UTC and focused post-build checks covered 08:03–08:09 UTC. Paused menus, app-background intervals and setup are explicitly represented above; this is not presented as a continuous timed performance soak. The coordinator's separate desktop run covers the longer requested QA period.

The emulator cannot certify physical mid-range 60 FPS, Samsung-specific GPU stability, 90/120 Hz output, heat or battery endurance. A timed jump over a particular bus was not reproduced on Android; moving jumps and normal rendering were checked, while bus continuity needs separate route-specific evidence. A complete delivery used aXuXXhTQ; C7B received focused regressions rather than another full delivery. No screen recording or pixel-equivalence comparison is claimed. Concurrent SwiftShader AVD activity from approximately 07:48–08:09 increased Mac CPU load during the coordinator's desktop runs and must be labeled in desktop results. Physical mid-range-phone performance remains unavailable; see `device-access.md` for the Samsung and BrowserStack sign-in barriers.


## Final source compatibility follow-up (09:07 UTC onward)

The stable Android15 SwiftShader AVD was restarted at **09:07:19 UTC**, after the coordinator's isolation boundary, for a bounded final compatibility pass. This is a separate run from the earlier successful delivery and C7B tests. New original captures/diagnostic JSON are under `output/playwright/android/final/`.

Initial candidate **`assets/index-BJIRiEt4.js`**, source commit `497e169a0012a42d7cbc5cd4e39f9a6e7f11d3aa`:

- Chrome first displayed its own ad-privacy education screen. Opening Settings and returning dismissed that setup interruption without changing ad settings. Multiple queued native URL intents briefly produced two agent-owned game tabs; the extra tab was closed before actual gameplay checks. Early target/hidden-tab automation attempts are setup failures, not product defects.
- Portrait gate, fullscreen and landscape were exercised. Public Play → RTC X Roads was selected at 09:10:30. The loading screen remained over preparation, with no partial world exposed. At 09:11:01 the complete scene was visible and `graphicsReady=true`, `gameplayActive=true`, 4 tiles, 138,748,476 active bytes and zero admission failures. The exact readiness time is bounded by the last loading observation at 09:10:42 and the visible observation at 09:11:01.
- Software-emulator `installMaxMs` recorded 405.3 ms during initial preparation. This is retained diagnostic evidence, not a physical-phone frame-time result, and was covered by the initial loading screen. No all-staging-under-4-ms claim is made from this run.
- Progress retained 730 coins, Level 1 · 1/3 and Accept orders OFF. GO/BRAKE, JUMP, map open and Close map worked. The opaque HUD, right minimap and centered bottom speed remained intact (`06-low-visible.png`).
- Paused at 09:11:40 with no held input to permit the coordinator's diagnostics-only rebuild. This new follow-up does not claim another full delivery. Newest-bundle High/app-return checks are recorded below under their separate hash.


### Newest diagnostics-guard bundle: `assets/index-mkht0607.js`

The coordinator restarted the preview for a presentation-measurement guard (source `f368d75`). The earlier BJIR result above remains labeled separately. High was chosen through the visible Settings menu, causing a full reload; `10-mkht-high-gate-state.json` confirms the exact newest bundle and persisted quality High, without a URL override.

- **Initial High preparation:** public Play → RTC X Roads selected at 09:16:16 UTC. The opaque initial loading screen was still shown at 09:16:32; by the 09:17:16 observation the complete 3D scene was visible with `graphicsReady=true`, `gameplayActive=true`, 8 active tiles, 396,427,724 active bytes and zero failures/admission failures. Readiness time is bounded by those observations; no precise startup-duration claim is made. Screenshot `13-mkht-high-ready.png` visibly confirms the Roadster, road markings, shops/buildings, pedestrians and flyover with intact opaque HUD.
- The SwiftShader initial-preparation maximum installation sample was 532.6 ms; activation maximum was 57.3 ms. These are emulator-host startup diagnostics covered by the loading screen. They do not establish physical-phone frame time or a universal per-batch budget.
- **Visible controls:** GO and BRAKE responded; FLY entered flight and showed LAND. The car reached an observed height of 21.706 m before pausing. Minimap open and Close map worked. Original state/screenshots `14-mkht-flight*`, `15-mkht-map.png` record the actions.
- **App return and input blocking:** paused before Home → Android Settings. `17-mkht-hidden-state.json` at 09:18:20 records `documentHidden=true`, fullscreen false, paused true, active false, zero speed and retained airborne position. Returning to Chrome showed the portrait gate; Enter Full Screen Mode restored landscape, Resume returned to the visible High scene, and LAND started descending with the LANDING… label (`19-mkht-return-land-state.json` and PNG). A completed ground landing was not retested in this final bounded pass; it was completed in the earlier delivery round.
- **Progress:** 730 coins, Level 1 · 1/3 and Accept orders OFF persisted. No additional full delivery is claimed on this final bundle.
- **Console:** the attached observer captured six known warnings and zero application errors/unhandled exceptions during this follow-up. The final observer covered the page from approximately 09:09 UTC; prior native Chrome setup was not a gameplay-console test. Filtered raw events are in `output/playwright/android/final/console-events.json`.

Cleanup at **09:19:14 UTC**: restored Auto, 60 FPS, adaptiveResolution false; confirmed physical 1080 × 2400 / density 420 with no overrides; final page blocked at the portrait gate, with no held input. Only the agent-created game tab and the owned stable AVD were closed; ADB port mappings and observer were removed. `20-final-cleanup-state.json` preserves the final bundle/settings/gate state. The AVD is not running, allowing the coordinator's final isolated CPU measurements. Android SwiftShader host contention for this follow-up was approximately **09:07:19–09:19:14 UTC** and must be labeled separately from isolated desktop runs.
