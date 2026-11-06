# Version21 portable behavioral regressions

Run `node scripts/test-legacy.mjs` from any directory. The runner resolves this
checkout from its own location, uses its installed dependencies, and runs the 38
registered suites in `suites.json`. A suite failure returns a nonzero exit code
and includes its original assertion output. Individual suites also run directly.

This is a test-only migration from the portable archive in
`2026-10-28/roadster-next-lab/tests/legacy`, adapted to the exact Version21 runtime
restored from `bd7313d6` plus the explicitly requested repairs. No optimization
runtime, pooling, incremental world loader, flight controller or reduced-motion
settings were copied from that experiment.

The retained 36 suites include production metro movement and clearance, mixed
traffic and bus service, delivery acceptance/collection/handover, pause/input,
phone control geometry and gestures, map lifecycle, worker/network failures,
road/bridge/building/landmark safety and moving train roofs/collisions. The two
new local suites cover the missing historical jump/kickflip/bus-visibility and
loading/opaque-paint contracts against original Version21 modules. The new
railway track-flow and camera/map repairs have additional focused tests under
`tests/v21-fixes` and are not substituted with archived expectations.

## Harness adaptations

- Minimal map DOM mocks now implement accessibility attributes. The map color
  check drives the new incremental visible preparation before awaiting readiness.
- Game mocks implement the flight-navigation HUD boundary and window pointer
  event registration used by the requested camera repair.
- Loader fixtures exercise Version21's synchronous `onMessage` publication;
  calls to NextLab-only `pumpJobs` and its synthetic cache fields were removed.
- Settings expectations retain the original Version21 fields. The rejected
  experiment's `reducedMotion` setting is not required.
- The spatial takeoff check tests wall collision during the original fast climb
  while the body is actually below the barrier. It does not demand NextLab's
  slower acceleration controller. The barrier remains solid until clearance.

## Archived and unavailable historical commands

The cinema economy and cruise groups were retired before Version21. Their exact
old source and reasons remain in `fixtures/retired-v2-groups.json`; they are not
counted as executed passing groups. The fixture reader checks archived evidence
and classifier files against the recorded SHA-256 hashes before using them.

The old package listed seven historical commands whose standalone files were
unavailable: kickflip, jump, jump visibility, loading screen, railway,
delivery-only and paint state. Their current coverage is explicit:

| Historical command | Current executed evidence |
| --- | --- |
| kickflip, jump, jump visibility | `jump-kickflip-regressions.mjs` |
| loading screen, paint state | `paint-loading-regressions.mjs`, `v2-loading-regressions.mjs` |
| railway | `moving-rail-regressions.mjs`, `tests/v21-fixes/railway-flow.test.ts` |
| delivery-only | `v2-game-regressions.mjs` (28 production integration groups) |

Passing these offline checks establishes the tested production behavior and
fixture geometry. It does not establish browser rendering, device compositing,
phone frame rate, real-world map accuracy, or a successful deployed playthrough.
