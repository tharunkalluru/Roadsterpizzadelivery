# Mystery deliveries V1: implementation and verification notes

Recorded 2026-10-29 for `codex/mystery-deliveries-step1`. This is the isolated mystery-delivery branch, not a statement that the public Version 21 link has been replaced. Build metadata identifies this release as `mystery-deliveries-v1`. Recheck the deployed build identity before reporting any preview as live.

## Scope

The branch replaces random order offers with seven content-driven mystery deliveries. Existing driving, flying, Jump, traffic, map, railway simulation and landscape HUD remain the host. There are no spendable coins, rewards currency or collectibles in this mode; the collection is a record of completed customers. Progress is `Level N / total`, with `total` read from the level array.

`Game.carrierPickupMode` currently enables the new flow for this branch. Legacy dispatch and save code remains dormant for comparison. It is guarded from generating offers, accepting old requests and applying old payouts. Removing dormant legacy code is a separate cleanup; it is not required to erase the player's old save.

## Architecture and ownership

| Part | Responsibility | Main source |
| --- | --- | --- |
| EventBus | Typed synchronous events; unsubscribe on disposal | `src/delivery/core/events.ts` |
| CarrierMarker | Select eligible nearby NPCs; attach and recycle pooled pizza boxes | `src/delivery/systems/carrier-marker.ts` |
| PickupDetector | Jump-only swept overlap and one-order latch | `src/delivery/systems/pickup-detector.ts` |
| Pickup clearance | Reject grabs through buildings, decks and walls | `src/delivery/systems/pickup-clearance.ts` |
| OrderSystem | Assign the next unlocked content entry; expose anonymous destination | `src/delivery/systems/order-system.ts` |
| NavSystem | Place name, distance and relative heading; reuse existing map target | `src/delivery/systems/nav-system.ts` |
| CallSystem | Incoming/outgoing/nag/bonus calls, fixed scripts, reveal lines, call gate | `src/delivery/systems/call-system.ts` |
| DeliveryController | Delivery state machine and gate ordering | `src/delivery/systems/delivery-controller.ts` |
| RevealSystem | Unknown identity until configured reveal; completion card | `src/delivery/systems/reveal-system.ts` |
| ProgressSystem | Stable-ID completion, unlocking, restaurant stages and isolated save | `src/delivery/systems/progress-system.ts` |
| DeliveryRuntime | Adapt pure systems to existing Game, traffic, navigation, scenes and input | `src/delivery/runtime.ts` |
| DeliveryUI | Opaque phone/completion/collection views, location chip and actions | `src/delivery/ui/delivery-ui.ts` |
| Mechanic modules | Five reusable setpieces with the same lifecycle | `src/delivery/modules/` |

Normal state sequence is `ROAMING → EN_ROUTE → ARRIVED → CALL → SETPIECE → REVEAL → LEVEL_COMPLETE → ROAMING`. A nag call returns to en route; an optional bonus call returns to completion. Failed drops retain the delivery and allow another attempt. A completed arrival call, rather than merely opening or hanging up the phone, unlocks the setpiece.

Important events are `orderPicked`, `locationSet`, `arrived`, `callStarted`, `callEnded`, `callRinging`, `setpieceStarted`, `setpieceDone`, `setpieceFailed`, `celebrityRevealed`, `levelComplete` and `stateChanged`. The pickup payload contains carrier ID and position, not customer identity. The location payload also stays anonymous. UI reads the revealed identity; it must not render `activeLevel.celebrity` before a reveal.

Synchronous module completion can tear down the module during its update. Runtime clears its current-module reference before teardown and rejects stale callbacks, preventing a completed target from reappearing or a duplicate completion from advancing another level.

## Pizza pickup and navigation

`src/delivery/content/pickup.json` controls pickup tuning:

```json
{
  "boxHeightAboveRoof": 0.65,
  "grabRadius": 1.7,
  "carrierRange": 160,
  "maxCarriersNearby": 3,
  "recycleRange": 210
}
```

Eligible carriers are auto, bus, bike, car and truck. Vehicle type does not select the celebrity. Boxes recycle beyond the hysteresis distance or when the NPC despawns. Empty carrier recovery uses the ordinary collision-aware traffic spawner, with bounded attempts. Jump is the grab action; ordinary unlimited flight cannot collect a box.

The marker is now a complete closed cardboard box: cream lid, orange sides, dark lid seam, sealing tape and a printed pizza. The body stays opaque and readable at night. A small separate halo pulses with proximity; only the visual tilts, so its collision center stays stable. Geometry/materials are shared across the small pool; pepperoni shapes use instancing. No extra light or postprocessing pass is introduced. A successful catch produces the short effect and carried box without an order modal.

The compact top-left chip reveals only location, distance and heading. Map marker and beacon follow a moving target every frame. Road-route reconstruction is bounded to at most once per four seconds for ordinary moving targets that moved more than 12 m; a new target label or substantial relocation updates immediately. Static target calculations are not repeated unnecessarily.

## Call behavior and gameplay time

| Mode | Behavior |
| --- | --- |
| `PLAYER_CALLS` | Disabled until arrival; player starts the call. |
| `CUSTOMER_CALLS` | Rings near the destination; player answers. |
| `CUSTOMER_NAGS_EN_ROUTE` | Early impatient call during travel, followed by the required arrival call. Finishing the nag does not unlock delivery. |

An unanswered incoming ring expires after eight active seconds and retries after five. Ignoring it never fails the level. Early hangup leaves the required call incomplete. Subtitles advance by tap; one or two reply buttons converge on the same next line. Invalid or missing required reply input cannot skip ahead. Bonus calls are content-controlled and do not increment progress again.

The host frame loop stops player movement, ordinary traffic, module motion and day progression during a phone, completion or collection dialog. The call timer advances while the phone is visibly open. Map, Pause, portrait gate, background tab and area selection stop that timer too. Input is reset on blocking transitions and restored after closing; modules cannot accrue delivery progress while the call gate is closed.

Game hotkeys are ignored under a story dialog. The dialog focus utility traps Tab and makes surrounding UI inert. The main game camera/timing loop is not replaced by the story system. Underwater/approach movement overrides are limited to the active setpiece region and are removed at teardown/retry.

## Editing content

Edit `src/delivery/content/levels.json`; `levels.ts` deep-clones, applies optional variants and validates it. The file contains an ordered array. Each entry needs:

- A stable unique `id` and a sequential `level` matching its array position.
- `celebrity: { name, movie, image }` and `destination: { label, x, z, y? }`.
- A supported `callMode`, `revealAt`, nonempty `script`, mechanic name and `moduleParams`.
- `restaurantStage` and `completionLine`.
- Optional `nagScript`, `bonusScript`, `arrivalRadius`, `failureLine`, `defaultVariant` and `variants`.

`revealAt: "callLine"` requires a `reveal: true` line in the arrival script. `afterDelivery` rejects reveal lines in arrival/nag scripts. Scripts use `who: "customer" | "player"`, `text`, optional player `replies` (one or two), and optional `reveal`. Lines are fixed authored content, not generated at runtime. The user-requested Mahesh opening is retained; the other jokes are newly authored film references.

To add a level, append content, give it a stable ID, renumber the ordered `level` fields, choose a restaurant stage and reuse a registered mechanic. HUD total and unlocking use the resulting array length. To change Nani's default, edit `defaultVariant`; `loadLevels({ [levelId]: variantName })` also selects a configured variant. Jersey is default and Eega remains a data option. Film/scene choice for Pawan is data, not mechanic code.

Do not silently rename IDs already stored in players' saves. Appending preserves existing completion. Reordering or inserting levels can shorten the restored contiguous completed prefix; plan an explicit migration if a release must preserve more complex rearrangements.

World X/Z are game coordinates, not latitude/longitude. The existing city origin is latitude 17.4063, longitude 78.4966; use the project's coordinate conversion. Retained lat/lon values document the anchor but are not converted dynamically by the story system. Confirm every new destination against packed city tiles, road/rail/water surfaces and the entire scene footprint before accepting it.

## Seven configured levels

| Level | Customer and scene | Module | Call/reveal |
| --- | --- | --- | --- |
| 1 | Allu Arjun / Pushpa; sandalwood truck on Hyderabad–Jangaon Highway | `matchAndLand` | Customer calls; mid-call reveal; optional bonus |
| 2 | Ram Charan / Vinaya Vidheya Rama; existing train near Secunderabad | `matchAndLand` | Player calls; reveal after delivery |
| 3 | Pawan Kalyan / Gabbar Singh; police rooftop antakshari | Stationary `matchAndLand` | Customer calls; optional bonus |
| 4 | Nani / Jersey; Uppal stadium timing window; Eega alternative in data | `beatDrop` | Nag en route, then arrival call |
| 5 | Mahesh Babu; Prasads IMAX opening and sweeping projector hazards | `threadGap` | Player calls; mid-call reveal; optional bonus |
| 6 | Jr NTR / Simhadri; Hussain Sagar underwater throw | `underwater` | Customer calls; reveal on “Singamalai!” |
| 7 | S.S. Rajamouli / Baahubali; four Ramoji Film City targets | `chainDrop` | Retakes advance targets; final restaurant; optional bonus |

Restaurant stages are Pizza cart, Covered cart, Street stall, Corner kiosk, Pizza shop, Restaurant and Neon restaurant. Each completion updates the small restaurant illustration and collection. The last completion presents the grand-opening state. These are fictional delivery setpieces anchored to mapped Hyderabad locations; they are not claims of surveyed interiors or actual celebrity activity.

## Mechanic interface and extension

Each registered module provides `setup(ctx, params)`, `update(dt)`, `onDrop()` and `teardown()`, plus `target`, `status`, `supports` and `movement`. The context supplies player pose, real city scene, destination and `emit('done' | 'failed')`. Optional adapters supply real road samples, existing train bodies, bridge clearance, footprint surface heights, cues and traffic collision/following checks.

`canInteract()` is the mandatory story gate: a scene may be prepared before arrival, but it must not accrue landing/entry/timing progress or finish while the call is incomplete. Callbacks must be harmless after teardown. Module resources must be released without disposing shared host resources.

`registerDeliveryModule(name, Constructor)` allows a future unique mechanic without changing the content schema. Unknown names fail explicitly. Only the five V1 mechanics are implemented; `hookAndRope` and `midAirHandoff` are deliberately absent.

The truck follows actual sampled road geometry and lane direction, stops smoothly at a nonclosed route end and uses the host's optional kinematic traffic adapter. NPCs yield to its finite bounds; the truck follows/avoids NPCs and rejects occupied poses. Clearing the scene removes the adapter. Trains come from the existing railway simulation; modules do not invent new tracks.

The truck's route now uses the full eligible mapped road segment with a six-metre margin at each end, instead of a 180-metre slice. It still stops at the finite route end: it never reverses into opposing traffic or teleports to manufacture a loop.

Level 2 can require a real bridge passage only when the host finds a viable overhead road deck on the selected live train's actual route. `rail-passages.ts` intersects finite mapped segments and checks their physical elevations, coach height and headroom. Discovery is cached and bounded to two kilometres ahead, rather than scanning a city-wide railway run every frame. The module requires the player and the same coach to be observed below the ceiling and then beyond the far edge. Pre-call travel, flying above a bridge, changing coaches and simply waiting do not count. If no viable mapped passage is available, normal train handoff remains possible and the UI says **No verified bridge ahead**; it never claims that the bridge challenge was completed.

The packed-data probe of the canonical run nearest the current Secunderabad anchor `(510, -2844.3)` found no safely qualifying overhead span within 2.5 km either side. It used the shipped `core.pack.wasm`, canonical non-service rail profiles and existing railway-clearance/underpass preparation on local roads. St Johns Road is a road underpass at `y=-6.5`, roughly 520 m along that run, so the train goes above it. Sitaphalmandi Flyover is about 2.39 km east with deck `y=6.8` and nominal soffit `y=5.9`; it leaves approximately 1.615 m above a coach roof, below the host's conservative 1.85 m requirement. No track, bridge or underpass was created, raised or relocated to force this level's scene. This is an automated inspection of shipped/modelled geometry, not a survey or a rendered/manual train passage. Consequently a mandatory bridge challenge is conditional, and is not guaranteed at the initial Level 2 location.

Static sets sample existing roof/road/deck heights over their footprints once during preparation. The police facade hangs seven metres below its platform, so its entire set is raised by the required underside clearance. IMAX checks the entrance approach as well as its center. Chain targets check local platform footprints; the shipped elevated waterfall/crane offsets also keep their undersides above audited roofs. Future chain variants with lower offsets need a renewed full-scenery clearance audit, not just the platform's center.

## Save, restart and teardown

The only new progression key is **`roadster-mystery-progress-v1`**:

```json
{ "version": 1, "completed": ["stable-level-id"] }
```

Completion is idempotent and only the next unlocked ID can complete. Restore accepts only the contiguous completed prefix in current content order. Unknown/malformed saves do not unlock arbitrary future levels. Storage failure keeps the game playable in memory; `saveAvailable` communicates persistence status. The old `p2ph-save-v1` is neither loaded nor overwritten by story progress.

Unfinished orders are intentionally not serialized: reload resumes the same next level from roaming so the player can grab a new box. Pause's **Restart current delivery** clears the current call, target, module, carried box and pickup latch, then resumes. Completed levels and collected cards remain. The controller's explicit `reset()` is a separate story-only reset API; it is not the ordinary retry action.

Teardown clears map/beacon target, temporary movement and traffic adapters, modal blocking, listeners and scene resources. Leaving an underwater delivery restores flight instead of stranding the roadster below water. Finishing the last level disables new pickup offers while leaving free roaming available.

## Road geometry repairs and provenance

These incidental repairs arose while checking the delivery routes. They use existing mapped road topology; they do not invent roads, railway flyovers or underpasses.

- `src/world/road-openings.ts` identifies shared mapped road nodes. `city.ts` now permits a divider opening at a shallow connected merge where the actual carriageway footprints overlap at compatible heights. Parallel disconnected roads and separate-height flyovers retain boundaries.
- The packed-city regression uses the shipped Dallas Centre/IKEA merge edges `89279b8f-2c8_8` and `4d24a77f-b3b_0`. It checks that the divider does not bisect the joining lane and that source road data is unchanged.
- Divider collision height now matches the visible painted curb instead of an invisible metre-high wall.
- `physics.ts` checks the actual finite wall intersection and rounded endpoints. It removes invisible percentage-based extensions while preserving solid endpoints, oblique swept collisions and vertical separation.

This is a geometry/topology correction grounded in the shipped city data. It does not newly verify the real-world road layout or construction status. `tests/v21-fixes/city-road-openings.test.ts` and `road-openings.test.ts` contain the reproduction cases.

## Portrait assets and attribution

All seven level image URLs point to local assets in `public/delivery/celebrities/`: `allu-arjun.jpg`, `ram-charan.jpg`, `pawan-kalyan.jpg`, `nani.png`, `mahesh-babu.jpg`, `jr-ntr.jpg` and `rajamouli.jpg`. Source pages, authors and licenses are recorded in `credits.json` and the linked `credits.html`; collection UI links the credits page. No runtime image hotlink is required.

The initial audit found an empty Allu Arjun author field. This was resolved against the [Commons license attribution and original upload history](https://commons.wikimedia.org/wiki/File:Allu_Arjun_at_Pushpa_2_The_Rule_meet.jpg): Bollywood Hungama is now credited, with the original photograph link and a note identifying the Commons crop/retouch history. This does not infer an author from the uploader's username. All author strings are nonempty and trimmed. The Nani PNG was also renamed to `.png` with its level reference updated. All seven configured local files exist; browser decoding and served content types still belong in rendered QA.

## Verification ledger

Counts below describe distinct snapshots; do not add them together or present an older run as a final current suite.

| Evidence | Recorded result | What it establishes |
| --- | --- | --- |
| Latest full `npm run check`, observed by the coordinating agent | **Exit 0: 258 focused tests, the complete legacy suite, both TypeScript checks and production build passed** | Latest automated integration checkpoint; does not establish manual completion or physical-phone performance |
| Latest delivery-only run after passage integration | **125/125 delivery-focused tests passed**, plus TypeScript | Story/module/runtime, real packed-city fixtures, conditional train passage, UI and grand-opening coverage; this is a subset checkpoint, not an additional 125 tests to add to 258 |
| `npm run typecheck` after runtime/traffic/footprint repairs | Passed | TypeScript compatibility at that snapshot |
| `node scripts/test-v21-fixes.mjs delivery` at the same snapshot | **99 delivery-focused tests passed** | Automated story, module, runtime, traffic, movement, pickup, UI-contract and packed-city checks |
| Later focused keyboard repair: `npm run typecheck` and `node scripts/test-v21-fixes.mjs delivery-focus` | TypeScript and **3 focus tests passed** | Production line update preserves keyboard continuity without timer/touch refocusing; narrow DOM fixture, not real-browser acceptance |
| Earlier broader focused suite, reported by coordinating agent before later additions | **218 tests passed at that earlier snapshot** | Historical checkpoint only; rerun for a current final total |
| Prior committed Step 1 report | 152 focused tests, 38 legacy suites and production build passed | Pickup-preview baseline only, not acceptance of this seven-level implementation |
| Prior observed Step 1 desktop play | Keyboard/camera/map play, misses then an auto pickup, persistent carried box | A real desktop pickup was observed; screenshot in `output/delivery-step1/desktop-caught.png` |
| Prior Step 1 mobile emulation | iPhone 16 852×393 and Galaxy A55 800×360 layout observations | Layout compatibility only; reliable held-touch catch was not obtained |

The 99-test snapshot includes an automated all-seven-level controller/module completion harness; identity and call gating; retries and duplicate callbacks; hidden/background timing; moving-target route-reset bounds; existing traffic parity when the adapter is empty; packed-city highway/train/water/roof placements; and real Player Jump/underwater fixtures. These run production algorithms in fixtures, including shipped city data. They are **not** seven manual deliveries, physical-phone results or rendered collision clearance proof.

`docs/playtests/2026-10-29-carrier-pickup-step1.md` preserves the earlier observed/manual evidence and its limitations. Do not overwrite that milestone report with claims about later code. Record new browser/device results separately with build identity, viewport/device, actual actions and screenshots.

### Latest manual browser observations

These observations were made by the coordinating agent in the local development preview using the visible QA scenario launcher. **Prepare order** bypasses the Jump pickup for that scenario. The completed deliveries below used ordinary gameplay controls without injected positions or completion events. Part of Level 2's unfinished chase used bounded keyboard inputs based only on the visible DOM direction arrow; that portion is labelled assisted. These observations do not prove seven consecutive deliveries from a fresh normal save.

| Scenario | Observed | Not yet established |
| --- | --- | --- |
| Level 1, truck | Incoming call, early hangup/re-ring, replies and Allu mid-call reveal; then manually flew to 7 m of the truck on the mapped highway, matched its 0 km/h speed while it waited behind traffic, held through 87% to “Matched”, and used DROP/E. The Allu Arjun / Pushpa completion card showed Level 1/7 and Pizza cart; [reveal screenshot](../output/mystery-v1/allu-call-reveal.png), [completion screenshot](../output/mystery-v1/truck-complete.png) | A moving-speed truck handoff remains automated-only; this observed handoff was to a traffic-blocked stationary truck. Normal Jump pickup and physical-phone completion remain unverified for this scenario |
| Level 2, train | Actual outgoing call retained Unknown Customer identity; chased the real train marker to 11 m and observed real overhead-gate messaging plus fallback after an ignored passage. Some chase input was assisted by bounded keyboard actions based solely on the visible DOM arrow, not injected game state | Completed train handoff or a completed qualifying mapped overhead passage. This is partial assisted chase evidence, not manual level completion; the route limitation above still applies |
| Level 3, police rooftop | Successful rooftop delivery, completion card, optional bonus call and unlock to Level 4; [completion screenshot](../output/mystery-v1/rooftop-complete.png) | A normal Jump pickup for this scenario and post-fix physical touch acceptance |
| Level 4, stadium | En-route nag, a separate arrival call and successful delivery in the timing window; [completion screenshot](../output/mystery-v1/stadium-complete.png) | A normal Jump pickup for this scenario and physical-phone completion |
| Level 5, IMAX | Completed the call/reveal, entered through the actual aperture, hit a projector-sweep failure, reversed out and re-entered, avoided the beam, reached the seat at 3 m and used DROP. The Mahesh Babu / Pokiri completion card showed Level 5/7 and Pizza shop; [completion screenshot](../output/mystery-v1/imax-complete.png). Physical hall-wall collision was also observed | A normal Jump pickup for this scenario and physical-phone completion |
| Level 6, underwater | After manual shoreline relocation from the QA lake pin, completed the arrival call/reveal, entered the 60 m local underwater region with slowed floaty movement, approached within 10 m, saw “Singamalai! Throw the pizza”, used E and observed the thrown box animate away; the Jr NTR / Simhadri completion card showed Level 6/7 and Restaurant; [completion screenshot](../output/mystery-v1/underwater-complete.png) | A normal Jump pickup for this scenario, an unassisted approach from the original QA lake pin and physical-phone completion |
| Level 7, film sets | Completed the call with replies and mid-call Rajamouli reveal; an initial miss showed “Retake #47” without penalty. Used ordinary Fly, steering and drop controls to complete Palace gate → Waterfall → Battle arena → Director's crane, with no injected positions or completions. Observed “DREAM DELIVERED”, the S.S. Rajamouli / Baahubali card, animated restaurant doors/lights/neon, then “Welcome to Roadster Pizza” and Explore Hyderabad; [grand-opening screenshot](../output/mystery-v1/grand-opening.png) | A normal Jump pickup for this scenario and physical-phone completion |

Galaxy A55 **800×360 viewport emulation** exposed an Answer button overlapping Fly. The repair now checks the ancestor `.is-touch` state, and the regression tests pass. **There is not yet a post-fix manual touch confirmation.** This was browser viewport emulation, not a physical A55 session. No phone FPS, thermal or battery result is inferred.

The final restaurant card was also visually checked at **800×360**. The customer portrait/name, neon restaurant, welcome message, **Explore Hyderabad** and **One more call** all fit within the opaque card without overlap or clipping; see the [compact final-card screenshot](../output/mystery-v1/grand-opening-compact.png). This confirms that rendered layout only, not touch operation or physical-device performance.

## Remaining acceptance work and read-only review

- The latest full `npm run check` passed as recorded above. Preserve its output/build identity and repeat appropriate checks if source changes after this checkpoint.
- Level 2 is the only level without an observed completed delivery. Finish its train handoff and, separately, a moving-speed Level 1 truck handoff: the observed Level 1 success was while the truck waited behind traffic. All six completed scenarios skipped the initial pickup through Prepare order; also test normal pickup-to-completion progression, missed Jump grabs and a bus jump. The final restaurant ceremony was observed after the manually completed Level 7. Scripted state advancement is supplementary evidence.
- Recheck Answer/Fly separation after the mobile-layout repair using actual touch interaction. Confirm all seven mechanics in landscape on a physical phone when access is available; the current viewport observations do not satisfy that acceptance.
- Confirm mobile one-thumb reach, portrait/fullscreen transitions, app switching, pause/restart, collection return and camera/control restoration. A viewport profile is not a physical device and cannot establish phone FPS, thermals or battery life.
- Check the full pizza box and opaque dialogs on a physical Samsung/foldable when available. Preserve the stable opaque interface treatment; do not introduce blur or translucent modal layers as an unvalidated aesthetic change.
- The keyboard focus finding is repaired: on a changed script line, keyboard focus moves from Next/a removed reply to the next visible reply, Next or End control. Pointer taps and unrelated controls are not refocused, and timer-only frames return without changing focus. Three automated fixtures pass; verify actual keyboard and touch behavior in rendered QA.
- Confirm portrait decoding and served content types. The Allu attribution repair is source-verified; all seven configured files and nonempty trimmed author records pass the local integrity check.
- Timing/restart review found the intended gates in place: story dialogs freeze gameplay; pause/map/background also freeze the phone timer; retry removes the temporary scene and movement override while retaining completed progress. Automated tests cover these paths, but real interaction after orientation/app-switch events remains part of acceptance.

No sustained physical-phone performance, battery-life estimate, all-seven-level manual completion, or live-public deployment is claimed by this document.

## Development-only manual scenario launcher

Vite development supports `?qaDelivery=1` through `?qaDelivery=7`, for example `http://127.0.0.1:4229/?qaDelivery=5&q=low`. `main.ts` dynamically imports `src/delivery/qa.ts` only under `import.meta.env.DEV`; a minified `DEV=false` bundle check confirmed that neither the QA module nor its controls remain in the production graph/output. No QA methods are published on `window`.

The launcher keeps all real content entries, uses ordinary `ProgressSystem.complete` validation to seed only the completed prefix in an in-memory store, and starts through normal area relocation/loading. Progress, area and tutorial markers are session-only. Explicit settings changes retain the normal settings behavior; the launcher itself does not change stored settings.

A visible **QA scenario N · temporary progress** panel offers **Prepare order**, **Restart scenario**, and **Hide QA controls**. Prepare assigns the next order through `controller.pickup()` and skips only the pickup for this test. It never advances dialogue, completes a mechanic, changes physics or teleports during the delivery. The player must perform calls, flight, landing, throws and drops manually. Reload restarts with fresh temporary progress.

TypeScript and two focused QA tests passed: valid scenarios use normal sequential progress; each launch has independent storage; invalid values are rejected; the entry-point import is DEV-gated. The development URL returned HTTP 200. These are launcher checks, not evidence that a manually completed delivery was observed. Reports using this launcher must label the pickup as **scenario preparation**, not a successful Jump grab.
