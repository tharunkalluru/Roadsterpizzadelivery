# Traffic realism v2 candidate — 2026-11-02

Status: **source candidate ready for Root capture and independent visual review**. The independent v1 FAIL in `main-expansion-vehicles-review.md` is retained. No v2 visual pass, physical-phone performance pass or photorealism claim is made here. Root owns the real browser captures and integrated driving checks; this producer did not operate a browser or publish the source.

## Corrections driven by the actual v1 review

The producer read the independent report and inspected the actual v1 captures and the official Swift/Dzire/Creta/TGSRTC reference photographs before remodeling. The new geometry is authored interpretation, not manufacturer CAD or a licensed replica.

| Family | Concrete v2 construction |
| --- | --- |
| Hatch / sedan / cab | Replaced the separate rod pillars and flat canopy with formed side sheets containing rounded window holes, a curved crown with underside, returned A/C pillars, curved glazing and flush rubber window trim. Retained separate sedan boot proportions. Hatch uses its own curved grille/swept lamp backing and C-shaped rear lenses; sedan/cab use a wider trapezoid grille and different rear treatment. Right-hand driving positions and actual seats/controls remain. |
| SUV | Taller upright quarter/canopy, broad arch cladding and lower sill, larger slatted grille, skid-plate volume, lower headlamp groups and horizontal upper DRL/rear bar. It is no longer merely the hatch fascia scaled up. |
| Bus | Cut actual semicircular tyre openings in both side sheets, including shallow return lips. Added framed/sliding window cues, horizontal safety rails and transoms, cream waist band and a recessed grille/paired round headlamp construction. Axles now use a 5.700m wheelbase (local z −3.6/+2.1) rather than the former 6.7m spacing. The front LH entrance is before the front axle at z −4.7; rear remains z +4.4. Side panels and arches leave both openings clear. Blue open-entrance buses identify as Metro Express. |
| Lorry / tanker | Formed cab side-window apertures, raked screen, chamfered front corners, roof cap, supported mirror stalks and real front fenders replace solid cuboid cab construction. Recessed grille/slats and attached shallow lamp casings replace colored grille blocks and detached lamps. Tanker adds physical lamp crossmember/brackets, saddles, thin vessel hoops, ladder and plumbing. Its registered height is now 3.22m because the existing filler cap actually reaches 3.21m; markers/collision must use that physical envelope. |
| Compact goods truck | Real cab-side wheel arch/lip, formed window frame, shallow front/rear lamp backing and connected rear crossmember. Existing sourced 3.8 × 1.5 × 1.84m envelope and 2.1m wheelbase retained. |
| Passenger van | Real rear door window apertures, mullion, returned trim, hinges/handles and supported lights. After actually viewing the now-accessible official Traveller image, corrected the cab-over-like front to a short crowned bonnet, raked screen and separate formed driver-window assembly. Retains sourced 5.1 × 1.925 × 2.615m envelope / 3.05m wheelbase. |
| Auto | Rounded front legshield pods, black dual-round lamp mask, real front/rear fenders, raked clear screen/frame/wiper, attached mirrors, lowered rounded canopy and supported shallow lamps. Floor, driver seat and grips now have consistent physical anchors. Existing yellow/black/green identity and Telugu rear quotes retained. |
| Motorcycle | Shaped tank, tubular triangle frame, complete finned engine/crankcase, twin fork/shock hardware, open alloy wheels, curved mudguards, real footpegs/grab rail, supported headlamp/indicator housings and mirror stalks. Grips derive from the actual scaled shared rider wrists. |
| Scooter | Formed curved legshield and rear shell, footwell/floor ribs, saddle, molded lamp nacelle, open wheels/fender, forks, grab rail and actual rear foldout footboards. Separate `scooterPillion` contact pose is used after coordination with the NPC owner. |

Root's previous flush car-lens fix is preserved: the loft end heights and shallow lens positions remain at the actual front/rear skin. All ordinary head/tail/brake/reverse lens depths are now 12mm rather than projecting 45mm cubes. Dedicated round auto/bus lenses have physical backing. The existing pooled night-light system still receives the actual lens positions; no per-vehicle real lights were introduced.

## Bus exchange and human contact coordination

- Four-person exchange counts, start times, travel duration, dwell ownership and original x/time schedule are unchanged.
- Boarding completes its outside longitudinal approach before reaching the body, then crosses straight at the actual front opening. Rear alighting stays at z4.4 until outside. This corrects a former diagonal shoulder path through a jamb. Stair/floor positions remain aligned with the .94m saloon floor.
- Full seated people remain in buses, cars, van and goods cabs. Optional auto/pillion passengers are now represented accurately in the gallery's occupant metadata without changing their probability or adding random calls.
- NPC producer owns the human mesh/anatomy. Exact production hip, wrist, peg and floor anchors were supplied for bike/scooter/auto and pillions. That producer added a sole-based foot support pose and `scooterPillion`; vehicle source only selects the matching pose and provides actual hardware. This is coordination, not independent human/contact approval.
- Root still needs elevated cabin/contact views and a real LH boarding/alighting sequence; an aperture ray alone cannot prove convincing animation or full-body clearance.

## Primary references actually inspected

| Official reference | Application and evidence limits |
| --- | --- |
| [Swift brochure cover](https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/brochures/Swift%20Brochure%20-%20Vertical%20-%205th%20Oct.pdf), [Dzire brochure cover](https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/dzire/brochures/DZire-brochure_.pdf), [Creta brochure](https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta.pdf) | Actually viewed the reference renders supplied to the independent reviewer. Used continuous roof/pillar structure and class-specific grille/lamp/arch cues; no brand logo or exact replica claim. Dimensional data remains recorded in `traffic-vehicle-specs.ts`. |
| [TGSRTC City Ordinary photograph](https://www.tgsrtc.telangana.gov.in/images/uploads/City_Ordinary_1_eaef630da7.webp), [Metro Express photograph](https://www.tgsrtc.telangana.gov.in/images/uploads/Pictures_4_fd27274564.webp) | Actually viewed both official photos: real wheel openings, window sliders/bars, grouped circular lamps, cream/colored sheet metal. Livery remains an interpretation across variants. |
| [TGSRTC 2023 City Ordinary / Metro Express body specification](https://www.tgsrtc.telangana.gov.in/pdf/Bus%20Body%20Specifications%20-%20Dec-2023.pdf) | Official indexed document text rechecked in this pass: two LH entrances before front/after rear wheels; TATA 5700mm wheelbase among its listed chassis. Old publisher PDF routing can redirect; indexed official text was available. This is an 11m-class interpretation, not an exact chassis registration. |
| [Bajaj RE official regional leaflet](https://cdn.globalbajaj.com/-/media/Iraq/Documents/RE/RE-4S-Petrol/re_fl_leaflet.pdf?hash=F44C15BD9E37A7A88AE2CDC089947FE6&rev=-1) | Downloaded, rendered and actually viewed. Used rounded yellow front pods, black dual-lamp panel, raked screen/wiper and open side canopy. It is an older regional RE reference, not proof that every current Hyderabad auto has identical fittings. Existing compatible game footprint retained. |
| [Honda official Activa combined brochure](https://edge.sitecorecloud.io/hondamotorc388f-hmsi8ece-prodb777-e813/media/Project/HONDA2WI/honda2wheelersindia/scooter/Activa-110/2New-Combine-brochure-for-website.pdf) | Linked from the official Honda Activa product page, downloaded/rendered and actually viewed. Used formed apron/rear shell, molded nacelle, floorwell, fork and grab-rail construction. |
| [Hero official Splendor+ brochure](https://www.heromotocorp.com/content/dam/hero-commerce/in/en/products/practical/content-fragments/splendor-plus/assets/updated-image/Splendor_Plus_Brochure.pdf) | Downloaded/rendered and actually viewed. Used finned engine, shaped tank, tubular frame/forks/shocks, open alloy wheels and supported controls/lamps. Generic commuter interpretation rather than a badged exact replica. |
| [Ashok Leyland BOSS official image](https://www.ashokleyland.com/backend/wp-content/uploads/2024/02/Boss_Application_Parcel-e-commerce_1440x620.png), linked by its [product page](https://www.ashokleyland.com/in/trucks/icv/icv-boss?variant=trucks/icv/icv-boss) | Actually viewed for real cab bevels, supported mirrors, recessed grille/bumper, wheel arches and attached lamp construction. Large lorry/tanker remain generic Indian goods classes, not asserted BOSS replicas. |
| [Force Traveller official exterior](https://www.forcemotors.com/wp-content/uploads/2025/02/Traveller-3050WB-mina-img.webp) and [driver cabin](https://www.forcemotors.com/wp-content/uploads/2025/02/Traveller-Passenger-Interior-new-1.jpg.webp) | Both downloaded and actually viewed in this pass. The main product URL repeatedly timed out in the web reader, but the public page/assets fetched successfully; the manufacturer subdomain also served its [3050WB product page](https://vapt.forcemotors.com/vehicles/traveller-3050wb/). Used short bonnet, high roof, door/window framing and right-hand cockpit. |
| [Tata Ace Gold Petrol product page](https://smalltrucks.tatamotors.com/tata-ace-gold-petrol) | Dimensional source from v1 retained. The independent reviewer received HTTP403 for photo/brochure; this v2 pass does not invent a new primary-photo acceptance for it. Compact cab geometry still needs independent actual photo comparison. |

Local research renders are under `/tmp/roadster-vehicle-independent-review/` and `/tmp/roadster-vehicle-v2-references/`. Reference photographs are not shipped as game assets.

## Geometry and cost guardrails

Actual seeded production-body buffer sample, using the same `RoundedBoxGeometry` templates/seeds as the browser fixture and the shared NPC candidate at measurement time:

| Model | Occupants | Body triangles | Body vertex buffers MiB |
| --- | ---: | ---: | ---: |
| Hatch | 1 | 7,534 | .948 |
| Sedan | 2 | 9,494 | 1.195 |
| SUV | 1 | 7,345 | .925 |
| Cab | 2 | 9,520 | 1.198 |
| Auto | 1 | 4,650 | .585 |
| Motorcycle | 2 | 8,925 | 1.124 |
| Scooter | 1 | 6,008 | .756 |
| Bus | 5 | 15,277 | 1.923 |
| Lorry | 1 | 6,534 | .823 |
| Tanker | 1 | 7,852 | .988 |
| Compact goods truck | 1 | 5,966 | .751 |
| Passenger van | 3 | 11,228 | 1.413 |

These are CPU-generated **body-only** geometry buffers, including occupants. They exclude light/decal/glazing batches, textures, JS arrays and city scenery. They are shared per prototype, not rebuilt for each spawned car. They are not renderer totals, phone FPS, GPU time or heap-growth measurements. NPC revisions alter the counts; v1/v2 differences cannot be attributed solely to coachwork. Root's final frozen browser captures must record actual submitted calls/triangles.

Geometry is built at prototype/load time. New curved parts enter existing body/glass batches; glazing uses the shared simple material. No blur, transmission, per-frame mesh rebuilding, new simulation group, AI cadence/camera timing change or crowd/traffic population growth was added. The v1 compact truck/van are additional prototypes in existing groups. Their render cost and the extra shared glass draw need integrated same-route profiling after visual approval.

## Checks and pending acceptance

- `npm run typecheck`.
- `node scripts/test-v21-fixes.mjs traffic`: **36/36 passed** in the final full traffic run, including the van bonnet, tanker cap envelope and full bus-door path corrections.
- Geometry tests now check actual headlamp backing within 5.5cm, real rear van window holes, bus/compact-truck exposed wheel arches, roof envelopes, actual entrance rays at three heights and full four-person crossing paths rather than only endpoints. Existing traffic adapter, collision/marker, camera orbit, brake/reverse and pooled-night-light tests remain.
- `git diff --check`.

Fixture: `/tests/browser/traffic-vehicles.html?model=hatch&view=three-quarter`. Models: hatch, sedan, suv, cab, auto, motorbike, scooter, bus, lorry, tanker, mini-truck, passenger-van. Views: front, side, **left-side**, rear, three-quarter, cabin; `&night=1` available. Actual production models, not substitute review meshes.

Still required: Root's frozen v2 gallery, independent body/reference assessment of **all** families, final NPC occupant/contact approval, LH bus exchange in motion, day/night driving, camera orbit and jump-over-bus/van, and fixed-route frame-time/memory comparison. Mobile compatibility or desktop geometry counts cannot establish physical-phone 60/90/120 FPS. Player Roadster body/physics/equipment and requested stickers remain unchanged by this vehicle pass.
