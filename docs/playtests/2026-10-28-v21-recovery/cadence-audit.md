# Version 23 cadence and flight-camera audit

This read-only audit examines the archived optimization checkout. It does not change the restored Version 21 game or certify phone performance. The paired JSON contains source hashes and reproducible **synthetic actual-module probes**, not measured browser/device FPS.

1. **The default policy deliberately removes presentation opportunities.** At a supplied stable 60 Hz callback stream and synthetic 15.1 ms CPU cost, the real `RefreshPolicy`/`PresentationPacer` demotes a 60 FPS request to 30 FPS after about 3.57 synthetic seconds and stays there through 25 seconds. The CPU input is still below the 16.67 ms frame period. At 120 Hz callbacks the same input demotes 60 to 40 FPS. With cheap 10 ms CPU at 90 Hz callbacks, the 60 FPS request caps at 45 FPS. Version 21 renders on every active callback and has no equivalent controller. This establishes the policy's scheduling behavior, not what a physical phone would achieve.

2. **Camera/FOV smoothing receives the wrong elapsed time when presentation is skipped.** Version 23 `src/game/game.ts:143–144` calls `updateCamera(raw)` only when presenting, where `raw` is one callback interval. Camera smoothing at `:1046` and FOV smoothing at `:1059` therefore run two or three times more slowly on divided callback schedules. A probe of the actual `Game.updateCamera` method with an unobstructed flight fixture at 160 km/h gives a 21.03 m camera-to-car offset at 60 Hz/60 FPS, but 29.91 m at 120 Hz/60 FPS and 38.62 m at 120 Hz/40 FPS. Supplying elapsed presentation time instead restores about 21 m. This directly reproduces cadence-dependent camera response without rendering or claiming real-phone behavior.

3. **Simulation catch-up multiplies full-system work.** `Game.frame:140` runs the full `simulationStep` for each fixed tick. A 50 ms callback runs three complete updates; Version 21 runs one update with a 50 ms dt. The repeated step includes metro/rail, player, world, traffic, walkers, route/HUD work (`:907–1012`). Presentation demotion does not reduce the 60 Hz simulation workload. At ten 100 ms callbacks, the actual clock executes 40 updates and simulates 0.667 seconds while dropping 0.333 seconds. These are workload/time-policy facts, not a benchmark establishing that this alone caused the reported drops.

4. **The visual hierarchy uses mixed timestamps.** `presentationObjects:70–74` includes the player root/glow/light but excludes its kickflip pivot, wheels and thruster deployment. `Player:335–353` updates those children at the current fixed tick, while the root is interpolated one tick behind. The camera's takeoff framing then reads that mixed hierarchy. This is a source-confirmed phase mismatch and a plausible animation risk; this audit did not reproduce a browser-level flight artifact from it.

The actual scheduling demotions and camera dt mismatch are concrete regressions relative to the prior loop. Restoring the complete known-good Version 21 is the appropriate immediate recovery. Reintroduce changes only in isolated, opt-in experiments after elapsed-presentation timing, complete animated-pose consistency, camera response across 60/90/120 Hz callback schedules, moving/flight frame intervals and full simulation workload have been tested together. A stationary average-FPS pass does not cover these behaviors.

Reproduce against the optimization checkout explicitly:

```sh
node tools/diagnostics/cadence-regression-probe.mjs \
  --source /Users/tharun/Documents/Codex/2026-10-28/roadster-performance-audit
```

Use `--out /new/path/results.json` to preserve another result. The script refuses to overwrite an existing result file. It loads Three.js/esbuild from the specified source checkout and never loads the restored `game/` runtime accidentally.
