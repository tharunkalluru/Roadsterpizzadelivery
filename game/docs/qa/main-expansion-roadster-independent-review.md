# Independent Roadster structure second opinion

Reviewer: `/root/metro_independent_review`, 2026-11-02. Scope: the optional player-car no-change decision in `main-expansion-roadster-review.md`, not the separately revised traffic vehicles.

**Decision: keeping the existing Roadster geometry is reasonable for this pass.** Independently opened all four CPU renders: front-quarter, rear-quarter, side and deployed flight. The wheels occupy real body openings with coherent ground contact; the coupe cabin, glazing, mounted mirrors, pizza equipment, rear light bar, diffuser/nozzle cluster and deployed spoiler remain attached to a recognizable custom car. No visible structural defect in these four views justifies a rushed replacement while the delivery and traffic work is being integrated. This is not a claim that the car is a photographic replica.

The gold side/rear rectangles are explicitly the offline export's substituted canvas-texture surfaces. These images cannot approve `tfigames.com`, `pizzadeliveryboy`, plate text or exact WebGL shading. Likewise a CPU static render cannot establish headlight illumination, brake/reverse behavior, wheel animation, kickflip timing or mobile performance. Those remain native integrated gameplay checks.

Independently rehashed the three production files; each matches the producer manifest:

- `src/world/vehicles.ts`: `093061b04ffc7c16d3d0cd6a565e48a255edd83878bb9cca21b4d3cb84558e4b`
- `src/world/roadster-decals.ts`: `f082bd092216dfddc64a1f3ad6fbf696dd75824c86bbf39f48877068a121051e`
- `src/game/player-lights.ts`: `8fdc182f46945a1cb889078cd05f02274cbcf8c23052f8a63bc94cda6513d26b`

The source mesh/triangle inventory and finite-export checks were read from the producer's manifest; they were not independently rerun by this second-opinion reviewer. No production file was edited. Evidence: `evidence/main-expansion/roadster-structure-current/manifest.json` and its four referenced PNGs.
