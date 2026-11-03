# Independent traffic vehicle review v2 — 2026-11-02

**Verdict: FAIL / another bounded correction pass is required.** V2 is materially better than v1: hollow formed cabins, visible wheel arches, class-specific front treatments, real bus entry openings and more complete two-wheelers are visible in the actual renders. Lorry and motorcycle bodies now pass as reasonable game-scale generic vehicles. Remaining failures are specific silhouette, unsupported-part, penetration and attachment defects; this is not a demand for manufacturer CAD or photorealistic detail.

The independent v1 report is preserved. Final vehicle-feature acceptance also remains blocked by the separate NPC gate and integrated contact/driving/performance checks. Known NPC v4 clothing failures are not reclassified as vehicle-body failures below.

## Frozen evidence and scope

- **Actually viewed all 72 Root native Chrome PNGs** in `vehicle-captures-v2.json`: all twelve families, each with three-quarter, front, side, left-side, rear and cabin views. The views are genuinely distinct in this set. No misnamed v1 cabin duplicates were used.
- Manifest capture runtime fingerprint: `da3a46cc6653abed674a3722bb8864cccdce6c41e43716024e0f905cf5c22060`.
- Manifest SHA-256: `c3d8df1953a638123f4925712b54aef5b7e217208edcd0c16e995615b60356a8`.
- Read-only source SHA-256, unchanged between the beginning/end of this review: `traffic_models.ts` = `543d1259e810106ef93a2d8bd796d76f0d6ae91992a918614dde4575dda0db54`; `traffic-coachwork.ts` = `92670a09cfe59dbf84423cbaa06341bb70e7894611bb153d731c65f455a30df8`; specs = `85370990961a72456c66fbb0f53894915b730cfcccc50ad2328b0d63a1a45322`. Observed current `people.ts` = `bbb316e378ee4b6a71f23f36ac2339a59e640fbb21e90d9e70c8ca006f6c03b3`.
- Read the producer's v2 report and the actual production coachwork/model sources. The manifest fingerprint is recorded as provided by Root; this reviewer did not rebuild or recalculate its combined runtime hash.
- No browser, GPU workload, server, implementation, deployment or commits were performed by this reviewer. Only this report was added. Static gallery evidence does not establish live traffic smoothness, night lighting, boarding motion, camera persistence or phone FPS.

## Official visual references used

The previously viewed official Swift, Dzire, Creta and TGSRTC images remain the comparison set from v1. This pass also **actually viewed** all six local primary-reference renders supplied by the v2 producer: `re.png`, `splendor.png`, `activa.png`, `boss.png`, `traveller-front.webp` and `traveller-cabin.webp` under `/tmp/roadster-vehicle-v2-references/`.

| Primary source | What it establishes for this review |
| --- | --- |
| [Swift brochure](https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/swift/brochures/Swift%20Brochure%20-%20Vertical%20-%205th%20Oct.pdf), [Dzire brochure](https://www.marutisuzuki.com/content/dam/msil/arena/in/en/assets/cars/dzire/brochures/DZire-brochure_.pdf), [Creta brochure](https://www.hyundai.com/content/dam/hyundai/in/en/data/brochure/creta.pdf) | Distinct hatch/two-box, sedan/three-box and upright SUV silhouettes; integrated lamp clusters, pillars, window trim and roof hardware. Exact badging and trim reproduction are not required. |
| [TGSRTC Ordinary](https://www.tgsrtc.telangana.gov.in/images/uploads/City_Ordinary_1_eaef630da7.webp), [Metro Express](https://www.tgsrtc.telangana.gov.in/images/uploads/Pictures_4_fd27274564.webp) | Wheel openings, framed windows/bars, grouped lamps, sheet-metal waist and bus-class proportions. V2 now captures those cues substantially better. |
| [Bajaj RE leaflet](https://cdn.globalbajaj.com/-/media/Iraq/Documents/RE/RE-4S-Petrol/re_fl_leaflet.pdf?hash=F44C15BD9E37A7A88AE2CDC089947FE6&rev=-1) | Joined rounded legshield/cowl, black lamp mask, raked windscreen, canopy and open sides. This regional reference does not prove every Hyderabad auto's current fittings. |
| [Hero Splendor+ brochure](https://www.heromotocorp.com/content/dam/hero-commerce/in/en/products/practical/content-fragments/splendor-plus/assets/updated-image/Splendor_Plus_Brochure.pdf), [Honda Activa brochure](https://edge.sitecorecloud.io/hondamotorc388f-hmsi8ece-prodb777-e813/media/Project/HONDA2WI/honda2wheelersindia/scooter/Activa-110/2New-Combine-brochure-for-website.pdf) | Commuter bike tank/engine/frame/fork/saddle and scooter continuous apron/steering neck/nacelle/footwell. Simplified meshes are acceptable if those relationships remain coherent. |
| [Ashok Leyland BOSS image](https://www.ashokleyland.com/backend/wp-content/uploads/2024/02/Boss_Application_Parcel-e-commerce_1440x620.png) | Formed commercial cab, proper window aperture, fenders, supported mirrors and attached lamps. The game lorry/tanker are generic classes, not asserted BOSS replicas. |
| [Traveller exterior](https://www.forcemotors.com/wp-content/uploads/2025/02/Traveller-3050WB-mina-img.webp), [cockpit](https://www.forcemotors.com/wp-content/uploads/2025/02/Traveller-Passenger-Interior-new-1.jpg.webp) | Distinct short bonnet with closed shoulder/front structure, raked windscreen, high roof, side windows and interior steering wheel behind the windscreen. The candidate still has physical assembly problems despite adding a bonnet. |

The Tata Ace dimensional reference remains useful, but no independently accessible official Ace photograph was obtained in this review. Compact-truck approval therefore concerns generic class construction, not an exact Tata replica.

## Per-family body verdict

All image references below mean files under `docs/qa/evidence/main-expansion/`, with the exact form `vehicle-{family}-{view}-v2.png`.

| Family | Verdict | What passes now | What prevents acceptance / bounded correction |
| --- | --- | --- | --- |
| Hatch | **FAIL** | Formed roof/pillars and real apertures replace exposed rods; wheel arches and body joins are substantially improved. Ordinary white lenses are now attached to their black backing rather than floating in air. | Both side views still show a pronounced horizontal rear deck after a long sloping rear window: the purported hatch reads as a small sedan. Shorten the deck, extend the roof rearward and make the tailgate/rear glass more upright within the existing length. Front lamp backings form unsupported-looking outward/upward fins beyond the tapered front corners; blend/recess those casings into the painted corner. Changing only C-shaped tail graphics does not fix the class silhouette. |
| Sedan | **FAIL — local fascia correction** | Convincing generic compact three-box body, closed windows, coherent boot and sensible arches; no need to reproduce branded Dzire CAD. | Front black lamp-casing corners stick above/outside the painted nose and look like bolted fins; the three-quarter/cabin views expose their abrupt edges. Keep the newly attached shallow lens, but inset the casing or form a continuous surrounding fender surface. This is a local assembly correction, not another body rebuild. |
| Cab | **FAIL — same local fascia correction** | Readable compact taxi with yellow plate; shared sedan construction is now acceptable in principle. | Same headlamp-casing issue as sedan. Reuse its correction, then verify the commercial plate and final lamp/pooled-light anchors. |
| SUV | **FAIL — unsupported hardware** | Distinct larger grille, split light language, arch cladding, lower sill and upright quarter now distinguish it from the ordinary cars. | Roof rails are visibly floating straight rods with no mounting feet in both side and front/rear views. The source rail center is `H-.018` while the lower crown leaves a visible air gap beneath it. Add at least two actual feet per rail or lower/integrate them. The thin full-width DRL also reads as an exposed strip on the hood edge; give it a restrained attached recess/backing and blend the lower lamp casings into the fascia. |
| Auto | **FAIL — headroom and cowl** | Recognizable yellow/black three-wheeler, real screen/wiper/mirrors, attached paired lamps, fenders and improved control anchors. | Driver hair/top of head is cut off by the canopy in the side/cabin images. Resolve actual interior headroom instead of masking the head. The new front cowl also reads as two separate large hanging egg-shaped pods, whereas the official RE has a joined pressed legshield wrapping the lamp mask/front wheel. Blend the pods into a continuous shallow cowl; do not add more detail to the existing exaggerated lobes. |
| Motorcycle | **PASS — body only** | Reads as a coherent Indian commuter bike: tank, finned engine, frame, forks/shocks, saddle, supported headlamp/indicators, mirrors and wheel/fender positions are understandable at game scale. Actual visible rider wrists meet the grips and feet appear on the real pegs in this captured adult pair. | Exact branded trim and photorealism are not claimed. Known clothing defects remain the NPC owner's gate. Verify the alternate pillion/age poses and moving-game visibility before whole-feature acceptance. No further broad remodeling is justified by this static evidence. |
| Scooter | **FAIL — steering-neck connection** | Distinct molded apron/rear shell, footwell and saddle; feet rest visibly on floor ribs, and hands reach actual controls. | Side/front/cabin views show an air gap between the nacelle and the top of the apron, making the handlebars/headlamp float. The nacelle bottom is about `1.09m`, apron top `1.08m`; their differing longitudinal centers also expose the gap. Add a real steering neck/return from the apron to the nacelle, rather than closing it only from one camera. The ordinary silhouette is otherwise reasonable. |
| Bus | **FAIL — local mirror support; major v1 defects resolved** | Actual wheel openings, revised axle/door relationships, framed windows/rails, waist band and grouped round lamps now read convincingly as a stylized RTC bus. Both LH openings and three steps are genuinely visible in the left-side view. | Mirror blocks remain visibly suspended off the body with no stalk/bracket in the front view. Add support bars. Real exchange animation and final occupant contacts still require runtime evidence; the static doors alone do not establish safe boarding. Do not discard the successful arch/window/fascia work. |
| Lorry | **PASS — generic body only** | Formed/raked cab windows, fenders, supported mirrors, attached lamps/bumper, grille and high-sided goods bed now form a coherent generic Indian truck. The former colored grille tiles/floating white cubes are gone. | Simple planar cargo panels and polygonal tyres are acceptable game-scale simplification here. A close-up fender return shows faceted/intersecting-looking slivers; clean those when sharing the final arch helper, but they do not defeat class recognition. Cabin hip/feet remain hidden from this camera and need the separate contact proof. |
| Tanker | **FAIL — ladder penetration** | Tank saddles, hoops, supported rear light crossmember, plumbing and formed cab resolve the major bare-cylinder/floating-lamp complaints. | Rear image shows the upper portion of the ladder's left rail and several rungs disappearing into the curved tank end-cap, leaving disconnected stubs. Source ladder z decreases with height while the end cap bulges outward. Move the full ladder clear of the vessel or conform it to the cap with real stand-offs; preserve the actual collision/marker envelope. A coherent generic tanker does not require exact manufacturer trim. |
| Mini-truck | **FAIL — rear identification occluded; body otherwise passes** | Compact goods silhouette, true cab arch, formed window frame, connected shallow lamp backing and rear structure are now reasonable generic class construction. | The new rear crossmember hides almost the entire rear number plate; the rear image shows only a thin yellow sliver. Move the plate onto the visible rear-facing crossmember or relocate its backing. Do not undo the lamp support to uncover it. No full cab rebuild is necessary. |
| Passenger van | **FAIL — bonnet/cockpit assembly and mirrors** | Distinct high-roof passenger shuttle, seat bays, rear door windows/seams/handles/hinges and wheel arches are now present. A boxy authored shuttle can be acceptable; boxiness alone is not the rejection. | Front/cabin views show an open horizontal slit below the bonnet/header and the steering-wheel upper arc emerging through/over the external bonnet. At current anchors the driver control center is near `z=-2.034`, forward of the windscreen base, causing the interference. Close the bonnet/shoulder/front returns and keep steering hardware and hands behind the screen. Side mirrors also have no visible support stalks. Recheck the resulting window/roof joins from all sides; do not call it a close Traveller reproduction while these physical defects remain. |

## Contact findings, kept separate from wardrobe

- Bike/scooter captured driver hands and feet now align visibly with real hardware; this is a meaningful improvement. The motorcycle passenger feet also appear supported on the actual pillion pegs in the shown pair.
- Auto roof/head clearance **fails** in the supplied actual model. Check the canopy underside against the tallest supported driver, not just the registered exterior height.
- Passenger-van steering wheel/bonnet interference **fails** independently of NPC clothing. Move the seat/control pose together or reshape the cockpit so hands remain on the actual wheel inside the cabin.
- Most closed-body cabin cameras hide pelvis, thighs and feet. A visible head/torso and a source anchor are not proof of cushion/sole support. Final accepted NPC meshes still need an elevated contact/cutaway check in car, bus, goods cab and van, plus optional passengers and side-saddle/pillion poses.
- Bus exchange must be played through both real LH openings. The new left-side image proves apertures/steps exist; it does not prove a moving person clears the jamb, stair tread, roof and aisle.

## Renderer counts and limits

The manifest's actual three-quarter capture labels report:

| Model | Occupants | Submitted draws | Submitted triangles |
| --- | ---: | ---: | ---: |
| Hatch | 1 | 7 | 8,512 |
| Sedan | 2 | 7 | 10,448 |
| SUV | 1 | 7 | 8,323 |
| Cab | 2 | 7 | 10,474 |
| Auto | 1 | 7 | 4,820 |
| Motorcycle | 2 | 3 | 8,975 |
| Scooter | 1 | 3 | 6,058 |
| Bus | 5 | 7 | 15,555 |
| Lorry | 1 | 6 | 6,630 |
| Tanker | 1 | 7 | 7,950 |
| Mini-truck | 1 | 7 | 6,064 |
| Passenger van | 3 | 7 | 11,342 |

The van cabin view shows 6 draws / 11,340 triangles because one two-triangle surface is outside that view; use the full three-quarter number for comparison. These are prototype gallery renderer counts, not CPU timing, GPU timing, integrated city totals or phone FPS. NPC changes alter the counts, so geometry differences cannot be attributed solely to vehicle body work. Current visual fixes should remain in existing batched/shared material paths; no per-vehicle real lights, extra traffic, different simulation/camera cadence or expensive transmission effects are warranted.

## Next capture gate

1. Correct the twelve specific local issues above, prioritizing auto headroom, van cockpit/bonnet closure, hatch silhouette, unsupported hardware and the occluded rear plate. Preserve the already successful generic lorry/motorcycle construction and RTC arch/window work.
2. Capture changed families in the same six distinct views with a new frozen manifest. A source fix alone does not close a visual finding.
3. After the NPC mesh passes its independent gate, capture actual seat/control/floor contacts and a full bus exchange cycle.
4. Root must still verify day/night driving, camera orbit, jump over bus/van and fixed-route frame-time/memory behavior. This reviewer makes **no physical-phone performance or final integrated-game acceptance claim**.

V2 is a substantial improvement, with two body families accepted and the others carrying bounded corrections. It is not ready to be described as a completed, accurately modeled fleet.
