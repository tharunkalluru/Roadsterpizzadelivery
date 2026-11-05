# Real college campus corrections — 2026-11-05

## Scope and sources

Hasini remains at Nizam College, Basheerbagh (level 7). Arjun Reddy remains at Osmania Medical College, Koti (level 13). No character assets, voices, road profiles, vehicle timing or camera tuning changed.

The old Nizam landmark was a generic domed building. Its replacement follows the mapped main-building footprint and the college's peach/cream raised arched portico, flat parapet, dark shutters and blue/silver entrance gate. The gate is open so the receiver can be seen clearly.

The old OMC destination lay west of the campus and could be replaced by an unrelated nearby façade. The new destination uses the actual main academic block entrance, pale wings, tall central glazing, geometric patterned piers, portico and two open courtyards. It is not Osmania General Hospital or Sarojini Devi Hospital, both of which appear among the medical college website's homepage banners.

Primary visual references:

- https://nizamcollege.ac.in/assets/images/banner/banner-img1.jpg
- https://nizamcollege.ac.in/AboutUs/college-map.php
- https://nizamcollege.ac.in/AboutUs/contact-us.php
- https://www.omc.ac.in/gallery.php
- https://www.omc.ac.in/images/gallery/gallery-image12.jpg
- https://www.omc.ac.in/images/alumni-image1.jpg
- https://commons.wikimedia.org/wiki/File:Main_building_of_Osmania_Medical_College.jpg
- https://commons.wikimedia.org/wiki/File:Campus_layout_of_Osmania_Medical_College.jpg
- https://commons.wikimedia.org/wiki/File:File_Nizam_college.jpg

Mapped plan evidence is recorded in `src/world/college-campus-plans.json`: Nizam building way 417240852, campus way 105728936 and gate node 11118331047; OMC relation 10429489 (outer way 238285514 and inner ways 756463213/756463214), campus way 797830921. Public OSM geometry supplies footprint coordinates, not surveyed façade elevations. Gate/vertical proportions, planting and windows are photo-informed approximations. This is a closer recognizable game model, not a survey-accurate or photogrammetric reconstruction. External reference images are not shipped as game textures.

## Placement and rendering

- Dedicated campuses replace only the corresponding mapped building footprint. Surrounding city blocks remain.
- OMC courtyard holes remain open in roof geometry; collision checks retain the open drive.
- Both delivery anchors are pinned to their researched entrances. Unloaded or blocked geometry returns no placement instead of silently relocating to a generic vacant lot.
- Marker, receiver pose, handoff and story camera share the entrance orientation.
- Buildings use existing static tiled batches. No per-frame campus updates, downloaded photo textures, new dynamic lights or blur effects.

## Gameplay evidence

Development build at port 4310; low graphics. QA URLs used `qaDelivery=7` / `13`, `qaScene=1`, and `qaTouch=1` for the phone layout. Pickup was prepared with the QA button and the car was placed 12 metres outside the real marker: these are assisted preconditions, not a claim of unassisted full-level play.

From there, actual desktop W acceleration and Space braking completed both handoffs. Each reached `LEVEL_COMPLETE`, showed the existing receiver eating with the pizza box, retained the viewing scene until Next, and returned to `ROAMING` after Next. OMC was repeated at 915×412 with touch events on GO and BRAKE and also reached `LEVEL_COMPLETE`. This is browser touch-layout coverage, not a physical-phone performance result.

Evidence retained with this report:

- `college-campus-20261105/nizam-campus-final-approach.png`
- `college-campus-20261105/nizam-campus-final-handoff.png`
- `college-campus-20261105/omc-campus-final-approach.png`
- `college-campus-20261105/omc-campus-final-handoff.png`
- `college-campus-20261105/omc-campus-mobile-handoff.png`

## Checks

Campus regression tests exercise the actual packed city: exact entrance placement, rejection of a blocked entrance, source-footprint clearing, visible college labels and open courtyard roofs. Story tests use the real grounded campus marker instead of an arbitrary world-axis side. Legacy catalogue expectations increase from 192 to 193 because OMC now has its own named landmark.

The legacy expressway suite reports an existing packed-file byte-manifest mismatch (`p2_0.pack.wasm`, 697698 actual versus 705238 manifest). The same failure was reproduced with the unchanged pre-campus source commit a8646c7 against the same untouched city assets. This campus patch does not change those files or relax that assertion. Current runtime regressions and production build validation are recorded in the release result.
