# Independent review (MASTER §30 "Final supervision")

Date: 2026-10-17. Reviewer: an AI agent (Claude), run as a separate session from the builder. This is NOT a human review, NOT a field review, and NOT a device test. It is a code-reading and test-running review. Everything below is either marked "executed" (I ran code and saw the result) or "code-read" (I traced the code but did not execute that path).

## 1. Method

- Read the spec (`docs/handoff/MASTER_PROMPT.md` §10, §12, §13, §15, §30; `config/flight-budget.json`) and then read the implementation without relying on the builder's notes: `src/player/flightLedger.ts`, `src/player/player.ts`, `src/missions/session.ts`, `src/missions/catalog.ts`, `src/world/nav.ts`, `src/app/app.ts`, `src/ui/input.ts`, `src/ui/hud.ts`, `src/persistence/store.ts`, `src/core/clock.ts`, plus the docs and ledgers.
- Wrote throwaway Vitest files (outside the repo, in the session scratchpad `/tmp/claude-0/-home-user-Roadsterpizzadelivery/8ec8a6d8-6d1d-5d8c-8e7f-3a249097a7cd/scratchpad/rev/`: `adv.test.ts`, `steer.test.ts`, `cp.test.ts`, `cp2.test.ts`, `cp3.test.ts`, `ex.test.ts`, `real.test.ts`) that import the game's own modules and the repo's test fixture, and ran them with a separate vitest config. Nothing in the repo was edited except this file.
- Did not run Playwright (told another process was using the port). The browser-level behaviours (input, lifecycle, context loss) are therefore code-read only.

## 2. What I ran, with actual results

| Command | Result |
|---|---|
| `npx tsc --noEmit` (in `game/`) | No output, clean. |
| `npx vitest run` | 5 files, 67 tests, all passed (18.7 s). |
| `npm run validate:world` | `ok: true`, 0 errors, 0 warnings; 1 SCC (1162 routable directed edges); 10 deliveries, 90 pairs, 0 unreachable, route min 447 m / max 9079 m; chunk hashes 176/176. |
| `python3 monitoring/verify_run.py ...` | `valid_ledger: true`, `achieved_release: development_fixture`, `ready_for_requested_release: false`, 519 blockers; requirements: passed 0, failed 0, invalid_pass 0, blocked 7, not_run 75, stale 0; roads verified 0 m of 61,872 m; displayed names verified 0 of 142. |
| Throwaway flight fuzz (executed) | 1,600 accepted launches (launch remaining from "exactly affordable" up to +700 ticks; 3 warm-up speeds; 8 input patterns: none, brake, boost, steer left/right held, Land early, Land late, brake+Land). Per-tick check: consumed delta was exactly 1 on every tick that began airborne, never more than 1, never negative, never above the allocation: 0 violations. 189 flights ended in a crash, all of them "Invalid landing surface" with steering held (see finding m1). No "exhausted in the air" crash in any pattern. |
| Checkpoint probes (executed) | See M4. |
| Real-world route probe (executed) | See M3. |
| `git status` after my runs | Only `qa/artifacts/e2e/*` show as modified, which I did not touch (another process was running Playwright). The vitest suite rewrites `qa/artifacts/calibration/*.json` as a side effect; after my run `git diff` showed no change there, so the calibration output is deterministic and reproducible. |

## 3. Findings (ranked)

No critical findings. I could not break the core flight-budget invariants with ordinary or adversarial play (metering, refunds, queued launch, held press, double metering); the one ordering defect I found is a narrow-window major (M1).

### MAJOR

**M1. Budget exhaustion near the ground skips touchdown validation (touchdown vs exhaustion mis-ordered).**
- `src/player/player.ts:295-308`, specifically the `else` branch at 304-306. When `spendTick()` fails and the car is `supported()` (y <= surface + 0.05 m) in FLYING/DESCENDING, the code sets `LANDING_CONFIRM` directly. It never runs the §12.6 qualified-touchdown checks in `resolveSurface` (carriageway validity, building check, vertical speed limit, hard-landing event and cargo cost).
- Executed scenario (`ex.test.ts`): car DESCENDING at y = 0.03 m over the footpath (x = -11 on a 12 m road), vy = -3.2 m/s. With fuel left: crash "Invalid landing surface" -> recovery. With consumed = 1500: `landed`, no crash, no penalty. Same for vy = -6.8 m/s (limit 6.5): with fuel "Landing too hard" crash; exhausted: `landed`, no cargo cost.
- Likelihood is low (a 5 cm band, 2-3 ticks of every descent, only when the last allocated tick falls in it), but it is exactly the "mis-order touchdown vs. exhaustion" case: an invalid landing becomes free when the fuel happens to hit zero.
- Fix: in that branch, do not transition directly. Run the same touchdown qualification as `resolveSurface` (surface identity, building, `maxTouchdownVy`, hard-landing event) and invoke recovery if it fails. Add a test next to the F15/F16 tests.

**M2. WebGL context loss while the mission is in READY (before the countdown finishes) soft-locks the run.**  (code-read; the U07 e2e only covers PLAYING)
- `src/app/app.ts:305-323`. `onContextLost()` sets `CONTEXT_LOST` for any previous state. `resumeAfterContext()` then goes `PAUSED -> resume()`, and `resume()` (line 273) sets `state = PLAYING` whenever `session.phase !== 'RECOVERING'`. For a fresh (non-resumed) session in READY, `session.phase` is still `'READY'` because `session.start()` is only called by the countdown (line 423). `Session.step` returns at once when `phase !== 'PLAYING'` (session.ts:168), so the app shows PLAYING with controls enabled, the clock never advances, and the car cannot move. Soft lock; the only way out is pause/quit if those are reachable.
- Fix: in `onContextLost` remember READY (and the countdown) and restore to READY, or in `resume()` call `session.start()` / route through `beginCountdown()` when `phase === 'READY'`. Add an e2e step: lose context on the READY screen.

**M3. Displayed route lengths and the distance behind the deadline formula are inflated (up to ~50%); deadline "calibration" is looser than the docs imply.**
- `src/missions/catalog.ts:10-33` takes `lengthM` from `NavGraph.route`, which charges the whole target approach edge (`src/world/nav.ts:93-109`: cost to a target is cumulative `ne.lengthM`, not the distance to the stop point). `Session.routeRemainingM()` (session.ts:156-165) correctly subtracts the remainder of the last edge, so the HUD and the catalog disagree.
- Executed on the real package (`real.test.ts`), catalog `routeLengthM` vs `routeRemainingM()` at the start: practice 420 vs 391; mt01 625 vs 417 (+50%); mt02 1565 vs 1542; mt07 793 vs 585; mt05 1003 vs 841; mt08 1241 vs 1222; mt10 3838 vs 3631. The mission list and preview (`src/ui/screens.ts:97,116`) show the inflated figure, and `deadlineFor` is computed from it (e.g. mt01: 625 m -> 220 s deadline, while the reference agent finishes in 43 s).
- Calibration claims: `qa/artifacts/calibration/deadlines.json` shows margins of 24-80% for a perfect-knowledge reference agent (`Autopilot`) that is not a human; mt02 needed 6 recoveries and ended at 56% cargo with 4.15 m/s average, mt10 66% cargo at 4.85 m/s. The code comment (`catalog.ts:36`) says "measured runs 4.8-8 m/s"; the recorded runs span 4.15-14.5 m/s. `DECISIONS.md` D6 (line 20) is stale against the code: it documents route/8 m/s with margins 1.9/1.7/1.4/1.45, but the code uses route/6.0 m/s, margins 1.9/1.8/1.6/1.6, +10 s per signal, +12 s per turnaround. QA_REPORT does say human playtesting is absent, which is accurate.
- Fix: make `routeBetween` subtract the remainder of the final edge (use `stopAlong`) so catalog and HUD agree, then recompute deadlines and re-run the calibration; update D6 and the catalog comment from the actual numbers; if "tested appropriate deadline" is claimed, report margin per mission vs a recorded human or a degraded agent.

**M4. Checkpoint restore is not "exact" and not validated (MASTER §12.7).**  (items a-c executed, `cp*.test.ts`)
- (a) `src/missions/session.ts:75,446-480`: `nextEncounterTick`, `encounters`, hold state, `lastEdge`, `boundaryDist` are not in the checkpoint. After restore at tick 1230 the original session had `nextEncounterTick = 2771` and one active encounter; the restored one had `nextEncounterTick = 1200` and zero encounters, so it schedules a new queue immediately while the restored traffic still holds the old one (the `maxConflictEvents` bound is also lost). A resumed run therefore diverges from an uninterrupted run with identical input. (Runs from before tick 1200 matched exactly in my probe.)
- (b) `session.ts:462-470`: the ledger comes entirely from the saved snapshot (`FlightLedger.restore`, flightLedger.ts:45); `allocationSeconds` is not compared with `mission.flightSeconds`. A snapshot with `allocationSeconds: 30` on a 25 s mission produced `initialTicks = 1800`. The saved checksum (store.ts:120, FNV) is trivially recomputed, so this is a local-tamper issue only, but a saved value can grant fuel, which §12.7 forbids in spirit ("A saved reserve number cannot grant fuel").
- (c) `session.ts:470-474`: an airborne/RECOVERING snapshot is never restored as airborne ("exact" is effectively ignored). If there are no anchors yet (first 60 ticks after start), the fallback is `player.move = 'GROUNDED'` while y = 1.67 m and vy = +4.5 m/s are kept (executed): the car falls under ground gravity with no landing validation and no hard-landing check. With anchors it teleports back with no penalty. This "documented ground-recovery path" is covered by a unit test, but I found no mention of the deviation from "exact" restore in DECISIONS.md.
- Fix: persist encounter/scheduler state (or derive it deterministically from `tick`); assert `cp.player.ledger.allocationSeconds === mission.flightSeconds`; in the no-anchor case use `recoverTo` of the pickup staging pose; document the airborne-restore decision in DECISIONS.md.

### MINOR

**m1. Held steering can drive the car to an invalid landing even during committed descent (§12.5: "do not accept inputs that knowingly make all static landing solutions unaffordable").** `src/player/player.ts:393-472` (executed, `steer.test.ts`): holding steer >= 0.7 for the whole flight on the 12 m fixture road ends in "Invalid landing surface" recovery (189/200 flights at warm speed with full lock). Releasing or starting the steer 100+ ticks into the flight landed fine. Real roads are narrower (4.5 m floor), so this is likely worse in the real world (QA_REPORT itself notes the agent lands off narrow roads). Fix: attenuate lateral steering authority from the landing-soon point so the predicted footprint stays on the carriageway.

**m2. Incompatible or tampered checkpoint gives an unclearable generic error.** `app.ts:189-217` (throw inside `startMission`'s try -> `handleLoadError` "Something went wrong" with Retry that re-runs the same bad checkpoint), `app.ts:331-336` (`continueSaved`'s try/catch cannot catch an async rejection), `store.ts:104-116` (only `SAVE_SCHEMA` checked on load, not `cp.schema`/`world`/`missionVersion`). After any mission/world version bump, Continue shows the error again each time; only Back and starting a new run (which overwrites the slot after 5 s) clear it. Fix: validate compatibility in `loadCheckpoint` or clear the slot and show the "older version" message on `Incompatible checkpoint`.

**m3. U12 race: restarting while chunks are loading can leave a start chunk silently unloaded.** `app.ts:350-366` (code-read). A chunk fetch begun by the aborted run clears `chunkLoading` in `finally`; a waiting new-run `ensureChunk` then finds no cache entry and returns without loading (line 361). The new run reaches READY with that chunk missing; at PLAYING `criticalLoaded()` triggers a "loading" technical pause and `stream()` later fetches it, so it degrades to a spurious pause rather than a hang. Stale progress callbacks from the old load can also repaint the loading screen (line 204) and a late non-abort error from the old run can show the ERROR screen over the new run (line 217). Fix: loop in the waiter until the chunk is cached or its own signal aborts; ignore callbacks/errors when `this.abort !== abort`.

**m4. Context loss during RESULTS discards the results screen** (`app.ts:318-323`: session ENDED -> `toMenu`). Cosmetic, but the result is lost.

**m5. Stuck-control edge:** in `ui/input.ts:54-58,82` `steerPointer` / the brake set are updated before `setPointerCapture`, which throws `InvalidStateError` if the pointer has already ended; the entry then never receives a release. Wrap in try/catch and roll back. (code-read)

**m6. Orientation pause relies solely on the `orientationchange` event** (`app.ts:110,299-303`); a resize to portrait without that event (split-screen, desktop window) does not pause. (code-read)

**m7. Clock drops time silently between 8 ticks and the 0.5 s stall threshold** (`core/clock.ts:25-27`): a 0.3 s hitch runs 8 ticks and discards the rest, with no interruption record. Gameplay time and fuel stay tick-based so there is no unfair deadline loss, but §10 asks for explicit technical pause or recorded interruption for severe stalls.

**m8. Debug harness hygiene.** The harness is gated correctly: `manualClock` requires `?debug`, `debugAdvance` returns immediately without `?debug`, and records exclude `debugUsed`/`resumed` runs (`store.ts:80`). Residual: `window.__hmd` is always exposed and `runTicks()` (app.ts:466) is public and unflagged, so a console user can advance ticks without `debugUsed` being set; `debugUsed` is not saved in the checkpoint (covered in practice by `resumed`); `finish()` calls `markCompleted`/`practiceDone` for debug and autopilot runs (app.ts:539-542); `debugAdvance` in RECOVERING calls `frame()`, which starts an extra `requestAnimationFrame` chain per call (app.ts:404,489), debug only.

**m9. Recovery anchors can predate a delivered stop** (`session.ts:344-353`): up to ~30 s of anchors are kept across stops, so recovery after stop 1 can return the car to a leg-1 position. No progress gain (honest) but potentially a large unexplained setback.

**m10. Manual recovery in flight preserves the landing reserve** (`session.ts:356`, 3 s penalty, no cargo cost): the player skips the descent and keeps the unspent reserve ticks. This is not a refund and not a bug, but it is a trade the spec's "reserve is part of the same budget" wording did not clearly anticipate. Design note only.

**m11. Hard-coded corridor copy not from data.** `src/ui/screens.ts:81-82` names "LB Nagar", "JBS Parade Ground" and "MG Bus Station"; the data's station names are "L. B. Nagar", "JBS" / "Parade Grounds" and "Mahatma Gandhi Bus Station" (CONTENT_GAPS C20 already flags the JBS naming). Fix: generate from `core.stations`. Mission briefs also attach real OSM business names to fictional cargo (e.g. fragile glassware for a named business); the docs disclose that names are provisional but not that the cargo fiction is invented.

**m12. Documentation drift (understates progress rather than overclaiming).** `qa/status.json:592` still says "Nothing is playable yet" with phase `foundation` (updated 22:26) while README says playable; no Vitest/Playwright run is registered in `qa/evidence-index.json` (3 records only); QA_REPORT.md:20 and IMPLEMENTATION_STATUS.md:39 say 60 tests (actual 67; `store.test.ts` is missing from the QA table; session 18, replay 6 vs 17 and 4); CONTENT_GAPS C15 lists "Shell" as a delivery but the package has "The Hindu" (core.json `d_the_hindu`); C25 says max route 8,894 m, validator prints 9,079 m. IMPLEMENTATION_STATUS lists the independent review as `todo`.

## 4. Claims verified as accurate

Flight budget (executed or code-traced):
- One integer counter, no API to add, refund or reset (`flightLedger.ts`); the only ledger writers are `spendTick` and `beginTransaction`; a ledger is created only in the `Session` constructor (new contract / retry), and `FlightLedger.restore` for checkpoints.
- Every tick that begins airborne is metered exactly once, including the launch tick and the touchdown tick; supported LANDING_CONFIRM ticks are free; losing support in confirmation resumes metering in the same transaction (fuzz: 1,600 flights, 0 violations).
- Hover and braking are metered; there is no free glide (`integrateAir` is only reachable from `isAirborne`, which is metered).
- A denied launch spends nothing and queues nothing (`player.ts:279`; `discardEdges` in `input.ts:125`; Fly edge is consumed in `sample()`, `input.ts:119-120`).
- A held press cannot count as Land: keyboard repeats are ignored (`input.ts:41`), touch uses `pointerdown` only, `clearAll()` drops a pending edge on blur/hide/pause/resume, and `player.ts:269-288` handles Land only in the else-branch so a launch press cannot also land on the same tick.
- Exhaustion while unsupported in the air = crash/recovery with no refund; exhaustion while supported in TAKEOFF aborts; launch affordability uses the predicted post-takeoff state (`player.ts:212-226`). Exception: M1.
- Recovery keeps consumed ticks and applies the penalty once (`completeRecovery` clears `pendingRecovery` first); retry and new contract create a new ledger; ground driving and intermediate stops never touch the ledger.
- Mission rules (`session.ts:217-251`): deadline-tick success passes and one tick later fails; cargo failure and critical contact beat success; an outside-area recovery also blocks delivery that tick; hold needs speed < 1 m/s for 60 ticks, grounded, matching level and approach; FAST or reverse cancels and disarms until the car leaves or exceeds 2 m/s.
- Pause freezes time: gameplay advances only through `Session.step`, called only from `runTicks` while `state === 'PLAYING'` (re-checked every iteration); `Session.step` also refuses unless `phase === 'PLAYING'`; no `Date.now`/`performance.now`/timers in `src/player`, `src/missions`, `src/traffic` or `src/world` gameplay code; pause, hidden, stall, loading and tutorial all clear input and the accumulator.
- Navigation: routes come from Dijkstra on the directed graph with no straight-line shortcuts (every first-leg route length >= the straight-line distance in my probe); U-turns are only offered where the importer says they are the only option (validator message in `validate-world.mjs:262`) and carry a 400 m routing penalty; `mustLeave` forces a real loop back after overshooting a stop.
- Geographic honesty: all 10 delivery labels and all 139 non-line names appear verbatim as `name` values in the bundled OSM files (`corridor-0*.osm`, `metro-network-full.json`); all 142 name records are marked `verification: provisional`; Telugu aliases come from `name:te`; the importer reads only bundled files; the sources manifest, ODbL notice and "nothing is field verified" statements are consistent with what the data contains.
- No overclaim of verification, device testing or Whiteout comparison was found: README, QA_REPORT, DECISIONS (D10) and IMPLEMENTATION_STATUS all state that no physical phones, no Whiteout inspection, no imagery review and no human playtests exist; `verify_run.py` reports 0 passed requirements, 0 invalid passes, and the ledger marks every check `not_run` or `blocked`.
- Debug harness cannot be reached without `?debug` for stepping, and flagged runs are excluded from records (m8 lists residual gaps).

## 5. Limits of this review

- Not executed: any browser path (input events, visibility, orientation, context loss, restart-abort race). M2, m3-m6 are from reading code only.
- The e2e results and screenshots in `qa/artifacts/e2e/` are from another process that was still writing when I looked; I did not rely on them or verify the QA_REPORT's Playwright claims.
- Calibration used the repo's own reference agent; I did not obtain human timing.
- Geographic accuracy against the real world (road shapes, one-way directions, heights) was not and cannot be assessed here; I only checked that names trace to the bundled OSM source.
