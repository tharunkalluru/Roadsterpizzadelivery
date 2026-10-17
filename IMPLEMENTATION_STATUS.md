# IMPLEMENTATION_STATUS — Hyderabad Metro Delivery

Live checklist. Status values: `passed`, `failed`, `blocked`, `not_run`, `stale` (acceptance); work items use todo / doing / done / blocked.

## Paths
| What | Path |
|---|---|
| Repository | `tharunkalluru/roadsterpizzadelivery`, branch `claude/adoring-dijkstra-ireick` |
| Handoff kit (unmodified source snapshot, v3.0) | `hyderabad-game-handoff/` |
| Application root | `game/` |
| Ledgers | `game/requirements.json`, `game/scope-manifest.json`, `game/qa/status.json`, `game/qa/evidence-index.json`, `game/qa/visual-reference-review.json` |

## Session / environment facts (recorded 2026-10-17)
- Session configured model: `claude-opus-5-5` (from session metadata; see QA_REPORT for verification method).
- Node v22.22.0, npm 10.9.4, Python 3.13.16. Chromium 1194 headless with WebGL2 via SwiftShader (software) — works for our own captures.
- Network: npm, PyPI, GitHub reachable. **Blocked by environment network policy:** `whiteout.plgb.chatgpt.site`, `overpass-api.de`, `download.geofabrik.de`, `polyhaven.com`, `ambientcg.com`, `cdn.jsdelivr.net`, `unpkg.com`, `tile.openstreetmap.org`.
- No physical Android/iPhone access. No paid spend authorized.

## Blockers
| ID | Blocker | Affects | Continuation |
|---|---|---|---|
| B1 | Whiteout reference host denied by network policy → gameplay cannot be inspected | Q08, C4 | User can allow the host in environment Network settings, or supply gameplay recording/screenshots. Comparison stays `blocked`. |
| B2 | Overpass/Geofabrik denied → no road data beyond the 4 bundled Uppal–Tarnaka boxes | C5, G-series for Red/Green/rest of Blue | Allow hosts or supply a clipped PBF; pipeline accepts more `.osm` inputs. |
| B3 | No street imagery / field review | G05, G12, frontage verification | Capture brief in CONTENT_GAPS.md. |
| B4 | No physical phones | U01, P03, C6 | Procedure in QA_REPORT.md. |

## Work checklist
| # | Item | Req IDs | Owner | Status |
|---|---|---|---|---|
| 1 | Kit audit + offline checks | C0 | lead | done (valid_handoff, 82 IDs, cache PASS) |
| 2 | Scaffold game/ with pinned deps | P01 | lead | done |
| 3 | Contracts: `src/world/schema.ts`, `src/art/api.ts` | G01, G04 | lead | done |
| 4 | OSM import pipeline → `public/world/hyd-uppal-tarnaka/v1` (deterministic, validated) | G01–G03, G06–G08, G11, Q01–Q04 | data worker (Sonnet) | done: 816 edges / 61.9 km (core 655 / 48.3 km), widths clamped to footprints, 147 pillars, 10 deliveries |
| 5 | Procedural art (car, traffic, metro, buildings, roads, env, signs, markers) | C4, P02, P05 | art worker (Sonnet) | first pass done; follow-up running (stairs off carriageway + `stationObstacles`, car silhouette, auto, ground) |
| 6 | Ledgers + docs/handoff copy | Q05–Q12 | ledger worker (Sonnet) | initial done; final evidence binding pending (after final build) |
| 7 | Core sim (clock, FlightLedger, Player, recovery, checkpoints) | F01–F24 | lead | done |
| 8 | Traffic (IDM, yield + deadlock recycle, curb stops, pedestrians, seeded encounter queues ≤2) | M07–M11 | lead | done (basic) |
| 9 | App/UI (state machine, HUD, touch, menus, map, results, settings, tutorial, SW) | U01–U12, M06 | lead | done (first pass) |
| 10 | Tests: 60 Vitest (incl. all 12 missions on the real package via reference agent), 9 Playwright e2e on dist | C2, C3 | lead | Vitest 60/60; e2e 8/9 + U07 flaky |
| 11 | Reports: README, DECISIONS, QA_REPORT, DATA_SOURCES, CONTENT_GAPS | P08, Q12 | lead/data | drafted |
| 12 | Independent review pass | C7 | reviewer agent | todo (after art lands) |
| 13 | Whiteout comparison | Q08, C4 | — | blocked (B1) |
| 14 | Red/Green/rest-of-Blue packages | C5 | — | blocked (B2) |
| 15 | Physical phone tests | U01, P03, C6 | — | blocked (B4); procedure in QA_REPORT |

## Running jobs
- art worker: follow-up (stairs/colliders, car, auto, ground)

## Current achieved release
Playable corridor with disclosed geographic gaps (development build): Blue Line Uppal–Tarnaka package; requested scope = all three operating corridors (not achieved).

## How to run
`cd game && npm ci && npm run dev` (http://localhost:5173) · `npm test` · `npm run build && npm run test:e2e`.

## Next actions
See checklist rows marked `doing`/`todo`.
