# Independent wedding crowd review

Reviewer: `npc_people_independent_review`, separate from the producer. **Final scoped verdict: PASS for wedding-crowd geometry, resource ownership and the inspected native Level 8 day/night scene.** The repaired frozen17 replay closes the prior native HOLD; frozen15's failure remains documented below. A suspected release-loading regression was investigated and rejected by a controlled build. This is not whole-game release approval, celebrity-likeness approval or physical-phone performance certification.

Original reviewed runtime: frozen15 feature build `d0701843673f99e54ba714b71cf08e3c886854da0804686409157f471f0affa6`. Final native acceptance evidence: frozen17 **`cadffeefaddb5b1a83be3c7b9deae1fd5cc1af906de70c70ecaf172bb91d9d99`**, served at local port4267. The reviewed change replaces Level 8's remaining primitive procession figures. The prior generic-NPC v7 review did not cover this legacy scene-specific crowd; it must not be used to imply that the original stick crowd already passed.

## Source and ownership findings

- `WeddingCrowd` retains exactly sixteen procession slots, four shared reduced anatomical templates and four instanced draws. Internal vertex colours preserve skin, hair and garment differences; there is no single whole-person instance tint. The templates represent sari and kurta adults, a teenage salwar guest and an elder shirt/trouser guest.
- The continuous body, hands/feet and hair use the same generic native source reviewed in NPC v7. Four upper-body celebration poses are baked once through its actual skeletal weights. Temporary rigs and source geometry are disposed after baking; skin attributes are removed from final geometry. No live skeleton/bone texture, per-frame body deformation or material creation is introduced for the procession.
- Runtime updates reuse matrix/vector/quaternion buffers and preserve the sixteen previous center/slot/bob/sway/phase formulas. Absolute scene time remains the only clock. Nonfinite time retains the last valid time; the NPC v6 negative-delta response is not reintroduced.
- The helper owns its four instance buffers, four geometries and one opaque vertex-colour material, with idempotent disposal. `WeddingHandoff.teardown()` disposes and detaches it before base teardown, avoiding double ownership. It does not incorrectly dispose a borrowed walker geometry lease. Base scene teardown/reuse remains covered by the street-scene suite.
- The local roughness `.82` and metalness `0` avoid the shiny shared traffic material. No light or shadow pass is added by the crowd. Bhanumathi's authored dance and existing target/handoff/camera/light branches remain separate; ordinary story routes and timing were not changed by the helper integration.

## Actual cost measured by the reviewer

| Template | Instances | Template triangles | Geometry attribute bytes |
| --- | ---: | ---: | ---: |
| Sari adult | 4 | 3,504 | 462,528 |
| Kurta adult | 4 | 2,926 | 386,232 |
| Salwar teenager | 4 | 3,138 | 414,216 |
| Shirt elder | 4 | 2,636 | 347,952 |

Total rendered crowd: **48,816 triangles in four draws**. Final owned typed arrays, including instance matrices, total **1,611,952 bytes / 1.537 MiB**. A simple CPU-plus-GPU-mirror estimate is about **3.075 MiB**, excluding existing shared source/template caches, JavaScript objects, driver overhead and temporary construction peaks. This is an estimate from real buffer sizes, not measured GPU residency.

This is an explicit increase from the old primitive crowd. Instancing reduces draw submissions; it does not make the extra triangles free. Frustum culling remains disabled on these small local meshes as in the former crowd. The final integrated/mobile performance check must include the completed Level 8 scene. No existing global NPC/car/bus ceiling was raised.

**Release-loading hypothesis investigated and rejected:** Root initially suspected that the static `wedding-crowd → people/human` import caused the approximately 5.074 MB single-entry release bundle, based on comparison with the roughly 2.3 MB entry plus separate 2.1 MB people chunk in multi-entry QA builds. That comparison did not establish a regression. The reviewer independently read the actual existing imports `Game → Traffic → traffic_models → people` and `city → people`; people were already reachable statically without WeddingCrowd.

Root then ran a diagnostic Vite build replacing **only** `wedding-crowd.ts` with an empty structural stub through an isolated plugin, without editing production files. The reviewer read `/tmp/roadster-entry-crowd-control.log`: the no-crowd diagnostic still emits a **5,070.83 kB / 1,858.96 kB gzip** entry. Root's corresponding actual build is approximately **5,074.07 kB / 1,860.31 kB gzip**, so the crowd-code difference is approximately **3.24 kB source / 1.35 kB gzip**, not the entire people payload. Multi-entry QA changes Rollup's common-chunk arrangement. The diagnostic directory `/tmp/roadster-diagnostic-omit-crowd-only-20261103` is never a publication artifact. No wedding-specific startup regression is substantiated, no deferred-loader rewrite is requested on this evidence, and the initial suspected startup blocker is withdrawn. Overall release loading/performance remains part of Root's existing integrated validation.

## Independent checks rerun

- `node scripts/test-v21-fixes.mjs wedding-crowd`: **3/3 pass**.
- `node scripts/test-v21-fixes.mjs street-scenes`: **27/27 pass**.
- `node scripts/test-v21-fixes.mjs story-actor-camera`: **10/10 pass**.
- `npm run typecheck`: **pass**.

All **40** focused tests passed. They cover actual finite coloured anatomical buffers, sixteen slots/four draws, demographic mix, original transforms through time, invalid-time handling, exact one-time disposal, street-scene reuse/handoff rules and the alongside-car/camera regression. They do not establish native appearance or physical-phone FPS.

## Producer geometry images actually opened

The reviewer opened all three actual production-buffer CPU/Blender renders, not merely their filenames. They show continuous limbs/neck/hair, sensible celebration poses and attached clothing with distinct internal colours. The sixteen-person overview preserves the two side rows and open center. They are useful structural evidence; native day/night output must still confirm that the guests remain secondary and do not obstruct Bhanumathi, her physical handoff, the alongside Roadster or the cinematic camera.

Paths below are relative to `docs/qa/evidence/main-expansion/wedding-crowd-producer/`.

| PNG | SHA-256 |
| --- | --- |
| `wedding-people.png` | `99cea88639742601908ec3e708e02814bad43c5808aea98eb3e521a1e9be996e` |
| `wedding-profiles.png` | `a387f850c4205cc6c293411a89c4a8c4f4e8054ab05ebc58c9dc2136c79f71b6` |
| `wedding-procession.png` | `1d1469395a43995d218ce88a4b9a65a01fb78dc9ef082cf9ad1a356ceec9d7f8` |

All image hashes and the four source hashes in the producer manifest were independently rechecked and match. Runtime helper SHA-256: `5798d548074eb9fad7de3483c1346f0e6a86c1bfdca07173c534042f4b388188`. Integrated `street-scenes.ts` SHA-256: `f4a5c017f9d0d889faf0a3c45bba2d8e6f76694b3b829ba83b573943d3f3aa76`.

## Frozen15 native failure, preserved

**Historical result: HOLD.** The reviewer opened `native-scenes-v15/level-08-night-playing.png` and the two held files from the original frozen build. The native owner subsequently renamed the held failures to `level-08-night-blank-failure.png` and `level-08-after-toggle-blank-failure.png`, preserving them as failure evidence. The night-playing image visibly contains multicolour anatomical guests, attached limbs/hair and a clear full-body Bhanumathi beside the Roadster. In that frame the guests remain secondary and do not obstruct the main character or car.

Both held captures are blank apart from the pause button. They are failure evidence, not proof that the new crowd is visually accepted. The native QA owner reports that the diagnostic campaign observer still assumes `delivery-wedding-crowd` is an `InstancedMesh` and dereferences `instanceMatrix.version`; the replacement is a `Group` of four meshes, so that listener throws and interrupts the REVEAL/hold flow. Root and the observer owner are repairing that integration and recapturing a new freeze. The reviewer did not alter the observer or claim to have independently replayed its exception.

The source/CPU successes did not override the interrupted actual scene. Native approval was withheld until the fixed day/night evidence below was actually opened.

| Frozen 15 native PNG | SHA-256 |
| --- | --- |
| `level-08-night-playing.png` | `af562b3fa7d4179cc08429a9792c6c8e0f57da70b8e4d4ea604c95fc33d5c0c8` |
| `level-08-night-blank-failure.png` | `7c4d8198ccfdae07009bd43a1139176688a8dc527dde9d6e2f3a8289ea2dac59` |
| `level-08-after-toggle-blank-failure.png` | `0e5ace9b875564e3bfa63c1c645194cc3cc5d222dc4757032ddae25b6eb5bd32` |

## Frozen17 native replay — final scoped visual PASS

The reviewer actually opened all four final held images and the subsequent road image in `native-scenes-v17/`: `level-08-night-held-a.png`, `level-08-night-held-b.png`, `level-08-day-held.png`, `level-08-held.png` and `level-08-next-road.png`. The two day/held files are byte-identical and are counted as one image. Both night captures are distinct.

- The main character remains full-body and readable beside the Roadster in day and night. Neither the generic guests' raised arms nor their bodies intersect her visible silhouette or obstruct the character-viewing camera. The car and character have clear physical separation in the inspected views.
- Visible guests have coherent anatomical heads, necks, arms/hands and garment silhouettes, with separate skin, hair and costume colours. The old single-tinted stick bodies are absent. The smaller reduced-detail guests remain clearly secondary to Bhanumathi. No arm spikes, detached hair or broken cloth panels appear in these captures.
- The procession remains visible in both lighting states. The two night frames show changing scene/character positions without losing the composed hold. The only visible actions during the hold are Pause and Next; the former blank scene is not reproduced. Still images do not prove every motion frame, so the actual matrix-motion facts below provide supplementary evidence rather than substituting for the pixel inspection.
- After Next, the separate road screenshot shows the Roadster and restored normal driving HUD on the new road. The saved accessibility capture records the intervening loading screen. The reviewer did not operate this browser session; the native QA owner performed the assisted scene replay.

The reviewer independently read the compact Level 8 portion of `level-08-campaign-evidence.json`: completed `true`, automatic handoff `true`, observer healthy with failureCount `0`, no story violations, no missing physical facts and no missing visual checks. Recorded facts include street procession, crowd animation, authored dance, grounded arrival, physical pizza transfer, viewing hold and the direct Next/loading/new-road transition. The report explicitly discloses **QA scene staging, player relocation and pickup not observed**. Input is **mouse in a 932×430 touch layout**, with `trustedTouchObserved:false` and `physicalHardwareVerified:false`; this is not a natural jump-pickup run or a physical-phone test. Native Pause/Resume was observed by the native QA owner, not independently operated by this reviewer.

The current observer now traverses actual visible `InstancedMesh` children and requires all visible batches' matrix versions to change before certifying crowd motion; it does not dereference instance attributes on a Group. Passive observer failures are caught and remain explicit invalid evidence rather than interrupting completion or being cleared by recovery. The reviewer inspected that source and independently reran `node scripts/test-v21-fixes.mjs story-qa-observer-safety`: **7/7 pass**, in addition to the 40 crowd/scene/camera checks above. The helper and integrated scene source hashes still match the producer manifest; no art geometry was rewritten to fix the observer.

| Frozen17 native evidence | SHA-256 |
| --- | --- |
| `level-08-night-held-a.png` | `5d24865357115ee7d5e67bf3403b4537cf58848008ad9e24c9f0f45e56b9a935` |
| `level-08-night-held-b.png` | `ac2285f97418b98cad2c9d36432e378574afe3e65490d76456b78025069f5969` |
| `level-08-day-held.png` / identical `level-08-held.png` | `18eaf64ea05fea41163e889cfbe4bbcc68bbc0a1edfa908b0c2af385440d6312` |
| `level-08-next-road.png` | `452e3de5ec7182ce38178d97d932cba5ba557b599c8abc4ab69dd60ab50d89df` |
| `level-08-next-ax.txt` | `856d5863ead4c19b2068e5b2906ac03ca8306c312f31705c72a49295e01ad08d` |
| `level-08-campaign-evidence.json` | `fb6cdef6af3888d2de26479732bc0e263880e0420fb28451495b43a86d49f2fc` |

There is no remaining observed wedding-crowd geometry, disposal or native-scene blocker in this evidence. Integrated mobile performance/thermal/memory validation, natural player pickup and the rest of the campaign remain Root's separate acceptance gates. The measured local geometry cost above remains real; the visual pass is not an FPS claim.
