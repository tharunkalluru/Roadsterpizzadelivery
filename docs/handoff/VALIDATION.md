# Handoff validation — 2026-10-19 UTC

Frozen authored survey: **revision 102**, `hyd-metro/2.0.0`; historical Git base `440d5b40e3b8751ea31a51ab69d41aa8e1289a1f`. Validation ran in an isolated clone; active mapper files and Chrome were untouched.

| Check | Actual result |
|---|---|
| Node/npm | Node 24.13.1 / npm 11.8.0 |
| Clean dependency install | `npm ci --ignore-scripts --offline` from the existing npm cache: passed, 59 packages added. No credentials or `.env` required. Standard second-machine command is `npm ci`. |
| TypeScript + production build | `npm run build`: passed. Vite transformed 84 modules and produced the bundle. |
| Full survey validation | `npm run survey:validate`: passed, zero errors, all canonical chunks checked. Existing warning: no exact street-level storefront placement verification. |
| Summary/network/queue | Regenerated in this isolated copy at revision 102. `npm run survey:check` and `node --experimental-strip-types scripts/survey-queue.mjs --check`: passed. |
| Immutable applied batches | **90/90** batch IDs present; canonical `surveyRecordHash` matches every stored receipt. |
| Focused regression suite | `npm test -- tests/unit/street-survey.test.ts tests/unit/street-survey-batch.test.ts tests/unit/world-identity.test.ts tests/unit/revision44-section.test.ts tests/unit/revision45-section.test.ts`: **5 files / 43 tests passed**. Two compact historical survey JSON fixtures required by tests were retained; unrelated new screenshots were excluded. |
| Known current unit failure | `npm test -- tests/unit/researched-frontage-order.test.ts`: **4 passed, 1 failed**. The visibility test at line 90 dereferences `appearance.signBaseM` on an undefined appearance for a provisional front. This pre-existing snapshot issue is recorded, not silently treated as passing or changed during handoff. |
| Full `npm test` | Started, exposed the above failure, then interrupted during expensive route/calibration tests. **Not a full-suite pass.** The focused suite was rerun after retaining required historical fixtures. |
| Browser E2E / physical devices | Not run. No browser was opened or active mapping tab altered. The Playwright default binary path targets Linux CI; set `CHROMIUM_PATH` to your installed browser when intentionally running E2E. |
| Data acquisition rebuild | Not run. Runtime data is committed; optional Python geospatial acquisition/rebuild is integrator work and has additional dependencies/network/cache requirements. |
| Secret/content scan | Changed text scanned for private keys, GitHub/OpenAI/AWS/Slack credentials, JWTs and credential-bearing URLs; no matches. No new browser state, `.env`, session exports, node_modules, build output, private screenshots or raw Street View imagery included. Staged diff and path review performed before publish. |

These checks establish a buildable, internally validated handoff. They do not certify map accuracy, full-network completion, physical-phone performance, all test suites, or a deployed version. Existing historical QA ledgers and dated narrative counts are not new acceptance proof for this snapshot.

The connected GitHub owner account supports repository writes. Terminal Git authentication on this host references a missing temporary credential-helper executable and Keychain has no usable GitHub credential; the supported GitHub connector may publish the same scanned Git tree/parent directly. In either case the branch's remote SHA must be read back before reporting success. Repository visibility and default branch are preserved; no merge or Sites deployment is part of this handoff.

## Lossless archive setup verified

The source-accuracy blob was absent from the remote base tree (`cb12b99f9b77dffe272c19ca9feb8773bc97f1ea`). Its complete content is now tracked as a normal gzip archive, **2,044,381 bytes**, SHA-256 `4e0e9f32c651de10e6ce40f6a4eec96986b4e8d7b0fcfd77de4610d512d490fd`. No records or precision were removed.

A clean `npm ci --offline` with the output JSON absent executed the project postinstall restore. The restored file and original frozen input both hash to `53ffc82503447ec72846894343e1562c9f5f33456514bfc90aadea3103111e05` (**19,856,474 bytes**). Production build, full survey validation, survey reproducibility check and queue reproducibility check passed after restoration. Runtime/world manifests remain unchanged. `npm run setup:data` supports installations with lifecycle scripts disabled. The archive manifest and setup script are tracked; restored output is ignored and only the integrator may repack it.

## Final113handover validation

Current113JSON shapes, unique IDs, source references and consistent capture hashes checked; full manifest in TRANSFER_DELTA. Source/world functional code unchanged (one trailing-newline delta); prepared gzip restore hooks retained. No new outgoing build, browser/mapping audit, broad tests or test-Site build were performed. Existing main113publication previously passed build/survey and hosted start/assets with zero runtime errors; headless software renderer triggered its long-stall safeguard, so sustained real-device performance remains unverified. Incoming system must run its own needed setup/checks and qualify a fully mapped zone before the separate actual pizza-game test publication.


## Receiving system revision113 validation

Coordinator base `ee683f5fe4713e700e2887e175545f84726ef256`, original packet882b13f. Node24.13.1/npm11.8.0 locked install passed,59packages. Postinstall restored19,856,474bytes with expected SHA25653ffc82503447ec72846894343e1562c9f5f33456514bfc90aadea3103111e05. `npm run build` passed TypeScript and Vite (84modules). `npm run survey:validate` passed0errors; the existing no-exact-placement warning remains. `npm run survey:check` passed.

Initial `survey-queue.mjs --check` failed because the transferred queue was stale (its revision/source/observation-derived state predated113). The receiving sole integrator regenerated queue and queue summary with `survey-queue.mjs`; the subsequent `--check` passed. Only these derived queue files changed; authored survey113 and world/lock/archive input hashes are unchanged. No new evidence or batch receipt was created by this refresh. Generated queue priorities never override reservations or station order.

Full unit suite, browser E2E and physical-device runtime testing were not rerun. The historical researched-frontage-order failure and full-suite limits remain unresolved. These checks establish build/internal consistency, not map accuracy, a fully mapped game zone or Sites access. Main Sites get_site returned project_not_found/HTTP404 for the receiving connection; no publication attempted.

## Receiving batch002 integration at114

Exact immutable batch002 (canonical hash 568f0850dbc4e6a107283774592d24a0e404eab1db30ee6391ea02f4a6cf5cc8) passed disposable113 importer preview, duplicate/road/scope checks and coordinator review, then was imported once at114. Post-import survey validation passed0errors; network and queue regenerated, both --check commands passed; TypeScript/Vite production build passed. Batch001 remains exactly one receipt. Counts812sources/587observations/169provisional storefronts;0verified storefronts/sides. No placements/coverage added. Survey SHA256a29402c27013da98f97e925a133ff935822666d99b9357b83805b8566b7f8aa3. Full unit/E2E/device suites not rerun; main Site remains unchanged/inaccessible to this connection.

## Interrupted batch003 admission at115

1actual Nov2021 forward source/1pending context atQMjB; no unconfirmed side-view evidence. Disposable114preview and coordinator duplicate/scope checks passed; exact canonical hash d6cf9f695107874b0a9433ee7ac28ead637de040c99813569acbd1d62b573f7f. Imported once at115. Post-import survey validation passed0errors; network/queue regenerated and both reproducibility checks passed; TypeScript/Vite build passed84modules.813sources/588observations/169provisional storefronts,0verified storefronts/sides. Survey SHA256200ac5b3bacc443ec021b1dfedf65206906901a40c586c83371a45bc70a10a50. No coverage/placement, prior evidence, world/lock/archive or reservation range change. Full tests/E2E/devices not rerun. Local browser-control timeout blocks more imagery; no independent second imagery review or publication claimed.

## Receiving batch004 integration at116

2026-10-20T02:05:53Z: same-browser recovery and bounded endpoint stop. Exact24November2021sources/24pending observations, canonical hash3767c47258b6097948d8f5a679dce571b811c8db86bfe78ad780683fe989a4cb, passed disposable115preview, duplicate angular-signature/scope checks and sole coordinator admission. Imported once at116. Survey validation passed0errors; network/queue regenerated and both reproducibility checks passed; TypeScript/Vite build passed84modules.837sources/612observations/169provisional storefronts,0verified storefronts/sides; SHA256f925e617373b9694ecad96a0157fb053adbf9018f57e4b2fcc7011d874d85521. Old evidence/road reviews/placements, world/lock/archive, lease ranges and blocked reservations unchanged. No coverage promotion. Last camera168.102920m, stopped before168.60m boundary; imagery/start/tail gaps open. Full unit/E2E/devices not rerun; old test failure retained. Browser recovered; Sites access remains project_not_found/HTTP404; no publishing. See second-computer-01-batch004-import-116.md.

## Pilot001–004 evidence/gap audit (no runtime mutation)

2026-10-20T02:11:23Z: recomputed four canonical hashes with actual surveyRecordHash; exactlyone receipt each, all31source/observation records equal immutable batches and occur once,31unique(pano,heading,date)signatures across15cameras. Recomputed allcamera projections/nearest road/bounds; five SNAPSHOT hashes match. Full read-only validator with real chunks passed0errors/existing exact-placement warning. Both pilot sides remain unreviewed, no ranges/overrides/coverage. Survey116andhash unchanged; no importer/build/unit/E2E/device rerun. Recovered two byte-identical missing coordinator checkpoint copies from reviewed worker81ce543. See pilot-gap-audit report and JSON.

## S76a fixed-camera review (no import/runtime mutation)

2026-10-20T02:19:43Z:8actualNov2021views atsamecamera25.978411567m;2existing sourceviews reused+6review-only angle references. Ledger URLs/coordinates/date/headings andreference-onlypolicy checked. All5SNAPSHOT and4batchfilehashes/once-onlyreceipts unchanged;runtime116andpilot unreviewed0ranges/overrides/coverage unchanged. Exactworker5d517fa51426b0a1b0fb09592afb65ff64675cabcheckpoint/ledger copied;nogamecode/datachanges,importerpreview/build/unit/E2E/devicererun. Existingknownlimitsremain. See second-computer-01-S76a-fixed-review-116.md.

## Alternative in-lease sightline review (no runtime mutation)

2026-10-20T02:31:37Z:10actualNov2021views/7knowncameras,allrecomputedwithinlease/nearestassignedroad;noS76arepeat orjunction/othercarriageway traversal. Partialcontextclarification,remaininginventory EVIDENCE_BLOCKED. URL/date/heading/position bindings andunique reviewrefs checked;5SNAPSHOT hashes,4immutablebatchhashes/once-onlyreceipts,31pendingcontexts andpilotunreviewed0ranges/coverage unchanged. Exactworkerfa18213b45e4dad88ff83bceaa3b11cf58ccebdbcheckpoint/ledger copied;secret/path/whitespace checks. No newbatch/import/build/unit/E2E/device rerun;priorlimitsremain. See alternative-sightlines-116 receipt.
