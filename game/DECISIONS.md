# DECISIONS

Important defaults, rejected alternatives and reasons. Dated 2026-10-17 unless noted.

## D1 Repository layout
The supplied repository was empty. The handoff kit is kept unmodified at `hyderabad-game-handoff/`; the application lives in `game/` at the repository root (not inside the kit folder) so the kit stays a byte-identical source snapshot. `IMPLEMENTATION_STATUS.md` is at the repository root.

## D2 Stack (pinned in package-lock.json)
three 0.186.1, TypeScript 7.0.2, Vite 8.3.4, Vitest 5.0.5, @playwright/test 1.64.1, fast-xml-parser 5.11.2 (import pipeline only), Node 22.22.0, npm 10.9.4. Lightweight DOM/CSS UI, no UI framework.

## D3 Physics: deterministic custom arcade layer instead of Rapier
MASTER §9 names Rapier as the *default*. We use a small custom fixed-step layer: kinematic-bicycle chassis on canonical road surfaces, circle-vs-polygon building collision, circle pillars, overhead bands for decks/bridges, kinematic traffic with IDM following. Reasons: (1) every collider is derived directly from the same canonical world data as navigation and render (G04) without a second scene graph; (2) bit-stable integer flight accounting and same-tick event ordering are easy to test (F01–F24 run headless in Vitest in <1 s); (3) no WASM init on mobile (P06, payload). Rejected: Rapier dynamic chassis — heavier, harder to make the flight ledger and touchdown confirmation exactly testable, and determinism across platforms is not guaranteed anyway. Revisit if richer vehicle dynamics are needed.

## D4 Flight model implementation
One integer `consumedFlightTicks` per contract (`FlightLedger`), no API to add/refund. Metering occurs at a fixed point in the tick (after input requests, before integration) for TAKEOFF/FLYING/DESCENDING and for LANDING_CONFIRM ticks without support. Touchdown tick is metered (inclusive). Launch affordability uses the predicted post-takeoff state (altitude 4.5 m, climb 4.5 m/s): ascent ticks + predicted descent ticks + 30-tick margin. Automatic descent when remaining ≤ reserve + 6 ticks. Minimum flight altitude 4.5 m (clears 3.2 m buses), cruise 6.5 m, lowered automatically under overhead structures. Values are proposed tuning, not playtested.

## D5 Air envelope
Flight is allowed over the selected road surface + 3.5 m (footpath margin). At the edge the controller holds position at the boundary, turns toward the road and bleeds speed while an "air_edge" warning is shown — a visible, assisted limit rather than a late invisible wall. Roofs, vehicle tops and off-carriageway touchdown are invalid landings → recovery.

## D6 Deadlines
Formula (in `src/missions/catalog.ts`): est = physical route length / 6.0 m/s + 2 s × (turns + 6 per dead-end turnaround + 5 per signalled junction) + 5 s per stop + 6 s; deadline = est × margin (practice 1.9, MT01 1.8, all other standard contracts 1.6, incl. multi-stop), rounded up to 5 s. Route length is the physical distance from the pickup's staging point to the destination stop on the directed graph (the routing penalty for turnarounds is excluded; independent review M3 fixed an over-count of the final edge). The 6.0 m/s pace was recalibrated from measured reference-agent runs (≈4.8–8 m/s average with traffic, signals and encounter queues). Every instantiated mission is verified by the reference driving agent through real physics with its traffic seed and no flight (`tests/unit/missions-real.test.ts`; results in `qa/artifacts/calibration/deadlines.json`). Limitation (from the independent review): this agent has perfect route knowledge — it is not a human, so margins are provisional until human playtests.

## D7 Headless browser harness
Software WebGL (SwiftShader) runs at ~1 fps; real wall-clock play would trigger the stall pause (which is correct behaviour). `?debug&manualclock` makes the simulation advance only via `__hmd.debugAdvance(n)` through the same per-tick path; such runs are flagged `debugUsed` and never stored as records. This is a test harness, not evidence of frame rate or phone performance.

## D8 Strong connectivity and boundary roads
The routable network is the largest strongly connected component so every delivery has an outbound and return route. Roads within 200 m of the alignment that are only weakly connected (one-way carriageways leaving the acquired boxes at Uppal and Tarnaka) are kept as drivable `routable: false` boundary roads; routing never plans through them; leaving the area triggers the boundary warning and recovery. No connector was invented.

## D9 Quality presets
`auto` picks `low` on touch/mobile user agents and `standard` on desktop; DPR capped at 1 / 1.5 / 2 for low / standard / high. Gameplay-critical geometry is identical across presets.

## D10 Whiteout reference
The reference host is blocked by the environment network policy; no observations are claimed. UI typography uses condensed uppercase headings — a generic choice, not a claimed match. Q08/C4 stay blocked.

## D11 Delivery naming
Delivery labels are OSM `name` values (provisional source claims). The fictional delivery brand is "Metro Express"; no real business is given fictional signage.

## D12 Road precedence over conflicting footprints
After clamping provisional widths to source footprints (floor 4.5 m; 3.0 m service), 258 OSM building footprints still overlap the minimum carriageway (`intrudesCarriageway: true`). Either the road centreline or the footprint is mis-registered; the source cannot tell which. For gameplay the selected road wins: those footprints are omitted from BOTH render and collision (never one without the other), and remain listed in `CONTENT_GAPS.md` (C28) and `data/import-report.json` for imagery/field resolution. Rejected: keeping them as collision (makes real roads undrivable) or rendering without collision (visible wall the car passes through).

## D13 Control model (v2, playtest request)
The specification's auto-accelerate cruise is replaced at the user's explicit request: steering pad on one side, ▲ accelerate / ▼ brake / FLY on the other. With no input the car slows at 4 m/s² and holds. Keeping ▼ held for 0.3 s while stopped reverses, so there is no reverse button. Deadlines are still calibrated with the reference agent driving these same controls.

## D14 Whole-network data source (v2)
Overpass and Geofabrik are blocked here, but the Overture Maps S3 bucket is reachable. The whole-network package therefore uses Overture release 2026-09-23.1: transportation (ODbL, derived from OSM) and places, buildings and base (CDLA-Permissive-2.0). Street View and satellite imagery are neither reachable nor licensed for copying, so storefront signboards come from Overture place listings and are marked `provisional_listing`.

## D15 Level lengths (v2)
The plan's bands (L3 5–10 km, L5 15–25 km) were calibrated at real scale with the reference agent. On the ground, L5 contracts of 13–18 km needed 37–50 minutes of driving, with deadlines of 58–82 minutes. That is too long for a phone session, so the bands were shortened: L1 0.4–1.5 km, L2 1.5–4 km, L3 3.5–6 km, L4 4.5–7.5 km, L5 7.5–10 km (about 20–25 minutes on the ground; 30 s of flight). L4 pairs stations on different lines, so the route must go through an interchange area; it is not forced through specific named interchange roads. Lengths stay data-driven: change the `bands` table in `src/missions/levels.ts` and re-run `CALIBRATE_ALL=1 npx vitest run tests/unit/missions-v2.test.ts`.
