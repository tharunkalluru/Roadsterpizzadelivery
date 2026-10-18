# Hyderabad Metro Delivery (working title "Metro Express")

A single-player, mobile-browser-first Three.js delivery game on real Hyderabad roads beside the
metro. Drive a Roadster-inspired car through traffic, choose real routes, spend **one shared
flight allowance per delivery (25 s default; 20/30 s contracts)** and stop at the correct entrance
before the deadline.

**Current achieved release level:** playable corridor with disclosed geographic gaps (development)
— Blue Line Uppal–Tarnaka package only. Requested scope (all three operating corridors) is not
complete; see `../IMPLEMENTATION_STATUS.md`, `CONTENT_GAPS.md`, `qa/status.json`.

## Commands (run in `game/`)

| Command | What it does |
|---|---|
| `npm ci` | Install pinned dependencies (package-lock.json). |
| `npm run dev` | Vite dev server on http://localhost:5173 (binds 0.0.0.0 for LAN phone testing). |
| `npm run build` | Typecheck + production bundle in `dist/`. |
| `npm run preview` | Serve `dist/` on http://localhost:4173. |
| `npm run typecheck` | TypeScript check only. |
| `npm test` | Vitest unit/integration tests (flight budget, missions, real-world reference-agent traversals). |
| `npm run test:e2e` | Playwright browser tests against the production build (uses `vite preview`; set `CHROMIUM_PATH` if Chromium is elsewhere). Run `npm run build` first. |
| `npm run import:map` | Rebuild the world package from the bundled OSM snapshots in `../hyderabad-game-handoff/resources/osm/`. Deterministic. |
| `npm run validate:world` | Validate the world package (ids, foreign keys, connectivity, hashes, alignment). |
| `npm run verify:ledger` | Run the supplied ledger checker on requirements/status/scope/evidence. |

## Controls
- **Touch (landscape):** left thumb steering pad (drag left/right, recentres on release). Right thumb: **▲** accelerate, **▼** brake (keep holding ▼ when stopped to reverse), **FLY/LAND** (press; a fresh press during flight requests landing). Map and pause buttons top right.
- **No input = the car slows and holds.** There is no automatic cruise and no separate reverse button.
- **In the air:** ▲ speeds up, ▼ slows to a hover (still uses flight time), no input keeps the current speed.
- **Keyboard:** W/↑ accelerate, S/↓ brake/reverse, A/D or ←/→ steer, Space/F fly/land, P/Esc pause, M map (pauses), H horn.
- Deliver by stopping inside the marked area at the entrance below walking speed for about one second. ▲ cancels a delivery hold.

## World and levels
- `public/world/hyd-metro/v2/` (when present) covers the roads around all three metro lines from Overture Maps open data, including real business names as shop signboards. Shop names come from listings and are **not** street-view checked; see `qa/storefront-inventory.json`. The original Blue Line Uppal–Tarnaka package (`hyd-uppal-tarnaka/v1`) remains as a fallback (`?v1`).
- Deliveries come in five levels: 1 Neighbourhood, 2 Next stop, 3 Line runner, 4 Interchange, 5 Across the city. Completing any delivery in a level unlocks the next.

## Architecture
`src/app` (state machine, streaming, lifecycle) · `src/core` (fixed 60 Hz clock, seeded RNG streams) · `src/player` (FlightLedger, Player state machine) · `src/world` (schema, road index, nav graph, collision, loader) · `src/traffic` · `src/missions` (session, catalog) · `src/ui` (input, HUD, screens, map) · `src/art` (procedural assets, implements `src/art/api.ts`) · `src/audio` · `src/persistence` · `src/debug` (reference driving agent) · `scripts/` (OSM import + validation) · `public/world/` (versioned world packages).

Debug: append `?debug` for the diagnostics panel; `?debug&manualclock` for test harness stepping; `?debug&autopilot` to watch the reference agent drive. Debug runs are never stored as records.

## Known limitations (summary)
- Only the Uppal–Tarnaka Blue Line package exists; Red/Green/rest of Blue are planned (source data not acquired: Overpass/Geofabrik blocked in the build environment).
- Uppal and Tarnaka station surroundings are drivable boundary roads but not routable (one-way pairs leave the acquired boxes).
- All geometry, names, widths, heights and metro clearances are OSM source claims or provisional estimates; no field or imagery verification was possible.
- Whiteout graphics reference could not be inspected (host blocked) — visual comparison open.
- No physical Android/iPhone testing was possible; performance targets are unmeasured on phones.
- Night/rain (MT11) not implemented.

Map data © OpenStreetMap contributors (ODbL 1.0). Textures: Poly Haven (CC0). Font: Noto Sans Telugu (OFL 1.1).
