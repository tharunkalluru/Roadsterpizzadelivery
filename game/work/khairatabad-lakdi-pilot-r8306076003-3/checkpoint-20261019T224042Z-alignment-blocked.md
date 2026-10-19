# Lakdikapul pilot — imagery alignment checkpoint

Recorded 2026-10-19T22:40:42Z. Worker `second-computer-01`; assignment `khairatabad-lakdi-pilot-r8306076003-3`; personal branch `worker/second-computer-01/khairatabad-lakdi-pilot-r8306076003-3`.

## Startup binding

- Activation and worker base: `50e23bd3b8162381623e8ea7bd617409f88bda54`, verified as the current remote handoff HEAD and commit introducing `docs/handoff/RESERVATIONS.json` before this attempt. Frozen predecessor: `7145ba2b954c2ec01c67e902a44e45c6fc5d91a4`.
- Reservation: ACTIVE for `second-computer-01`. No local or remote personal branch existed at the collision check; the personal branch was created locally from the exact activation commit. This task continues the authorized worker scope; it does not create another assignment. The original Mac checkout was left unchanged.
- World `hyd-metro/2.0.0`, survey revision 102, SHA-256 `2500760b5de99102489055f7f52d1639ad64b486424fdbcbe54b5ece3d7f1e2a`. All five frozen SNAPSHOT.json file hashes passed. The gzip archive decompresses to 19,856,474 bytes, SHA-256 `53ffc82503447ec72846894343e1562c9f5f33456514bfc90aadea3103111e05`. Node v24.13.1 executes. No dependency install, build or full validation suite was repeated during this source/alignment attempt; VALIDATION.md retains its documented limitations and existing test failure.
- Only `r_8306076003_3`, Lakdikapul Road, canonical left and right, closed interval [20.00, 168.60] m in stored `road.points` order. Exclude [0,20), (168.60,188.60], endpoint junctions, all other roads/carriageways, branches, station connectors and gates. Protected primary/cloud reservations remain untouched.
- The repository gives sequential inspection within this bounded interval; no fixed sampling increment is specified. No new increment or expanded route has been assumed.

## Attempt and exact alignment blocker

The isolated in-app browser was unavailable. An agent-created tab in the existing supported Chrome browser was used without changing the existing GitHub tab. Ordinary Google Maps Street View navigation requested the assignment's approximate start anchor:

https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=17.4064797%2C78.4625119&heading=138&pitch=0&fov=85

The provider instead selected panorama `1fe1afaU42WEtPPcstiEIA`, camera 17.4065353, 78.4624984. The visible provider panel and image footer both show **Apr 2026**; the resulting URL specifies heading 138 degrees. Reproducible selected view:

https://www.google.com/maps/@?api=1&map_action=pano&pano=1fe1afaU42WEtPPcstiEIA&heading=138&pitch=0&fov=85

Using the WGS84 local projection in `game/src/world/geo.ts`, manifest origin (17.4146,78.5484), and the reserved road's stored polyline, this camera projects to local X=-9126.952286779602, Z=892.5510310269527. Its nearest point on that polyline is at approximately **16.03249 m**, lateral distance **4.35983 m**. This lies before the included 20.00 m boundary, in the excluded start buffer. These are computed map-alignment diagnostics, not field-measured dimensions or proof of camera carriageway.

The locator view contains a divided-road/viaduct context. The selected camera's alignment to the assigned one-way edge and permissible frontage was not established. No signs, tenants, entrances, doors, unit bounds or non-shop frontage from this out-of-range locator view were entered as assignment observations. No navigation chain, reverse angles or alternate carriageway was followed. Per SECOND_COMPUTER_ACTIVATION.md, stop on unavailable/misaligned imagery rather than expanding to another edge.

Action status: **paused for alignment**, not denied by the provider or an approval system. Maps imagery loaded successfully; no CAPTCHA, authentication rejection or traffic restriction was observed. The failed in-app browser launch was a tool-availability limitation, resolved by supported Chrome. No provider evasion was attempted.

## Evidence, validation and resume

- New immutable evidence batches: none. Batch IDs/content hashes: not applicable. No eligible in-range frontage observation was established, so no empty or invented survey batch was authored or imported.
- Observed/partial/visually inventoried/verified coverage added: **zero** on either side. Both sides remain unreviewed by this worker.
- Last locator panorama: `1fe1afaU42WEtPPcstiEIA`, Apr 2026, heading 138 degrees, coordinates above; **outside lease, not a research resume panorama**.
- Next eligible panorama, capture date, camera heading, canonical side/frontage alignment and source ID: unknown. Actual imagery continuity and all storefront identities, tenancy, entrances, floor/unit boundaries and occlusions remain unverified.
- Next action: parent/integrator reviews the out-of-range snap and supplies or confirms a supported in-range camera/edge alignment within this same road's [20.00,168.60] m lease. Re-fetch and verify the lease before any further research. Do not broaden the assignment or infer eligibility from this locator view.
- Only this checkpoint is proposed for the worker branch. No shared survey/world/generated files, revisions, receipts, reservations or deployment metadata were changed. No raw provider imagery is saved or redistributed.

Save checks: the checkpoint diff and whitespace check passed; changed content was scanned for credential/session/private-screenshot material. Final save SHA and remote readback are supplied in the task handoff rather than embedded self-referentially here. Importer preview is not applicable because no evidence batch exists. No build or full-suite pass is claimed.
