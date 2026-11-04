# Final finite road audit preparation

Status: the independent audit harness is prepared, with eight geometry-oracle controls and one real World/tileworker transport smoke test passing. No final broad road model has been held or accepted by this reviewer. Production, UI and publication are untouched.

`scripts/audit-road-release.mjs` bundles the reviewer-owned TypeScript runner and verifies its imported implementation did not change while executing. The runner accepts `--manifest FILE --output NEW_FILE`, rejects an existing output, checks all supplied artifact SHA256 values before and after the run, and preserves every failed or unresolved record. It never writes a new model or updates source packs.

The manifest binds the exact baseline World model, frozen historical L/R footprints, and the all-imported-source historical exporter provenance. The historical reference is the reviewed `a679b72bacefb751057f0282a86571e8e6ef006d` World export; its old physical widths are not reconstructed through a current helper. The baseline asphalt-film constants are explicitly tied to that revision. The producer supplied the read-only directly bound World/LR/provenance chain under `/tmp/roadster-road-freezes/a679-world-reference-v1`; these are input artifacts, not files silently assumed by the runner.

The candidate input must contain **actual city-emitted Float32 asphalt triangles**, including node caps, annotated with road identity, canonical source arclength and centreline segment, and a complete physical L/R inventory. The runner checks that every physically changed or removed model road is included, detecting width-helper changes even when stored road fields look unchanged. `--emit` executes the actual World constructor and actual tileworker through Node-only message/file adapters. It requires active verified model data and compares the actual final World geometry with the held model before exporting. The finite audit requires its hash-bound successful execution receipt, current implementation identity and actual Float32 coordinates; a producer boolean alone is insufficient.

The finite oracle clips actual triangle footprints in both directions: historical protected overlap vertices/centroids against surviving candidate coverage, then candidate overlap vertices/centroids against historical local branches. Removed coverage and newly introduced coverage remain separate unresolved inventories. A locally source-backed apron fragment can exempt only its own finite polygon and only an actual height difference at most1cm. It cannot waive a positive intermediate gap or reversed bridge order. The runner also verifies source-node/path continuity and separately hash-bound evidence for each fragment. The actual component/protected-level interpretation still requires independent review of that evidence; a whole-pair waiver is not supported.

The final thresholds protect every independent historical positive gap above1cm, with a5.85m target and only1mm Float32 comparison allowance. These replace the earlier4.5m eligibility/5cm allowance, which could miss smaller-gap regressions. A source-proved finite apron remains eligible only when its actual gap is at most the unchanged1cm cap. Full actual-Player tyre/body gates, rail/metro/landmark/roadside clearance and screenshot3 structural-cap class checks remain additional required gates. The finite runner deliberately writes `releaseApproved:false`, `coverageClassificationComplete:false` and `fullVehicleAndObstacleGatesComplete:false`; it cannot be mistaken for whole-release approval.

`tests/fixtures/actual-world-worker.ts` constructs actual production `World` with a transport-only fake Worker, captures its real cloned initialization payload, then executes the actual `tileworker` module. Local HTTP is adapted to the immutable source packs; its real gzip decoder, RoundedBox templates, preparation adapters, colliders and Float32 emission run unchanged. `structuredClone` transfer semantics are retained. The smoke test built tile3/-3 with72 buffers,724 surface-grid cells and all288 transferred buffers detached. Geometry data was disabled for that explicitly permitted smoke; it does not approve any road candidate. Final runs reject inactive data. The harness restores globals and disposes its owned worker/sign/ground resources; successful flow creates no retry timer.

`--known30` retains all thirty historical bypass IDs and samples the original centre/±1.3m paths every2.5m to250m. It uses actual production World/tileworker and actual Player placement/updates/matrixWorld, with real wall/building colliders and first/settled whole-mesh measurements. Wrong-layer placement is an explicit failure rather than silently staging above an obstruction. This is stationary pose/settling coverage, not claimed input-driven travel. The existing22 actual-input Tarnaka drives,72 side-street traversals and Root's native controls remain separate evidence. Actual `st`, `foot`, `kerb` and `wall` triangles near the car are retained as structural-cap/sidewalk diagnostics for screenshot3; a flagged face still requires physical/visual classification, rather than being treated as an automatically proven closed solid.

Eight reviewer controls pass: reduced-positive clearance and reversed order; unchanged identity; fragment-only apron scope; refusal of positive/reversed gaps even inside an apron; explicit old/new coverage loss; canonical-arc loop separation; real node-cap inclusion; and finite triangle boundaries with no capsule extensions. Command: `node scripts/test-v21-fixes.mjs road-release-finite-review`.

The current emitted-data manifest shape is:

```json
{
  "version":1,
  "sourceCoreSHA256":"...",
  "baseline":{"model":{"path":"...","sha256":"..."},"footprints":{"path":"...","sha256":"..."},"provenance":{"path":"...","sha256":"..."}},
  "candidate":{"model":{"path":"...","sha256":"..."},"emitted":{"path":"...","sha256":"..."},"emittedReceipt":{"path":"...","sha256":"..."}},
  "knownCases":{"path":"...","sha256":"..."},
  "aprons":{"path":"...","sha256":"..."},
  "references":{"source-proof.json":{"path":"...","sha256":"..."}}
}
```

The emitted artifact declares `schemaVersion:1`, `representation:"actual-city-float32-asphalt"`, `sourceModelSHA256`, `sourceCoreSHA256`, `changedRoads`, `physicalFootprints` (`id,L,R`) and `triangles` (`road,points,arc,centre,tile,cap`). Its coverage fields record changed roads, nearby crossings and node caps. These declarations must be backed by the independently run exporter and its receipt, not hand-authored to make the gate pass. Example commands use fresh output names:

```sh
node scripts/audit-road-release.mjs --emit --manifest /absolute/held-manifest.json --output /absolute/emitted-new.json
node scripts/audit-road-release.mjs --manifest /absolute/manifest-with-emitted-receipt.json --output /absolute/finite-new.json
node scripts/audit-road-release.mjs --known30 --manifest /absolute/held-manifest.json --output /absolute/known30-new.json
```


The source-stage integration review corrected two harness mismatches before final execution. Fresh actual-World fixtures now source-normalize, warm the optional cache, prepare generic roads and rebase stop heights in exactly the startup order used by main.ts; conditioned-core reuse skips the raw stages. The emitter projects through corrected source roads, then explicitly maps correctedArc back to the immutable former-edge sourceArc for historical branch matching. Negative or beyond-old-end historical distances are retained; out-of-domain corrected distances fail rather than being silently clamped. Apron connectivity validates the corrected source node geometry. Neither harness repair changes runtime road geometry.


For the corrected-source generation 9413, final manifests additionally bind `sourceCorrespondence` to `docs/qa/evidence/reported-roads/geodetic-historical-reference-9413-20261103.json` (SHA256 `651cc769bbc83ace4eedcca9ca8e92654b774330f3d7ad682dc4749b6ec6da97`). The reviewer generator projects exact historical raw vertices onto retained full Overture geometry, verifies their `actualBefore` cuts, uses GeographicLib2.1 WGS84 distances, and rejects distinct close source branches. It binds136/136 repaired roads with zero unresolved references; maximum geographic residual from rounded raw coordinates is69.425mm. `legacyPointFractions` and inherited heights never establish official geographic correspondence.

Candidate triangles keep their actual road IDs and immutable former-edge arclength. Only these136 proven roads may additionally carry a full source-segment UUID plus official source-distance range. The finite index can therefore follow an ownership boundary that moved from one sibling piece to another, while still requiring an actual finite triangle at the query position and the same local source branch. A real geographic gap, remote loop branch, full-UUID lookalike, missing sibling or unbound reference remains unresolved. Candidate duplicate keys also retain segment and arclength identity, so identical Float32 vertices on distinct branches are not silently dropped.

The initial readiness rerun passes16 Node controls with one intentionally skipped active-model reuse test; source-family enrichment subsequently adds three more Node controls and three isolated GeographicLib projection controls. The active-model reuse/clone/restart, final cached/derived parity, broad full-vehicle runs and final artifact executions remain open. These results are harness readiness only, not a final road release acceptance.

Reproduce the geographic reference and projection controls with the existing isolated dependency:

```sh
PYTHONPATH=/tmp/tile-boundary-geodesic-deps /Library/Developer/CommandLineTools/usr/bin/python3 scripts/qa/generate-road-source-reference.py --source-data src/world/road-source-geodesic-data.json --output NEW_REFERENCE.json
PYTHONPATH=/tmp/tile-boundary-geodesic-deps /Library/Developer/CommandLineTools/usr/bin/python3 scripts/qa/test-road-source-reference.py
node scripts/test-v21-fixes.mjs road-release-source-reference
node scripts/test-v21-fixes.mjs road-release-finite-review
```


Final core/tile coverage requires two additional bound manifest entries: `baseline.tiles` is the strict a679 actual tile exporter result, selected for every changed core and minor road; `candidate.tiles` is the final prepared owner/context model with its actual local L/R at final heights. Both retain `roads`, `physicalFootprints`, `copies`, raw pack hashes and explicit rendering disagreements. Historical `includedCoreRoadIDs` must cover every changed core ID; both `requestedRoadIDs` lists must cover all tile profile/source repairs. A source-bound owner is required for every changed minor ID. The finite comparison uses literal old Float32 asphalt/caps throughout that selected neighborhood, rather than mixing reconstructed old quads with partial tile coverage. The frozen historical core model/LR remain identity evidence. Height-dependent width changes are checked against actual final worker quads.

The diagnostic source-node observer ran against the explicit9413 preconditioning/ordinary freeze without activating a verified overlay. Its v2 result is `source-node-actual-surfaces-diagnostic-9413-v2.json` (SHA256 `49a99ba17134a704818cf9e19a40ecc0b6bf1d30214dbdb629c1656e7accc855`) with a successful stable-import execution receipt. All52,411 ordinary core roads match the held model before inspection; actual worker triangle association has zero unmatched entries. Of50 source-corrected nodes,45 have emitted support seams, four retain multiple actual endpoint/cap levels, and29e61023 is unresolved because the diagnostic intentionally does not install the inferred tile/node overlay. Eleven negative seam rows have actual finite-overlap discontinuity evidence, including the three rows whose real tile/core XY differ by0.1m. This overlap mode preserves those actual coordinates and the strict unresolved point-binding categories. It does not approve new ramps, terrain, vehicle traversal, a final model or a release. The v1 result is preserved as a superseded observer iteration.
