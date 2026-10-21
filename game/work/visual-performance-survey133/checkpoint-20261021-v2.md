# Roadster v2 driving presentation — survey 133

Recorded 2026-10-21. Assignment: `visual-performance-survey133`, game owner `returning-account-game-01`, branch `worker/returning-account-game-01/visual-performance-survey133`. Implementation and independent visual/UI reviews used **GPT-6 Astra, ultra**, as explicitly requested. This continuation addresses the user's distracting name cards and broader request for better performance, appearance and game feel.

## Source and authority

The frozen v2 baseline and exact source parent is `39a3c306d5d3c5aa96ff03c54d7e5c1477aa817e`, the open [draft PR11](https://github.com/tharunkalluru/Roadsterpizzadelivery/pull/11). It remains stacked on game branch `worker/returning-account-game-01/qualified-zone-game-survey133`, [PR9](https://github.com/tharunkalluru/Roadsterpizzadelivery/pull/9), head `6485be98021aaba9d2323c2cbd111830940c0c41`. The parent agent fetched and checked those remote heads before implementation and again during final review. The coordinator is the unchanged mapping handoff recorded in the [v1 checkpoint](checkpoint-20261021.md); no shared coordination file was edited.

AGENTS, STATUS, ASSIGNMENTS, WORKER_GUIDE, VALIDATION, SNAPSHOT, GAME_SPLIT and the latest checkpoint were read. Source ownership was split explicitly between camera/integration, UI, scene materials, hero and performance files, then frozen before serial QA. Root performed independent source and screenshot review. The scoped local commit and its exact final tree are recorded in the scratch publication manifest at `game/output/visual-performance/v2-publication-manifest.json`. Remote publication is pending the parent's expected-head and tree-equality checks; connector-generated commit metadata may produce a different commit ID with the same tree.

No deployment or merge occurred. Main public Site revision 113 and the existing hosted private provisional preview remain unchanged. No source import, mapping lease, provider imagery, road geometry data, route/connectivity, pickup coordinate, scoring rule, simulation physics, input calibration, dependency or verification state changed. Survey 133 remains **908 sources, 682 observations, 169 provisional storefronts, zero verified storefronts and zero verified sides**. The provisional entry gate and locked verified mode remain.

## Delivered presentation and interaction

| Before | After |
| --- | --- |
| Automatic large floating name cards while driving | No helpers during motion or flight; one bounded full-name helper only during a deliberate parked inspection |
| Higher, less responsive chase composition | Lower chase framing, small turn anticipation and separate smooth aim/boom response; reduced-motion behavior retained |
| Brown-looking canopy and warm, flat street values | Cool reflected canopy, clearer white shoulders and rear deck, neutral daylight contrast and charcoal road |
| Separate large HUD cards and passive grounded flight prose | Compact timer/cargo/destination and boost display; accurate fractional reserve and critical flight feedback preserved |
| Long ready instructions; result score inside details | Short ready handoff, expandable complete controls, existing result score/time/pizza condition in view |
| Repeated static transform calculations and discarded off-tile geometry | Cached completed static transforms and skipped off-tile geometry emission |

- Labels reuse one container plus one text span (three DOM elements including root), use at most eight nearby candidates/ray checks and update at 10 Hz only during inspection. A continuous 350 ms hold is required at speed ≤0.15 m/s; releasing an unfinished hold resets the dwell. A completed hold grants a 1.5-second reading window. Moving or becoming airborne immediately hides it. Labels retain source text/case and exact existing building occlusion, stay outside the central forward corridor and measured HUD rectangles, and wrap within 180 px phone / 220 px desktop width and at most three lines (28/44/60 px height). Names that cannot fit in three lines remain available on physical signs and map context; no ellipsis is shown. There is no repeated provisional caption over the road; the entry gate, compact persistent badge and source context retain disclosure.
- Ground chase distance is 6.7 m plus bounded speed adjustment, with a 2.65 m base height; turn anticipation is limited to 0.085 rad. Collision boom and overhead checks remain. Reduced motion removes turn/FOV response; flight boom distance/height remain unchanged. Camera unit tests cover frame-rate independence, reduced motion and overhead clearance.
- The original white Roadster retains 20 meshes and 12 materials. Colour gradients clarify canopy/shoulders without a new texture or draw call; mesh geometry adds 52 triangles. Wing, pooled cold-gas jets, courier and cargo cues remain. Scene changes add no textures or postprocessing. Low-quality contact shadow follows existing road elevation and car heading, narrowing on the road and fading with clearance; its flat shape remains an approximation on slopes/curbs.
- A real unloaded-to-loaded collection transition produces one short synthesized pickup cue and existing 15 ms haptic. Restoring loaded cargo does not replay it. The notice cursor now continues correctly after the eight-entry ring fills and does not replay old notices on resume. Collect cancellation, click behavior, touch target sizes and steering travel are unchanged.

Official design references reviewed on 2026-10-21: [Absolute Drift](https://www.absolutedrift.com/) for clear driving space and sparse accents, [art of rally](https://www.artofrally.com/) for coherent colour and directional depth, and [Horizon Chase 2](https://www.horizonchase2.com/) for readable car presence and compact feedback. These principles were translated into original game code. No third-party game artwork, models or reference screenshots were added. The [Tesla Roadster](https://www.tesla.com/roadster) remains the original vehicle inspiration; dimensions/flight hardware are game approximations.

## Performance evidence

[Paired workload measurements](../../qa/visual-performance/evidence-v2/workload.json) compare 60 frames of the same paused scene with cached static transforms against temporarily restored automatic updates. The diagnostic restores every flag and method after measuring.

| Profile | Local transform compositions/frame | World matrix multiplications/frame | Frozen scene nodes |
| --- | --- | --- | --- |
| Phone low | 5,897 → 3,037 | 5,896 → 3,036 | 2,860 |
| Desktop standard | 6,003 → 3,080 | 6,002 → 3,079 | 2,923 |

That removes about **49% of these repeated transform operations**, not 49% of frame time. Exact comparisons across all 5,896/6,002 scene-node world matrices found zero differing elements. Static caching is restricted to completed cull-registered scenery with stationary parents; dynamic update subtrees retain automatic updates. Hero, traffic, pedestrians, trains, signals, sky and markers are not blanket-frozen.

Road-tile generation still preprocesses all neighboring frames, joins, ramps and crossings, then skips geometry emission for unowned tiles. Tests compare every selected tile's complete vertex/index data, material assignment and instance/world matrices with the full build at low/standard/high. An off-tile crossing still changes the correct bridge-pier placement. A selected fixture allocates less than half the full builder vertices; a nonexistent tile allocates zero. This is bounded geometry-work evidence, not a measured production load-time percentage.

The [before](../../qa/visual-performance/evidence-v2/before-metrics.json) baseline was captured before any v2 source edit. [After](../../qa/visual-performance/evidence-v2/after-metrics.json) was captured after every source fix, including full-name wrapping, following the final production build. The root deliverable preview was explicitly blanked and verified before this final measurement, then reopened after the benchmark browser closed. Both profiles use Chrome/ANGLE Metal on Apple M2, the same normal spawn, a 2-second warm-up, 10-second manual-clock stationary rendered window and actual renderer DPR 1. Phone viewport is 844×390 with touch emulation/forced low; desktop is 1280×720 standard. Camera framing deliberately changes, so these draw counts describe scene budgets rather than an isolated optimization.

| Measurement | Phone low before → after | Desktop standard before → after |
| --- | --- | --- |
| p50/p95/p99 frame interval | 16.7/16.8/16.8 → 16.7/16.7/16.8 ms | 16.7/16.7/16.8 → 16.7/16.7/16.8 ms |
| Draw calls | 177 → 176 | 278 → 278 |
| Triangles | 179,714 → 179,694 | 535,922 → 536,010 |
| Geometries/textures/programs | 170/29/30 → 170/29/31 | 226/31/38 → 226/31/39 |
| Retained JS heap after GC | 139.47 → 139.37 MB | 140.56 → 140.30 MB |
| Raw JS heap snapshot | 248.02 → 318.82 MB | 280.95 → 301.72 MB |
| Development resource transfer | 62.317 → 62.347 MB | 62.317 → 62.347 MB |
| Development play-ready interval | 6.37 → 5.94 s | 5.67 → 5.77 s |

The extra shader program supports vertex-coloured canopy glass. Samples remain display-capped near 60 Hz, so **no physical-phone FPS gain or total-RAM reduction is claimed**. Retained heap is effectively flat; raw heap and development load timing are cache/GC sensitive. Deliberate graphics, build and test workloads were serialized for the comparisons; external user-tab activity cannot be fully controlled and is a measurement limitation. GPU/system/peak memory, thermal behavior and actual mid-range devices remain unmeasured.

The immutable decoded survey/core/source-accuracy/listing files still total **49,091,565 bytes**. A bounded loader audit found transient decode strings/buffers already eligible for release, with the retained source layer, navigation graph and full listing context used by streamed reconciliation, routes and search. No safe large code-only retention removal was established without changing those semantics or the immutable data package. That separate loading work remains open; this pass does not silently prune source evidence.

[Production code sizes](../../qa/visual-performance/evidence-v2/production-code.json), gzip level 6: **1,142,736 → 1,147,558 raw bytes; 337,722 → 339,351 gzip bytes** (1,629 extra compressed bytes). This excludes unchanged fonts, textures and world data. The production build is a local provisional build, not a deployment.

## Validation and evidence sequence

Final TypeScript plus provisional production Vite build passed with **91 modules**. Final focused unit run passed **126 tests in 14 files**, using Node 24.13.1 and two workers: `render-quality`, `render-lifecycle`, `hero-presentation`, `delivery-marker`, `pilot-zone`, `provisional-zone`, `terrain-cutouts`, `camera-look`, `flight`, `world-labels`, `hud-notices`, `scene-presentation`, `static-transforms`, and `road-tile-rendering`. `git diff --check` passed. The build/test run includes the final full-name-wrapping adjustment.

The [delivery regression](../../qa/visual-performance/evidence-v2/regression.json) passes three complete normal-spawn journeys through real physics and actual emulated touch for selection, collection/cancellation and handover: first order with cancelled/retried collection, same-order reset and a second order. Selection Back and abandon also pass. **No teleports, recoveries, page errors or failed asset responses.** Three collections produced exactly three pickup cues. Accelerator/steering cancellation returned to neutral; 40 px steering travel remains exactly 0.34255408324467224. Portrait paused for orientation and landscape resumed. Controls at widths 568/667/844 stayed in bounds, hittable and at least 44 px. Ready/results expanded instructions/details and action buttons passed at 568×320.

Normal-clock driving covered 129.82 m in 15 seconds, with no recovery or moving-label appearance. An additional 15-second 4× desktop CPU pressure sample reached 242.37 m total, still without recovery. Actual flight reached FLYING at 5.35 m and returned to LANDING_CONFIRM, with zero moving-label violations. Desktop throttling and touch emulation are not physical-phone certification.

Four same-spawn resets after those journeys retained 297 geometries/57 textures/32 programs and one label container each. Post-GC JS heaps were 142.26, 141.98, 141.91 and 142.66 MB. No cumulative growth trend appeared in this bounded check; it is not a long-duration leak proof. Duplicate chunk attachment retained candidate count, removal left no dangling slots, and disposal left zero label roots/candidates.

The complete journeys preceded the narrow interrupted-hold and full-name-wrap fixes. Those changes are independently covered by final focused tests and the [final inspection check](../../qa/visual-performance/evidence-v2/inspection.json): passive labels zero, two interrupted short holds zero, one qualified full-name roadside helper showing “Kallada Tours Travels & Logistics” at 180×44 CSS px, no clipping/control overlap, expired reading window zero. The clean parked screenshot hides the diagnostic panel. The original regression record is retained verbatim rather than presenting it as a rerun of unrelated final changes.

The repository-wide suite is **not claimed green**. The unchanged `researched-frontage-order.test.ts` failure (`appearance.signBaseM` on undefined) was previously reproduced on untouched `6485be9` and recorded in v1; no fixture or mapping data was changed to conceal it. Current validation is the focused regression suite and integrated browser checks described here.

## Frozen files and handoff

All five hashes match exact source parent `39a3c3`:

| File | SHA-256 |
| --- | --- |
| `game/public/research/street-survey.json` | `39016ea94266f623198c8a9a13dd94dc7ae6feb1433300c2725a700f0337fc42` |
| `game/public/world/hyd-metro/v2/manifest.json` | `b07636419815d2428d110b6e912144f93679d1b928ce53cd5d1464db62fe1089` |
| `game/public/world/hyd-metro/v2/core.json` | `6a1f8ae682113b3ac6ea7faf4e64edef5062bf9358d626bead5025fa496d2d7c` |
| `game/package-lock.json` | `dc36354e007ddbe185b883df2d2723348aa4e0387de975138c016c18b43fc9f6` |
| `game/data/archives/source-accuracy.json.gz` | `4e0e9f32c651de10e6ce40f6a4eec96986b4e8d7b0fcfd77de4610d512d490fd` |

The [QA README](../../qa/visual-performance/README.md) documents current behavior, reproduction and selected original-game screenshots. Historical v1 evidence and checkpoint remain unchanged. Scratch raw runs/build output and private reference images are excluded from the commit. Remaining limits are physical-device validation, unchanged data/RAM floor, pre-existing frontage fixture failure and zero verified mapping coverage. Review and any eventual integration remain through the existing stacked PR11 → PR9 path; no deploy or merge is authorized by this checkpoint.
