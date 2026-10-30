# Traffic visibility during camera rotation — 30 October 2026

## Cause and repair

The previous `Traffic.hideNear` rule removed an entire vehicle whenever the camera-to-player segment crossed its padded body. The vehicle stayed in traffic collision queries. A nearby auto could therefore disappear on the side view and reappear in the chase view, making an occupied lane appear empty. This was an explicit visibility policy, not a tile unload or GPU frustum problem.

The shared traffic path now keeps an exterior vehicle visible even when it obstructs the player. Ordinary depth testing handles the obstruction. The only remaining camera hide is when the camera itself intersects the displayed body with a narrow 0.1 m near-plane margin, rather than the former 1.2 m expansion. Protection follows the rendered position. It restores visibility immediately on leaving that volume. All five traffic groups share the policy; jumping and landing no longer switch to different visibility rules. Collision, traffic movement, despawn distances and camera timing/framing are unchanged.

## Regression evidence

- The new 12-test suite against archived pre-fix HEAD `f1567c9` failed all 12 tests; the fixed source passed all 12.
- Actual production models cover auto, bus, bike, car and truck; nine headings and 72 exterior orbit samples per heading, repeated for before/during/after-jump states.
- Additional cases cover camera interior/exit, a camera just outside a body or above a roof, displayed-pose versus stale simulation coordinates, and unchanged `hitTest`/`pushOut` participants and results.
- Full `npm run check`: **394/394 current tests, 38/38 legacy suites, TypeScript and production build passed**.
- The two older tests that explicitly expected a sightline-obstructing bus to vanish now require it to remain visible, including after landing. Their true camera-inside checks remain.

## Manual browser comparison

A frozen pre-fix checkout and current source both used the same visible development staging button to place actual production auto/bike/car/bus/truck instances beside the stationary Roadster. This staging changes only the development scenario; it does not replace visibility or collision code. Camera rotation used real drag input.

At 1280×720, the old side view hid the auto while the new matching side view retained it. [Before](../delivery/evidence/traffic-visibility/orbit-auto-before.png) · [After](../delivery/evidence/traffic-visibility/orbit-auto-after.png).

At 667×375 with the phone touch HUD and low graphics, eight 100-pixel horizontal drags swept more than a full turn. The visible QA readout retained all five vehicles through each sampled view. After hiding the QA panel, the side view still showed the auto; an actual stationary JUMP and landing retained it as well. [Full orbit](../delivery/evidence/traffic-visibility/phone-full-orbit.png) · [Side view](../delivery/evidence/traffic-visibility/phone-side-after.png) · [After landing](../delivery/evidence/traffic-visibility/phone-landed-after.png).

This is browser compatibility and gameplay evidence, not physical-phone FPS, thermal or battery testing. The automated tests cover five-degree orbit increments; manual observation does not certify every possible world occluder or camera-inside case. Development staging and status controls are removed from the production bundle by the existing Vite DEV gate.
