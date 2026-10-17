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

## Work checklist (revision 91565e3 and later)
| # | Item | Req IDs | Owner | Status |
|---|---|---|---|---|
| 1 | Kit audit + offline checks | C0 | lead | done |
| 2 | Scaffold game/ with pinned deps | P01 | lead | done |
| 3 | Contracts `src/world/schema.ts`, `src/art/api.ts` | G01, G04 | lead | done |
| 4 | OSM import pipeline → world package v1 (deterministic; widths clamped to footprints; ramps/elevation continuity; boundary roads) | G01–G03, G06–G08, G11, Q01–Q04 | data worker (Sonnet) | done (816 edges / 61.9 km; routable core 655 / 48.3 km; 147 pillars; 10 deliveries) |
| 5 | Procedural art incl. station obstacles, revised car/auto/ground | C4, P02, P05 | art worker (Sonnet) | done (visual weaknesses listed in QA_REPORT/art report) |
| 6 | Ledgers + final evidence binding + release-report | Q05–Q12 | ledger worker (Sonnet) | running |
| 7 | Core sim (clock, FlightLedger, Player, recovery, checkpoints) | F01–F24 | lead | done |
| 8 | Traffic: IDM, yields + deadlock recycle, curb stops, pedestrians, seeded encounter queues (≤2), signal plans (S03) | M07–M11 | lead | done |
| 9 | App/UI: state machine, HUD, touch, menus, map, results, settings, tutorial, service worker | U01–U12, M06 | lead | done |
| 10 | Tests: Vitest 69/69 (incl. all 12 missions on the real package, flight variants), Playwright 9/9 on final dist | C2, C3 | lead | done |
| 11 | Independent AI review (separate agent) | C7 | reviewer (Sonnet) | done — majors M1–M4 fixed with regression tests; minors listed in `game/qa/independent-review.md` |
| 12 | Whiteout comparison | Q08, C4 | — | blocked (B1) |
| 13 | Red/Green/rest-of-Blue packages; routable Uppal/Tarnaka ends | C5 | — | blocked (B2) |
| 14 | Physical phone tests | U01, P03, C6 | — | blocked (B4); procedure in `game/QA_REPORT.md` |
| 15 | Local recognition / imagery frontage review | G05, G12 | — | blocked (B3) |

## Running jobs
- ledger worker: final evidence binding (requirements.json, qa/status.json, qa/evidence-index.json, qa/release-report.md)

## Current achieved release
Playable corridor with disclosed geographic gaps (development build): Blue Line Uppal–Tarnaka package. Requested: completed three-corridor network with Android + iOS validation — not achieved.

## How to run
`cd game && npm ci && npm run dev` (http://localhost:5173) · `npm test` · `npm run build && npm run test:e2e` · `npm run import:map && npm run validate:world`.

## Next actions
1. Unblock B1: allow `whiteout.plgb.chatgpt.site` (environment Network access) or supply gameplay captures → run the GRAPHICS_REFERENCE_WHITEOUT §2–4 comparison and iterate art.
2. Unblock B2: allow Overpass/Geofabrik or supply a clipped PBF → widen Uppal/Tarnaka boxes (CONTENT_GAPS C1/C2), then Red/Green/Blue packages via `npm run import:map`.
3. B4: run the physical-device procedure in QA_REPORT.md on one Android + one iPhone.
4. B3: imagery/field frontage inventory and recognition review (CONTENT_GAPS).
5. Human playtests to re-tune deadlines (MT08 margin 8 %) and flight assist.
