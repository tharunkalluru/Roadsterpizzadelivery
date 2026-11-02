# Fourteen-scene driving and station presentation

This change adapts the camera, readable station identity, structural rhythm and economical surface treatment studied in Auto Rush. It does not copy that game's code or assets. It belongs to the separate fourteen-scene preview, on `codex/fourteen-driving-polish`, based on `636c3104d3aa740bdf63917b3ad4255eda90c977`.

## Implemented scope

| Item | Implementation | Safety boundary |
| --- | --- | --- |
| Grounded driving camera | Lower neutral eye, 6.8 m base chase distance, smooth speed-based forward aim, actual-displacement compensation before camera smoothing. | Retains simulation clock, acceleration, braking, speed caps, takeoff/jump timing, lens speed scale, free-orbit limits, collision clearance and authored receiver views. Train carry uses actual player displacement. |
| Metro nameboards | Two exterior end faces plus one inward board per platform, aspect-correct English/Telugu layout, identity mark and sourced line bands. | Shop atlases are unchanged. Missing Telugu source names stay English-only. The interchange platform band follows its own line. |
| Station architecture | Continuous curved outer vault, bounded ribs, fascia, open framed upper bays and entrance trim; painted windows on the lower concourse. Closed entrance doors, a train pictogram and a side stair graphic identify the retained stair housing from the road. | Existing mapped platforms, stair footprints, supports, rails, lamps, colliders and delivery surfaces remain. Added shell pieces use the existing clearance callback. Entrance decoration adds 492 vertices inside each accepted existing footprint, in the existing batch. |
| Shared materials | Fine neutral asphalt, pavement seams, shopfront cues and one shared opaque painted-reflection station-window material. | No renderer upgrade, new glass/transmission passes, additional Light objects, DPR cuts or changed bloom settings. Night window intensity follows the existing mood. |
| Useful street detail | Backed shelter benches, bins and diffusers inside existing pre-cleared mapped shelter footprints. | At most 8 Low / 16 High shelter kits per tile, using existing tile batches. No new road obstacle or per-fixture light. |

At normal driving pitch, the eye is approximately 2.4 m above the road. Manual ground pitch blends back to the safe spherical orbit; the requested eye is always above the road before camera-clearance processing. Actual displacement is applied to both saved camera position and aim, so absolute-world damping no longer adds an unintended speed-proportional pullback. World-anchored authored close-ups opt out. Relocation revisions and large discontinuities reset the history.

The station atlas is one lazy shared page: 2048 × 1024 in High, 1024 × 512 in Low, with retained geometry buffers and 64 maximum visible quads. Opposite boards share their texture entry. Membership updates follow tile changes, font completion and movement; unchanged stationary content does not repaint. Including RGBA mipmaps, the page is approximately 10.7 MiB High / 2.7 MiB Low. The two shared 128 × 128 concourse textures add approximately 0.17 MiB with mipmaps. These are bounded resource costs, not claims of free visual detail or faster device FPS.

## Issues caught during independent review and play

1. The initial camera lowering could request a below-road eye at the lowest manual pitch and far zoom. It now blends the lowering by pitch and preserves the safe zoom-height relationship. Actual Game traces cover the complete legal pitch range and near/far zoom.
2. Initial opaque upper-platform panes could obstruct the external camera and across-platform view. The final upper bays are open. More than 4,000 actual generated-geometry sightline raycasts cover all 59 mapped station assemblies, including curved platforms. Lower-concourse glazing remains opaque.
3. A native completion → background pause → Resume → Next delivery test exposed an existing stale `inert` snapshot in overlapping dialogs. Shared per-element isolation ownership now releases an element only after its last dialog owner closes. The regression fails against the original implementation and passes with the repair. Existing pre-inert elements remain inert.

## Verification

- `npm run check:release`: 798 current tests, 38 portable legacy suites, both TypeScript checks, production build and 15/15 appearance approvals passed.
- Real `Game.updateCamera` traces at 30/60/120 Hz exercise road maximum, acceleration/braking, reverse, collision-limited displacement, moving flight, train carry, relocation, authored views and camera clearance. These are behavior regressions, not measured phone FPS.
- Native Safari gameplay uses immutable QA snapshots with visible developer controls. Starts/order preparation are explicitly assisted; movement, ramp entry, metro ride, platform approach, handoff, jump, orbit and app switching use normal controls.
- Matched Rasoolpura baseline/candidate views verify closer car framing and proportionate signs. Low/night views verify board contrast, asphalt, shopfronts and the retained lighting treatment.
- Actual cargo-ramp entry, receiver framing and handoff completed in Low/night and High/day. A real metro ride to the next station, platform approach and four-person handoff completed with the corrected open bays.
- After completion → app switch → Resume → Next, native reversing, ramp exit, jump and a clearly different manual camera angle work. The unrepaired candidate had left the HUD/canvas inert.
- A normal flight landing onto the existing Rasoolpura deck and a sideways orbit show the complete inward-facing English/Telugu board. A source-verified shelter close-up shows its bench/bin behind the kerb. The final entrance is checked from the same ground pose that previously showed an unmarked housing.

Selected original native screenshots, with file hashes and candidate scope, are retained in [the gameplay review](gameplay-review/driving-polish-2026-11-02/README.md). Final runtime fingerprint: `7eee91d9920bc4a277a13b6a3e58a738a73f1f504a7e917b498a7c6396ade234`. The v4 change from the prior native-tested candidate is limited to the ground entrance decoration and its accepted-entrance call argument; the other visuals, camera and dialog repair are unchanged.

The independent monitoring agent reviews source changes, each build result, immutable snapshot identity and actual screenshots. Its acceptance is separate from implementation-agent claims. Publication must use the pushed source and a clean production artifact; developer-only QA snapshots are never deployment archives.

These checks do not establish physical-phone FPS, heating or battery life, a fully unassisted fourteen-level campaign run, or pixel-identical rendering. Version21's public site and source binding are outside this checkout's release target.
