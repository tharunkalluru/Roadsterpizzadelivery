# Street delivery scene review

Local interactive fixture: <http://127.0.0.1:4201/tests/browser/street-scenes.html>.

The viewer imports the actual scene modules. It supplies a white test vehicle marker, an orbit camera, and approach/deliver buttons. It is not the complete game, a mobile-phone test, or a performance benchmark. The production scene modules do not depend on the viewer.

CUA visual review covered Paradise, the fictional haunted mansion, the degree college gate, Villa 79, the fictional fortified industrial courtyard, the walking street, the street wedding procession, the 45-degree parking bay, and the classroom courtyard. The roof cable, open bucket, pizza transfer, moving gate clearance, painted parking angle, signs, and continuous clear approaches were inspected. The mansion has physical cobwebs, pointed ironwork, dead trees and lantern faces. The wedding is on a street, with 16 anonymous background dancers in one instanced draw.

Paradise and Villa 79 are original architecture inspired by their requested setting, not surveyed reconstructions. The haunted mansion, production office and fortified courtyard are deliberately fictional sets. Named actors are withheld by the central appearance-review gate; these screenshots verify scenery only. No actor likeness has been approved by this review.

The focused `street-scenes.test.ts` suite covers proximity, walking alongside, speed and angle restrictions, deliberate handover, failed-attempt retry, visible pizza animation, bucket lift before completion, gate/collider agreement, bounded crowd animation, interaction gating, and resource cleanup. Passing these checks does not replace integrated desktop/mobile gameplay review.

Screenshots in this folder were captured from the local scene viewer. Fixture counters include the ground and white vehicle marker; they are not game FPS measurements.

## Actual-city ground placement

The nine grounded delivery scenes now pass a regression using the actual shipped city packs, including generated filler buildings, barriers, road widths, water and rail corridors. The synchronous offline finder and incremental runtime job choose the same points. [Fit details](ground-placement-fit.json) record the results and desktop-only preparation timings.

| Scene | Offset from approved current anchor | Placement |
| --- | ---: | --- |
| Paradise | 1.3 m | Existing mapped facade, rooftop winch and ground-level bucket; no duplicate building |
| Haunted mansion | 0 m | Explicit fictional plot; tall architecture uses a compact footprint |
| Jessie | 0 m | Actual quiet Jubilee Hills carriageway, 36.5 m walking path aligned to the road |
| Hasini | 16 m | Public college approach, compact gate/pillar rather than another campus building |
| Wedding | 196.2 m | Existing quiet Shamirpet street; no duplicate road or houses |
| Sukumar | 88 m | Clear production-office courtyard and marked parking bay |
| Maruthi | 0 m | Compact Villa 79 public-entrance treatment |
| Salaar | 0 m | Explicit fictional plot with tall walls and an open central driving corridor |
| Arjun | 22.5 m | Actual medical-college approach with compact classroom entrance |

The fictional haunted/Salaar anchors were moved 228.6 m and 304 m from their earlier provisional coordinates to clear mapped roadside ground. Jessie's former marker was on unmapped ground; her new start is on a real residential road 235.5 m away. Their latitude/longitude values were updated consistently.

Runtime placement starts within 700 m of the delivery and advances a cancellable generator with a soft 1.2 ms time allowance and 64 operation limit per frame. Both initial indexing and candidate validation yield. Failed searches are cached until the loaded tile/road revision changes; no full failed search repeats every second. A stale world or changed level cancels the job. This is a scheduling design, not a guaranteed phone frame-time measurement.

`scene-placement.test.ts` checks blocked polygons, rail/road conflicts, water and underpass rejection, unchanged world data, real-facade reuse, road alignment, job budgets, revision invalidation and cancellation. `scene-placement-world.test.ts` enforces the nine actual-city fits. Street handovers also reject flight, descent and jumps.

An additional actual-game Chrome check of `?qaDelivery=5&qaScene=1&q=low` confirmed that the haunted scene prepares in the streamed city. After the development-only approach staging, the car remained on ground and the ordinary delivery action became ready at the physical gate. [In-city gate screenshot](haunted-in-city.jpg) was captured before manually pressing Deliver. The completion card was not captured in this scoped check; this is not evidence of a complete driven route or physical-phone testing.
