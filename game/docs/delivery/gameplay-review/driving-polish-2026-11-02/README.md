# Native gameplay evidence

These are original Safari window captures at a 1280 × 547 game viewport. The local instrumented builds use visible QA order preparation/starting placement and isolated progress. They do not prove an unassisted campaign, physical-phone performance, true touch input or continuous smoothness from stills. The development UI is excluded from the production build.

The baseline runtime is `fe8101e59186535fbe59cc16e742218af2409a625628f305943b404934a6d36a`. Final v4 runtime is `7eee91d9920bc4a277a13b6a3e58a738a73f1f504a7e917b498a7c6396ade234`. Immutable v1–v4 snapshots are kept locally under `/tmp/roadster-final-frozen-qa-polish-20261102-v*`; they are not publication archives. v4 adds only the closed entrance decoration to v3. Earlier successful camera, sign, shelter and delivery views remain applicable to those unchanged parts.

| Evidence | Observation |
| --- | --- |
| `baseline-rasoolpura-stopped.jpg` / `candidate-rasoolpura-stopped-high.jpg` | Same sourced start area: lower eye, larger readable Roadster and fitted exterior nameboard. Traffic populations/time are not locked, so this is a composition comparison, not a controlled FPS benchmark. |
| `v2-rasoolpura-board-low-night.jpg` | Low/night street approach: English/Telugu board contrast, road texture and retained vehicle lighting. |
| `v2-metro-platform-handoff-neutral-high.jpg` | Real next-station ride and platform movement; all four actors and passing-pizza action visible after removing opaque upper infill. Completion was separately observed. |
| `v3-container-real-handoff-high.jpg` | Actual normal ramp entry and passing pizza inside the moving container with the receiver framed. |
| `v3-completion-background-pause.jpg` / `v3-input-restored-after-completion-pause-next.jpg` | Completion, app switch, pause, Resume, Next and restored HUD controls/diagnostics. |
| `v3-container-exit-clear-and-orbit.jpg` | Subsequent real ramp exit; the retained exit notice has cleared. The distinct side-angle recovery was also observed during reversing. |
| `v3-jump-camera-and-traffic.jpg` | Actual jump/kickflip and nearby traffic remain visible. |
| `v3-moving-flight-stop-and-orbit.jpg` | Flight and changed orbit angle while slowing down; screenshot still reads approximately 49 km/h, so it is not a stationary-hover image despite its original filename. |
| `v3-devara-submerged-authored-camera-high.jpg` / `v3-devara-delivery-complete.jpg` | Underwater receiver/skeleton framing and actual Level3/14 completion. |
| `v3-mapped-shelter-oblique-high.jpg` | Bench, green bin and existing shelter stay behind the kerb with clear lanes. |
| `v3-station-deck-landing-platform-board-high.jpg` | Normal Q takeoff/landing on the existing Rasoolpura deck after an explicitly assisted ground start; a 90-degree orbit shows complete inward English/Telugu names and line footer. |
| `v3-rasoolpura-entrance-close-high.jpg` / `v4-rasoolpura-entrance-identity-high.jpg` | Same source-derived ground pose before/after closed entrance identity treatment. |
| `candidate-metro-platform-handoff-high.jpg` | Rejected v1: opaque upper pane band obstructs the platform sightline. The large foreground slab is not conclusively identified from this image alone. Upper infill was removed; the later neutral handoff above is the passing view. |

File hashes and original capture paths are in `screenshots.json`. Native player controls were used for every depicted movement, descent and handoff; selecting a starting scenario/order is explicitly assistance. No injected frame stepping, private browser-state inspection or developer autopilot is used for these captures.
