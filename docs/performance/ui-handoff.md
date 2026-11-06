# UI reuse implementation handoff

Baseline: `bd7313d6d20cb3f6a448bedb2e52bccd269b1bba` in `/Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit`. Scope covers P02 map/sign reuse and P12 settings migration. No commit or publication performed by this agent.

## Changed files

- `src/world/signs.ts`: retained typed geometry buffers, stable atlas slots and deterministic source quad ordering; selection driven by world changes and movement with a 250 ms minimum interval, not rendered frame count. Stationary views do no selection/rebuild/texture painting. `add`, `remove`, `invalidate` trigger immediate reevaluation. `dispose` releases owned materials, textures and geometry. Existing facade transforms, text/color drawing and emissive appearance retained.
- `src/ui/minimap-cache.ts`: bounded world-aligned raster tile cache, independent of route/player overlays. Local road membership is checked on graph revision; unchanged local content is retained when distant graph changes. Metro source identity/raster density changes invalidate the cache. Default maximum 32 tiles, density bounded 1–2 pixels per world metre.
- `src/ui/settings.ts`: defensive old-key migration adds `targetFPS: 60 | 90 | 120` (default 60) and `adaptiveResolution: boolean` (default false), preserving existing graphics, sound, steering, hints and separate progress. Options are displayed in the current opaque settings sheet. Exported `normalizeSettings` supports tests.
- `tests/ui-reuse.test.ts`: five behavioral tests using controlled canvas mocks and real Three.js geometry.

## Coordinator integration

1. In `game.ts`, import `MinimapBaseCache` from `../ui/minimap-cache` and create one game-owned cache.
2. Inside the existing `drawMinimap` world transform, replace only the static road and metro stroke loops with `this.minimapBase.draw(g, this.graph, this.zone.metro.lines, P.x, P.z, R, sc)`. Preserve current base fill, circular clip, route/target/player overlays and UI layout.
3. Call `minimapBase.dispose()` on game teardown. Source graph identity changes invalidate automatically; call `invalidate()` for an in-place geometry/style mutation that does not update graph revision. Metro data is immutable in current source; changing its geometry in place also requires invalidate.
4. Integrate settings callback keys `targetFPS` and `adaptiveResolution` with the coordinator's frame/adaptation controller. Main startup reads these from `loadSettings()`; existing callers remain compatible through defaults.
5. Sign integration requires no call-site change. API is `update(px, pz, force = false, nowMs = performance.now())`; optional explicit time is useful for tests. Call `invalidate()` after mutating existing sign text/style/transform. World add/remove already increment source revision.

## Validation

`npm run typecheck` passed after implementation. `node scripts/test.mjs ui-reuse` passed all five tests: settings migration/progress preservation; shared sign slots and 3,600 unchanged 120 Hz updates; retained geometry update and unload; minimap stationary/motion/remote-revision reuse; bounded map cache bytes through 50 distant areas.

Renderer screenshot/gameplay acceptance remains coordinator-owned. Canvas mocks verify cache behavior and geometry, not device pixel appearance or physical Samsung performance. No `paint-safety.ts`, control layout, jump or gameplay behavior was modified.

## P12 follow-up: measured compatible refresh targets

`src/core/refresh-policy.ts` now provides `RefreshPolicy` and `compatibleRefresh`. Source/API is frozen for coordinator wiring; this agent did not edit Game or Engine.

- Constructor: `new RefreshPolicy(requestedFPS = 60)`.
- `setRequestedFPS(60 | 90 | 120)` changes the requested preference and discards old measurement evidence. The policy never writes browser settings, quality or resolution.
- `.state` is a stable mutable decision object: `requestedFPS`, runtime `effectiveFPS`, `observedCadenceHz` (observed browser callbacks, not hardware Hz), `callbackDivisor`, `reason`, `healthySeconds`, `pressureSeconds`.
- `observe({ rafMs, cpuMs, presented, presentationMs, active })` runs after frame work. `active` must exclude hidden, loading, paused, opaque UI, map and graphics-unready states. `presented` means an actual scene render; `presentationMs` is the measured interval since the preceding rendered active scene. CPU-only or stale/no-rendered-frame evidence cannot promote the goal.
- Use the preceding decision at frame start: `engine.targetFPS = state.effectiveFPS`; call `PresentationPacer.due(rawSeconds, state.effectiveFPS, measuring, state.callbackDivisor)`.
- `reset('viewport')` and `PresentationPacer.reset()` on resize, fullscreen/orientation, context-restoration and similar discontinuities; reset the coordinator's previous-presentation timestamp too. Inactive observations automatically discard stale evidence once.
- `.snapshot()` copies diagnostics on demand; do not invoke it every displayed frame. Sample buffers are fixed at 240 entries, percentile scratch memory is reused, and evaluation occurs twice a second.

Only a stable callback cadence within a recognized timing band is used. Mixed/stalled/uncertain cadence stays unknown and conservative; it does not infer the display hardware from a loaded scene. Compatible integer callback divisors preserve evenly spaced presentation: requested 90 on observed 120 callbacks/s uses 60; requested 120 on observed 144 uses 72; requested 60 on observed 144 uses 48. Effective targets never exceed the requested goal.

The policy uses a 2-second cadence warm-up, then at least 5 seconds of fresh healthy CPU plus current presentation evidence before probing a higher goal. Sustained pressure for at least 2 seconds demotes the actual target, with a 10-second recovery cooldown and fresh healthy evidence before recovery. Unknown cadence cannot raise an already pressure-demoted target. Presets and opt-in resolution settings remain independent. This is a guarded presentation probe, not proof of physical-phone GPU/display/thermal capability.

The coordinator should scale background installation allowance generically (`Math.min(1.5, 90 / effectiveFPS)`), since compatible targets can be 45, 48, 72 or 40 rather than only 60/90/120. Settings copy now explains that the selected frame rate is a requested goal and that sustained load may lower the actual rate without changing graphics.

Validation: `node scripts/test.mjs refresh-policy` — 10 passed; existing `core-performance` tests — 6 passed; `npx tsc --noEmit` passed. Cases cover 60/90/120/144 observed cadences, 90 requested on 120, 120 requested on 60, mild jitter with uniform divisor gaps, unstable cadence, missing/stale presentation evidence, sustained pressure, hysteresis, pause/reset, requested-preference changes, long gaps and bounded storage. Runtime integration and actual high-refresh browser/device validation remain coordinator work.
