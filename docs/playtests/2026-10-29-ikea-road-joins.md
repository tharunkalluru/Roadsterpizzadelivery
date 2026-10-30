# IKEA road-join accessibility repair

The earlier Dallas Centre regression is around `(-12567, -2790)`, about 900 m from the IKEA store facade at `(-12884.44, -3633.53)`. It did not cover the reported store/interchange frontage. The current repair uses the full prepared city pipeline, packed neighboring tiles, real collision/support grids and production `Player.update`.

## Reproduced failures

The first frontage pose, `(-12763.396, -3556.686)`, yaw `2.293110`, is **not** a hard-stop reproduction. Both the manual drive and the production Player simulation cross its glancing retaining-wall contact. It is retained as an audit observation, not reported as a failed drive.

Two actual failures occur farther south at the IKEA road joins:

| Source road | Initial pose / traversal | Before repair | After repair |
| --- | --- | --- | --- |
| `2030c448-606_0` | `(-12679.314682, -3884.189058)`, yaw `-2.504195233`, street height 0 | GO for 15 s advanced only 11.65 m at 30 Hz / 15.34 m at 60 Hz; speed fell to about 0.21 / 0.87 m/s | 20 m completed in about 3.3 s; final speed 12 m/s. A gentle 7 m/s cruise completes in about 3.8 s |
| `70f8fde2-79a_0` | Start of the real 6.44 m connector at `(-12681.5, -3652.8)`, heading along its source | GO for 15 s advanced only 1.80 / 2.31 m at 30 / 60 Hz | 6 m completed in about 1.83 s at both rates; final speed 6.6 m/s |

These comparisons use the same gentler longitudinal control tuning in both snapshots. Parent-browser QA independently reproduced the southern stop before the geometry change. The apparent visible curb stop was aggravated by the buried wall steering the car about 0.96 radians into the nearby genuine median. Correcting the wall retains the intended heading; the car does not need to pass through the yellow/black median.

## Cause and correction

The retaining wall for an existing underpass finished 12 cm above ordinary ground. Some real upper-road and branching carriageway footprints cross that lip. The vertical collider therefore caught a ground-level car, although most of the wall was underground. Opening only the visible median or changing a finite barrier endpoint could not repair this case.

`UnderpassTerrainIndex` now indexes the same finite road quads used by road rendering. Where an actual compatible upper street covers the retaining cap, both the rendered concrete cap and its collision top finish beneath the asphalt. The lower concrete remains solid for a car inside the underpass. Uncovered caps, ordinary medians, railway gates, above-ground flyovers and other barriers remain unchanged. No street centerline, elevation, node identity, underpass location or construction status is changed. A shallow-overlap guard prevents inverted or zero-height concrete faces.

This geometry is prepared in the tile worker. No new city-wide search runs during driving frames; only ordinary surface/wall records and prepared buffers are installed in World.

## Verification

- `road-join-driving.test.ts`: production Player drives both directions through the two packed-city joins at 30/60 Hz, both quality modes and both full GO and a gentle cruise. No jump, flight, rescue, position reset or speed injection occurs after placement.
- A controlled input-only 180.10 m trace follows four actual source edges: `2030c448-606_0`, `aa22a4a9-9ce_0`, `5e43d7a9-ead_0`, `3104fde8-b8a_0`. At both rates/qualities and in both directions, it reaches 177.2–177.4 m in about 29.8 s, with no nose/body/tail contacts against real solid barriers or buildings and no fall into the adjacent cut.
- Geometry/raycast tests verify that the removed lip is absent from rendered concrete as well as collision. The deep wall remains visible and solid. A point with no upper street retains its wall cap. A flyover cannot remove a ground retaining wall.
- Existing underpass, shallow connected merge, preserved parallel-road divider, elevated-road separation and finite-wall endpoint suites still pass.
- A local static audit sampled 48,364 usable lane/support poses near the actual store. Contacts fell from 955 to 236 after the cap correction. The remaining contacts are outer-lane approaches to retained separating medians, principally the opposing Shilpa Layout carriageways; none is a center-lane obstruction. These point probes are geometry diagnostics, not proof of a physical-phone drive or a complete citywide road acceptance pass.

The visible turn in the southern continuation is real: after about 16.7 m from the supplied start, the road bends roughly 34 degrees right and then runs almost along positive Z. Continuing straight indefinitely leaves the mapped carriageway; that is not evidence that the join remains blocked.
