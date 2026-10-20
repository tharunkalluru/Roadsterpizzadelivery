# Road No 5 Jubilee Hills → Yusufguda — provisional Road No. 2 corridor and visible-arrow segment, revision 112

**Pair status:** first pass remains active with gaps. This receipt establishes a defensible provisional corridor family and a connected Road Number 5 → Rd Number 2 imagery segment. It does not verify the station-to-station road, station gates, a continuous route to Yusufguda, route length, frontage coverage, storefront placement, or canonical sides.

## Corridor basis

The Blue Line order remains Road No 5 Jubilee Hills (station 7) → Yusufguda (station 8). Their provisional core markers are 17.430049, 78.423207 and 17.435112, 78.427319. Neither marker proves a gate or public connector.

Google Maps driving directions opened on 2026-10-20 from those coordinates displayed **1.4 km / 3 min via Rd Number 2 and Krishna Nagar Main Rd**. A second directions view from the Road Number 2 `a8o` camera coordinate to the Yusufguda marker displayed **1.1 km / 2 min via the same named roads**. Both are route-planning context, not measured geometry. Their local route line, the named road family and the core road graph agree on a provisional candidate corridor.

A directed shortest-path query over the current core road network gives **1,443.3 m between the nearest road nodes**. The selected nodes are 62.5 m from the Road No 5 marker and 28.9 m from the Yusufguda marker, so those snaps are not included in the edge total and do not prove the station connectors. The candidate edge sequence is an unnamed local connector → Road No. 7 → Road Number 5 → a short unnamed connector → Rd Number 2 (`r_63797909905_0`, `r_44631118593_0`, `r_36912718420_0`, `r_4755815917_0`, `r_61490614649_0`, `r_4318374048_0`) → an unnamed link and Labour Adda Rd → Yousufguda Main Road (`r_10499154543_0`, `r_45657515376_0`). All of this remains provisional planning geometry, not field measurement or a verified ground route.

## Actual Street View navigation

In the existing Chrome Google Maps tab, I resumed the already-saved January 2026 Road Number 5 pano `X_A755v2ljJNY8HGmGYFIw` at 17.430628, 78.4210081, heading 267.43988°. I followed visible roadway arrows from it through this connected sequence:

`X_A755v2ljJNY8HGmGYFIw` → `CUXPz4fyO2sxYBlCuyVbMg` → `wcqFkJkyK9dxUXLHQZMl4Q` → `rAcziqO_Viw4xf2njV1Emg` → `zHV4L6pXMiMZq4rA5ILirw` → `EQAPW3ta-MkMW_B188KXwQ` → `JlcXKkzbnWgJAS9VtNg_Qw` → `vQXGB_oADHNV9NDMrkViaw` → `TqeFWcmcoksX5tXcPM_u_g` → `a8oHkcsNWTj8JES7u9ZS8A`.

All frames are dated January 2026. The X_A/CUXP/wcq views are labeled Road Number 5; the successive rAc through Tqe views are labeled 5/61 Rd Number 2. The arrow from Tqe to `a8o` is supported as the final local step on the mapped `r_63797909905_0` Road Number 2 segment. The later Venkatgiri/Rd Number 8 chain is still unconfirmed against the station route and is not counted as corridor continuation here.

At pano `JlcXKkzbnWgJAS9VtNg_Qw`, heading 20°, the image-right facade shows a legible **ZERO INTERIORS** sign. It is saved as a pending identity-only observation. The panorama is a camera anchor, not an entrance; exact unit, frontage, side, floor, order, current tenancy and placement remain unknown. No other new business identity was clear enough to record, and no storefront override was added.

## Stop point and remaining gaps

At `a8oHkcsNWTj8JES7u9ZS8A`, I inspected an east-facing angle (heading 90°) because core geometry and Maps directions place the onward candidate on Rd Number 2 toward Krishna Nagar Main Rd. That view shows a junction frontage and boundary wall, but no visible arrow that I could identify along the eastbound candidate. The known heading-26 arrow goes onto the Venkatgiri-labeled branch from the earlier segment; following it farther would repeat the unconfirmed Road No. 8 sidebranch, so I stopped at the junction. This is a local route-link ambiguity, not a claim that Street View imagery is unavailable along the rest of the road.

The connected chain starts from the earlier route-preview X_A anchor; the intervening station-marker-to-X_A approach remains unlinked. The onward link from a8 toward Krishna Nagar Main Rd and Yusufguda remains open. The exact Yusufguda gate/connector, station access, road alignment, metric length, both canonical sides, shop order, full frontage inventory, and bounded coverage remain unverified. Neither the previously unavailable Road No. 5 marker nor the Yusufguda endpoint was retried in Street View.

## Batch, import and validation

- Immutable batch: `data/research/batches/road5-yusufguda-road2-corridor-segment-20261020-a.json`
- Imported survey revision: **112**; batch `road5-yusufguda-road2-corridor-segment-20261020-a`; content hash `6eea355b9a8e617609c82d3df00722c610e538799afe37d7fb2402dbf536221d`.
- Batch adds 10 source records: 7 newly reached January 2026 pano anchors, one new a8 heading-90 angle, and 2 Google Maps directions references. It adds 3 pending observations (connected corridor context, ZERO INTERIORS identity, and the eastbound link gap). No storefront override, road review, side claim or coverage interval was added.
- `survey-validate` passed with **0 errors**. `survey-network --check` returned **ok** after refreshing the derived summaries.
- Ledger after import: **806 sources**, **581 observations**, **169 provisional storefronts**, **0 verified storefronts**, **0 verified sides**, **59 partial sides**. The added evidence does not change pair coverage.

## Resume pointer

Leave the pair active at the eastbound check angle of pano `a8oHkcsNWTj8JES7u9ZS8A`, 17.4312441, 78.4210728, January 2026, heading 90°:

`https://www.google.com/maps/@?api=1&map_action=pano&pano=a8oHkcsNWTj8JES7u9ZS8A&heading=90&pitch=0&fov=85`

Next, resolve the visible-arrow connection from this Road Number 2 geometry to the Maps route via Krishna Nagar Main Rd. Continue only when a public arrow can be matched to that mapped path; do not treat the Venkatgiri/Rd Number 8 branch as the connection without new evidence.
