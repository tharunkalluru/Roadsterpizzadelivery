# Driving HUD refresh — 2026-10-30

The mystery-delivery preview now uses fixed top-center navigation, a speed capsule on the minimap's lower arc, and contextual call prompts on the steering row. Day/time, dynamic level progress and restaurant access are in Pause. Map credits remain accessible through Pause rather than covering the city view. Nearby rendering, physics, camera timing, routes and progress rules are unchanged by this pass.

## Verification

- `npm run check`: TypeScript client/Worker checks, 438 current regression tests, 38 portable legacy suites and production build passed.
- Production Hud and DeliveryUI browser audit: 8 combined notice/action states passed at 568×240, 568×320, 667×260, 667×375, 800×360, 1024×768 and 1280×720. Each JSON records the actual viewport, rendered rectangles, loaded fonts and per-state failures. Only the intended speed-within-map relationship overlaps.
- Actual gameplay with one pointer and forced touch controls: free roaming and an en-route level 6 order had no unavailable phone control; the level 3 arrival produced Incoming call, and answering opened one opaque phone panel. A level 5 arrival exposed Call customer and opened its real fixed-script conversation. The QA launcher skips the pickup only; arrival/call actions are manual.
- GO, BRAKE, both steering directions, JUMP and FLY were held and released through browser input. Computed transforms and `aria-pressed` confirmed immediate feedback and cleared release states. `go-pressed.png` captures GO; `control-presses.json` records the remaining controls. Speed was observed changing from 0 to 18 and 64 km/h in the map capsule.
- Pause was opened during an active order. It showed Level 5 / 7 with four completed segments and the current segment highlighted. Restaurant collection opened from Pause, isolated the other HUD layers, and returned to the city without changing progress. Additional real-component tests cover 7, 27 and 100 content entries.
- Normal desktop mode without forced touch controls: W/S driving and braking, J jump, M full map, and map close were exercised. Top navigation and minimap speed remained visible; gameplay/map contributor text was absent. Pause → Map credits served the licence page.

## Limits

These are browser/component and actual desktop input checks. They do not establish physical Samsung/iPhone rendering, phone frame rate, thermals or battery life. Full-screen dialogs retain the existing opaque Samsung treatment; translucent guidance and call surfaces use no backdrop blur. No campaign progress was reset on the live preview.

The short 240–279px landscape treatment keeps action targets at least 44px and reduces GO/BRAKE height only in those constrained windows; the normal 320px+ layout retains its established dimensions.
