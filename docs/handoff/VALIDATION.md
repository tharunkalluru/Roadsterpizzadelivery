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
