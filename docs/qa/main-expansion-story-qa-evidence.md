# Passive story QA evidence update

The previous schema-2 campaign observer still required manual Drop, truck/compound departure and underwater resurfacing. Those describe the older call-gated interaction. They cannot validate the promoted automatic story flow, which retains the completed scene until Next.

## Changed acceptance rules

- `NONE` levels now require a captured real story, an attached render-enabled physical pizza carton intersecting the gameplay camera frustum, a separate matching `setpieceDone` event in the controller's reveal phase, and a clean retained scene for more than one active second. `levelComplete` alone cannot satisfy these facts.
- The retained-view check reads the actual director/module and computed DOM visibility. Pause and Next must be visible; minimap, navigation, driving, flight, jump, call and drop controls must be hidden. Observed overlap, premature Next or disappearance of the completed scene remains an explicit violation even if a later sample looks correct.
- Non-final Next requires a trusted actual Next click, a real loading-shell observation after the old module has been released while the car is still at its held pose, then exactly one prepared road placement with the expected next content identity within four kilometres. Full XYZ of the held pose must remain unchanged until that placement; unexpected departures or extra placements permanently invalidate this transaction and remain assistance. The loading element uses a read-only MutationObserver so cached preparation cannot disappear between 250 ms samples. The observer never wraps or calls movement, story, controller or loading methods.
- Only a fully observed expected Next placement is classified as progression. Standard R recovery and other unobserved relocation remain visible as assistance. The existing schema-2 normal-run artifact was not rewritten.
- The final level distinguishes Next from actual restaurant-opening observation; Next alone cannot prove the ceremony.
- Actual railway/metro contact uses the shared solver's support identity, real roof/grade height and vertical velocity, plus the module's marked-rake arrival predicate. A nearby or falling car cannot supply roof-contact evidence. Any real marked coach can qualify; traversing several coaches is still observable but is not mandatory when the player lands directly beside Ram.
- Bucket return height is checked against the actual rope/winch geometry rather than the original unfitted roof-height data.
- Current story instructions describe automatic local motion and retained character viewing. Odela and Salaar are now explicit required art identities; the full campaign requires fourteen primary appearances plus the three metro companions.
- Legacy levels with a non-NONE call mode keep the prior manual-handoff, departure and resurfacing requirements.

Schema 3 exports the per-row workflow and exact required-fact list, `automaticHandoff`, and story violations. Physical mechanics, explicit scene reviews, independent character approval, natural pickup, absence of assistance, true touch and physical hardware remain separate criteria. A desktop touch layout still does not establish a real phone, FPS, heat or battery result.

## Initial verification before independent feedback

- New automatic-story evidence regressions: 12 passed. Includes the real RopeBucket module, StoryDirector and DeliveryController physical handoff path; false completion/order/scene checks; paused viewing; overlap; trusted Next; old-scene release; loading; on-road and four-kilometre failures; R recovery visibility; final opening separation.
- Existing campaign evidence: 10 passed, including explicit legacy manual fixtures.
- Existing local art review: 13 passed, including preview-never-accepted checks with the current automatic requirements.
- TypeScript and diff whitespace checks passed.

These are scoped code and fixture checks, not independent approval or a new native campaign run. Parent must freeze a new instrumented build, exercise the actual story/Next flow and have an independent reviewer verify this update. Production gameplay, world geometry, runtime timing, assets and release registry were not edited by this agent.

## Initial held files before independent feedback

```json
{
  "src/delivery/qa/campaign-observer.ts": "d2b5a12c62c1e2cf151a0cffa1a03de2ebe32e3711b681be83bae7f311ba628c",
  "src/delivery/qa/campaign-recorder.ts": "c9c6e0a39928a4d99984e535dda5c6ddfd466575a609d1658c66eb88cb90bd5a",
  "src/delivery/qa/campaign-scenarios.ts": "b44403b2ab7c71828967b37e7b7d2fb9cd28204b6c7bc8fdda458c7d4a8e34a7",
  "tests/v21-fixes/campaign-evidence.test.ts": "9716ef62c552c315bf6a936bbb52e2188c0920c709f6949d0e18896e2b4bb5dc",
  "tests/v21-fixes/local-art-review.test.ts": "d45a6395eb6417aeeef6b8fd0b10f90a5850fb5100d9c73a16d738c1c08656d0",
  "tests/v21-fixes/story-qa-evidence.test.ts": "912261f005d2521c7363c027698dbc57ab36fa8d6f1d9a297df5e2425f51153f"
}
```

## Independent feedback repairs

The independent reviewer supplied failing actual-observer and recorder regressions. The original reproduction logs are preserved separately; earlier schema-2 native exports remain untouched.

- Scene-graph `.visible` flags were insufficient. Carton telemetry now requires an actual ancestor connection to the engine scene, enabled render branch/material/camera layer and finite, nonempty world bounds intersecting the actual camera frustum. Detached branches, material-hidden cartons and cartons behind the camera cannot satisfy transfer presence. This deliberately does **not** prove pixel visibility, lighting quality or occlusion; explicit human visual comparison remains mandatory and the export states this limit.
- A normal successful `Game.relocate` invokes `placeNear` once and `Player.place` once. Next therefore permits exactly one increment of `placementRevision`, rather than accepting any larger jump. Extra placements, including a preparation retry, remain explicit assistance and cannot be absorbed into a clean progression.
- Full held XYZ is checked before placement, so an old truck departure or underwater resurfacing under the loader cannot later be certified as direct Next. Motion after the prepared placement but before readiness also invalidates the transaction. New attempts clear unfinished Next state.
- A normal one-increment placement may remain under the loader while character/graphics work finishes. Classification is deferred without moving the baseline until its stable road becomes ready. A later R/extra placement is still detected.
- A hidden stale restaurant-opening DOM node no longer counts. The final ceremony must be attached and computed-visible, in the actual completed final level after the trusted final Next for the automatic NONE workflow, with over 2.2 seconds of continuously sampled visible-open exposure. Hidden, paused, background or suspended-observer gaps reset the exposure; existence plus elapsed wall time is insufficient. Legacy non-NONE final ceremonies keep this visibility/exposure requirement without requiring an automatic-story Next button that their UI does not have.

Current producer checks: 17 story-QA regressions, 10 campaign evidence and 13 local-art regressions pass (40 focused tests), plus typecheck and diff checks. The independent reviewer's expanded 16 actual-observer/accounting regressions pass, including positive automatic and legacy final ceremonies plus hidden-panel, background and Pause exposure resets; the distinct reviewer owns its final verdict. A fresh final native run is still required.

## Prior held source fingerprints before native finale feedback

```json
{
  "src/delivery/qa/campaign-observer.ts": "dfc772a5decc44d26283405929cf346698063ce088eac2f8cd102228ae1345a5",
  "src/delivery/qa/campaign-recorder.ts": "2dd95e2a21318931ae767913044253875e5f7c09d279e2c8598731daabeda0e9",
  "src/delivery/qa/campaign-scenarios.ts": "b44403b2ab7c71828967b37e7b7d2fb9cd28204b6c7bc8fdda458c7d4a8e34a7",
  "tests/v21-fixes/campaign-evidence.test.ts": "9716ef62c552c315bf6a936bbb52e2188c0920c709f6949d0e18896e2b4bb5dc",
  "tests/v21-fixes/local-art-review.test.ts": "d45a6395eb6417aeeef6b8fd0b10f90a5850fb5100d9c73a16d738c1c08656d0",
  "tests/v21-fixes/story-qa-evidence.test.ts": "480098d10b1c87c414c734771c0317dc597dee8e9628d9f1ebc2c386ae222ae1"
}
```

## Native final ceremony feedback repair

The actual frozen-v13 final delivery reached the real Uppal field/timing handoff, held Nani scene, trusted Next, visible grand opening for over 2.2 seconds, and restored exploration. Its original export remains untouched at `evidence/main-expansion/native-scenes-v13/level-14-campaign-evidence.json` (SHA-256 `8c2bebddfd49235fe374f9d359c429de5ae255a4bde13e17038bae478c795351`). It also exposed a passive-QA false violation: runtime deliberately restores the underlying HUD DOM for its final completion dialog, whose opaque full-screen overlay covers those controls. The observer had confused underlying computed DOM visibility with visible gameplay controls.

Only this known final presentation now qualifies for an exception. It requires the completed final automatic level, retained viewing director/module, prior trusted final Next, and the actually attached/visible grand-opening element inside the actual final completion sheet and modal overlay. The overlay must have an opaque RGB background, fully opaque visible ancestors without filters/blending, full viewport coverage, and actual hit-test stacking over each control's center and four corners. A hidden, detached, translucent, undersized, unrelated or nonfinal modal cannot qualify, nor can a control painted above the valid overlay. During ordinary story playback or retained viewing before final Next, gameplay overlap is still a permanent violation. The four authored ceremony phases are presentation states; none changes the separate continuously visible-open exposure requirement.

`story-qa-finale.test.ts` executes the actual observer with explicit DOM style/hit-test fixtures. Restoring only the old HUD visibility expression in a temporary bundled test (without rewriting source) reproduces 12 pass / 2 fail; the two positive presentation regressions fail with the original false violation. The corrected source passes all 14 new cases. The full scoped rerun is 47 story-QA checks (17 producer, 16 independent and 14 finale), 10 campaign-evidence and 13 local-art checks: **70 passed**, plus TypeScript and diff checks. These fixture checks do not claim GPU pixel correctness, physical-device performance, true touch, likeness approval or a complete campaign pass.

Logs are preserved separately as `story-qa-finale-before.log`, `story-qa-finale-after.log`, `story-qa-all-after-finale.log`, `story-qa-campaign-after-finale.log`, `story-qa-art-after-finale.log` and `story-qa-typecheck-after-finale.log` under `evidence/main-expansion/`. A distinct reviewer will verify the correction; parent owns the fresh final freeze/native verification. No product UI, gameplay, clocks or old native evidence were modified for this repair.

Held finale correction fingerprints before the native wedding feedback:

```json
{
  "src/delivery/qa/campaign-observer.ts": "7cf79c63f101640387454bbb433b6bba6e43cfec81b2b25f9114ee06d083e322",
  "tests/v21-fixes/story-qa-finale.test.ts": "a2a0c7b7c2c439b2e40b5081b8e16865002e3d519fbda572de6d09f73e42969f"
}
```

## Native wedding observer crash and failure containment

The native frozen-v15 wedding scene exposed a concrete instrumentation crash. `delivery-wedding-crowd` is now the actual `WeddingCrowd.group`, containing four instanced draws. The old observer cast the named object to a single `InstancedMesh` and read `crowd.instanceMatrix.version`. Its exception during polling also recurred inside the synchronous `setpieceDone` listener, interrupting `DeliveryController.setpieceDone()` before it could progress from REVEAL to LEVEL_COMPLETE. Original evidence is preserved in `evidence/main-expansion/native-scenes-v15/level-08-console-errors.json` and `level-08-observer-failure-evidence.json`, with the blank-failure PNGs explicitly identified. Subsequent blank native frames are invalid scene evidence; they are not a visual acceptance result.

The observer now traverses the attached, visible group's actual nonempty instanced descendants and reads each instance-matrix version independently. Presence alone does not prove motion. Every currently visible draw must change its actual version between samples before `crowd-animation` is recorded; the production four-draw group and prior single-mesh format are both covered. Empty/hidden groups and a group with only one changed draw cannot supply the animation fact.

Passive delivery-event, input, loading and animation observations are contained by a QA-local guard. An exception records a bounded persistent context/message/level diagnostic and exposes **QA INVALID** on the panel. Repeated diagnostics are counted; the distinct list is bounded to 64. The frame continues scheduling, and the exception cannot escape the synchronous game event listener. Recovery or beginning another attempt cannot erase the run failure. Exports include explicit observer health/errors, affected rows fail scene acceptance, and all run-level scenario/mechanics/full-campaign acceptance remains false. This is failure containment with visible invalidation, not silently ignoring an error or certifying partial observations.

Seven new regressions execute the actual observer with the real WeddingCrowd, EventBus and DeliveryController where relevant. They cover four actual moving draws, legacy compatibility, partial/hidden negatives, injected synchronous diagnostic failures allowing real controller completion and downstream listeners, continuing RAF plus persistent visible failure after recovery/new attempt, and bounded error accounting. The complete scoped rerun is **77 passed** (54 story-QA, 10 campaign-evidence and 13 local-art), with TypeScript and diff checks passing. The exact healthy-summary fixture was updated to assert its new observer health fields. These checks make no native pixel, hardware, touch, FPS or likeness claim. Root owns the frozen-v17 native replay; the separate reviewer owns the independent verdict.

Logs: `story-qa-observer-safety.log`, `story-qa-all-after-safety.log`, `story-qa-campaign-after-safety.log`, `story-qa-art-after-safety.log`, `story-qa-typecheck-after-safety.log` under `evidence/main-expansion/`. Source is held; no gameplay, model, clock or historical native-export file was edited for this repair.

```json
{
  "src/delivery/qa/campaign-observer.ts": "d6ee599e8ad995addfab999f61ddb48a83e3783aaadb052f78563db7747598f3",
  "src/delivery/qa/campaign-recorder.ts": "3fc077ce16beb1678f95b600480f374c210646912205953c62e45d6c301881e2",
  "tests/v21-fixes/story-qa-observer-safety.test.ts": "18ab46a61b49cd4644601b09eed6462d1acce296fc528820cec3d709e7c90e41"
}
```

## Independent error-conversion edge repair

The separate safety reviewer reproduced a real containment edge: JavaScript permits an Error's `message` property to hold a number, null, Symbol or an object whose conversion throws. Slicing a nonstring message could itself escape the guard. The bounded access, `String(...)` conversion and 1,500-character limit now all happen inside the protected conversion try; any hostile accessor/conversion retains the fixed `Unknown observer failure` text while still permanently invalidating the run. No raw thrown values are printed by this change.

The reviewer's two malformed-message/hostile-value regressions now pass, including a failing diagnostic clock, persistent failure accounting and immutable exported diagnostic evidence. The scoped rerun is **79 passed** (56 story-QA, 10 campaign-evidence, 13 local-art), plus TypeScript and diff checks. This correction changes only recorder error coercion; no observer/gameplay timing, UI, native evidence or models changed. Logs are `story-qa-all-after-coercion.log`, `story-qa-campaign-after-coercion.log`, `story-qa-art-after-coercion.log` and `story-qa-typecheck-after-coercion.log` under `evidence/main-expansion/`.

Final held observer SHA-256 is `d6ee599e8ad995addfab999f61ddb48a83e3783aaadb052f78563db7747598f3`; final held recorder SHA-256 is `ed3d45095fe82a2727774fbe01abd8bf73cc8012ff6f27cb4bffeab91a271d26`. Root owns the exact final build and native verification. The distinct reviewer owns the final independent safety verdict.
