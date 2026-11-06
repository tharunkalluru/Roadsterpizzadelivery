# Independent automatic-story review

Reviewer: independent story/state reviewer, separate from production implementation.
Date: 2026-11-02. Checkout: `codex/story-realism-main`, baseline `9a01bd63b76d76d334a31d76163b7de7e8549693` plus the in-progress expansion changes.

## Scope and evidence boundary

Reviewed the actual `DeliveryRuntime`, `StoryDirector`, `DeliveryController`, `OrderSystem`, `ProgressSystem`, delivery module story frames, HUD view model/CSS, and host `Game` input, frame, camera, Pause and relocation paths. Compared them with `main-expansion-plan.md`, `main-expansion-story.md` and `main-expansion-native-progress.md`.

This is an independent source/state/physical-gate review. It is **not** character-likeness approval, all-city geometry approval, phone performance evidence, or completion of the native fourteen-level campaign playthrough. GPU/browser control and final actual pickup → physical story → held character → Next → new pickup checks remain Root's responsibility. All fourteen modules passing deterministic tests does not prove every camera shot or native driving approach is visually clear.

## Findings sent to implementation owner

### 1. Restart from the held character scene could advance to the wrong level at the old scene

**Reproduced, fixed by Root, independently re-tested.** Completion saves earned progress before the indefinitely held scene, which is correct. The Pause action labelled “Restart current level” previously called ordinary `runtime.retry()`, cleared the active order and released the physical scene. Because the progress system already considered that level complete, the next pickup assigned the next unfinished level, while the car remained in the old truck/water/train location. During a playing cinematic, retry could likewise return input inside physical story geometry instead of using a safe road.

Independent regression file: `tests/v21-fixes/story-runtime-independent.test.ts`. The pre-fix run was **1 pass / 3 failures**: ordinary relocation retry passed; held-completion, playing-story and final-completion restarts failed because no loading/relocation occurred. Requested fix: a dedicated Pause restart operation with an explicit replay override, safe-road loading near that same delivery, earned cards/unlocks retained, final-level replay allowed, ordinary relocation retry semantics unchanged. Completing the replay must then return Next to the next unfinished level.

The dedicated `restartCurrentLevel()` runtime/controller path passes all independent cases: completed-scene replay, Next after replay, playing-scene restart, final held scene despite `progress.finished`, ordinary retry unchanged, repeated restart while loading, and no-safe-road retention. An additional actual final Next → restaurant → Explore test confirms the explicit Restart action can replay the last level after the active scene is cleared, while ordinary finished free roaming still cannot assign a new delivery. Source review confirms the Pause menu calls the dedicated operation; the replay override survives ordinary relocation cleanup and is consumed only by pickup. Native Pause → Restart → loading → new jump-grab remains a final integration check.

### 2. Train/metro proximity could capture an ordinary falling car before actual roof contact

**Reproduced, fixed by Root, independently re-tested.** `Player.airborne` includes flying, descending and jumping, but excludes ordinary falling off a structure. Both module landing predicates previously accepted up to 0.8m roof-height error using only those flags. An actual `MovingRailInteraction` check confirmed a car falling with a 0.7m air gap was not carried, while the actual railway and metro modules both granted story entry.

Independent regression file: `tests/v21-fixes/story-physical-independent.test.ts`, using actual module implementations and actual moving-rail contact code. Pre-fix result: **0 passes / 2 failures**. Required resolution: preserve exact marked-rake/any-coach support while requiring real grounded roof contact, accounting for grade and actual coupling surfaces. A flying, jumping, descending or noncontact falling car must not receive automatic landing.

The host now forwards the contact solver's readonly `supportId` and the player's actual vertical velocity. Both modules require the exact supported body when host contact evidence is present, reject falling velocity, and query real `railRoofAt()` geometry with its grade/coupler span using a 0.2m grounded-height tolerance. Undefined support remains only a standalone fixture allowance; an actual host with no contact supplies `null`, which rejects capture.

Independent physical coverage expanded to **10 / 10 pass**: railway and metro each reject a 0.7m free fall, a same-height car with null support, actual support from another rake at identical coordinates, and stale support with nonzero downward velocity. Both accept solver-established rear-coach support on the actual generated, graded coupling span outside either coach rectangle. A separate actual `DeliveryRuntime` closure test confirms live null → exact supported id → null forwarding, plus live vertical-velocity reads without caching. The independent runtime suite totals **8 / 8 pass**, including that closure check and all restart edges.

## Contracts checked in the current source

- Jump-grab remains the `orderPicked` entry; ordinary driving is not replaced by the story director.
- The director's `driving`, `playing`, `viewing` and `transition` phases separate physical handoff from indefinite character viewing. The action delay and controller lock prevent duplicate drops/completions.
- Input is cleared when capture begins. The host also clears the already sampled input for that frame; queued Jump/Fly cannot leak into the cinematic. Keyboard, drag camera, map entry and touch drive controls are captured while Pause remains available.
- Story capture is distinct from the UI's simulation-blocking flag. Moving city/rail simulation and supports continue during story and held viewing. Actual Pause, hidden document, map, modal and portrait rotation gate still stop the active frame before those updates.
- Story pose is applied after normal player physics and moving-support carry. Its finite checks, bounded `dt`, translation and yaw steps prevent a hitch from becoming a teleport.
- Character viewing remains nonmodal and indefinite. Normal completion UI is hidden until the final restaurant conclusion; the retained module is not torn down simply because a timer elapses.
- Next has a viewing-state guard and consumes completion before relocation, so two clicks cannot advance two levels. No suitable near-next main road leaves the player in the held scene. The host's atomic loading path retains the failed destination and saved progress on retry; its existing request/abort checks reject stale placement results.
- Exact marked-rake selection is retained. Railway arrival uses the module's marked-coach landing evidence even if a rear coach is outside the ordinary customer-distance radius. Ordinary distance cannot substitute for manual boarding. Metro requires departure, actual travel and a different real station; unavailable platforms wait for another real stop.
- Metro's automatic exit first clears the coach side at roof height and then descends to supported platform parking, rather than cutting diagonally through the vehicle. The four actors retain their platform positions after the train departs.
- Automatic non-Salaar gate and Paradise bucket entries now reject rear-property approaches. Salaar retains its separate front gate opening/inside approach. These guards are covered by the producer's actual-module tests; final native approach replay is still required.
- Cinematic camera collision uses the actor-focus pivot only for authored shots. Normal driving camera behavior remains outside that branch. Root's changed train/platform framing still requires refreshed native screenshots.

## Focused test run

Commands use `node scripts/test-v21-fixes.mjs <filter>` and test production code bundled with production environment definitions.

| Filter | Final scoped rerun |
| --- | --- |
| `story-mode` | 17 / 17 pass |
| `delivery-runtime` | 34 / 34 pass |
| `delivery-ui` | 21 / 21 pass |
| `scene-preparation` | 11 / 11 pass |
| `map-relocation-game` | 13 / 13 pass |
| `metro-ride` | 12 / 12 pass |
| `railway-coach-continuity` | 23 / 23 pass |
| `story-runtime-independent` | 8 / 8 pass; pre-fix restart cases failed as recorded above |
| `story-physical-independent` | 10 / 10 pass; pre-fix contact cases failed as recorded above |

The final focused rerun totals **149 passing tests**, plus `npm run typecheck` passing. Expected offline/old-area network exceptions printed by relocation fixtures are deliberate failure-path evidence; the tests themselves passed. The coach-continuity suite uses the real `Player` across both travel directions, both traversal directions, curves/grades, coupling stops and 30/60/120fps plus 100ms steps. These are deterministic correctness tests, not measured device FPS.

## Release acceptance still required

1. Both independent regressions are resolved and the affected focused suites are green. Preserve these tests in the final integrated source and full release check.
2. Complete Root's actual native all-fourteen scene checks, including unassisted jump-grab, manual railway and metro roof landings, final camera framing, held character, Pause/resume, restart, Next/loading and the new safe pickup area.
3. Preserve release gates for the two newly produced actors until their immutable asset/rig/reference/scene evidence has independent appearance approval. This reviewer does not approve likeness.
4. Run final integrated checks on a stable source snapshot and separately document the limit of physical-phone compatibility/performance evidence. Passing desktop tests cannot establish phone FPS, thermal or battery results.

**Current review outcome:** scoped story/state/physical-contact logic review passes after independent regressions and re-test. No unresolved blocker remains in this review's source/test scope. This does **not** close final native all-fourteen gameplay, character approval, all-city road, integrated performance, physical-phone or publication gates. No publication performed by this reviewer.
