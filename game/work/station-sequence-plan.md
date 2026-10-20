# Sequential Hyderabad Metro station survey plan

Updated 2026-10-19 from the user's explicit station order. This file governs future station research: finish one adjacent station pair at a time, save a receipt for that pair, then advance along the same Metro line. Finish the line before starting another. Do not use the nearest-station road-graph queue to reorder stations.

## Active line and order

The active line is the Blue Line, following the canonical `public/world/hyd-metro/v2/core.json` shape from Raidurg toward Nagole. The station order projected onto that shape is:

1. Raidurg
2. HITEC City
3. Durgam Cheruvu
4. Madhapur
5. Peddamma Gudi
6. Jubilee Hills Checkpost
7. Road No 5 Jubilee Hills
8. Yusufguda
9. Madhura Nagar
10. Ameerpet
11. Begumpet
12. Prakash Nagar
13. Rasoolpura
14. Paradise
15. Parade Grounds
16. Secunderabad East
17. Mettuguda
18. Tarnaka
19. Habsiguda
20. NGRI
21. Stadium
22. Uppal
23. Nagole

Required sequence begins Raidurg → HITEC City → Durgam Cheruvu → Madhapur. The Durgam Cheruvu → Madhapur attempt is recorded in `work/durgam-madhapur-route-progress/checkpoint-revision73-post-range.md`; its inspected final range remains open because Street View diverges at the Road No. 36 junction, so the pair is not complete. Per the user's direction to continue with other stations, Madhapur → Peddamma Gudi is now the active next adjacent pair. Its first receipt is `work/madhapur-peddamma-route-progress/checkpoint-revision74-initial-chain.md`; the revision-75 forward Street View continuation is recorded in `work/madhapur-peddamma-route-progress/checkpoint-revision75-forward-chain.md`. A connected Jan 2025 Road No. 36 pano chain now reaches the provisional Peddamma Gudi station marker, but the metric road route, complete road-side inventory, shop order, and station gate remain unverified. Earlier-pair gaps remain open and must not be silently called complete. Continue to Nagole before starting Red or Green Line work. Station markers and line projections remain provisional evidence, not station entrances.

## Durgam Cheruvu → Madhapur checkpoint

Use the frozen 28-edge proposal in `work/durgam-madhapur-pair-route-progress.json`; its 1,640.60 m length is provisional planning geometry, not a field measurement. At survey revision 72, a coverage-only refresh retained the route geometry unchanged:

- 950.99 m of route geometry has at least one recorded observation window (57.97%).
- The side-specific observation windows union to 950.99 m LEFT and 650.51 m RIGHT; overlaps are not additive route progress.
- 650.51 m has a visual-inventory flag somewhere in the side records. This includes non-shop median/public-realm inventory and does not mean complete shop reconstruction.
- Strict metric-verified route length is 0 m.
- Full pair review and full shop reconstruction remain incomplete.

Open route ranges are listed in `work/durgam-madhapur-route-progress.json`. The known Inorbit junction alignment issue is within the 0.00–445.48 m gap; keep that alignment and the unsupported nearby Inorbit Mall Road panorama unresolved. The other open ranges are 464.48–465.46 m, 500.46–511.09 m, and 1,408.08–1,640.60 m. Do not infer continuity from endpoint cameras or pending observations.

The pre-inspection checkpoint for the single candidate range 1,408.08–1,640.60 m is `work/durgam-madhapur-route-progress/checkpoint-revision72-pre-range.md`. Existing endpoint context is close to the proposed route at source panos `sUhVuH4djDl5rg73uTmKmw` (about 2.7 m from route arclength 1,410.80 m) and `eoPBi2k4_X7NKvfTf2UWGw` (about 1.1 m from route arclength 1,608.77 m). These points support inspecting this one range; they do not establish the intervening path, frontage order, or coverage.

## Separate Miyapur → JNTU cloud reservation

Keep the cloud work separate from the local Blue-Line station pair survey. The current handoff at `/Users/tharun/Documents/Codex/2026-10-18/task-3/MIYAPUR_JNTU_CLOUD_HANDOFF.json` reserves **35 roads / 70 canonical sides**: the original 32-road scope plus the three frontage-road additions `r_4485149297_3`, `r_4485149297_4`, and `r_4485149297_5`. Do not shrink the reservation back to 32 roads or include neighboring roads. All observations remain scoped to their cloud handoff unless independently admitted through the survey importer.

The cloud reverse journey/opposite-side pass remains an independent, outstanding pass. Keep its seven documented gaps in `/Users/tharun/Documents/Codex/2026-10-18/task/library-recovery-20261019/cloud-miyapur-jntu-20261019-consolidated-handoff01.json` separate from the Durgam–Madhapur route gaps and receipts. None of those cloud gaps or route samples count toward Durgam–Madhapur coverage, and Durgam–Madhapur evidence must not consume or close the Miyapur→JNTU reservation.

## Separate Lakdikapul external pilot reservation — second-computer-01

This is an assignment reservation only, separate from the local Blue-Line station survey and from the Miyapur → JNTU cloud reservation. Assignment khairatabad-lakdi-pilot-r8306076003-3 covers road r_8306076003_3 (Lakdikapul Road), canonical left and right sides, arclength 20.00–168.60 m in stored point order. Approximate endpoints are 17.4064797, 78.4625119 → 17.4054927, 78.4634551. Exclude 0–20 m and 168.60–188.60 m, endpoint junctions, every other road/carriageway, and station connectors or gates.

Coordinator audit at revision 104 reports both sides unreviewed, no attached observations/overrides/corrections, no sources within 350 m, geometry matching handoff 102, and a disjoint cloud reservation. The pilot is assigned to second-computer-01; that external worker owns only immutable batches on its own branch. This runtime remains the sole integrator. The user relayed that the worker reported activation commit `50e23bd3b8162381623e8ea7bd617409f88bda54`, the same assignment, and frozen-hash checks passed; the worker reportedly started mapping on its own branch, but no mapping output has been received. This is external-reported status, not independently inspected or imported here. Review any future immutable batch locally before import. Do not map or claim this reservation from this thread; this record is scope metadata, not survey evidence.

## Evidence rules

Classify sources and observations separately from bounded road-side ranges. A panorama location is a camera position, not a storefront entrance. Keep unsupported sides, road alignment, metric verification, entrances, and shop order open until the evidence supports them. Do not claim a range visually inventoried unless its full visible frontage and non-shop gaps are accounted for with endpoint/intermediate and reverse views; do not claim metric verification without measured geometry evidence.

## Previous pair handoff — revision 100 quick pass

The Madhapur → Peddamma Gudi forward chain and reverse-facing / cross-median passes have a bounded first-pass reconciliation in `work/madhapur-peddamma-route-progress/checkpoint-revision100-quick-pass-reconciliation-20261019.md`. The reverse sequence reached pano 001 at the Madhapur end. The pair remains unmeasured and has 0 m / 0 sides of bounded frontage coverage; the 1,175.28 m corridor is still provisional. Pano 081’s December 2021 imagery, selective cross-median coverage, junction alignment, exact frontage details and station connectors/gate remain open. Do not treat camera anchors or existing provisional storefront overrides as verified entrances, unit bounds or canonical sides.

This pair is sufficiently recorded to proceed with the next first pass while preserving those gaps.

## Previous pair handoff — Peddamma Gudi → Jubilee Hills Checkpost, survey revision 107

This pair is saved as a first-pass quick pass with gaps, not as verified frontage or a complete station connection. The handoff is recorded in `work/peddamma-jubilee-checkpost-route-progress/checkpoint-pair-handoff-revision107-20261019.md`. Revisions 101–107 preserve the connected Road No. 36 observations and follow-up views. The latest Road No. 16 branch reaches a local glass frontage with partial blue hoarding but does not visibly connect to destination-area pano `v3rCgDlT4_ZfJGEMyqGuWw`; the station gate and public connector remain unresolved. The 17.4291573, 78.4132434 pano `3z6z90hNDQirFctke7RjyQ` is the last saved view from that pair. Do not repeat that unchanged hotspot chain without new evidence. Road sides, metric route and complete frontage inventory remain unverified.

## Previous pair handoff — Jubilee Hills Checkpost → Road No 5 Jubilee Hills, revision 109

**pairStatus:** first pass saved with gaps; not a verified complete pair. The pair handoff is `work/jubilee-checkpost-road5-route-progress/checkpoint-pair-handoff-revision109-20261019.md`; detailed route and reverse-angle receipts are `work/jubilee-checkpost-road5-route-progress/checkpoint-revision108-route-pass-a-20261019.md` and `work/jubilee-checkpost-road5-route-progress/checkpoint-revision109-opposite-angles-20261019.md`.

The saved Blue Line order was verified before advancing: Jubilee Hills Checkpost is station 6 and Road No 5 Jubilee Hills is station 7. The new pre-navigation scope and resume pointer are recorded in `work/jubilee-checkpost-road5-route-progress/checkpoint-revision107-pre-navigation-road5-20261019.md`. Start from January 2025 panorama `v3rCgDlT4_ZfJGEMyqGuWw` at 17.4282142, 78.4137412, heading 147°, a Checkpost-area context camera rather than a confirmed station gate. Core station markers are provisional at 17.428222, 78.413694 for Jubilee Hills Checkpost and 17.430049, 78.423207 for Road No 5; they do not establish entrances or the ground-road path. Continue only along visible connected public Street View within this adjacent pair, recording source-linked evidence and a synchronized pointer. Keep storefront placement, road side, order, geometry and station access provisional unless the imagery supports them. Preserve the independent Lakdikapul pilot reservation for second-computer-01 unchanged.

First route-step receipt: `work/jubilee-checkpost-road5-route-progress/checkpoint-revision108-route-pass-a-20261019.md`; survey revision 108, batch `jubilee-checkpost-road5-route-steps-20261019-a`, content hash `30e15aa8a593cae9bc0c4269d5507c20f1fff9fd1ec9bcbbe3ca006f2bb45a1f`. The same Chrome session followed visible route-preview panoramas from the Checkpost context toward Road No. 5, including a change from January 2025 to January 2026 imagery. The provisional marker at 17.4300073, 78.4231908 returned “No Street View imagery available here”; this provider-coverage gap is the current stop point, not evidence that station access is absent. Last valid panorama: `Zthp60eHW4zeTobWMZLLeA`, 17.4296049, 78.4251397, heading 210.886°. No storefront placements, entrances, canonical sides, complete frontage order or metric route coverage are verified. The alternate Road Number 17 local edge ends by a wall/parked cars and is not established as the target route.

Opposite-angle follow-up: `work/jubilee-checkpost-road5-route-progress/checkpoint-revision109-opposite-angles-20261019.md`; survey revision 109, batch `jubilee-checkpost-road5-opposite-angles-20261019-b`, content hash `37d2998eb975bab95a19445bc11acb2f6c134a629b8c2cbad45b12b66e165fe9`. Reverse/side angles were inspected in the existing Chrome tab at the already-saved Road No. 36, Mathur Road, Road No. 1, Road No. 5, Road No. 2 and Krishna Nagar panoramas. The only new business-sign leads are the partial `GKB OP…` fascia at JKKJ and uncertain `PAKKA NON` transcription at Zthp; both remain pending, camera-anchored observations with no game placement. HDFC BANK and APOLLO HOSPITALS are facility context. No frontage side/order, route continuity, station access, road review or coverage is claimed. Latest angle-resume pointer: `Zthp60eHW4zeTobWMZLLeA`, 17.4296049, 78.4251397, January 2026, heading 53° (`https://www.google.com/maps/@?api=1&map_action=pano&pano=Zthp60eHW4zeTobWMZLLeA&heading=53&pitch=0&fov=45`). The previously recorded no-imagery marker was not retried.

This pair is sufficiently recorded to continue the Blue Line sequence. Keep the exact Road No. 5 marker imagery gap and the absence of a confirmed gate/connector open; do not infer pair completion from route-preview frames.

## Active pair — Road No 5 Jubilee Hills → Yusufguda

**activePair:** Road No 5 Jubilee Hills → Yusufguda.

The stored Blue Line order confirms Road No 5 Jubilee Hills is station 7 and Yusufguda is station 8. Their provisional core markers are `st_road_no_5_jubilee_hills` at 17.430049, 78.423207 and `st_yusufguda` at 17.435112, 78.427319. Neither marker establishes a station gate or public-road connector. Scope this next quick pass to this adjacent pair only; do not enter Road No. 5 marker 17.4300073, 78.4231908, where the prior visible Street View result was “No Street View imagery available here.”

Pre-navigation scope and pointer: `work/road5-yusufguda-route-progress/checkpoint-revision110-pre-navigation-20261019.md`. Start from the already-used January 2026 nearby context panorama `Zthp60eHW4zeTobWMZLLeA`, 17.4296049, 78.4251397, heading 53°. This camera is on Krishna Nagar Main Road context near Road No. 5, not a confirmed gate and not yet linked continuously to Yusufguda. The destination has existing January 2026 station-area views `SW-AZpOmBQ67xElBv1aWbQ`, `HJ1tjD6B0TPyZfrkcBFbbw`, and `AhZGkOeNhY3BSGda5o1ePw` near 17.4350, 78.4273, but those references alone do not establish a continuous intervening route. Use only visible connected public Street View in the existing Chrome tab. Record source-linked candidates and approximate image-relative side/order where defensible; keep exact units, entrances, floors, canonical sides, metric route and complete coverage unresolved. Preserve the independent Lakdikapul pilot and blocked cloud reservation unchanged.

First route-preview segment: `work/road5-yusufguda-route-progress/checkpoint-revision110-segment-a-20261019.md`; survey revision 110, batch `road5-yusufguda-route-preview-20261019-a`, content hash `bd5f185b0e8ca21edca4a0f1a4f5220f83ad81a9d6ecef35edec8e1555ddf902`. Google Maps directions from the nearby camera suggested 1.6 km via Road Number 5, Rd Number 2 and Krishna Nagar Main Road; actual route-preview Street View reached separate January 2026 views `QoaaSSYtMe9wG0lTbeXzrg`, `X_A755v2ljJNY8HGmGYFIw`, and `TqeFWcmcoksX5tXcPM_u_g`, then reused existing pano `g7Fl11ZejwHLLmtEUlFKRw`. The next step at the Yusufguda provisional marker returned “No Street View imagery available here.” This preview is discontinuous and is not coverage or measured geometry; no new storefront identities or placements were supported. Last valid route-preview pointer: existing `g7Fl11ZejwHLLmtEUlFKRw`, 17.4302616, 78.4251374, January 2026, heading 114.30°. Do not retry the Road No. 5 marker or repeat the Yusufguda endpoint step. The exact Yusufguda gate and route connector remain unresolved.

Connected visible-arrow segment: `work/road5-yusufguda-route-progress/checkpoint-revision111-visible-arrow-segment-20261019.md`; survey revision 111, batch `road5-yusufguda-visible-arrow-segment-20261019-a`, content hash `448004208bcd5106aaf8ad0a9725205a58b10987ec4d67c8ccc444410b7e69cb`. From the already-saved Tqe Road Number 2 panorama, the existing Chrome tab followed visible Street View arrows through successive January 2026 panoramas on Venkatgiri Rd and Rd Number 8. This is a locally connected imagery segment, not proof of the station route or complete frontage. At `zRYvA3eocZjuRbayufMD7Q`, heading 270°, a clear GANESH TRADERS fascia is stored as a pending identity-only lead; no game placement was added. The last forward view `6KX5Pfs3g89xCMIbHGldow` is at 17.4324397, 78.4215065. Parked trucks obstructed the immediate view and no further forward navigation arrow was identifiable; keep the pair active with that pointer. No prior unavailable station marker was retried, and all route, gate, side, frontage-order and metric gaps remain open.

### Revision 112 corridor follow-up — 2026-10-20

The new receipt is `work/road5-yusufguda-route-progress/checkpoint-revision112-road5-road2-corridor-20261020.md`. Google Maps directions between the stored station markers show 1.4 km / 3 min via Rd Number 2 and Krishna Nagar Main Rd; the directed core-road candidate is 1,443.3 m between nearest nodes, with marker snaps of 62.5 m and 28.9 m outside that edge total. These agree on a provisional corridor family, not an exact ground route or measured length.

In the existing Chrome tab, visible arrows now connect saved pano `X_A755v2ljJNY8HGmGYFIw` on Road Number 5 through `CUXPz4fyO2sxYBlCuyVbMg`, `wcqFkJkyK9dxUXLHQZMl4Q`, the new Rd Number 2 cameras, saved `TqeFWcmcoksX5tXcPM_u_g`, and one geometry-aligned step to `a8oHkcsNWTj8JES7u9ZS8A`. The new `ZERO INTERIORS` sign at Jlc is pending identity only; no game placement was added. The marker-to-X_A connection and the route onward from a8 remain open. At a8 heading 90°, I could not identify an eastbound visible arrow that matches the Maps route; do not continue the previous uncertain Venkatgiri/Rd Number 8 branch as the station route.

Imported batch `road5-yusufguda-road2-corridor-segment-20261020-a` at revision 112 (SHA-256 `6eea355b9a8e617609c82d3df00722c610e538799afe37d7fb2402dbf536221d`). `survey-validate` passed with 0 errors and `survey-network --check` returned `ok`; ledger is 806 sources, 581 observations, 169 provisional storefronts, 0 verified storefronts/sides and 59 partial sides. Pair status remains active with gaps. Resume at `https://www.google.com/maps/@?api=1&map_action=pano&pano=a8oHkcsNWTj8JES7u9ZS8A&heading=90&pitch=0&fov=85`.

## Receiving coordinator bounded continuation — 2026-10-20T03:04:38Z

Full takeover is CLAIMED by second-computer-01; outgoing owners quiescent. The existing RoadNo5→Yusufguda pair remains current, with all saved marker/a8/unconfirmedbranch/route gaps. A new explicitly claimed interior slice `road5-yusufguda-road2-r15543570465-0` covers only r_15543570465_0 canonical left/right8.00–27.26m at the separate saved g7Fl anchor. Claim: `docs/handoff/claims/road5-yusufguda-road2-r15543570465-0-20261020.md`. This is a declared direct source jump, not continuity from a8, not a station-pair advance or pilot extension. Publish/verify the unique claim before mapping. The retained RedLine Lakdikapul pilot remains evidence-blocked;Miyapur–JNTU remains reserved/provider-blocked. No queue-driven station reordering, ownership override or completion promotion.

2026-10-20T03:19:19Z: sameRoadNo5→Yusufguda pair, boundedRoadNo2 assignment batch001 admittedat117 (sixpendingcontexts,0qualifiedmetres), latest `game/work/road5-yusufguda-road2-r15543570465-0/checkpoint-20261020-startup-and-batch001.md` / `docs/handoff/reviews/second-computer-01-road2-batch001-import-117.md`. No station advancement or a8route-gapclosure. Both8.00–27.26m sides remain unreviewed; boundary stopvDWU23.658229m. Dec2021 offereduninspected remains a bounded evidenceoption after actualmetadata/projectioncheck; otherreservations unchanged.

2026-10-20T04:00:15Z: same RoadNo5→Yusufguda bounded assignment, batch002 admitted at118. December2021 option inspected, two new pending contexts; no station advancement or a8 link closure. Latest `game/work/road5-yusufguda-road2-r15543570465-0/checkpoint-20261020-dated-gap-review.md` / `docs/handoff/reviews/second-computer-01-road2-batch002-import-118.md`. Same8.00–27.26m sides unreviewed; forward stopvDWU23.658229m unchanged.

## Current collection: central Road No.2 bounded interior

Updated 2026-10-20T05:23:58Z. The plan `docs/handoff/claims/road5-yusufguda-road2-r63797909905-0-plan-20261020.md` was published at `57b4c09d53c0271d808e8185e062034fc3822fed` before this reservation change. Receiving coordinator second-computer-01 activates `road5-yusufguda-road2-r63797909905-0` on `worker/second-computer-01/road5-yusufguda-road2-r63797909905-0`, ONLY r_63797909905_0 canonical left/right closed10.00–62.00m (52.00m per side). Exclude endpoint buffers/junctions, other roads/carriageways, all station gates/connectors and a8/unconfirmed branch. Same Road No.5→Yusufguda pair; no station advance.

Activation file `docs/handoff/claims/road5-yusufguda-road2-r63797909905-0-activation-20261020.md` resolves the exact first-addition commit, which must be pushed/read back before an isolated worker checkout and startup report. Start at saved central Jlc34.503m after actual metadata/nearest-road verification; then new side sectors at other saved in-range cameras if useful. Existing ZERO INTERIORS identity-only observation is not another premise. All canonical geometry/width/direction remains provisional.

Previous r_15543570465_0 lease stays ACTIVE/evidence-limited with eight pending contexts, unchanged bounds/owner/gaps. Lakdikapul31contexts and Miyapur–JNTU35road/provider block preserved; all former owners quiescent. Survey118/five frozen hashes unchanged. No imagery or new batch in this activation; publishing parked.

2026-10-20T05:30:17Z: same Road No.5→Yusufguda pair; central bounded batch 001 admitted at survey 119, 6 total new pending contexts, zero qualified coverage. No station advancement, a8 link closure or protected reservation change. Latest `game/work/road5-yusufguda-road2-r63797909905-0/checkpoint-20261020-startup-and-batch001.md` / `docs/handoff/reviews/second-computer-01-central-batch001-import-119.md`.

2026-10-20T05:36:06Z: same Road No.5→Yusufguda pair; central bounded batch 002 admitted at survey 120, 10 total new pending contexts, zero qualified coverage. No station advancement, a8 link closure or protected reservation change. Latest `game/work/road5-yusufguda-road2-r63797909905-0/checkpoint-20261020-batch002.md` / `docs/handoff/reviews/second-computer-01-central-batch002-import-120.md`.

2026-10-20T05:39:41Z: same Road No.5→Yusufguda pair; central bounded batch 003 admitted at survey 121, 11 total new pending contexts, zero qualified coverage. No station advancement, a8 link closure or protected reservation change. Latest `game/work/road5-yusufguda-road2-r63797909905-0/checkpoint-20261020-batch003-official-sources.md` / `docs/handoff/reviews/second-computer-01-central-batch003-import-121.md`.

2026-10-20T05:49:48Z: same Road No.5→Yusufguda pair. Central batch 004 admitted at 122, 12 total new pending observations; no qualified coverage, station advancement, a8/marker gap closure or protected reservation change. Latest `game/work/road5-yusufguda-road2-r63797909905-0/checkpoint-20261020-batch004-place-corroboration.md` / `docs/handoff/reviews/second-computer-01-central-batch004-import-122.md`.

2026-10-20T05:54:51Z: same Road No.5→Yusufguda pair, central batch 005 at 123, 16 pending observations/zero qualified coverage. No station advance or a8/marker closure; all other leases unchanged. Latest `game/work/road5-yusufguda-road2-r63797909905-0/checkpoint-20261020-batch005-dated-access.md` / `docs/handoff/reviews/second-computer-01-central-batch005-import-123.md`.

2026-10-20T06:03:08Z: same Road No.5→Yusufguda pair, central batch 006 at 124, 21 pending observations/zero qualified coverage. No station advance/a8 or marker gap closure/protected lease change. Latest `game/work/road5-yusufguda-road2-r63797909905-0/checkpoint-20261020-batch006-historical-gaps.md` / `docs/handoff/reviews/second-computer-01-central-batch006-import-124.md`.
