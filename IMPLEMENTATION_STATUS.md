# IMPLEMENTATION_STATUS — Hyderabad Metro Delivery

## Current checkpoint — 18 October 2026, survey 47 first pass

Exact full-map reconstruction remains **unfinished**. Added 444.68 m LEFT-only partial windows, twelve new November 2025 views and eleven pending observations; two prior references are reused, not duplicated. No new model/profile, suppression, RIGHT inventory, complete inventory, runtime or physical change.

Existing source/network/queue validation, base hashes, build/typecheck and a bounded atlas observation check passed. No new unit suite, driving, facade-ray/pixel, flight or delivery certification. All-forty delivery calibration is historical 32; prior 44 caption corrections remain preserved.

Combined1,216.90m /52views /30second-pass issue groups are not shop-unit counts. Raidurg-only 970.42 m; Durgam–Madhapur 950.99 m is unchanged and not additive.159 provisional fronts / 42 profiles unchanged, visual inventory 0.119%, strict 0. The checklist below is historical and has not been recertified.

---

## Historical baseline

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
| B2 | ~~Overpass/Geofabrik denied~~ **resolved** via Overture S3 (v2 package, all three corridors) | — | — |
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

## v2 checklist: whole network, real storefronts, new controls (plan: `EXPANSION_PLAN.md`)
| # | Item | Owner | Status |
|---|---|---|---|
| V1 | Schema v2 (storefronts, structures, lines) | lead | done |
| V2 | Controls: steer pad, ▲ accelerate, ▼ brake (hold = reverse), FLY; no input = hold | lead | done (tests, tutorial, reference agent updated) |
| V3 | Pedestrians only on at-grade footpaths (never bridges/flyovers) | lead | done (regression test) |
| V4 | Landmark research for 57 stations (web search, cited) | research worker (Haiku) | done (`game/data/research/landmarks.json`) |
| V5 | Whole-network package from Overture (roads, buildings, storefronts, structures, ~300 deliveries) | data worker (Sonnet) | done: 630.7 km routable roads across all three lines, 80,076 buildings, 19,508 listing-based storefronts, 342 deliveries (6 per station area), 56 structures including the Uppal skywalk; validates with 0 errors and is deterministic |
| V6 | Signboards with real names, bridge decks/ramps/piers, Uppal skywalk, facade polish | art worker (Sonnet) | done (preview screenshots in `game/qa/artifacts/art/v2-*`; in-game in `game/qa/artifacts/v2/`) |
| V7 | Levels 1–5 catalog + level menu with unlocks; v2 loader with v1 fallback | lead | done (awaiting v2 data for calibration) |
| V8 | Fork surface matching (narrow service road beside flyover ramp) | lead | done (MT08 margin 19.7 %) |
| V9 | v2 integration fixes found by calibration: pedestrians on overlapping divided-road carriageways, slip-road fork matching, hairpin U-turns, 20–58 % short-bridge grades (importer grade limit 10 %), buildings poking through decks, level-aware obstacle checks | lead | done |
| V10 | Road geometry streamed by 480 m tile (heap 449 → 145 MB; resident road triangles 3.9 M → ~80 k) | lead | done |
| V11 | Ground calibration of all 40 level missions by the reference agent | lead | done: 40/40 delivered, no flight (lengths per DECISIONS D15) |
| V12 | e2e for v2 (`tests/e2e/v2.spec.ts`), v1 suite pinned with `?v1` | lead | done: 10/10 |
| V13 | Independent review v2 | reviewer (Sonnet) | done: 3 major findings fixed (`game/qa/independent-review-v2.md`) |
| V14 | Ledger refresh, QA report v2 | lead | done: ledger valid (0 errors); 47 passed, 28 not_run, 7 blocked, 0 failed |

B2 is superseded by V5: Overture S3 is reachable. B3 is still open: street-view and satellite imagery are blocked here, and copying them is not permitted. Storefronts are listing-based and provisional.

## Running jobs
- none

## Current achieved release
Playable three-corridor network with disclosed geographic gaps (development build): v2 whole-network package (Red, Blue, Green) with listing-based storefront signboards, 5 levels and 40 calibrated contracts. Requested: completed three-corridor network with geographic verification, Whiteout comparison and Android + iOS validation. Not achieved (B1, B3, B4).

## How to run
`cd game && npm ci && npm run dev` (http://localhost:5173) · `npm test` · `npm run build && npm run test:e2e` · `npm run import:map && npm run validate:world`.

## Next actions
1. B3, storefront verification: allow `graph.mapillary.com` and its image CDN in the environment's Network settings and provide a Mapillary token. An AI-assisted pass can then compare the listing-based signboards (`game/qa/storefront-inventory.json`) with open street-level photos. Otherwise use the local field checklist.
2. B4: run the physical-device procedure in `game/QA_REPORT.md` on one Android phone and one iPhone, with the v2 network. The heap is about 145 MB on desktop; check that phones sustain it.
3. B1: allow `whiteout.plgb.chatgpt.site` or supply gameplay captures, then run the Whiteout comparison and iterate the art.
4. Performance: stream the metro viaduct like the roads (about 0.6 M triangles are still built at load). Shrink core.json (12 MB raw / 2.1 MB gzip) by moving provenance and status into a sidecar file.
5. Art: the dusty ground texture tiles visibly from the air; shop-front templates are generic per category.
6. Human playtests to tune the level deadlines and the ▲/▼ feel.
