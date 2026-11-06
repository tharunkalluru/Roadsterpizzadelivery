# Independent NPC review — iteration 7

Reviewer: `npc_people_independent_review`, separate from the producer. **Verdict: PASS for the inspected NPC anatomy, wardrobe and native gait defect.** The extreme animated deformation that blocked v6 is no longer present in the supplied native v7 evidence. This is a scoped visual/code review, not whole-game release approval, a physical-phone performance result, or a claim of photoreal humans.

The reviewer actually opened all nine PNGs in `evidence/main-expansion/npc-captures-v7.json`, identified as frozen feature build **`ed472b0b6aaf6c5507313d38c314a083b44b8f677efc876a8c45c8be44c9ba88`**. Previous v1/v3/v6 FAIL reports are preserved. No implementation, browser, server, approval registry or deployment was changed by this review.

## What passes now

- **Native walking output is coherent.** Both held stride views, the ordinary profile/front views and driving-distance capture show modest strides below the pelvis and restrained arm movement. There are no v6 airborne splits, knees folded beside the shoulders, detached-looking extremities or long stretched sari/burqa panels. Hands, knees and feet remain connected to the body. Wrapped clothing retains its silhouette while exposed feet change pose; it is no longer an exploded column or a static substitute for a walker.
- **The successful static repairs remain intact.** The native faces and three seated views retain joined neck/jaw surfaces, intact shins/pelvis, attached hair, continuous sleeves and attached drapes. Age/sex/build/wardrobe differences still visibly distinguish children, teenage male/female figures, adults and elders. The widened face gallery remains free of the former neighbour-arm overlap.
- **The repair did not replace the art to hide the fault.** SHA-256 checks show `human-body.ts`, `human-skin.ts`, `people.ts` and `npc-human-v4.json` are unchanged from the v6 producer manifest. The four static face/seat screenshots are byte-identical to the corresponding v6 images; that is expected for unchanged deterministic static geometry, and they are not counted as additional animation samples. The v7 stride/profile/front/driving captures are distinct from the failed v6 ones.

The result is a believable simplified anatomical generic NPC foundation, appreciably closer to real human proportions than the earlier disconnected primitives. Skin/cloth still have a simplified, somewhat glossy shared-material appearance, facial details remain untextured, and cloth folds are restrained. This pass does not describe them as scans or cinematic photoreal people, nor does it claim that arbitrary `face` IDs create extra facial morphs.

## Why the correction is credible

The inspected `human-gait.ts` now bounds finite animation delta to `[0, .05]`, treats a nonfinite delta as zero, bounds response amplitude to `[0, 1]`, and retains the last finite phase. The fixture derives its first delta from the first animation-frame timestamp and sets that delta to zero. This addresses the earlier unsafe expression: with an initial delta of `−0.8s`, `1 − exp(−10 × dt)` is approximately `−2,980`, so the old response could push amplitude far below zero and generate enormous joint rotations despite otherwise small gait constants.

The new code protects the shared runtime rig used by city walkers, bus exchange walkers and metro transfers, rather than only the screenshot fixture. No route/service timing or crowd-density code is involved in the timing correction. The numerical explanation is consistent with the new native output; this review does not claim to have independently replayed the original browser timestamp sequence.

The added regressions check the first five updates for negative/nonfinite deltas and long hitches using actual deformed body/cloth vertices and bounded joint envelopes. The palette test compares the float bone matrices and bind order used for upload with CPU deformation for independent scaled/rotated figures. That is a useful upload-contract regression, and the fresh native images separately supply visual evidence. The palette test alone is not a GPU execution test.

## Independent checks rerun

| Command | Result |
| --- | --- |
| `node scripts/test-v21-fixes.mjs npc-native-pose` | **8/8 pass**, including the new invalid-first-delta and independent-palette tests |
| `node scripts/test-v21-fixes.mjs npc-anatomy` | **4/4 pass** |
| `node scripts/test-v21-fixes.mjs pedestrian-geometry-lifetime` | **5/5 pass** |

All **17** checks passed in the reviewer's current checkout. Source finiteness/closure, selected seated contacts, demographic generation, sleeves, wrapped-foot stepping and bounded disposal remain covered. The nine-person fixture remains `47,996` triangles/`10` draws and the seven-seat fixture `21,142` triangles/`8` draws; no budget increase was used for this fix. Those counts do not establish integrated FPS or active memory cost.

## Scope and remaining integrated validation

The v6 review independently inspected twelve actual vehicle side/cabin captures and found the static occupant/contact foundation substantially repaired. With the four production geometry sources hash-identical in v7, that evidence remains applicable to those unchanged meshes; I did not present it as newly captured v7 vehicle evidence. Some controls/feet are obscured by real body panels in those angles, as recorded in the v6 report.

The nine native stills demonstrate plausible sampled poses, not uninterrupted full-cycle motion or a complete player route. Root must finish ordinary streamed-city walking, bus boarding/alighting, metro transfer, camera-orbit visibility, night driving, mobile controls and integrated performance/memory checks on the final combined build. In particular, observe a complete stride in motion and app-switch/resume behavior. This report supplies no physical-phone FPS, heat or battery claim. There is no remaining observed blocker in the NPC fixture evidence reviewed here.

## Evidence actually opened

Paths below are relative to `docs/qa/evidence/main-expansion/`.

| PNG | SHA-256 |
| --- | --- |
| `npc-stride-a-v7.png` | `c93624a8db6054e1768b877d459e5d9e55ffbbaf0b5bdb7404adcf69dfc1882c` |
| `npc-stride-b-v7.png` | `0881e779d69d26aa806c94aa546d81f711d40fe812a911563e25b36e8832b4ed` |
| `npc-profile-v7.png` | `10bc434b7c3140eb4fc9c8381a38358c1f81135c0698883074deef75b3894401` |
| `npc-front-v7.png` | `574b34ce47734c47504e0539530c1032c46f1a96c1354332eb13e82f17346cb3` |
| `npc-faces-v7.png` | `04b75c14536819883bdfa0a54ddadb976bc87230d2026181b20d7fcdaaa7ecba` |
| `npc-seated-v7.png` | `ed706e7d8f70752d35d3907efcf4be0bfc8ea6e0854f4c7ecc62134b3eb0ab80` |
| `npc-seated-side-v7.png` | `83bce65524d02f8d464c9a821f4c62040627e629f02b923fe7d13a794ea5a8c9` |
| `npc-seated-quarter-v7.png` | `f7030473c42321d1805ed3e5dd053b52b624d460017f07ff64ba48a2632786a8` |
| `npc-driving-v7.png` | `14e7aca5733caeb5f9d32c3ba2df8ac3541a60da2f750d46f41deafb55acd7cc` |

Reviewed source: `src/world/human-gait.ts`, the unchanged native body/skin/people sources and producer hash manifest, `tests/browser/npc-people.browser.ts`, and the new portions of `tests/v21-fixes/npc-native-pose.test.ts`. No optional CPU-overlay browser session was required or claimed.
