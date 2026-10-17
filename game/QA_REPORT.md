# QA_REPORT

Evidence classes are kept separate: **automated simulation** (Vitest, Node), **desktop browser
automation** (Playwright + headless Chromium 1194 with SwiftShader software WebGL), **mobile
viewport emulation** (Playwright touch/mobile context), **physical Android**, **physical iPhone**,
**local geographic review**, **AI visual review**. Only the first three were available in this
environment. Machine-readable bindings: `qa/evidence-index.json`, `qa/status.json`.

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
| `npm test` (Vitest) | automated simulation | 60/60 passed — see table below |
| `npm run build` | production bundle | succeeds (≈0.8 s) |
| `npm run test:e2e` | desktop browser automation on `dist/` via `vite preview` | 9 tests; last full-suite run 8 passed, U07 failed once with "Target page… closed" (renderer process loss under SwiftShader after context restore), passed on isolated re-run of the same build — recorded as flaky, not as a clean pass |
| `npm run validate:world` | data validation | 0 errors, 0 warnings; deterministic rebuild identical |
| `python3 monitoring/verify_run.py …` | ledger integrity | structurally valid; not release-ready (expected) |

### Unit / integration coverage (Vitest)
| File | Requirement IDs exercised |
|---|---|
| `tests/unit/flight.test.ts` (23) | F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, U06 (stall→pause) |
| `tests/unit/session.test.ts` (17) | M01 (fixture), M02, M03, M04, M05, M06, F12, F19, F20, F21, F23, F24, M13, U08, G02, G03 |
| `tests/unit/replay.test.ts` (4) | M12, M08, M11, P04 (simulation-level repeated traversal with streaming) |
| `tests/unit/missions-real.test.ts` (16) | M01 on the real package: every instantiated mission completed by the reference agent through real physics, mission traffic, no flight; flight variants for MT02/MT06/MT10; deadline calibration (`qa/artifacts/calibration/*.json`) |

### Browser automation (Playwright, desktop + emulated mobile)
| Test | IDs | Result |
|---|---|---|
| C2 select → pickup → drive (reference agent) → deliver → results → retry → exit | C2, M01, P06 | passed |
| C3 shared budget in browser: launch, metered flight, fresh-press land, HUD agreement, no refill | C3, F04, F11, F12, M06 | passed |
| Hidden page freezes time and fuel | U06, F18 | passed |
| WebGL context loss → pause → restore → resume | U07 | flaky (see above) |
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
- U07 flaky under SwiftShader (above).
- Reference agent occasionally lands off the carriageway at the end of a full-budget flight on narrow (4.5 m) clamped roads → recovery; human-controlled landing feedback exists but is untested by people.
- Encounter queues use stopped vehicles; no signal-phase simulation (1 signalled junction in source).
- Station stairs placement vs carriageway is under repair (art follow-up) — see IMPLEMENTATION_STATUS.
