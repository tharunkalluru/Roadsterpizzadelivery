# Madhapur → Peddamma Gudi bounded quick-pass reconciliation — revision 100

**Handoff status:** the available imagery has a usable first-pass record, and the reverse chain reached Madhapur pano 001. This is not a measured or fully inventoried pair. Keep the known gaps explicit; do not repeat the broad pass just to chase exact dimensions.

## What was actually viewed

- **Forward chain:** January 2025 panos 001–106 were linked and reviewed along Road No. 36, except pano 081 is a December 2021 comparison image. Forward headings are about 147° at the Madhapur opening and 140.38° on the main chain. Selected rotated/corner views include pano 064 (230.38°), pano 080 (90°), pano 094 (230.38°), and the Peddamma station-area headings in the revision 91 checkpoint.
- **Reverse-facing run:** heading 314° views cover panos 034–080, 083–087, 094–100 and 103–106; panos 101–102 were viewed at heading 44°. These are reverse-direction frames along the connected camera chain; they do not amount to continuous cross-median inspection of the far-side frontage.
- **Direct cross-median views:** heading 224° covers panos 001–033 continuously, including the pano 032–030 gap-fill. Additional cross-median checks exist at panos 046, 053, 061, 065–066, 072, 076, 079, 082, 088 and 090–093 (pano 089 at heading 270°), plus pano 016 at heading 250°. Panos 082–093 include both reverse and cross-median angles. These views are camera observations, not complete frontage windows.

The most material imagery gap is pano 081’s older capture date between the January 2025 junction views. Cross-median coverage also remains selective from panos 034–087 outside the listed checks. Metro piers, median shrubs, signs, trees and traffic obscure portions of panos 006–007 and 022–025 and several midblock frames. This records where imagery is incomplete without implying that the unviewed parts are blank.

## Duplicate reconciliation

| Candidate | Forward / reverse overlap | Quick-pass treatment |
|---|---|---|
| AUKERA | Forward panos 063–064; cross-median pano 066 | One existing provisional corner placement on building `b_6e739324f6`; reverse view corroborates it. |
| WILD WINGS / Buffalo Wings | WILD WINGS at pano 061; Buffalo Wings candidate at pano 058 | Possible same block/storefront, but the names differ. Keep the identity unresolved and add no second placement. |
| BROOKS | Forward panos 049–050; reverse pano 052 | One provisional Go Colors/Brooks row placement, not another unit. |
| CANON | Forward panos 051–052; reverse pano 053 | One Canon candidate; the shared/adjacent relationship to WOW CLICKS and BIRYANI BREAK remains unresolved. |
| Zuri Skin Clinic | Existing Madhapur approach record; repeated in opposite views at panos 002–003 | Corroborate the existing candidate; no duplicate observation/store. |
| Trisha Silks | Panos 033–029, with 032–030 filling the gap | One candidate repeated across the block, not five storefronts. |

Repeated 360 FITNESS panels, CROMA views and FASHION FACTORY views each remain one candidate. GOWRI and other pier/fence panels are advertising; RUDRA, ALCAZAR, SANDESH and VESTRO lettering is not treated as extra ground-floor tenants.

## Approximate game placements

Keep the existing provisional, footprint-backed rendering anchors from revisions 87–90: AUKERA and W for Woman on separate faces of `b_6e739324f6`; Go Colors and Brooks on `b_5486d00c2a`; Canon on nearby footprint `b_46e689039c` with lower building-edge confidence; Shaaranga on `b_ef5e4bc44a`; and Rado/Breitling on `b_c41fe871b8` with uncertain listing/road-face matches. Reverse frames corroborate AUKERA, Brooks and Canon identities but do not upgrade their geometry or side status.

For the new reverse candidates, heading-based sightlines meet nearby existing footprint candidates: Trisha Silks → `b_cb5b96d1a9`; Kurlon → `b_0341b170fd`; Apurupa Turbo → `b_d58e4d818a`; 360 FITNESS → `b_d77447ed2a`; and CROMA/FASHION FACTORY → the same broad footprint candidate `b_c9a20c769f`. These are block-level visual matches only; the stored adjacent road edges, camera angles and occlusion do not establish frontage faces or exact storefront units. Q.hub and Bombay Shirt Company remain endpoint camera-anchor candidates. No new storefront override, entrance point, canonical side or unit boundary was added.

## Gaps and recommendation

The known follow-up items are pano 081’s date break, selective cross-median coverage at panos 034–087, the Road No. 36 junction/side-street alignment, and the Madhapur/Peddamma station connectors and actual Peddamma gate. Exact doors, unit widths, floors, current tenancy, complete shop order and metric route length are additional detail work; none is established by the current evidence. Pair coverage remains **0 m / 0 sides**, and **1,175.28 m** remains provisional planning geometry.

**Recommendation:** after this handoff, start the next adjacent pair, **Peddamma Gudi → Jubilee Hills Checkpost**, with its own first pass. If this pair is revisited, make it a targeted pano 081/junction and station-connector review rather than another broad traverse. No navigation to another station was performed in this task.

## Project-write access outcome

A normal sandbox importer preflight failed with `EPERM` while creating `street-survey.json.lock`. Re-running the protected operations with `sandbox_permissions: require_escalated` and an explicit justification passed the supported auto-review approval and succeeded: revisions 98–100 were imported, batch copies and network summaries were written, and the project checkpoints were saved. The default sandbox remains read-only for project writes; there is no unresolved blocker when the approved escalation path is used. Revision 100 validation had passed with no errors (543 observations, 169 provisional storefronts, 0 verified storefronts/sides); no broad tests or deployment were run for this reconciliation.


## Revision 96 archive-artifact audit

The original immutable batch `madhapur-peddamma-reverse-opposite-middle-retail-20261019-handoff.json` was present in the authorized task workspace and has now been copied unchanged into `data/research/batches/`. The task-workspace source and project archive copy have identical SHA-256: `ea3caf32bab4348b5299795bc0bd0272dc57215c66e7aef95baef87dc68ba66a`, matching the previously recorded `ea3caf32` hash prefix. The revision 100 runtime ledger retains the applied batch receipt (`contentHash` `c0f7e3ad3476eb4052483cb1f076eda9151774ae1a19b0a6ec7e7fd3d90a60ca`, reviewed 2026-10-19), and the recovered original contains 28 sources and 3 observations. No reimport or deployment was performed.
