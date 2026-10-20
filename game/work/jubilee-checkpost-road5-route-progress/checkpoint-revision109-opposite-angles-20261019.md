# Jubilee Hills Checkpost → Road No 5 Jubilee Hills — opposite-facing route angles, revision 109

**Status:** first-pass angle review only. The saved Road No. 5 marker imagery gap, route alignment, route distance, road sides, station gate, and frontage coverage remain unresolved. The proposed 2.2 km directions path is navigation context, not a continuous or measured frontage route.

## Actual Chrome review

In the existing connected Chrome tab, I opened opposite-facing or side-on views for the already-saved route-preview panoramas. No new browser operator or external Google imagery fetch was used. The views reviewed were:

- January 2025 Road No. 36 / Checkpost approach: `JKKJr-012CmU9M0UlZxPHw` at heading 160° and `5sv-Nuaoc1F5dp__IIVX5A` at 134.42°.
- January 2025 Mathur Road turn context: `y8-dPmaitlix7rTDHQyzoA` at 313.255°.
- January 2026 Road No. 1 / Road No. 5 approaches: `x57AX7T7jZUypbm80fauTQ` at 228.524°; `RoO_ExTkgi147Gls7Vvbsg` at 249.587° and a 310° side view; and `g7Fl11ZejwHLLmtEUlFKRw` at 294.304°.
- January 2026 Krishna Nagar Main Road context: `Zthp60eHW4zeTobWMZLLeA` at 53° with a closer 45° field of view.

These are alternate angles at previously saved camera points, not a new continuous Street View traversal. Road No. 36 frames show the elevated Metro, traffic and screened commercial facades. The Road No. 1 and No. 5 approach frames show tree cover, walls and occluded frontage. The Road No. 2 reverse view has a long pale facade and traffic; the side-facing Road No. 5 view shows a boundary wall, blue hoarding and poster panels rather than a legible shop row.

## Pending sign and facility evidence

- At Road No. 36 pano `JKKJr-012CmU9M0UlZxPHw`, the reverse-facing frame shows a blue image-right fascia with visible letters **GKB OP…**. The remainder is blocked by a Metro pier and angle. This is a partial retail-sign candidate, not a confirmed business identity or placed store.
- At pano `Zthp60eHW4zeTobWMZLLeA`, the closer view shows a broad image-right black fascia whose lettering appears to read **PAKKA NON**. Spacing and identity remain uncertain, and the raised frontage may contain multiple units. This camera is on Krishna Nagar Main Road; its connection to the Road No. 5 station route and the correct game footprint are unknown.
- **HDFC BANK** lettering is legible at pano `5sv-Nuaoc1F5dp__IIVX5A`; this is facility context, not a retail storefront. **APOLLO HOSPITALS** signage is also visible in the Road No. 36 views and is not treated as another storefront.
- The remaining reverse angles show no additional fascia legible enough to record. Traffic, piers, trees and walls obscure substantial frontage; absence from these frames is not evidence that a shop is absent.

No storefront override, game footprint, exact entry, floor, frontage boundary, canonical road side, ordered frontage, road review or metric coverage was added. The two business-sign candidates remain pending and camera-anchored. Existing provisional placements are unchanged.

## Batch, revision and validation

- Batch: `data/research/batches/jubilee-checkpost-road5-opposite-angles-20261019-b.json`
- Batch content hash: `37d2998eb975bab95a19445bc11acb2f6c134a629b8c2cbad45b12b66e165fe9`
- Imported survey revision: **109**; 8 angle-specific source records and 3 pending sign/context observations.
- `survey-network` synchronized the derived summaries. `survey-validate` passed with **0 errors**; `survey-network --check` returned `ok`.
- Current ledger: **574 observations**, **169 provisional storefronts**, **0 verified storefronts**, **0 verified sides**, **59 partial sides**, **20,493 unreviewed sides**. This batch adds evidence only; it does not change pair coverage.

## Resume pointer and blocked target

Latest reviewed available panorama: `Zthp60eHW4zeTobWMZLLeA`, 17.4296049, 78.4251397, January 2026, heading 53°:

`https://www.google.com/maps/@?api=1&map_action=pano&pano=Zthp60eHW4zeTobWMZLLeA&heading=53&pitch=0&fov=45`

The saved provider response at the provisional Road No. 5 marker (17.4300073, 78.4231908) remains **“No Street View imagery available here.”** It was not retried. Nearby pano context does not establish station access or a connector. Resume only if new usable imagery/provider coverage becomes available; do not infer a continuous route from these camera points.
