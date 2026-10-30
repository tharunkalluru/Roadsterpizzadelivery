# Prototype speed badge and train roof continuity — 2026-10-30

## Changes

- The opaque plum speed badge crosses the minimap's lower cream rim and extends below the circle. Its lower edge is below the circle, so no map crescent can appear underneath it. Width is about 60% of the circle; height and rounded-rectangle corners scale with the circle. The badge's actual overhang is reserved above FLY and around other notices.
- Physical coaches carry explicit same-rake/index metadata. Only consecutive coaches with a small coupling gap gain a narrow graded roof join. The locomotive's shorter support and 0.275m roof change are included. Angle-aware overlap closes off-center gaps at curved coach end faces.
- Existing physical coach IDs/counts remain unchanged. Delivery selection still selects a real coach. Roof joins add no meshes or draw calls. Below-roof collisions, unrelated trains, missing coaches, oversized gaps, leaving the roof side and takeoff retain their normal behavior.

## Verification

- `npm run check`: 462 current tests, all 38 portable legacy suites, client/Worker TypeScript and production build passed. The subsequent browser-fixture-only change to stress 120 km/h also passed standalone TypeScript checking.
- Twenty-three new train tests use the actual Player and RailTrains updates: rear-coach descent, forward/reverse traversal in both train directions, 30/60/120Hz and 100ms steps, actual graded curves, parked coupling contact, 120km/h roof traversal, locomotive transitions and below-roof/other-rake/edge negative cases.
- Independent curved-gap reproduction sampled 10,503 roof points on 75–500m-radius curves at offsets up to ±1m. The formerly unsupported end-face wedges were absent.
- Actual game at 800×360 with touch controls and Low graphics: normal descent landed on rearmost `rail:0:12`; GO crossed into coaches `rail:0:11` and `rail:0:10`; BRAKE/reverse returned to `rail:0:12`. Visible diagnostics recorded roof contact and car height around 4.83m throughout those joins. No flying or jump was used to cross the gaps.
- At 5m from the selected customer coach, the normal call was completed, diagnostics were hidden, and DROP initiated the physical handoff. The game displayed **Delivery complete · Ram Charan · Level 2 / 7** and the Covered cart upgrade. `train-delivery-complete.png` is the actual result.
- The DEV-only `qaTrainRide=1` launcher stages a descending car above a real rear coach, without attaching it or altering train motion. It skips initial pickup only; driving, call and delivery were manual. Temporary in-memory campaign progress was used, with no live progress reset.
- Production HUD/DeliveryUI combined-overlay audits passed eight states at 800×360, 568×240 and 568×320. Narrow audits use the three-digit 120 km/h readout and assert both number and unit text fit inside the opaque badge. The desktop audit is recorded separately in its JSON.

These checks establish browser layout and gameplay behavior, not physical-phone FPS, thermal or battery performance. The original Version 21 deployment is unchanged.
