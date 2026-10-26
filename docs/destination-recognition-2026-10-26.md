Destination recognition, 26 October 2026
======================================

The complete shipped pack inventory now has 2,615 classified name/building
records: 1,423 college, 173 university, 442 mall, 360 cinema and 217 office
records. These are source listing/building records, **not counts of distinct
real institutions or certified current occupants**. Repeated campus buildings
and branches retain distinct source identities. All are available to the map;
nearby duplicate labels can be clustered by the map without deleting records.

679 records qualify for bounded architectural recognition: 31 university,
240 college, 163 mall, 164 cinema and 81 office records. Confidence, footprint
area and mixed-use upper-floor checks keep 1,936 uncertain/small/shared records
in the map/review inventory instead of promoting them into whole campuses or
malls. Engineering repair works, lecture/operating theatres and unrelated
Mallikarjuna place names are explicitly excluded by tested rules.
The final lexical review also removes five map-only commercial/listing names:
University Connect Overseas, New College Book Centre, College Consultants,
College Consult and Facebook Marketing University. These narrow name rules
do not remove real colleges merely because a longer name mentions consulting.

A subsequent production-map review removes 117 clear academic/office category
false positives: amenities, commercial services and address references such as
university-road diagnostics, ATMs, mosques, police/metro/bus stops, canteens,
company restrooms/lifts and hotel listings. They remain in the explicit review
queue, with original IDs, names, board/building bindings, source URLs and
rejection reasons; the complete prior records are preserved in
`pipeline/evidence/destination-category-review-2026-10-26.json`. This removes
28 formerly eligible architecture records and 21 source building IDs. Genuine
pharmacy colleges, theological/junior colleges, staff-training colleges,
academic departments and admissions offices have positive regression cases.

The architecture layer retains the exact shipped building ID, footprint and
existing board edge. Academic porticos/classroom bays, layered retail glazing,
cinema marquees and corporate fins/crowns distinguish the typologies. Heights
and facade treatments remain stylized; the existing board edge is an inherited
inference, not proof of a real entrance. Every new body checks the transport
clearance volume and neighbouring footprints; roofs also register matching
solid/support geometry. Original shopfront records and source packs are not
rewritten. Source polygons/concavities remain authoritative.

Five source-bound hero models
----------------------------

| Destination | Exact source binding | Result and limit |
| --- | --- | --- |
| Inorbit Cyberabad | [OSM w68871414](https://www.openstreetmap.org/way/68871414), [owner](https://www.inorbit.in/inorbit-mall-cyberabad) | The inherited rectangle becomes the original concave/curved plan with layered retail facade and name treatment. Facade materials and entrance treatment remain illustrative. |
| Nexus Hyderabad, formerly Forum | [OSM w311388388](https://www.openstreetmap.org/way/311388388), [owner](https://hyderabad.nexusmalls.com/) | Stable `forum` ID retained; original mapped outline and five-level retail rhythm replace the generic box. |
| LuLu Hyderabad | [OSM w880054935](https://www.openstreetmap.org/way/880054935), [owner](https://www.hyderabad.lulumall.in/about-us/) | Source-bound retail mass with six-level facade vocabulary. Internal shops, parking levels and cinema interiors are not reconstructed. |
| Asian AMB / Sarath City Capital Mall | [OSM w574673965](https://www.openstreetmap.org/way/574673965), contained AMB point n6771713703, [owner tenant directory](https://sarathcitycapitalmall.com/amb-cinemas/) and [operator](https://www.asiancinemas.in/) | New stable `asian_amb` catalogue ID. Named mall polygon plus contained named cinema point is an explicit identity binding; no nearest-building fallback. |
| Rajiv Gandhi International Cricket Stadium, Uppal | [OSM w839364278](https://www.openstreetmap.org/way/839364278), [HCA](https://hycricket.org/stadium.html) | Open seating bowl, tiered stands, cricket outfield/pitch, partial canopy and six floodlight towers. The source site sets location/extent; seating row count, canopy proportions and vertical dimensions are illustrative. |

The pitch uses the standard [MCC Law 6](https://www.lords.org/MCC/The-Laws-of-Cricket/The-pitch)
20.12 m × 3.05 m dimensions. Its particular bearing within this stadium is not
claimed to be surveyed. HCA's dated capacity descriptions are not presented as
a current counted seating capacity.

Hero clear zones follow their exact source polygons. Road/metro conflicts trim
the rendered body and its collider together; individual facade/arrival parts
also require clearance. All previous 191 landmark IDs remain, with the Asian
addition bringing the shared catalogue to 192 **place identities**, not 192
different physical models. The original `sarath_city` ID is now an explicit
map alias of `asian_amb` at the same source-bound anchor. Only the canonical
Asian/Sarath owner draws this shared mall body, roof support and exact polygon
clear zone. The duplicate inherited Sarath cube/rectangular clear is removed.

Evidence, reproducibility and remaining gaps
-------------------------------------------

- `pipeline/destination_inventory.py --write` reads all shipped packs and emits
  `destination-data.ts` plus the complete source-ID/review ledger. It writes no
  city pack, board order or saved game state.
- `pipeline/destination_hero_sources.py` regenerates the exact named source
  plans from retained OSM evidence and the original cached API XML.
- `pipeline/evidence/destination-hero-source-2026-10-26.json` retains original
  map IDs, versions, timestamps, coordinates, official URLs and uncertainty.
- The attempted fresh citywide Overpass inventory returned HTTP 502 on the
  primary server and timed out on the secondary. Requests were serialized and
  verified TLS remained enabled. No incomplete response was applied; this pass
  does not claim to enumerate every institution missing from the shipped data.
- Recognition is a scalable improvement across the eligible shipped inventory,
  not 679 photo-matched reconstructions. Low-confidence source associations,
  exact current facades, entrance assignments, interiors and detailed campus
  layouts still need individual evidence review.

`tools/destination-regressions.mjs` covers all runtime source building/board IDs,
false-positive exclusions, geometry and clearance, exact hero vertices,
upward roof support, six stadium floodlight towers, open playing field and
academic-only proximity dwell/re-entry. The development-only
`destination-review.html` renders production models/source tiles with explicit
source IDs. Static component views and successful builds are not driving or
delivery verification.

Actual source/render audit
--------------------------

The reproducible `tools/building-render-audit.mjs` pass covers 630 tiles,
including all 290 eligible destination tiles. It observes the production
decorator in a temporary offline bundle, without changing application files.
Of 544 eligible source building IDs, 525 bodies survive existing clear zones
and 522 receive visible recognition features across 528 surviving fragments.
The 19 omitted source bodies are listed individually in
`docs/playtests/2026-10-26-destination-render-audit.json`; the map identities
remain available, and several of these sites have a separate hero model.

53 destination source bodies require transport clipping. Three of those
survive but cannot safely fit any candidate architecture part: Lords Institute
of Engineering and Technology, Cyber Gateway and Tapasya College of Design &
Visual Arts, Narayanguda. They keep their source geometry/name; no replacement
facade edge or invented footprint bypasses the clearance checks. The remaining
eligible bodies produce 7,787 visible features and 494 matching rooftop solids;
9,194 proposed features are conservatively rejected by the source-footprint,
neighbour or transport-volume checks.

The independent intersection test finds zero overlaps between source/destination
solids or actual destination feature boxes and 1,830,042 rendered car-road
triangles / 10,169 major metro structural boxes. All 652,807 original building
records and 130,431 board records read by the sweep remain unchanged. Normal
quality RTC/IKEA probes also show no room/tank/rebar overlap. The shared
Sarath/Asian mall adds nine indexed source-body/canopy pieces with zero
road/metro intersections; its alias adds zero bodies or colliders. Application
source hashes stay unchanged throughout the final audit. These results cover
the documented geometry oracle, not physical-phone performance, real facade
accuracy, other hero-to-transport mesh intersections or completed delivery gameplay.
