# Restore the original Version 21 gameplay

The user reported that Version 23 still dropped frames and made flight glitchy after the traffic rotation hotfix. The optimization release failed gameplay smoothness acceptance. Its stationary FPS and heading-consistency checks did not establish an improvement during real mobile play.

The original saved **Version 21**, source `bd7313d6d20cb3f6a448bedb2e52bccd269b1bba`, was republished at the existing public URL. This reuses its original deployment archive; it is not a new approximate reconstruction. GitHub main's runtime source and all public assets are also restored byte for byte to that snapshot in a forward commit. Versions 22–23 remain recoverable on `archive/mobile-performance-v23`; all prior evidence remains present.

## Concrete regression findings

- The new refresh policy can demote a 60 FPS request to 30 FPS after about 3.6 seconds even with a supplied 15.1 ms CPU sample. On a 90 Hz callback stream it schedules 45 FPS for a 60 FPS request. These are synthetic actual-module policy probes, not real phone FPS measurements.
- Camera easing used the last callback's duration only when presenting. With skipped frames, this undercounted elapsed time and made flight camera response depend on browser refresh cadence. An actual `Game.updateCamera` probe with a synthetic unobstructed flight environment reproduced the increased camera lag.
- The streaming pump forced a full world update every callback even when there were no staged jobs, bypassing the old 0.4-second scan interval. That tail work was outside its time-budget accounting.
- Ground-detail readiness could freeze flight; detailed streaming could also starve the lightweight skyline. Low graphics additionally rendered more nearby detail than the original Low preset. These source findings identify scheduling/workload risks; no physical-phone trace attributes every dropped frame to one cause.

[Cadence and camera audit](playtests/2026-10-28-v21-recovery/cadence-audit.md) · [Streaming audit](playtests/2026-10-28-v21-recovery/streaming-audit.md) · [Exact saved-version deployment](playtests/2026-10-28-v21-recovery/deployment.json).

## Recovery verification

Both client and Worker TypeScript checks and a production build pass for the restored runtime. Its `index-Deiow6w-.js` matches the original Version 21 bundle byte for byte, SHA256 `7bf5047cbb02099d2ac15dced7f01773fa9e3920538d83096a25c89ea8bf3fb7`. New optimization-specific test results are historical evidence, not a pass for the restored code. The original external regression suite was not re-established by this rollback.

The production baseline is Version 21 again. Investigate optimization changes on the archived branch, one subsystem at a time, with moving driving/flight/landing and frame-time evidence; do not reintroduce the full bundle based on stationary FPS. Physical-device smoothness remains a separate verification requirement.
