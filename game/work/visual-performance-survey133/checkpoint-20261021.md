# Visual and performance review — survey 133

Recorded 2026-10-21T05:58:32Z. Assignment: `visual-performance-survey133`, game owner `returning-account-game-01`. Branch: `worker/returning-account-game-01/visual-performance-survey133`. Implementation and independent scene/HUD review used **GPT-6 Astra, ultra**, as expressly requested by the user on 2026-10-21. This current request supersedes the older model setting recorded in the shared split; the shared coordination files were not edited.

## Source and authority

- Exact implementation/baseline parent: `6485be98021aaba9d2323c2cbd111830940c0c41`, the fetched head of `worker/returning-account-game-01/qualified-zone-game-survey133` and [draft PR9](https://github.com/tharunkalluru/Roadsterpizzadelivery/pull/9).
- Fresh coordinator head: `909f3f6b1883b94cae33df65b807c15014deeb1c` on `handoff/parallel-mapping-2026-10-19`. Both heads remained unchanged at the final fetch. The current coordinator split acknowledges receipt and records the game as delivered awaiting feedback. Its `qualifiedZone` remains null.
- This isolated continuation is a stacked draft targeting the existing game branch. PR9 remains the single downstream integration route to the mapping coordinator. PR8 is mapping work and was not used as the game base. No mapping PR was merged.
- Read AGENTS, STATUS, ASSIGNMENTS, WORKER_GUIDE, VALIDATION, SNAPSHOT, GAME_SPLIT and current checkpoints before work. The mapping coordinator was idle, with no overlapping active game edits found. Latest user feedback explicitly authorized graphics, phone readability and the current flying Roadster appearance.
- Scope is game presentation, bounded rendering work, local QA and evidence. No road/side lease, imagery inventory, source import, route/connectivity, pickup coordinates, simulation physics, verification state or provider restriction changed. No deployment, merge, auto-merge, account/access change or third-party message was performed. Public Site revision 113 and the previously published private provisional preview remain unchanged.

Survey 133 remains **908 sources, 682 observations, 169 provisional storefronts, zero verified storefronts and zero verified sides**. Existing provisional/fictional gameplay disclosures and the locked verified-mode gate remain. No names, premises, tenants, entrances or verification evidence were invented. Building/shop labels repeat actual rendered sign plans from existing source data.

## Delivered changes

- Original low-poly white Roadster model based on the [official Tesla Roadster visual reference](https://www.tesla.com/roadster), observed 2026-10-21: angular low nose, dark gold canopy, inset headlights, broad rear shoulders, recessed full-width rear light and raised flight wing. The visible four rear nozzles informed the reference; underside/side nozzle positions, dimensions and actuation are game approximations, not engineering claims. Courier and pizza cargo cues remain visible. No reference photographs, provider imagery or downloaded vehicle model were added.
- Cosmetic cold-gas white jets with concentrated cores and soft dissipating vapor, flight/acceleration/steering response and ground suppression. Fixed particle pools are 28/42/56 for low/standard/high, with two instanced effect draws. Shared geometry, reused matrices and bounded lifetime avoid per-frame particle allocation. The inspection sheet records 20 ground versus 22 flight draws, 2,796 versus 3,212 triangles including its simple stage; these are separate from the full game measurements.
- Warm daylight, quieter procedural asphalt, shared plaster, baked contact shading on existing building vertices and untone-mapped sign colors. Low omits reflection capture; standard uses a smaller environment map; high retains richer maps/clouds. Low keeps antialiasing for thin geometry and lettering, with its resolution budget and existing disabled shadows bounding cost.
- Six reusable screen-label containers (25 total DOM nodes including root/spans), at most four visible on phone widths, range 80 m and updates capped at 10 Hz. Candidates originate from rendered building/store boards. Front-face, screen bounds, label/control overlap and exact loaded footprint/height/hole intersection filter visibility. At most 18 ranked candidates and 12 visibility checks per update. Names retain original case and provisional status. Door/access cutouts are conservatively solid. Long labels or busy small-screen layouts can suppress helpers rather than obscure controls; the underlying sign/map remains available.
- Ivory/ink/tomato HUD with larger world opening, restrained press feedback, readable touch targets, speed integrated into the boost panel, safe-area/mobile metadata and no backdrop blur. Cached text nodes and transform meters reduce DOM churn. The successful-pickup toast removes an obsolete cancellation toast. Collect remains click-driven with `pointer-events:auto`; cancel/release behavior is preserved.
- The smaller visible steering control retains the original travel calibration. Adaptive automatic quality uses coarse-pointer/memory/core hints, DPR caps of 1/1.5/1.75 and pixel budgets of 0.8/1.5/2.5 million. Slow hysteresis scales automatic rendering down to 65% under sustained pressure; manual presets remain explicit. Hidden pages skip frame work.
- Reused actor/pedestrian sets, cached brake materials and flight context, projection updates only when FOV changes, and a prefetched road-tile queue avoid repeated frame allocations/traversals. Stale chunk-cache targets are lower on low/standard, without evicting collision-critical visible chunks. Labels clean up on chunk removal/disposal and boot retry. No broad world-data rewrite was attempted.

## Validation

Final TypeScript plus provisional production Vite build passed: **90 modules**. Final focused unit run: **99 tests passed in 10 files** (`render-quality`, `render-lifecycle`, `hero-presentation`, `delivery-marker`, `pilot-zone`, `provisional-zone`, `terrain-cutouts`, `camera-look`, `flight`, `world-labels`; two workers). New focused coverage includes quality hysteresis/budgets, hero flight resource/ground behavior, and exact label occlusion through thin walls, height/base clearance and courtyard holes. `git diff --check` passed.

The [final regression record](../../qa/visual-performance/evidence/after-regression.json) passed three complete normal-spawn delivery journeys using a reference driver through real physics and actual emulated touches for job selection, collection and handover. It covered selection Back, cancelled/retried pickup, same-job reset, a second job and abandon. **No teleports or recoveries**, page errors or failed asset responses occurred. Accelerator and steering cancellation returned to neutral; 40 px steering travel matched the previous calibration exactly. Portrait paused with reason `orientation`, then landscape resumed. Controls at 568×320, 667×375 and 844×390 were in bounds, hittable and at least 44 px. Collect/hold rectangles are excluded from label placement.

Saved source-created screenshots were independently inspected: HANS TRAVELS is readable at 568 px; PARADISE BAKERY/R MOBILES/S.V.R TOURS & TRAVELS at 844 px; V KAVERI TRAVELS is readable during the pickup journey. At 568 px near pickup, the expanded cargo/action HUD appropriately leaves no room for a helper label. The flight screenshot shows actual airborne gameplay, raised wing and white jets against the road, followed by a successful landing transition. One minor cosmetic nit remains: the two-line provisional badge at 568 px touches the maneuver card border without obscuring text.

Four consecutive same-spawn resets after driving retained **294 geometries, 57 textures and 31 programs** each, with six label containers. Post-GC JavaScript retained heaps were 142.03, 141.65, 141.71 and 141.90 MB. This bounded check found no cumulative reset growth; it is not a long-duration leak proof. Chunk removal left no dangling label nodes, reattachment did not duplicate candidates, and disposal left zero label roots/candidates. Initial versus post-journey resource counts describe different streamed scenes and should not be compared as a leak.

The repository-wide suite is **not claimed green**. A broad run was stopped after 2m42s during unrelated calibration work. The isolated `researched-frontage-order.test.ts` failure (`appearance.signBaseM` on undefined, line 90; four other tests pass) was reproduced identically on untouched `6485be9` and this branch. A station-geometry case that timed out during the broad parallel run passed when isolated. No shared survey fixture was changed or weakened to hide these results.

## Matched rendering measurements

Full [before](../../qa/visual-performance/evidence/before-metrics.json) and [after](../../qa/visual-performance/evidence/after-metrics.json) measurements and reproducible harnesses are in `game/qa/visual-performance`. Chrome used ANGLE/Metal on an Apple M2. Both profiles used the same normal spawn, a 2-second warm-up and 10-second stationary rendered sample with manually frozen simulation; actual renderer DPR was 1. The phone profile is 844×390 with touch emulation and forced low graphics; desktop is 1280×720 standard. Explicit GC diagnostics were collected outside the timed window.

| Measurement | Phone low before → after | Desktop standard before → after |
| --- | --- | --- |
| p50 / p95 / p99 frame interval | 16.7 / 16.8 / 16.8 → 16.7 / 16.7 / 16.8 ms | 16.7 / 16.8 / 16.8 → 16.7 / 16.7 / 16.8 ms |
| Draw calls | 179 → 177 | 278 → 278 |
| Triangles | 182,180 → 179,714 | 547,362 → 535,922 |
| Geometries / textures / programs | 174 / 32 / 31 → 170 / 29 / 30 | 230 / 35 / 38 → 228 / 31 / 38 |
| Retained JS heap after GC | 139.12 → 139.46 MB | 139.87 → 140.34 MB |
| Raw JS heap snapshot | 322.27 → 315.01 MB | 414.16 → 428.34 MB |
| Development-server resource transfer | 62.40 → 62.32 MB | 62.87 → 62.32 MB |
| Development-server play-ready interval | 6.78 → 7.56 s | 6.15 → 8.00 s |

The samples are display-capped near 60 Hz, so they do not establish a frame-rate improvement or physical-phone smoothness. Retained JS heap is effectively flat; **no total-RAM reduction is claimed**. These snapshots exclude unmeasured system/GPU/peak memory, and loading timings are cache/dev-server sensitive; loading did not improve in this run. A separate 15-second normal-clock real-physics driving sample covered 129.8 m with p95 16.8 ms and no recovery. An additional 15-second 4× desktop CPU pressure sample stayed display-capped with no recovery. Neither CPU throttling nor viewport emulation models a particular mid-range phone or its GPU/thermal limits.

All deliberate browser/build/test workloads were serialized for final benchmarks. The separate app-browser connection became unavailable (`Transport closed`), so its last idle preview tab could not be directly closed/inspected. Restarting the local server reloaded the preview gate, which requires a click before creating the game renderer; that tab state could not be independently confirmed. Before/after used the same surrounding condition. Saved headless browser screenshots and scripted interactions supplied final visual/behavioral evidence; no direct app-browser action is pending.

[Production code sizes](../../qa/visual-performance/evidence/production-code.json), gzip level 6 using identical measurement code: **1,120,013 → 1,142,736 raw bytes; 330,404 → 337,722 gzip bytes** (about 7.3 KB extra compressed code/CSS). These exclude unchanged fonts, textures and world data. Four immutable decoded survey/core/source-accuracy/listing files total **49,091,565 bytes** and remain the main loading/memory floor. Reducing that floor requires a separately coordinated data-loading change; this presentation branch does not silently remove source detail.

## Frozen hashes

All five match the exact base after final build and regression:

| File | SHA-256 |
| --- | --- |
| `game/public/research/street-survey.json` | `39016ea94266f623198c8a9a13dd94dc7ae6feb1433300c2725a700f0337fc42` |
| `game/public/world/hyd-metro/v2/manifest.json` | `b07636419815d2428d110b6e912144f93679d1b928ce53cd5d1464db62fe1089` |
| `game/public/world/hyd-metro/v2/core.json` | `6a1f8ae682113b3ac6ea7faf4e64edef5062bf9358d626bead5025fa496d2d7c` |
| `game/package-lock.json` | `dc36354e007ddbe185b883df2d2723348aa4e0387de975138c016c18b43fc9f6` |
| `game/data/archives/source-accuracy.json.gz` | `4e0e9f32c651de10e6ce40f6a4eec96986b4e8d7b0fcfd77de4610d512d490fd` |

## Review and resume

Use the [local preview instructions and evidence index](../../qa/visual-performance/README.md). Start with Node ≥22.12 and `game/qa/visual-performance/start-preview.command`; local URL is `http://127.0.0.1:5486/preview.html`. The final server binds only to loopback. Selected PNGs depict only the original game, without browser chrome/private screenshots/reference imagery.

Changed implementation areas: `app/app.ts`, `app/view.ts`, new `app/renderQuality.ts`; art API/buildings/environment/hero/materials/storefronts/textures; HUD/input/styles and new world labels; preview/pilot presentation styles and the three HTML mobile metadata entries. New tests and local QA scripts/evidence live under `game/tests/unit` and `game/qa/visual-performance`. Shared mapping data/coordination, gameplay route definitions, dependency versions and production deployment settings are untouched.

Next action is review the isolated stacked draft, then integrate only through the existing game-owner/PR9 path if separately authorized. Do not deploy or merge from this checkpoint. Before resuming, fetch and re-read current ownership/base instructions. Remaining limits are actual mid-range hardware testing, the unchanged data floor, the pre-existing frontage fixture failure, and missing verified mapping coverage. None is represented as completed.
