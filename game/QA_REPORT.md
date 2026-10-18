# QA_REPORT

Evidence classes are kept separate: **automated simulation** (Vitest, Node), **desktop browser
automation** (Playwright + headless Chromium 1194 with SwiftShader software WebGL), **mobile
viewport emulation** (Playwright touch/mobile context), **physical Android**, **physical iPhone**,
**local geographic review**, **AI visual review**. Only the first three were available in this
environment. Machine-readable bindings: `qa/evidence-index.json`, `qa/status.json`.

## v2 update (2026-10-18): whole metro network, real storefronts, new controls
This section covers the latest build. The sections below it describe the v1 Uppal–Tarnaka build, which can still be loaded with `?v1`.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | clean |
| Unit/integration | `npx vitest run` | 87 passed, 2 dev tools skipped; includes v1 missions, v2 L1–L2 missions and the pedestrian-on-bridge regression |
| Full v2 ground calibration | `CALIBRATE_ALL=1 npx vitest run tests/unit/missions-v2.test.ts` | all 40 level missions delivered on the ground by the reference agent, with no flight (`qa/artifacts/calibration/deadlines-v2-all.json`); lowest margin 5 % (one L1 run with a recovery), L5 margins 33–45 % |
| World validation | `npm run validate:world:v2` / `npm run validate:world` | 0 errors; 1 warning (core.json is 12 MB raw, 2.1 MB gzip) / 0 errors |
| Determinism | `npm run validate:world:v2 -- --check-determinism` | two fresh imports byte-identical (data worker run) |
| Browser | `npm run build && npx playwright test` | 10/10: the v1 suite pinned with `?v1`, plus `v2.spec.ts` (level menu with locks, a Level 1 delivery by the reference agent, streamed roads, real-name storefronts) |
| Independent review | `qa/independent-review-v2.md` | 3 major findings, all fixed: credits licence text, shops drawn on omitted footprints, undocumented level lengths (now D15). Minor findings fixed: instance-buffer leak, same-level route matching, locale-dependent catalogue order, tunnel intrusion rule, grade-limit convergence. Still open: possible deck seams at tile borders on very long edges; road tiles pop in over the first frames |

**Performance (SwiftShader software rendering, so the frame rate is not representative):**
- Heap during a mission: 449 MB before road streaming, about 145 MB after.
- Resident road triangles: 3.9 M before, about 80 k after (480 m tiles within view range).
- Draw calls: about 130–200.
- Rendered triangles: about 0.45–0.55 M at standard quality.
- The metro viaduct (about 0.6 M triangles for the whole network) is still built at load; it is the next candidate for streaming.
- Physical phones remain untested (B4).

**Fixes found by v2 calibration:**
- Pedestrians were walking or crossing onto overlapping carriageways of divided roads.
- Slip roads overlapping the left lane were treated as a turn.
- Hairpin U-turns between divided carriageways.
- Short bridges ramped to 6.5 m within 10–20 m (grades of 20–58 %); the importer now limits grades to 10 %.
- Buildings poked through flyover decks.
- Traffic and pedestrians on another level blocked the car.

**Data honesty:**
- Storefront names are Overture listings marked `provisional_listing`. No street-view or satellite verification was possible here (blocked hosts; Google terms).
- `qa/storefront-inventory.json` lists all 27,994 nearby places and the reason for each one that was excluded.

## Environment (2026-10-17)
- Linux container, 4 vCPU, no GPU; Node 22.22.0; npm 10.9.4; Python 3.13.16.
- Chromium 1194 headless, WebGL2 via ANGLE/SwiftShader (software). Frame rates in this environment
  (~1 fps at 1280×720) say nothing about phones; gameplay tests use the `?debug&manualclock` harness
  (D7), which advances the simulation through the normal per-tick path independent of wall time.
- Network policy blocks the Whiteout reference, Overpass, Geofabrik and imagery hosts.

## Commands and latest results
| Command | Method | Latest result |
|---|---|---|
| `npm run typecheck` | static | clean |
| `npm test` (Vitest) | automated simulation | 69/69 passed (`qa/artifacts/unit/results.json`, revision 91565e3) |
| `npm run build` | production bundle | succeeds (≈0.8 s) |
| `npm run test:e2e` | desktop browser automation on `dist/` via `vite preview` | final build: 9/9 passed (`qa/artifacts/e2e/results.json`, `run.log`). History: U07 failed once in an earlier full-suite run with "Target page… closed" (SwiftShader renderer loss after context restore) and one C3 run failed on a HUD assertion that did not wait for the next rendered frame (test fixed); both are disclosed as flakiness of the software-GPU harness |
| `npm run validate:world` | data validation | 0 errors, 0 warnings; deterministic rebuild identical |
| `python3 monitoring/verify_run.py …` | ledger integrity | structurally valid; not release-ready (expected) |

### Unit / integration coverage (Vitest)
| File | Requirement IDs exercised |
|---|---|
| `tests/unit/flight.test.ts` (24, incl. review-M1 regression) | F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, U06 (stall→pause) |
| `tests/unit/session.test.ts` (19, incl. U11 and review-M4 regression) | M01 (fixture), M02, M03, M04, M05, M06, F12, F19, F20, F21, F23, F24, M13, U08, G02, G03 |
| `tests/unit/replay.test.ts` (6) | M12, M08, M11, M07, M10, S03 signal plan, P04 (simulation-level repeated traversal with streaming) |
| `tests/unit/store.test.ts` (4) | M14, U08, U05 (persistence) |
| `tests/unit/missions-real.test.ts` (16) | M01 on the real package: every instantiated mission completed by the reference agent through real physics, mission traffic, no flight; flight variants for MT02/MT06/MT10; deadline calibration (`qa/artifacts/calibration/*.json`) |

### Browser automation (Playwright, desktop + emulated mobile)
| Test | IDs | Result |
|---|---|---|
| C2 select → pickup → drive (reference agent) → deliver → results → retry → exit | C2, M01, P06 | passed |
| C3 shared budget in browser: launch, metered flight, fresh-press land, HUD agreement, no refill | C3, F04, F11, F12, M06 | passed |
| Hidden page freezes time and fuel | U06, F18 | passed |
| WebGL context loss → pause → restore → resume | U07 | passed (final build); flaky once earlier |
| Storage denied → session-only explanation | U05 | passed |
| No WebGL2 → readable failure | U05 | passed |
| Missing chunk (404) → explained load error | U05, U09 (load path only) | passed |
| Simultaneous touches, pointercancel/blur release, portrait pause | U02 (emulated), U01/U03 emulated only | passed (emulation — not physical evidence) |
| Map opens paused; manual recovery adds one penalty, keeps fuel | M03-adjacent, F19 | passed |

## Deadline calibration (reference agent, ground only)
See `qa/artifacts/calibration/deadlines.json` (charged time vs deadline and margin per mission, seed,
traffic). Every standard mission is completable on the ground. Human playtesting has **not** been
performed; margins are provisional.

## Performance and payload
- Production payload (gzip, all files incl. every chunk): ≈2.4 MB (JS/CSS/HTML 0.22 MB, world core
  0.18 MB, textures 1.3 MB, Telugu font 0.42 MB, 176 chunks 0.32 MB). Target ≤ 12 MB first play.
- SwiftShader scene stats (standard preset, street view): ≈139 draw calls, ≈249k triangles incl.
  shadow pass (art worker: low preset 104–210 calls, 44–91k tris). Budget: 150 calls / 250k tris (low).
- **Phone frame times: not measured** — no physical devices (B4).

## Physical device procedure (ready to run; result pending)
1. `npm run build && npm run preview` on a machine on the same LAN; open `http://<lan-ip>:4173/?debug` on the phone (debug panel shows p50/p95/p99 frame time, draw calls, triangles, heap).
2. Devices: one midrange Android (e.g. 2023 Snapdragon 6-series, Chrome) and one supported iPhone (Safari). Record model, OS, browser, battery %, charging state, ambient temperature, preset (auto→low).
3. Landscape; play MT10 (full corridor) for ≥15 minutes continuously using driving, two flights and recoveries; then ten MT01/MT08 out-and-back runs.
4. Every 60 s record the debug panel values; note thermal throttling, input lag (tap→visible response), stuck controls, audio.
5. Test lifecycle: app switch, lock screen, rotate to portrait and back, low-storage/private mode.
6. Save values into `qa/artifacts/device/<device>.json` and screenshots/recordings; register in `qa/evidence-index.json` as `physical_android` / `physical_ios`.

## Known issues
- Software-GPU harness flakiness (U07 once, C3 HUD timing once) — see above.
- MT08 (return) ground calibration margin is only 8 % with 5 reference-agent recoveries around the Tarnaka flyover approaches; human playtests may need a wider deadline.
- Independent AI review (`qa/independent-review.md`): majors M1–M4 fixed with regression tests; remaining minors listed there (e.g. restart-abort race in chunk loading, held-steer landing assist, debug handle exposure).
- Encounter queues use stopped vehicles; no signal-phase simulation (1 signalled junction in source).
- Station stairs/escalators are placed only clear of carriageways and registered as colliders (`stationObstacles`).
