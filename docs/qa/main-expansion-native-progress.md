# Integrated native QA observations

This is an intermediate development record, not final campaign or phone-performance acceptance. Root operated the actual Chrome game through CUA. No injected player poses or browser state evaluation were used; explicitly labelled development controls supplied the assistance below.

## Frozen feature candidate 2

Runtime fingerprint `5ec3ceb7403c9d92539d1e547ff9a09ff838ba20cc0a3b6333ca6a49457670d0`, desktop Chrome, Low graphics, 1579×1180.

- JBS Green-line approach: the visible Reset drive start control restored the authored source heading, then Q and W launched and flew the car toward the real station. Space stopped it above the canopy at x120.39/z−4208.79/y39.37. See `evidence/main-expansion/green-line-manual-flight-hover-v1.png`.
- Rasoolpura/Begumpet Airport flyover: from the packed road start, W for10s followed by braking travelled approximately182m and retained the elevated deck at y7.35. See `rasoolpura-manual-fast-entry-v1.png`. This is an actual fast entry, not a reproduction of unknown original screenshot GPS.
- IKEA southern join: actual W/brake input travelled approximately37m from the packed road start and retained road height y.55 across its32.67m edge. See `ikea-manual-road-join-v1.png`. The continuation bends; this does not assert that straight travel through its genuine outside curb should be allowed. The whole four-edge continuation is separately covered by production-input tests.
- Station gallery: MGBS Concourse was recaptured after confirming the new camera view had painted. `metro-mgbs-green-concourse-rechecked-v1.png` shows the actual open interior. The earlier similarly named capture contained a previous camera frame and is not concourse acceptance evidence.

## Frozen feature candidate 3

Runtime fingerprint `da3a46cc6653abed674a3722bb8864cccdce6c41e43716024e0f905cf5c22060`, desktop Chrome, Low graphics.

- Train scenario2: Prepare order skipped the pickup. Land above rear coach supplied the explicitly assisted descent onto the actual story rake. The game established contact with `rail:story:2:7`; proximity did not begin story while airborne. **Found a runtime bug:** the customer was122m away, beyond the100m controller gate, so capture did not start on that valid rear landing. Source correction now lets an actual module-verified marked-rake touchdown satisfy scene-only arrival; it does not grant arrival from flight or a different rake. A fresh final native replay is required.
- In this older frozen build, driving along the roof until the distance reached92m began automatic story. It traversed real coach contacts7,6,5,4,3,2, completed the handoff, and retained the moving customer scene with only Pause and Next. See `train-story-first-native-v1.png` and `train-held-clean-v1.png`. The initial shot placed the camera inside the Roadster cabin; source framing has since been moved sideways and needs a fresh capture.
- Next visibly displayed “Loading Hyderabad main road…” and restored driving/pickup on a different road near the following level, without requiring an old-train departure. `train-next-new-road-v1.png` captures that new road, **not** the transient loading screen. The loading screen itself was observed in the accessibility state.
- Vehicle gallery: all12 production families, six views each were captured by following the actual gallery links and confirming each loaded document. `vehicle-captures-v2.json` records72 captures. These are visual/attachment evidence, not a moving-traffic or FPS benchmark.

## Frozen feature candidate 4

Runtime fingerprint `70d5a0e9da15178ebd7485f882f74e7b6f44ea024bb63d4a503f2d0a418c0577`, desktop Chrome, Low graphics, forced touch HUD.

- Metro scenario10: Prepare order and Stage at scene approach supplied an explicitly assisted real-roof descent. The game then rode the real metro to a subsequent station, moved to its actual supported platform, animated the lawyer and three companions exiting, completed the physical handoff, and retained all four with Pause and Next. `metro-held-initial-framing-v1.png` records the held scene. It exposed an overly close, downward group shot; source framing now uses more distance along the platform while retaining the outside-guard clearance. A fresh final capture is required.
- NPC wardrobe v5: nine actual production views and repeatable gait phases are recorded by `npc-captures-v5.json`. Native limb topology is improved, but the producer found remaining costume and attachment defects; these images are rejected development evidence.

The real jump-grab pickup, latest source gates and camera changes, all14 final stories, final touch layout, sustained performance, exact final archive, and live private deployment still require final integrated acceptance. No physical-phone FPS, thermal or battery result is claimed.

## Normal campaign pickup and first story, frozen 7

On the immutable private QA build `b871b3770c8136e7572fa9e261a11173732a4d4c537fca0e752e81299e683f33` (port4257), the main agent used normal keyboard movement/flight/landing, the visible Jump control, and a real nearby traffic slice. No Prepare or Stage actions were available in this full-campaign session. The slice was caught during the real jump; road navigation and the minimap route appeared. The agent then followed the flight guidance to the truck. A manual landing initially reached a metro platform, so the standard R road-recovery action was used before driving to the truck's rear approach. This recovery is explicitly recorded as `player-relocated` assistance; this is not a claim of an entirely unassisted campaign.

The real rear approach captured the story, removed movement controls/map/navigation/speed, traversed the existing truck ramp and interior, completed the physical delivery, and retained Pushpa's reading scene with only Pause/Next. The held scene remained until the agent clicked Next. Native Chrome accessibility then showed a fresh Wellington Road spawn, restored driving controls, and a new glowing-slice search. The brief loader was not caught in that particular screenshot; other native transitions and the independent runtime/loader tests cover it.

Evidence: `evidence/main-expansion/normal-jump-grab-pickup-v1.png`, `normal-campaign-pushpa-held-phone-v1.png`, and exact downloaded `normal-campaign-pickup-delivery-v1.json`. The old schema2 report correctly records the natural pickup and standard recovery, but its now-obsolete manual-drop/truck-exit expectations are not used to accept the new story workflow. Updated schema3 instrumentation is reviewed separately.

The 932x430 layout was exercised with mouse/keyboard, not a physical phone or trusted touch. The passive export contains 1,021,333ms (about17.0min) of focused unblocked simulation-observer intervals, 61,208 callbacks, about59.93 callbacks/s, p50 16.625ms, p95/p99 17.625ms, and a583.3ms longest interval. These are desktop observer-callback statistics, NOT GPU-completed frames, a phone FPS result, thermal evidence or a final-build benchmark. Multiple local review sessions and authoring/test work existed during this development run; do not treat it as a controlled A/B.
