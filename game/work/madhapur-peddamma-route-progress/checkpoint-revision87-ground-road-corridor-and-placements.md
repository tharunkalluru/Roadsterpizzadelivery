# Madhapur → Peddamma Gudi provisional ground-road corridor and shop placements — revision 87

This bounded result establishes a provisional map-road path from the saved Road No. 36 panorama chain and records approximate game placements for three already-observed shops. It does not complete either road side or identify a station gate.

## Corridor

Active pair remains **Madhapur → Peddamma Gudi**. The candidate centerline follows these connected existing core edges in order:

`r_56672988322_0` → `r_150567764_0` → `r_27507103133_0` → `r_16308288432_0` → `r_6188833340_0` → `r_45946481775_0` → `r_27041705642_0` → `r_22337127219_0` → `r_50590156871_0` → `r_14800565705_0`

All ten edges connect by matching directed core nodes. Each is marked `oneway: true` in the core, but its direction status is provisional; the panorama sequence follows the stored point order and does not confirm the legal one-way direction. Clipping from the Madhapur station-marker projection on `r_56672988322_0` (edge arclength 206.60 m, marker 10.31 m from that line) to the Peddamma Gudi marker projection on `r_14800565705_0` (edge arclength 81.70 m, marker 10.45 m from that line) gives **1175.28 m of existing map centerline geometry**. This is a provisional geometry length, not a surveyed or driven route distance. The station markers are provisional and are not gates.

| Order | Road edge | Directed node connection | Included centerline |
|---:|---|---|---:|
| 1 | `r_56672988322_0` | `n_54804163311` → `n_29780240753` | 72.54 m |
| 2 | `r_150567764_0` | `n_29780240753` → `n_16317153220` | 173.92 m |
| 3 | `r_27507103133_0` | `n_16317153220` → `n_15282876118` | 14.01 m |
| 4 | `r_16308288432_0` | `n_15282876118` → `n_33172308968` | 282.92 m |
| 5 | `r_6188833340_0` | `n_33172308968` → `n_21388483186` | 67.37 m |
| 6 | `r_45946481775_0` | `n_21388483186` → `n_45969528539` | 89.09 m |
| 7 | `r_27041705642_0` | `n_45969528539` → `n_45907770499` | 193.15 m |
| 8 | `r_22337127219_0` | `n_45907770499` → `n_49613878775` | 15.57 m |
| 9 | `r_50590156871_0` | `n_49613878775` → `n_22820990225` | 185.02 m |
| 10 | `r_14800565705_0` | `n_22820990225` → `n_49222206346` | 81.70 m |
| | **Raw clipped centerline total** | | **1175.28 m** |

Per-edge table values are rounded independently; the GeoJSON total uses the concatenated raw road polylines.

All 106 saved initial/middle-chain camera positions project monotonically onto this edge chain (sequence monotonic: true), at 0.03–9.10 m from a selected road edge. Of these, 105 are Jan 2025 and 1 is the Dec 2021 comparison; the older view is not used for tenancy. The latest saved endpoint pano 106 is 3.42 m from `r_14800565705_0`; the Peddamma station-approach reference pano is 3.55 m from the same edge.

Endpoint alignment remains unresolved: the Madhapur station marker is closer to another parallel edge (`r_16198530936_0`, 4.91 m) than to the camera-chain start edge (`r_56672988322_0`, 10.31 m). At Peddamma Gudi the marker is 2.00 m from `r_60916540341_0`, while the panorama-supported route edge `r_14800565705_0` is 10.45 m away. No connecting walkway, carriageway turn, or gate is inferred.

## Provisional storefront anchors

Chrome inspection of the saved Jan 2025 views at panos 049, 051 and 052 confirmed the image-left commercial row. Near pano 049, the road tangent is approximately 114° (about 122° near pano 051) and camera heading 140.38°; screen-left aligns with the left-of-travel side, matching building `frontRoadId`/`frontSide` for the Go Colors/Brooks block and the stored left-side facade geometry.

| Existing observation | Provisional game frontage | Road / side | Building | Confidence and limits |
|---|---|---|---|---|
| `obs-mp-road36-go-colors-sign-hint-20261019` | Go Colors (`survey-mp-peddamma-go-colors-20261019`) | `r_6188833340_0` / left | `b_5486d00c2a` | Medium-high sign/side, medium footprint association; low unit boundaries/entrance.
| `obs-mp-road36-brooks-sign-hint-20261019` | Brooks Shoes (`survey-mp-peddamma-brooks-20261019`) | `r_6188833340_0` / left | `b_5486d00c2a` | Medium-high sign/side, medium footprint association; low unit boundaries/entrance.
| `obs-mp-road36-canon-sign-hint-20261019` | Canon Image Square (`survey-mp-peddamma-canon-20261019`) | `r_6188833340_0` / left | `b_46e689039c` | High sign identity, medium-low building/edge association; low unit boundaries/entrance.

The storefront records use `placementStatus: "provisional"`, camera-source IDs, the current footprint-derived facade spans, ground-floor interpretation, and facade-midpoint rendering anchors. The facade bounds, widths, door centers and exact neighbor sequence are estimates; their facade and neighbor evidence arrays remain empty. The Go Colors/Fashion India duplicate anchor and Brooks/Provogue coincident frontage IDs are retained as replaced base IDs rather than deleted. No active business status is asserted.

PUMA and BISI BISI remain pending because their image-right, across-median sign views do not yet resolve a building-to-opposite-carriageway assignment. The partial SONY wordmark at pano 052 also remains pending because its unit and building anchor are not resolved. Brand Freak and other signs remain identity/context evidence only.

## Coverage and continuation

The batch imports only these three provisional placements and links them to their existing identity observations. It adds no panorama sources, no road-side reviews and no bounded reviewed ranges. Active-pair frontage coverage therefore remains **0 m / 0 sides**; strict metric-verified road coverage remains **0 m**. Both canonical sides, endpoint connectors, measured road route, complete neighbor order, opposite carriageway inventory, station gates and unobserved gaps remain open.

The next saved panorama is unchanged: `sv-mp-road36-middle-chain-20261019-055`, pano `8pQcYHVnJ078ZVszAosxIw`, at 17.434008, 78.4049499. Resume the same pair there. Do not use the nearest-station queue to reorder the active pair. Cloud Google remains stopped and untouched.

Overlay: `work/madhapur-peddamma-route-progress/provisional-ground-road-corridor-and-shop-overlays-revision87.geojson`. Batch: `data/research/batches/madhapur-peddamma-road36-provisional-corridor-placements-20261019.json`.
