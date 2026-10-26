Transit and city identity improvements — 26 October 2026
======================================================

This pass extends main from `5ef2908d04bb5a5f8da52209ac4b8dfca84851de`. Existing
Roadster controls, delivery flow, unlimited flight and shopfront source records
are retained. The ten requests have the following implementation and evidence. A final visible map check caught117 campus/office address amenities; these are retained in an explicit review queue rather than published as colleges or offices.

| Request | Implemented | Limits |
| --- | --- | --- |
| Metro station names | Every one of the 57 modeled stations has exactly two exterior end boards and two inward-facing railing boards, one per platform. Duplicate roof/stair/platform name assemblies are removed. Exterior plates hang below the viaduct and toward the kerb so the deck/pillars do not hide the caption. | Road visibility was checked visually at RTC Cross Roads in both directions and by actual-mesh rays; every possible driving camera is not certified. |
| Metro service text | Both sides of every coach show the directed origin → destination, scrolling when necessary. Blue Nagole/Raidurg, Red Miyapur/L B Nagar and Green JBS Parade Ground/MG Bus Station retain official line identities. | Animated text is a game presentation, not a live transit feed. |
| Station life | Four benches per modeled station; waiting people and bounded boarding/alighting through doors tied to the actual arrival/dwell/departure. Peak/off-peak density varies. | Demand is an explicit heuristic. Three secondary interchange services have no modeled platform: Ameerpet Blue, MG Bus Station Green and Parade Grounds Blue. Transfers are disabled on those six direction/platform combinations rather than spawning people in empty space. |
| RTC dwell | Buses stop for 5–6 seconds, show people entering/exiting at the left doors, then resume their assigned service. Pose stays fixed during the stop. | This preserves the existing service coverage; it does not solve the previously documented unbound bus legs. |
| Street lamps | Shared inward-facing fixture planner aligns kerb/median/deck/mapped/ORR arms, heads and light pools. Posts use structure clearance. | This corrects the game-wide placement rule; it is not a survey of every physical Hyderabad lamp. |
| Road boards/hoardings | Road-facing exit/gantry boards use full footprint/headroom checks and kerb cantilevers where needed. Dynamic cinema canopies/counters/poster groups also require road/metro clearance; retained ground supports receive matching collision. | Source cinema façade direction and poster leases are preserved. All 13 mounted posters remain. Unsafe canopy groups are omitted at six theatres, counters at five, and one name board. See the cinema validation ledger. |
| Construction | Source-bound Uppal–Narapally work corridor: 149 road fragments, 148 unfinished piers, orange/white barriers, rebar/scaffolding and one open 4.5 m lane per carriageway at 25 km/h. A bounded IIIT Junction shoulder worksite is included. Guidance and traffic use the open lane. | Status is researched as of 26 October 2026; individual barricade positions/lane layout are game estimates. Current DLF gate diversions are not reconstructed. Superseded KBR proposals are not rendered as active sites. |
| Universities/colleges | Academic source identities appear under Education in the map and nearby-campus labels; source-bound academic building features are added where they fit. | The shipped inventory contains 1,423 college and 173 university records, not that many distinct institutions. Fresh citywide retrieval failed, so missing real institutions remain unenumerated. Interiors/campus layouts are not reconstructed. |
| Malls/cinemas/offices | 2,615 total classified source records are searchable; 679 meet architecture eligibility and 522 source buildings actually receive safe recognition features. Inorbit, Forum/Nexus, LuLu and Asian/AMB–Sarath use retained mapped polygons. Sarath and Asian share one physical model. | These are stylized exteriors, not photo-matched replicas of every building. Small/uncertain/shared listings stay map-only. Three eligible clipped buildings cannot safely fit new features. |
| Uppal Stadium | An open oval bowl with tiered seating, partial canopy, outfield, standard cricket pitch, stumps and six floodlight towers replaces the regular-place model. | Footprint is source-bound; exact seating, heights, canopy proportions and pitch bearing are illustrative. |

Sources and preserved uncertainty
---------------------------------

Official metro endpoints: [HMRL](https://hmrl.co.in/train-timings/).
Latest dated Uppal–Narapally work status: [Telangana Today, 25 October](https://telanganatoday.com/eight-years-after-launch-uppal-elevated-corridor-work-drags-on-commuters-fume).
IIIT Junction advisory: [Hyderabad Mail](https://hyderabadmail.com/iiit-junction-road-closure-extended-cyberabad-traffic-advisory/)
and [Telangana Today](https://telanganatoday.com/traffic-diversions-around-iiit-junction-dlf-road-for-90-days).
The old KBR proposal is superseded: [NDTV](https://www.ndtv.com/hyderabad-news/hyderabads-elevated-corridor-plan-to-ease-traffic-around-kbr-national-park-12144954).
Named destination source IDs, capture/version dates, owner references and limitations are retained in
[destination recognition](destination-recognition-2026-10-26.md) and the pipeline evidence JSON files.

Verification scope
------------------

The release ledger is [the transit/destination validation](playtests/2026-10-26-transit-destinations.json).
The production renderer audit covers 630 tiles, including all 290 eligible
destination tiles, with zero checked road/metro overlaps from source solids,
destination features or their roof solids. The bridge audit covers all shipped
packs. Actual loaded construction tiles and bus-width clearance are separately
checked; tile-boundary support failures disappear with their owner neighbours.

Visible browser component checks exercised real-time metro arrivals/doors,
passenger transfer, both directed service selections, peak/off-peak waiting
counts, readable station captions, a bus dwell and later terminal arrival,
night lamps/gantry, construction scenes and destination models. Those views
are explicitly isolated production components, not completed main-game trips.
Original screenshots are retained under `playtests/evidence/2026-10-26-transit-destinations/`.

Physical-phone acceptance, full city driving, exact current facades/interiors,
all secondary interchange platforms and exhaustive missing-place discovery
remain open. No new delivery completion is claimed by this release pass.

Published result
----------------

Version10 is live at [Pizza to Picture Hall](https://hyderabad-pizza-picture-hall.blithe-okapi-0017.chatgpt.site).
GitHub application commit: `59e19a24a6c90a972c8d42d0a1e4b61230686973`. All317 production files match the
tested main build byte-for-byte. A fresh live title screen loads
`index-DrNHNtuR.js` with no captured console warnings or errors. The report
contains the final630-tile audit, original screenshots, corrected category
retest and exact Site source/deployment identifiers.
