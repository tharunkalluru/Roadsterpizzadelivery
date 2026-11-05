# New level campus/location source review — 2026-11-05

## Osmania University

The user means the Arts College campus, not Osmania Medical College or Osmania General Hospital. Official university map: https://www.osmania.ac.in/univmap.php (currently embeds a Google map). Official campus college list: https://www.osmania.ac.in/academics-campuscolleges.php . The university describes Arts College as its campus landmark: https://www.osmania.ac.in/aboutus-routemap.php .

The main Arts College uses OSM way121543671/version3 with all16 exterior vertices and its real155-degree alignment. Only its precise source outline replaces the old generic solid square; surrounding mapped roads, paths, colleges, residences and vegetation remain. The source boundary way29252760 and ten named in-boundary building outlines from the complete boundary query are retained in `osmania-university-plan.json` for audit; absence from that list is not proof a building is absent from campus. The source boundary and queried area are not a complete architectural survey.

Visual reference: https://commons.wikimedia.org/wiki/File:Arts_College,_Osmania_University.jpg and https://commons.wikimedia.org/wiki/File:OsmaniaUnivArtsCollege.JPG . New geometry represents the grey/pink stone, tall recessed pointed gateway, columns, parapet/corbel rhythm, small raised academic doorway, split stairs and shaded corridor. Exterior footprint is mapped; heights, internal courtyard, carved ornament and corridor depth are photo-informed approximations, not survey/photogrammetry. No copyrighted photo is shipped as texture. It would be incorrect to call the entire multi-square-kilometre campus photorealistically reconstructed.

Car approach: x3188.103,z-1366.926,y0, sceneYaw0.43633231299858233. Receiver offset from this frame: x0,y3.4,z-15, within the raised corridor. Car stays outdoors rather than driving up the real pedestrian stairs. A packed-city regression checks nine car-footprint samples for clear ground support.

## Prasads

Official source: https://prasadz.com/ . Exterior plan follows OSM way357057597. Main entrance alignment105.8degrees, marker x-3222.52,z-728.728,y0, sceneYaw1.2950343049797925. A source-aligned open lobby replaces the old solid generic tower/cylinder, retaining the exact concave outer footprint. The Athadu phone booth is deliberate movie scenery inside this visible lobby; it is not evidence that the booth remains in today's venue. Heights/step treatment/glazing are game approximations. Nine packed-city footprint samples at the marker are clear and ground-supported.

## Wine mart choice

Official https://tonique.in/contact-us/ lists Q By Tonique Filmnagar, shop1 plots1&2 Nandagiri Cooperative Society, with coordinate17°25′18.4″N78°24′38.4″E (17.4217778,78.4106667). This is preferable to claiming the original Road36 store is currently operational; a2024 closure was reported at that earlier site. The Filmnagar geographic address and nearby OSM service access are verified; its precise storefront entrance and interior are not surveyed. A compact14×10metre authored open storefront is placed at that geographic address, facing mapped service access, with a tightly bounded clearance footprint; its proportions are deliberately marked provisional. Do not silently bind an unrelated unnamed nearby building as the verified shop.

## Checks

`tests/v21-fixes/new-campus-world.test.ts`: actual packed-world OU/Prasads parked approaches plus finite source-aligned named render geometry, exact outer vertex counts, and no clearing of distant neighbouring blocks. These are offline physical/source checks, not browser acceptance or a claim of complete campus accuracy.


## Whole-campus context pass

The full published boundary query spans17.3962–17.4259N,78.5148–78.5413E. It contains297 OSM buildingways and452 highway/pathways intersecting the boundary. Native shipped geometry contains1429 satellite/source buildingIDs and852 roadIDs in the same boundary. These representations differ in fragmentation and coverage; counts cannot establish one-to-one completeness or accuracy. The inventory is retained at `docs/qa/osmania-campus-source-inventory-20261105.json.gz`.

Fifteen verified academic/library/hostel source points were bound by actual containment to existing native buildingIDs. Their original outline/heights/collision remain. They receive restrained institutional colours and real source nameplates rather than randomly coloured shop dressing. Six academic points not contained by a source footprint remain unbound and explicitly listed: Mathematics, EngineeringCollege, oneLawCollege label, LadiesHostel, old-admin description and ModelCareerCentre. They are not moved to unrelated buildings. The boundary also includes mapped commercial/peripheral areas: actual source businesses/181 source boards remain, while only invented generic frontage fill is suppressed. No new road geometry, guessed campus streets, or broad building deletion was introduced.

Two campus-context regressions pass: exact source/binding inventory and actual packed-tile rendering with no synthetic `f_` storefront signs inside the boundary while academic nameplates remain. This improves campus context without claiming surveyed individual architecture for every department or hostel.

## University Library correction

The existing `ou_library` recipe was a generic domed Indo-Saracenic model. The university's own library photograph (https://www.osmania.ac.in/oulwebpage/oul5.JPG ; page https://www.osmania.ac.in/oulwebpage/oulib3.html) shows a cream, flat-roofed building with tall paired entrance columns and a blue BharatRatnaDrB.R.AmbedkarLibrary sign. The new model uses the existing bound native concave footprint14567f80-c69, inherited7.3metre source height and a photo-informed columned entrance, without inventing domes. Public-entry step details remain approximate. Existing identity/anchor are retained, so no extra map marker is added.

## Arts corridor held-scene surface detail

The actual night delivery replay exposed a very plain backdrop. A direct2019 Arts courtyard/corridor photograph by iMahesh shows cream plaster behind the granite colonnade, black skirting, dark red timber frames, high square vents and granite columns: https://commons.wikimedia.org/wiki/File:Corridor_in_Ground_floor_of_OU_arts_college.jpg (CC BY-SA4.0; reference only, not used as a game texture). Official2025 Arts conference brochure corroborates the granite/pillar/lintel architectural vocabulary: https://www.osmania.ac.in/EventsConf2025/Arts%20College%20Conference%20Brochuer%20%282%29.pdf .

The existing6.6m model corridor rear wall now has shallow closed timber/glass frame surfaces, high vent details, black skirting, thin wall bands and end pilaster trim. This is a photo-informed bay arrangement, not a surveyed room/interior layout. No new traversable opening or passage was cut. Native footprint, roof, route, collision surfaces and actor/story timing are unchanged. Geometry uses existing static batches/material colours; no new texture, per-frame loop or lighting cost. Targeted source/actual entrance suites passed5/5 and campus context/library suites3/3 after this bounded addition. Actual held-frame replay recorded separately.
