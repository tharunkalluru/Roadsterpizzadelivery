# Independent traffic vehicle review v3 — 2026-11-02

**Verdict: PASS for vehicle-body geometry at the game's intended scale.** All twelve families now clear the concrete silhouette, attachment, penetration and identification blockers recorded in the independent v2 review. This is a scoped body-assembly verdict, not approval of the complete traffic feature, physical-phone performance, exact manufacturer replicas or photorealistic people.

The v1 and v2 FAIL reports are preserved. Their findings were valid for those frozen renders; this report closes them against new actual images rather than retrospectively changing the old verdicts.

## Evidence identity and method

- Actually viewed **all 72 Root native Chrome PNGs**, twelve families × six genuinely distinct views: `three-quarter`, `front`, `side`, `left-side`, `rear`, `cabin`. They are listed in `docs/qa/evidence/main-expansion/vehicle-captures-v3.json`, using `vehicle-{family}-{view}-v3.png`. All 72 files exist and have distinct SHA-256 image hashes. Distinct hashes alone are not the visual check; the images themselves were inspected.
- Frozen capture runtime fingerprint supplied by Root: `4764eb0d07abc4d6dc5d9bb945a54b085d8837d796f8f4fb9e333ed28b47ef70`. This reviewer recorded it, not independently reconstructed the combined runtime hash.
- Manifest SHA-256 independently checked: `98bff60dcf186ac4851c38fa72374202d23c549cf45a2e8c4f3a665c74188a70`.
- Current production source SHA-256 independently checked:
  - `src/world/traffic_models.ts`: `6f071ad577d82f88b6e321d5927f769b6e829628cb48b01f2e954fb2fa44b936`.
  - `src/world/traffic-coachwork.ts`: `20f910ccaceea0005db744b452a2eb094bee9d822b759488f66ba0af6bce9ba8`.
  - `src/world/traffic-vehicle-specs.ts`: `85370990961a72456c66fbb0f53894915b730cfcccc50ad2328b0d63a1a45322`.
- Read the v3 producer report and inspected the bounded source corrections alongside the images. Parent reports the shared NPC v6 static clothing/contact pass and subsequent v7 negative-dt animation repair; neither is independently certified by this body review. Observed current `people.ts` hash is `95eb9f74ebcab5359a740c6a5fe9a0ccdba4f76895b5ef0bcb09d26cf1a53a78` and must not be silently substituted into the frozen capture fingerprint.
- No browser, GPU workload, server, production edits, deployment or commits were performed by this reviewer. Only this new review report was added. Producer-run typecheck, 42/42 traffic tests and geometry rays are supporting evidence, not this reviewer's own test runs or substitutes for the PNG check.

## Comparison standard

The primary manufacturer/operator visual references actually viewed during v1/v2 remain the comparison set: Swift/Dzire/Creta brochures, TGSRTC Ordinary/Express photos, Bajaj RE leaflet, Hero Splendor+ and Honda Activa brochures, Ashok Leyland BOSS photo, and Force Traveller exterior/cockpit photos. Exact source links and access limitations remain in `main-expansion-vehicles-review-v2.md`.

Those sources support class proportions and construction relationships: two-box versus three-box silhouettes, lamp integration, window/door apertures, mirror mounts, scooter steering neck, formed commercial cabs and steering controls behind a windscreen. The candidate fleet is an authored, simplified interpretation. A recognizably coherent generic hatch or passenger shuttle can pass without matching a Swift or Traveller panel for panel. The unavailable official Tata Ace photograph is still not invented evidence for an exact Tata replica. A regional RE leaflet also does not establish every current Hyderabad auto's fittings.

## Per-family body verdict and closure of v2 findings

Every row was checked in all six actual v3 views. View names below identify the most diagnostic evidence, not a smaller reviewed subset.

| Family | Body verdict | Visible result and boundary |
| --- | --- | --- |
| Hatch | **PASS** | Both side views now show the roof extended towards an upright rear screen with a short tail deck. It reads as a compact two-box hatch rather than the v2 small sedan. Front/cabin and rear views show shallow attached lamp surrounds instead of protruding casing fins. The angular body is a generic hatch interpretation, not a current Swift replica. |
| Sedan | **PASS** | Coherent three-box proportions, window apertures, wheel openings and boot remain. In three-quarter/front/cabin views the former black lamp fins are replaced by restrained shallow casings against the painted nose. Rear lights remain supported by the tail. No new body aperture or loose hardware blocker is visible. |
| Cab | **PASS** | The same corrected sedan fascia is visible with commercial identification. Headlight backing no longer projects upward/outward as an unsupported corner fin. The taxi plate, bumper and tail-light placement remain readable. |
| SUV | **PASS** | Both roof rails visibly have actual feet joining them to the curved roof. Front light strips now have shallow backing within the fascia; the exposed hood-edge strip complaint is resolved. Upright cabin, larger grille, cladding and arch treatment distinguish the SUV from the other cars. Generic trim detail remains simplified. |
| Auto | **PASS** | Front/three-quarter views show one joined shallow yellow cowl and wheel cut, replacing the two hanging egg-shaped pods. Paired lamps and their black mask are supported. Both side views show a complete driver hair/head silhouette below the canopy; the prior head/roof penetration is gone. Floor support exists beneath the visible driver region. Full optional-passenger sole/seat proof belongs to the separate contact gate, not the partly occluded cabin PNG alone. |
| Motorcycle | **PASS** | The previously accepted commuter-bike body is retained: tank, engine, frame, forks, fenders, saddle, pegs, lamps and supported mirrors remain coherent. The shown adult pair's hands reach grips and feet appear supported by real pegs. No broad rebuild is warranted. Alternate rider poses, animation and wardrobe remain separate checks. |
| Scooter | **PASS** | Side/left-side/cabin images show a solid steering-neck return overlapping the apron and head unit, resolving the floating nacelle. Footwell, saddle, molded rear shell, attached mirrors and fork/fender relationships remain coherent. Visible shoes rest on the footboard in the shown pose. |
| Bus | **PASS** | Front and three-quarter views now show mirror stalks anchored at the frame/header instead of suspended mirror blocks. Wheel openings, framed windows/bars, RTC color blocking and grouped front lights retain the major v2 improvement. Left-side evidence clearly shows both real passenger openings and steps. This supports body/door construction only; it does not prove a complete moving boarding cycle. |
| Lorry | **PASS** | The previously accepted generic Indian goods cab/bed structure is preserved: formed/raked window frame, attached lamps, grille/bumper, supported mirrors, wheel openings and high-sided bed. Polygonal tyres and broad cargo panels are reasonable game-scale simplifications. Small faceted fender-return slivers are visible at close range but do not defeat the body assembly or class silhouette. |
| Tanker | **PASS** | Rear view now shows both full ladder rails and every rung in a continuous plane clear of the end-cap. Side evidence shows supports connecting the ladder assembly back to the tank/chassis. The prior buried upper rail/rungs are gone; saddles, hoops, rear crossmember and light supports remain coherent. This is a generic water tanker, not a specific manufacturer trim claim. |
| Mini-truck | **PASS** | Rear image shows the entire yellow plate on the visible crossmember face, with no occluding bar. Cab aperture/arches, supported mirrors/lamps, compact proportions and cargo deck remain coherent. It passes as a generic small goods carrier rather than an exact Tata Ace reproduction. |
| Passenger van | **PASS** | Front/cabin/three-quarter images show a closed bonnet front/shoulder return with no former horizontal open slit. The steering wheel is behind the windscreen; it no longer emerges over the external bonnet. Both mirrors have visible supporting stalks. A short bonnet, high roof, passenger window bays and rear doors distinguish the vehicle from the lorry/bus. It is still an angular authored shuttle, not a close panel-for-panel Traveller reproduction. |

No remaining concrete v2 body blocker was found in this frozen set. This finding should not prompt another fleet-wide remodeling pass merely to pursue branded CAD fidelity. Further changes should answer a demonstrated visual or gameplay defect.

## Occupants and contact scope

The actual v3 auto headroom and van steering-wheel/body interference are visibly resolved. Bike/scooter shown hand/foot alignments are coherent. Occupants now look materially more complete than the old primitive figures, but character anatomy/wardrobe diversity is owned by its independent reviewer.

Closed cabins obscure much of the pelvis, cushion contact and floor. A torso behind a window cannot establish every seated or optional passenger contact. The parent's separate static-contact verdict should retain its own evidence and source fingerprint. Likewise, this body-only pass does not cover the repaired negative-dt animation behavior or prove moving gait/bus entry clearances.

## Actual gallery renderer counts

These are the production gallery's **three-quarter submitted counts**, read from the actual v3 captures and manifest. They include the visible seeded occupants and render batches, not just painted body triangles.

| Model | Occupants | Submitted draws | Submitted triangles |
| --- | ---: | ---: | ---: |
| Hatch | 1 | 7 | 8,504 |
| Sedan | 2 | 7 | 11,596 |
| SUV | 1 | 7 | 9,702 |
| Cab | 2 | 7 | 11,434 |
| Auto | 1 | 7 | 5,628 |
| Motorcycle | 2 | 3 | 9,948 |
| Scooter | 1 | 3 | 6,232 |
| Bus | 5 | 7 | 19,920 |
| Lorry | 1 | 6 | 6,746 |
| Tanker | 1 | 7 | 7,960 |
| Mini-truck | 1 | 7 | 6,184 |
| Passenger van | 3 | 7 | 11,660 |

The van cabin submits 6 draws / 11,658 triangles because a two-triangle surface is outside that view; the table consistently uses three-quarter evidence. NPC changes also changed totals in otherwise retained vehicle bodies. These are not controlled v2→v3 body-performance deltas.

Producer source inspection indicates prototype/load-time geometry construction within the existing shared batches, no per-vehicle real lights and no added traffic or simulation cadence changes. The recorded draw/triangle counts are useful cost bounds, **not** CPU time, GPU time, city-frame totals, heap stability or physical-phone FPS. No 60/90/120 FPS conclusion follows from them.

## Remaining integrated acceptance gates owned by Root

1. Final accepted NPC source and actual cushion/sole/hand contacts, with the optional passenger/age/body-type variations rather than only the shown seeded occupants.
2. A complete bus entry/exit cycle through both left-side openings, checking feet on steps, jamb/roof clearance and no visibly detached moving passenger.
3. Driving beside these models by day and night: body-origin headlights, red tail/brake lights, reverse lights and readable traffic silhouettes.
4. Camera orbit and jumps over bus/van with the vehicle retained and visible throughout approach, flight and landing.
5. Integrated fixed-route frame-time/memory comparison using unchanged timing/camera/traffic conditions; real-phone results remain separate from desktop/emulator/gallery observations.

**Body review complete: all twelve families pass the bounded v3 visual geometry gate. Whole-feature and release acceptance remain with the integrated gates above.**
