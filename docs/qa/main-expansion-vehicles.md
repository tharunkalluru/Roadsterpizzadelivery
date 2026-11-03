# Traffic vehicle implementation candidate — 2026-11-02

Producer: `traffic_vehicle_realism`. **Independent visual approval is pending.** This report does not claim photorealism, exact branded CAD fidelity or phone FPS.

## Implemented

- Rebuilt hatchback, sedan, SUV and taxi body skins as smooth section lofts with real wheel-arch openings. Added separate roof/pillars, door seams/handles, mirrors, grille slats, machined wheel detail and hollow passenger compartments.
- Replaced the solid black car greenhouse with one shared, thin, double-sided glazing batch. A driver, actual seat/cushion, supported feet, steering wheel/column and optional passenger occupy the cabin. India-spec driver position is on the right.
- Bus window band is hollow, with **complete seated figures and seats** instead of ten detached sphere heads. Four seated customers plus one driver are a bounded visible sample; empty seats remain modeled. Standing entry headroom no longer passes through a solid thick roof block.
- Bus entrances are real openings on the left, before the front axle and after the rear axle. The old middle-door anchor was corrected from local `z=.6` to `z=4.4`. Matching passenger exchange uses the same rear opening and actual .94m saloon floor with three internal steps. Four-person exchange counts, dwell timing, start times, horizontal schedule and traffic service ownership remain unchanged.
- Lorry and water-tanker cabs now have hollow glazed windows, complete seated drivers, optional passengers, steering controls and floors/seats. They do not use a solid cab volume surrounding a hidden head.
- Added compact last-mile goods truck and passenger/office-shuttle van prototypes. They use the **existing** `truck` and `car` groups. Collision, route selection, marker roof height, lamp source anchors and camera-visibility behavior consume their actual dimensions through existing contracts.
- No added traffic population, route-decision loop, per-frame allocations, individual lights, simulation cadence, visibility cull or jump timing changes. Prototype registration adds two appearances; the existing traffic cap remains unchanged.
- The already-authored player Roadster was inspected and preserved. Its shaped body/real wheel arches, pizza case, nozzles, flight/jump behavior, both tfigames.com vinyls and rear pizzadeliveryboy vinyl are untouched. There is no new player-car appearance change to misrepresent as completed work.

## Primary references and what they establish

These are dimensional/design references for authored interpretations, not a claim that the game imports manufacturer CAD or reproduces every trim:

| Reference | Applied facts |
| --- | --- |
| [Maruti Suzuki Swift](https://www.marutisuzuki.com/arena/swift) | 3.860 × 1.735 × 1.520m, 2.450m wheelbase; distinct hatch silhouette, raked glass, grille and lamp design cues. |
| [Maruti Suzuki Dzire](https://www.marutisuzuki.com/arena/dzire) and [Tour S](https://www.marutisuzuki.com/tour/dzire) | 3.995 × 1.735 × 1.525m, 2.450m wheelbase; separate sedan boot and commercial yellow-plate taxi identity. |
| [Hyundai Creta official brochure, dimensions on p.17](https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta.pdf) | 4.330 × 1.790 × 1.635m **including roof rails**, 2.610m wheelbase; upright SUV greenhouse and roof rails. |
| [Tata Ace Gold Petrol](https://smalltrucks.tatamotors.com/tata-ace-gold-petrol) | 3.800 × 1.500 × 1.840m, 2.100m wheelbase, 2.200 × 1.490 × .300m load deck; compact goods prototype. |
| [Force Traveller N 3050WB](https://www.forcemotors.com/vehicles/traveller-3050wb/) | 5.100 × 1.925 × 2.615m, 3.050m wheelbase; separate passenger van silhouette/seat bays. |
| [TGSRTC City Ordinary/Metro Express Bus Body Specifications 2023](https://tgsrtc.telangana.gov.in/pdf/Bus%20Body%20Specifications%20-%20Dec-2023.pdf) | Indexed official specification describes two LH passenger entrances ahead of front wheels and behind rear wheels, 11m-class chassis, 2×2 saloon seating, max 2.590m width and 1.130m pillar centers. The publisher's old PDF URL currently redirects to its new website; the official indexed text was available to the research tool. Existing 11×2.5m body is retained within that envelope; it is not labeled an exact chassis replica. |
| [Ashok Leyland Viking official specification](https://www.ashokleyland.com/in/buses/brands/viking/specification) | Independent manufacturer check of roughly 11m bus/chassis proportions. |
| [Bajaj RE official specification](https://www.bajajauto.com/three-wheelers/re/specifications), [Hero Splendor+](https://www.heromotocorp.com/en-in/motorcycles/splendor-plus.html) | Cross-checks of existing auto/two-wheeler class. Those body builders are retained in this pass; their new shared occupants remain subject to the separate failed NPC review. They are still procedural models, not newly verified exact replicas. |

The bus now labels its blue two-open-entrance variant Metro Express, not the old AC Metro Luxury label. Red/blue paint is a retained game interpretation; an exact photographed bus-by-bus livery audit is not established by dimensional research alone.

## Geometry / rendering cost

CPU measurement of actual generated production batches, seeded sample: each car body is approximately **6.0k–8.9k triangles** with one or two complete occupants; bus **16.9k** with five occupants; lorry **4.6k** with one occupant; tanker **8.1k** with two; mini-truck **7.3k** with two; passenger van **10.8k** with three. Body vertex-buffer estimates range from ~.76MiB to ~2.13MiB **per prototype**, shared by spawned instances. Exact counts may change when the rejected NPC anatomy is corrected.

Glazing adds **one draw per affected visible vehicle**, using a shared material and no extra light/shadow. It is regular small-area 3D glazing, with no blur, bloom or UI transparency changes. This increases geometry/draw cost over the simpler baseline and requires Root's integrated profiling gate. Bounded geometry and unchanged AI do not prove equivalent FPS, sustained phone temperature or battery life.

## Verification completed

- `npm run typecheck` passes.
- `node scripts/test-v21-fixes.mjs traffic`: **32/32** pass. This includes prior visibility/orbit, collision, traffic-following, headlight-pool, rear/brake/reverse lamps and all five new production geometry/integration tests.
- New tests exercise real cabin rays (driver is not hidden by opaque outer glasshouse), actual bus entrance apertures, finite geometry budgets, seat/roof bounds, passenger door/floor schedule, registered traffic groups and real jump-grab marker heights for both new prototypes.
- `git diff --check` passes.

## Actual visual review still required

Root owns browser control. Fixture: `/tests/browser/traffic-vehicles.html?model=hatch&view=three-quarter`. Model choices: hatch, sedan, suv, cab, auto, motorbike, scooter, bus, lorry, tanker, mini-truck, passenger-van. View choices: three-quarter, front, side, rear, cabin; add `&night=1` for night. This fixture uses the exact production geometry/materials and supports drag orbit.

Mandatory before release: independent front/side/rear/three-quarter review of body winding, glass, actual occupant seat/control/roof contacts; day/night gameplay captures and a jump over the new tall van; actual bus boarding/alighting through its open doors; integrated draw/frame-time/memory comparison. The shared NPC candidate **failed** independent visual review in `main-expansion-npc-review.md`; this pass does not approve or conceal that failure. Corrected human geometry must be rechecked inside the vehicles.
