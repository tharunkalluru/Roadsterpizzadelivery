# Independent traffic vehicle review — 2026-11-02

**Verdict: FAIL / hold vehicle-feature acceptance.** The candidate improves hollow cabins, occupants, class dimensions and variety. It does not yet meet the requested close-to-real vehicle structure. This review concerns the rendered vehicle bodies separately from the shared NPC gate, which also remains failed until corrected occupants are visually approved inside their actual vehicles.

Reviewer: `traffic_vehicles_independent_review`. No implementation, browser manipulation, deployment or commits were performed by this reviewer.

## Evidence actually inspected

- Read `main-expansion-vehicles.md`, `src/world/traffic_models.ts`, `src/world/traffic-vehicle-specs.ts`, the capture manifest, and the five actual production geometry/integration tests in `tests/v21-fixes/traffic-vehicle-realism.test.ts`.
- Viewed **32 valid Root Chrome PNGs**, four views for each of hatch, sedan, SUV, cab, bus, lorry, tanker and mini-truck: `docs/qa/evidence/main-expansion/vehicle-{family}-{front,side,rear,cabin}-v1.png`.
- The stated 40 captures include eight three-quarter files. The manifest honestly records that seven non-hatch three-quarter captures retained the previous cabin camera. They are not independent three-quarter evidence and were excluded from the verdict.
- These are **v1 geometry/occupant captures**. Root subsequently changed the car front/rear loft end heights and shallow lamp housings. Source inspection confirms that change, but this reviewer has **not seen a corresponding v2 render**. The v1 visual failures cannot be marked resolved by the source change alone.
- No passenger-van, auto, motorbike or scooter render was supplied in the valid 32-image set. No left-side bus-door render, actual boarding sequence, integrated night drive, moving-camera orbit, jump-over-van sequence or physical-phone profile was inspected here.

Source snapshot at review: `traffic_models.ts` SHA-256 `94283020fca6ff7e06a969ee55190afe6e2dbf438e863297f3fe099a0ca30080`; specs SHA-256 `85370990961a72456c66fbb0f53894915b730cfcccc50ad2328b0d63a1a45322`. These hashes do not imply the older PNGs were generated from this exact source.

## Primary visual reference comparison

Official images were independently downloaded and **actually viewed** from these sources:

| Source | Observation and comparison |
| --- | --- |
| [Swift official brochure, cover](https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/brochures/Swift%20Brochure%20-%20Vertical%20-%205th%20Oct.pdf) | Raked, integrated pillars; rounded roof/shoulder; shaped lamp clusters and inset grille; wheel arches with a continuous painted lip. The candidate captures the small-hatch envelope and arches, but its flat canopy, exposed bar-like pillars and generic rectangular lamps do not capture that structure. |
| [Dzire official brochure, cover](https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/dzire/brochures/DZire-brochure_.pdf) | Clearly separate boot, continuous A/C pillars, inset narrow lamps, and a distinct three-box silhouette. Candidate sedan and cab have a boot and better proportions than a solid box, but still use the same canopy/fascia construction as the hatch. |
| [Creta official brochure, PDF page 3](https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta.pdf) | Upright SUV silhouette, substantial wheel-arch cladding, tall broad grille and separated horizontal upper lamps/lower lamp clusters. Candidate SUV reads mainly as a slightly larger version of the generic car, with the same lamp/grille language. |
| [TGSRTC official City Ordinary photograph](https://www.tgsrtc.telangana.gov.in/images/uploads/City_Ordinary_1_eaef630da7.webp), linked from its [coach-types page](https://www.tgsrtc.telangana.gov.in/reservation-coach-types) | The reference has visible large wheel openings, framed/sliding window bays with horizontal bars, a shaped front fascia/grille and grouped lamps. Candidate keeps a recognizable red/cream bus identity, but the uninterrupted lower side panel hides the wheel openings and its tall clear window band reads like a glass-sided tram. |
| [TGSRTC official Metro Express photograph](https://www.tgsrtc.telangana.gov.in/images/uploads/Pictures_4_fd27274564.webp) | Same important wheel openings/window framing; compound grille and paired round lamp clusters. The exact livery varies, so this is a structural comparison, not a demand to copy one photographed registration or every stripe. |

The official Tata Ace product and brochure requests returned HTTP 403 to this reviewer, and the Force Traveller page timed out. Their dimensions are recorded in the producer's sourced specs, but **independent primary-photo comparison is not established here**. Do not label those exact manufacturer replicas. The large lorry/tanker are generic authored interpretations without a named chassis reference.

Local reference renders used for the visual review are in `/tmp/roadster-vehicle-independent-review/` (`swift-cover.png`, `dzire-cover.png`, `creta-exterior.png`, `bus-ordinary.webp`, `bus-express.webp`). They are research images, not assets to ship in the game.

## Per-family decisions

Statuses below assess vehicle bodies. Every complete vehicle additionally needs the final occupant/contact and runtime gates below.

| Family | Body verdict | Visible improvements | Concrete remaining issue / correction |
| --- | --- | --- | --- |
| Hatch | **FAIL** | Small hatch dimensions, curved lower skin, real wheel openings, visible driver and seat. | Canopy/pillars look like separate flat bars with blunt ends rather than a continuous roof/window aperture; same generic rectangular fascia as other cars. v1 front/rear lamps float visibly off the skin. Integrate pillars/roof/sill trim, shape a distinct hatch fascia and prove shallow housings in v2. |
| Sedan | **FAIL** | Longer body and rear boot, seams, handles and cabin. | Sedan-specific silhouette is too weak relative to the hatch; roof and C-pillar are still a flat frame with exposed ends, and front/rear clusters are generic blocks. Strengthen boot/C-pillar/shoulder shape and integrated lamp recesses; fresh v2 views required. |
| SUV | **FAIL** | Taller body, roof rails and dimension envelope. | Primarily a scaled generic car: window/quarter structure, grille/lamp arrangement and wheel-arch cladding do not provide the researched SUV identity. Give it a genuinely distinct upright quarter, bumper/arch volumes and class-specific lamps, while retaining shared low-cost materials. |
| Cab | **FAIL** | Commercial yellow plate and sedan proportions distinguish its service role. | Same sedan body issues and v1 detached lamps. A taxi plate is a useful identity cue but does not establish close-to-real body construction. Reuse the corrected sedan body, then verify plate and lamps together. |
| Bus | **FAIL** | Real hollow saloon, five complete seated figures rather than isolated heads, modeled seats and source-defined two LH entry openings. | In the right-side capture the long painted lower slab covers almost the entire wheels, with no arch cutouts. This is a major silhouette failure. Cut actual arches, add restrained horizontal window frame/slider/rail cues and a formed front grille/lamp group. The supplied right-side view cannot validate LH doors; use the new left-side camera and capture actual boarding. |
| Lorry | **FAIL** | Recognizable six-wheel goods class; hollow right-hand-drive cab, wipers, handles, high-sided cargo bed and rear sign. | Cab remains an almost perfect upright cuboid; grille decoration is five colored solid rectangles, not a functional recessed grille. Headlamps are prominent thick external blocks. Add a slight windscreen/cab bevel, real lamp backing integrated with bumper, restrained panel/vent lines and a supported mirror rather than replacing the entire simulation. |
| Tanker | **FAIL** | Clearly recognizable water tank, six-wheel layout, water label, hollow cab. | Same box-cab problem; headlamps project as separate white boxes. Rear lamps appear unsupported beside the rear tyres: give them a real crossmember/mudguard bracket. A tank mount/saddle and restrained rear plumbing/ladder cues would improve the bare cylinder/chassis join without dense geometry. |
| Mini-truck | **FAIL** | Useful new compact goods class; small dimensions, open cargo bed, upright cab, plate and visible driver. | Front lamps visibly project well outside the body; rear lamps are detached-looking cubes. Cab side bottom covers the upper front tyre without a real arch. Add a proper front fender opening, flush/recessed shallow lamp housings and continuous sill/bumper contact. Official reference photograph still needs an independent check. |
| Passenger van | **NOT REVIEWED — no visual pass** | Source includes a distinct high roof, seat bays, wheel openings and sourced dimension envelope. | Capture front, both sides, rear, three-quarter, cabin and night. Check the front lamp offset, rear door/window structure, driver/roof clearance, actual landing/collision roof and jump visibility. The new prototype is not visually accepted just because its test passes. |
| Auto | **UNCHANGED BODY — requirement not completed** | Shared occupant work may improve riders after its separate gate passes. | Producer explicitly retained the old auto body. No new body accuracy or primary-photo visual comparison is proved by this pass. Review canopy, open apertures, wheel/fender placement, driver control contact and lamp support in the real production model. |
| Motorbike / scooter | **UNCHANGED BODIES — requirement not completed** | New shared seated anatomy is the only claimed change. | Body silhouettes, wheels/tyres, fork/handlebar/footrest contacts and current materials still need their own actual captures/reference comparison. Do not report the whole fleet as remodeled. |
| Player Roadster | **UNCHANGED — no new appearance claim** | Existing authored shape, equipment, stickers and behavior are preserved. | User allowed refinement, but none was implemented in this vehicle pass. It need not be changed merely to claim an upgrade; any later refinement needs to preserve equipment, stickers and the proven camera/flight/jump behavior. |

## Priority corrections for the next iteration

1. **Finish attached lamp structure across every affected family.** Root's car-only source fix is a good bounded correction, pending visuals. Lorry, tanker, mini-truck and passenger-van source anchors also need checking; the v1 goods-vehicle PNGs show visibly thick/outboard blocks. Use shallow housings that touch the body/bumper, with tiny lens offset for z-fighting, not large floating white/red boxes. Keep reverse/brake lamps and light-pool source anchors aligned to the final lens positions.
2. **Cut real bus wheel arches and mini-truck cab fender arches.** Do not solve this by hiding wheels or making the bus body taller. Preserve sourced axle spacing, roof/collision dimensions and bus door/floor/boarding contracts.
3. **Make the shared car construction read as closed sheet metal and glass.** Use integrated A/B/C pillars, door-window trim and continuous roof/shoulder joins, then distinguish hatch, sedan and SUV with a few meaningful cross sections and fascia choices. Dimensions alone are not visual acceptance. No logo or manufacturer-identical CAD claim is necessary.
4. **Keep NPC and vehicle acceptance coupled at contact points.** The supplied cabin views prove occupants are visible, but most hide hips/feet below the door line. They do not prove seat support, heel/floor contact or hands on the real controls. After the NPC author is approved, capture an elevated cabin/cutaway and normal exterior angle for every seat class. No floating figures, intersecting roofs/doors, uncovered control gaps or detached hands may remain.
5. **Capture the actual left bus side and exchange.** The supplied bus side is the right side. The source's rear entry at local `z=4.4`, its three steps and `.94m` floor must be checked while people board and alight during a normal dwell, not only by an aperture ray or static vehicle gallery.

## Geometry and performance: what the evidence proves

The v1 gallery labels report actual submitted renderer statistics for the shown production prototypes:

| Captured family | Occupants | Draws shown | Triangles shown |
| --- | ---: | ---: | ---: |
| Hatch | 1 | 7 | 5,970 |
| Sedan | 2 | 7 | 8,960 |
| SUV | 1 | 7 | 6,078 |
| Cab | 2 | 7 | 8,892 |
| Bus | 5 | 7 | 17,332 |
| Lorry | 1 | 6 | 4,634 |
| Tanker | 1 | 7 | 5,096 |
| Mini-truck | 1 | 7 | 4,456 |

These figures are **v1 gallery render counts**, not CPU frame time, GPU time, city-wide totals or phone FPS. Counts differ from the producer's separate seeded CPU geometry sample because occupant/variant selections differ. The shared NPC rewrite will change them again. No independent production CPU-time or memory-growth measurement was performed in this review, so none is claimed.

The actual test source caps car body geometry below 15k triangles, new goods/van bodies below 20k, bus below 25k; it checks finite buffers, cabin rays, entrance rays, existing traffic-group registration, marker height, collision and camera-visibility behavior. Those are useful guardrails. A finite mesh and a passing aperture ray cannot establish a convincing vehicle silhouette or sustained smoothness.

One shared transparent double-sided glass draw per affected visible vehicle is a real additional cost, even though it adds no lights and no AI cadence change. Preserve batching and shared geometry/materials. Add silhouette detail to existing body batches where possible. Do not add per-vehicle point lights, expensive glazing blur, population growth or different camera/physics timing to address these appearance findings. Profile the same fixed route/density/camera/day-night conditions against the prior baseline after final geometry, with frame-time distribution, renderer calls/triangles, prototype-buffer memory and a long-session allocation check. This review supplies **no physical-phone 60/90/120 FPS acceptance**.

## Required closing evidence

- Fresh v2 front/side/rear/three-quarter renders of all changed families, including flush lamps and arch corrections; include both bus sides and the new van.
- Final accepted NPC anatomy inside actual seats/controls, including feet/floor and pelvis/cushion contacts.
- Integrated daylight and night drive showing head/rear/brake/reverse lamps with correct attachment and no missing bodies during camera orbit.
- A moving bus boarding/alighting cycle through the correct LH opening and a jump over the tall van without disappearing traffic.
- Same-route before/after performance evidence. Keep real-phone, emulated compatibility and desktop-throttled findings explicitly distinct.

Until those close, report this feature as **implemented candidate with visible improvements and remaining failures**, not completed fleet realism.
