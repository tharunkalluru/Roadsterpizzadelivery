# Pilot batches001–004: evidence review and remaining-gap checkpoint

Audited 2026-10-20T02:11:23Z by second-computer-01, the CLAIMED receiving coordinator/single integrator. This is a repository, record, source-ledger and gap audit. No new imagery was opened, no UI navigation occurred, and no independent second image review is claimed.

## Exact authority and unchanged runtime

Coordinator audit base: `aead848c01f92a1c4cd3318c7ee650d1274b2791`, branch `handoff/parallel-mapping-2026-10-19`; fetched remote matched. Worker head `23cb04810b2643f6c9c4147cc648b29e6184406a`, existing branch `worker/second-computer-01/khairatabad-lakdi-pilot-r8306076003-3`; remote matched. Original activation `50e23bd3b8162381623e8ea7bd617409f88bda54`; frozen predecessor `7145ba2b954c2ec01c67e902a44e45c6fc5d91a4`; original handover `882b13f0a9079c14407ea872800863d08c7b63b7`; receiving claim `ee683f5fe4713e700e2887e175545f84726ef256`. Outgoing account/owners remain QUIESCENT; no new identity, writer, ownership transfer or assignment.

Assignment `khairatabad-lakdi-pilot-r8306076003-3` remains ACTIVE for second-computer-01. ONLY Lakdikapul Road `r_8306076003_3`, canonical left/right closed[20.00,168.60]m in stored-point order. Each assigned side is148.60m; total297.20side-metres. Exclude endpoint buffers/junctions, branches, every other road/carriageway and station gates/connectors. Access faces and uncertain facade extents remain omitted. The entire Khairatabad–Lakdi pair is not activated.

Survey stays116, hyd-metro/2.0.0:837sources/612observations/169provisional storefronts,0verified storefronts/sides globally. SHA256 `f925e617373b9694ecad96a0157fb053adbf9018f57e4b2fcc7011d874d85521`. All five SNAPSHOT hashes reverified. Audit changes only documentation/coordination; no reimport, revision increment, runtime/game data, geometry, archive, lockfile, queue or coverage change.

## Immutable admission audit

| Batch | Sources / pending observations | Documented admission revision | Exact receipt count | Recomputed canonical hash |
|---|---:|---:|---:|---|
| 001 | 2 / 2 | 113 | 1 | `8367814cde80fd0f11911d8c778740396135ad2d2233dbff4ab481c85d7841e1` |
| 002 | 4 / 4 | 114 | 1 | `568f0850dbc4e6a107283774592d24a0e404eab1db30ee6391ea02f4a6cf5cc8` |
| 003 | 1 / 1 | 115 | 1 | `d6cf9f695107874b0a9433ee7ac28ead637de040c99813569acbd1d62b573f7f` |
| 004 | 24 / 24 | 116 | 1 | `3767c47258b6097948d8f5a679dce571b811c8db86bfe78ad780683fe989a4cb` |

All31source IDs and31observation IDs occur exactly once in live116 and equal the canonical content of their immutable batches. All31(pano,heading,capture-date) signatures are unique against the live survey. Every observation is pending on the assigned road, with no storefrontOverrideId. No batch contains storefrontOverrides, corrections, suppressions, retractions or roadReviews. No raw imagery is redistributed; all31sources are reference_only.

There are15distinct cameras,30side-facing context views (15per side) and1forward context. QMjB appears once in003at138degrees and twice in004at51/231degrees; these are distinct angular records, not duplicate imports. The003failed side requests were never admitted as imagery;004contains the later actually observed views. Identical-source content is not imported again during this audit. File SHA256values, exactsource IDs, headings, projection checks and gap ledger are in [docs/handoff/reviews/second-computer-01-pilot-gap-audit-116.json](../../../docs/handoff/reviews/second-computer-01-pilot-gap-audit-116.json), SHA256 `4c65a9b749eef9812de9f2094c78d7dc794ea2a57180fccdfc936029fcc6eb9f`.

## What is accepted and what remains unqualified

Accepted here means retained dated evidence records only. It does not mean accepted premise mapping. For THIS pilot, live road-review status is **left unreviewed / right unreviewed**; reviewedRanges absent; provisional/verified storefront overrides0; exact entrances0; reviewed side-metres0; visually inventoried side-metres0; verified side-metres0. All148.60m per side remains unqualified for gap-free inventory/verified coverage. Nothing qualifies as a fully mapped playable zone.

`game/data/research/batches/README.md` requires actual endpoint/intermediate and reverse-angle review plus every visible unit/floor, unresolved/hidden operator and non-shop gap before allFrontagesRecorded=true. The types explicitly separate visual inventory from measured placement. `streetSurvey.ts` computes coverage from bounded reviewedRanges; observation counts and camera travel do not create it. A partial/verified side needs evidence ranges; complete sequences require verified placements; full verified side requires gap-free complete evidence over its whole canonical length. Because the assigned interior excludes the full road's endpoint buffers/junctions, this assignment cannot by itself certify the entire188.60m road side. Exact measured dimensions, current tenancy, safe access and playable connectivity cannot be inferred from these historical views. None is promoted in this audit.

## Camera anchors and remaining gaps

All admitted capture dates are **November2021**. Batch001 observed/reviewed2026-10-19;002–0042026-10-20. The outside locator `1fe1afaU42WEtPPcstiEIA` at approximately16.03249m/April2026 is excluded and absent from batch evidence; the date break cannot establish continuous or current tenancy.

Canonical projection was independently recomputed with WGS84 origin17.4146,78.5484 and the committed road. All15camera points lie within the lease and have this road as nearest; lateral distances are provisional map alignment, not entrance locations or measured setbacks.

| Pano anchor | Projected along m | Lateral m | Actual admitted headings |
|---|---:|---:|---|
| `S76aL2Sv9OLkf6WqmLbU1Q` | 25.978412 | 2.348420 | 48, 228 |
| `1PBg5J5YtEBKCWHrJsU_jw` | 38.828271 | 2.187702 | 43, 223 |
| `o-vaNpcgphoMVn379vda1w` | 48.814775 | 1.958046 | 46, 226 |
| `QMjBEf_gY6kDB97EYaVM4Q` | 58.058406 | 2.298697 | 138, 51, 231 |
| `Y59qzZVpzqHRnne4tb3jew` | 67.187996 | 2.903860 | 51, 231 |
| `xiztE-Rbni-cvnz5I-uy3A` | 77.052032 | 2.798709 | 51, 231 |
| `Rj0cRGl5yNaKkGo91g6e3g` | 85.848572 | 2.646858 | 51, 231 |
| `2awrXb19OUAb178IswEahg` | 95.954724 | 2.837821 | 51, 231 |
| `rMW-R1MAZ5rcCQhhwiGsJQ` | 106.718772 | 3.323927 | 48, 228 |
| `-aB4UQcZE0eynNzym7vN_g` | 114.340077 | 3.670933 | 48, 228 |
| `KGQW7mWa7fGew9B-r4DP1A` | 122.324535 | 3.991381 | 48, 228 |
| `MmB9Dsus6dXfK1hgtm6PkQ` | 131.744023 | 4.235698 | 48, 228 |
| `Hdp8DEocf-1pqu68d4PGMA` | 146.454077 | 4.436974 | 48, 228 |
| `G6CFJgLm22hgY0zrPIIaQw` | 157.449236 | 4.049914 | 48, 228 |
| `dEjZp5gMqbt9o7EBasmOXw` | 168.102920 | 4.127228 | 48, 228 |

First anchor25.978411567m leaves the start interval[20.00,25.978411567] without bounded inventory:5.978411567m per side. Final anchor168.102920258m leaves the tail[168.102920258,168.60]:0.497079742m per side. Images can look beyond their camera point, so these numbers locate inventory gaps, not proof that every pixel there is unseen. All14inter-camera spacings are listed in the JSON; largest14.710054672m between MmB9 and Hdp8. These are camera spacings, not quantified unseen/observed frontage lengths; no inter-camera interval is accepted as gap-free. Occlusion extent is unknown and cannot be measured from these notes.

- **start-boundary-and-alignment** (left, right; anchors: `S76aL2Sv9OLkf6WqmLbU1Q`): First admitted camera25.978411567m;20.00–25.978411567m has no bounded inventory. Earlier locator at16.03249m/April2026 is outside lease and excluded. First sector geometry/occlusion remains provisional. Next evidence: Re-examine existing in-lease S76a views and reverse angles with current visible date/alignment. No navigation to excluded locator and no inference of unseen start frontage. Metric extent unknown; no frontage range assigned.

- **left-median-pier-and-far-carriageway** (left; anchors: all relevant cameras in the table): Traffic, supports and dense planting hide portions; distant signs and business rows across separate carriageway are excluded. No proof that whole assigned left edge is gap-free non-shop frontage. Next evidence: Use only existing in-lease anchors to resolve near-edge visible boundaries; retain hidden portions, exact geometry and other-carriageway exclusions. No promotion from absence of a mapped merchant. Metric extent unknown; no frontage range assigned.

- **right-vegetation-walls-and-utilities** (right; anchors: all relevant cameras in the table): Foliage, shade, wall, planters, poles and equipment conceal property details. Advertising and institutional signs do not establish tenant, floor, door or frontage extent. Next evidence: Target visible alternate/reverse views of same in-lease anchors if useful. Record actual visible units/non-shop gaps; unresolved hidden areas remain pending. Metric extent unknown; no frontage range assigned.

- **right-blur-Rj0c** (right; anchors: `Rj0cRGl5yNaKkGo91g6e3g`): Large provider blur conceals central/right detail at camera85.848571769m. Next evidence: Ordinary visible alternate angles only if they add new evidence; preserve blur gap. No hidden endpoint/asset retrieval or inference. Metric extent unknown; no frontage range assigned.

- **left-blur-MmB9** (left; anchors: `MmB9Dsus6dXfK1hgtm6PkQ`): Substantial provider blur conceals left/central detail at camera131.744022665m. Next evidence: Ordinary visible alternate angles only if useful; leave concealed details unknown. Metric extent unknown; no frontage range assigned.

- **access-faces-and-barrier-occlusion** (right; anchors: `Y59qzZVpzqHRnne4tb3jew`, `xiztE-Rbni-cvnz5I-uy3A`, `2awrXb19OUAb178IswEahg`, `rMW-R1MAZ5rcCQhhwiGsJQ`, `-aB4UQcZE0eynNzym7vN_g`, `KGQW7mWa7fGew9B-r4DP1A`): Access faces/openings, steps and gates excluded; barriers/vehicles hide curb and wall. No access/connector or route claim exists. Next evidence: Keep exclusions; focus any allowed evidence review on assigned near-edge non-access context. Station gates/connectors remain out of scope. Metric extent unknown; no frontage range assigned.

- **parked-vehicle-and-sign-occlusion** (right; anchors: `KGQW7mWa7fGew9B-r4DP1A`, `MmB9Dsus6dXfK1hgtm6PkQ`, `Hdp8DEocf-1pqu68d4PGMA`): Vehicles and foliage/shadow conceal curb/property portions; incomplete sign text is not an operator identity. Next evidence: Review only supported visible angles at known in-lease cameras; no transcription guesses or reconstructed hidden units. Metric extent unknown; no frontage range assigned.

- **end-boundary-and-extent** (left, right; anchors: `dEjZp5gMqbt9o7EBasmOXw`): Final camera168.102920258m leaves0.497079742m to168.60m. Median opening/junction and hospital facade/access extents may span beyond limit; excluded from inventory. Next evidence: No forward navigation. Use known fixed in-bounds images for context only; without bounded evidence, retain end-tail gap and omit uncertain facade/access extent. Metric extent unknown; no frontage range assigned.

- **geometry-currentness-and-playability** (left, right; anchors: all relevant cameras in the table): All admitted images November2021. Camera coordinates and canonical road are provisional; no dimensions, entrance coordinates, floors/neighbours, traffic geometry or source-supported game job access has been accepted. Next evidence: Obtain evidence required by schema/qualification process within scope before geometry/placement/coverage changes. Do not claim current tenancy or a complete playable zone. Metric extent unknown; no frontage range assigned.

No source absence proves absence of a business. No advertising board proves an on-site tenant, door or current occupation. Far-carriageway signs, excluded access and uncertain hospital facade extent are not accepted pilot premises. Dimensional/floor/neighbour/entrance evidence is missing. Existing source notes remain immutable; any later correction must use a fresh batch with exact expectedPrevious hashes.

## Current stop and next valid assigned work

Last actual imagery remains `dEjZp5gMqbt9o7EBasmOXw`, camera17.405521,78.4634809,November2021,h228/fov65 (left viewh48): https://www.google.com/maps/@?api=1&map_action=pano&pano=dEjZp5gMqbt9o7EBasmOXw&heading=228&pitch=0&fov=65 . No onward step was taken. Next distinct panorama/date/location is unknown. Browser was last confirmed operational during004; this audit does not recheck it or retry a provider.

Evidence state: **AUDIT_COMPLETE_GAPS_OPEN_BOUNDARY_HOLD**. Lease stays ACTIVE/retained; no completion/release or new road assignment. Admission review of001–004 is complete for pending evidence retention. Placement/coverage/playable-zone qualification is PARKED_MISSING_EVIDENCE, not pending approval to reimport.

The current process permits one next task **within the same assignment**: `same-pilot-known-anchor-gap-review`, owned by second-computer-01. This audit records that bounded plan. After fresh lease/browser checks, revisit the existing fixed **S76a** camera17.4064672,78.4625709,projected25.978411567m; verify visible capture date/alignment and examine knownh48/228plus supported reverse/oblique angles only as useful. Aim to clarify near-edge alignment/start inventory and occlusion, not infer hidden frontage. No translational navigation into the excluded start locator, onward from finaldEjZ, endpoint buffers/junctions or another road. Stop on ambiguity/provider block. If no view resolves a gap, keep it open and report precisely. This plan was recorded but not executed in this audit.

Reuse existing source IDs for identical(pano,heading,capture-date); new actual facts/view sources only may enter new immutable005. A repeat of the same source is not a new record count. Any changed old fact requires a correction batch/expectedPrevious; preview and sole-integrator review/admission remain mandatory. No coverage/placement promotion is authorized by merely recording this plan.

No other owner's approval is required for this repository audit or same-worker fixed-anchor review under the current ACTIVE lease and explicit takeover. No mandatory independent second image reviewer was found in the governing process; none is claimed. Further roads are **not assigned**: Road5→Yusufguda/a8/g7Fl remain parked; former Peddamma owner inactive; Madhapur–Peddamma quick-pass gaps retained; Miyapur–JNTU35roads/70sides reserved/provider-blocked. For protected work, the recorded reservation owner/coordinator and actual provider access must resolve the reservation/block before any reassignment; the cloud owner's identity is unknown in the packet and must not be invented. No release/assignment request is sent by this audit. Generated queues do not activate work.

## Trail repair, checks and blocked publication

The coordinator packet omitted two worker historical checkpoints referenced by001. Recovered exact committed bytes from worker81ce543c677e2eb6e59cbcfe29d8ff20bb973022, also identical to current worker copies:

- checkpoint-20261019T224042Z-alignment-blocked.md: SHA25692ceeeb5fce074b6e2bf4a3abd9ab5bf51647f640ef9782df6a9e9edda1977fb.
- checkpoint-20261019T235519Z-first-batch.md: SHA256f6a77f5f79079164032712ac3e46fff3fd35d7d48e4b8dd432f634b196558eb0.

Historical contents were not edited and do not override current ownership/runtime. This repairs documentation continuity, not evidence or coverage. Audit used actual surveyRecordHash/canonicalSurveyJSON, nearestSurveyRoadPoint and full validateStreetSurvey across real chunks:0errors, existing no-exact-placement warning. No importer executed; no new broad tests/build/device audit needed or claimed for documentation-only changes. Prior116build/check results remain historical, and known researched-frontage-order failure remains unresolved. Stage explicit audit/docs paths, inspect diff/whitespace and secrets/browser-state, fetch before normal push and verify SHA. Worker branch remains23cb048.

Publishing stays BLOCKED/PARKED: native sites_get_site/get_site on `appgprj_6ad576049ff8819196715b604db10264` returned `SitesConnectorError: Sites project not found`, codeNOT_FOUND,typeproject_not_found,HTTP404. Existing failed action, not a pending approval or uncertain deployment. No retry/access change/replacement project/deployment. Main https://roadster-pizza-delivery.blithe-okapi-0017.chatgpt.site stays public113; separate actual pizza-game Site remains unbuilt and no zone qualifies.
