# Browser-control QA harnesses

**Historical scope:** these optimization-era harnesses are preserved for `archive/mobile-performance-v23`. Production has returned to Version 21; helpers that read experimental diagnostics are not compatible with it. The recovery controller is `tools/diagnostics/v21-recovery-controls.js` at the repository root.

These files are `async(page) => ...` callbacks for the installed Playwright CLI's
`run-code --filename` command. They are not standalone Node executables. Use an
agent-created browser session with one input owner, create `output/playwright/`,
and first inspect the current snapshot and dismiss any modal through its visible
controls. Never interrupt an outstanding callback and start a second input
controller: cancelling the CLI client may not cancel its daemon-side action.

Example, after opening and inspecting a local game:

```sh
playwright-cli -s=roadster-qa run-code --filename scripts/qa/delivery-controls.js
```

Navigation observes current `window.__game` data but sends actual W/A/D/S, Space,
J and E keyboard controls. It never assigns game state, teleports, steps the
simulation or enables developer autopilot. Label this **external scripted
visible-control gameplay**, not human/manual play. Synthetic physics replays are
a different harness (`scripts/sim-replay.mjs`) and never delivery/FPS evidence.

`free-roam-controls.js` and `area-cycles.js` require orders OFF and no accepted
job. The offer's **Stop requests** button can cancel an unaccepted offer; the
orders toggle can be hidden while the offer owns input. An accepted delivery
must finish normally. Helpers report attempts separately from proven bus jumps,
ORR driving and moving-train rides. Do not relabel failed controller approaches
as product defects without reproduction.

`context-recovery.js` deliberately injects WebGL context loss/restoration.
`offline-relocation.js` deliberately sets the owned browser context offline,
then uses the visible Retry button. These are explicit fault tests. Keep their
expected errors separate from ordinary application errors. They restore the
network/context after the experiment; inspect cleanup after an exception.

CPU rates 4.04 and 16.05 were calibrated on one host/browser snapshot. Recalibrate
for a new host and record viewport, drawing-buffer size, DPR, quality, source
fingerprint, requested FPS and concurrent workloads. Desktop throttling and
Android emulator results do not certify a physical phone's GPU, heat or battery.

The three `delivery-endurance-*-controls.js` variants run185s with a30s warmup,
record exact held/coasting observations and capture completed-delivery screenshots.
Their rates1/4.04/16.05 are specific to the recorded calibration. Use the current
snapshot to resume/stop requests before changing scenarios; do not discard a
pending accepted job and then call it complete.

`streaming-boundary-controls.js` is an explicit offline fault test. It chooses a
known unloaded destination from manifest observations, drives there using real
keys, tests the opaque recovery gate, restores network and uses visible Retry.
It reports cache-hit attempts separately from a demonstrated freeze/recovery.
It restores network, releases keys and pauses its owned game afterward.

For a **synthetic** matched Roadster rendering fixture, run:

```sh
node scripts/build-roadster-visual-fixture.mjs --baseline-ref 6390d3ed7d763ccd6c8cf64b028a8af2a418dcd4
```

Serve the printed output directory (default `output/playwright/roadster-visual-fixture-repro/`) through local HTTP; compare
baseline/candidate with identical view/mood/deploy/steer/roll/flip queries. This
fixture uses actual Player/Engine, physical materials, fonts, shadows and bloom;
its assigned static poses are synthetic diagnostics, never gameplay or FPS
proof. Isolate it from timing runs and preserve its metadata and original pixels.

`post-gc-area-cycles.js` is a separate memory diagnostic:20public area loops,
first10warmup, then10same-endpoint comparisons. It pauses and explicitly runs
page GC at each checkpoint. Never credit its wall time as gameplay or use it as
an FPS benchmark. Compare Runtime heap fields, backing storage, renderer counts,
owned reservations and cache bounds separately; they are not total phone RAM/VRAM.
