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
Formula (route length / 8 m/s + 2 s per turn + 5 s per stop + 6 s) × margin (1.9 practice, 1.7 first parcel, 1.4 standard, 1.45 multi-stop), rounded up to 5 s. Every instantiated mission is driven by the reference agent through real physics with its traffic seed and no flight (`tests/unit/missions-real.test.ts`); results in `qa/artifacts/calibration/deadlines.json`. Human playtesting has not been performed.

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
