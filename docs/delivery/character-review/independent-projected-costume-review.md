# Independent Pushpa projected-costume component review

Reviewer: `/root/container_underwater_scenes`. Date:2026-10-31. The reviewer did not create, texture, rig or render this model. Actual supplied offline3D renders were independently opened through local image viewing; no Chrome/native input was used while QA owned the browser. This is requested component feedback, not a production release approval.

Exact candidate inspected: `/tmp/roadster-art-pipeline-validation/pushpa-projected-costume-v1.glb`, SHA-256 `5b975297467105183f09896fb3e905c1869ecaee26d90a5f50f10e9c50d9093e`.

| Actual rendered view | Preserved evidence path | SHA-256 |
| --- | --- | --- |
| Front full body | `evidence/independent-pushpa-projected-costume-v1/front.png` | `55ecccd524ba91133da418f2f8cb830c3b383032da6c7a6120d0dc71c5ea656c` |
| Three-quarter head/torso | `evidence/independent-pushpa-projected-costume-v1/three-quarter.png` | `154d78a505c28a672defdca241b606306a566f00dd8f368149ff32de9413f2de` |
| Profile head/torso | `evidence/independent-pushpa-projected-costume-v1/profile.png` | `dbb8e4cded7d2426f2bf570eb7b68c070cd4eca9be26fe535aed97f0751f4318` |
| Three-quarter complete body | `evidence/independent-pushpa-projected-costume-v1/full-body.png` | `8f0a2e0a9118d83d9c651cd17fc2dc2bd39d719e72325b163d6cac6909b01f84` |
| Back complete body | `evidence/independent-pushpa-projected-costume-v1/back.png` | `cc475fded9c47c9375096e6fefac8a2bbb7dc9d167a2727d9ec02fb8b34658ea` |

## Component decision

**Keep as a body/costume repair draft; withhold from the production character.** This is substantially more readable than a melted reconstruction: brown four-pocket shirt/trousers, open collar and chains, cuff jewelry and embroidered loafers are visible. Front and rear costume regions are coherent at a glance, and the complete silhouette has arms, legs and feet. These useful components do not yet constitute close actor likeness or the requested seated Japanese-reader scene.

The references constrain an interpretation: the cinema-distributed Pushpa2 poster establishes the brown outfit/red lenses style. The synthetic front/back guide supplies unseen costume detail; it is not another verified film still. The native Mythri profile uses different teal/no-glasses styling. Keep one coherent selected movie appearance and do not claim this draft's rear seam/feet were independently verified by an unseen primary photo.

## Repair order

1. **Finish lateral material coverage before further character polish.** Wide black bands are visible from the crown and side of the head through ears/neck, shoulders, outer sleeves, arms/hands and trouser sides. The profile shows a particularly large smooth black shoulder panel bordered by stretched brown image edges. This reads like front and back photograph projections joined by an unfinished middle. It is not plausible shirt shading and cannot be accepted because the front looks good. Give the actual side UV islands coherent fabric/skin/hair base color; dilate source-edge colors only where appropriate, blend front/back seams and manually resolve collars/cuffs/finger boundaries. Preserve deliberate hair/beard shadows while removing transparent-source black contamination. Re-render unlit and lit views to distinguish a corrected albedo from a lighting cover-up.
2. **Replace and integrate the head as a real volumetric component.** The current face remains soft/smeared, with a mask-like brow/cheek/beard plane and weak glasses/ear definition at three-quarter/profile. The side/back hair is interrupted by the black band. A new larger-pixel head should preserve a plausible nose–lip–chin profile, real temples and earpieces, coherent beard thickness and actual rear volume. Fit at anatomical head scale rather than the earlier head-only viewer's whole-object1.85m scale. Blend the neck geometry/material seam without a hard ring, shirt penetration or disembodied beard. A better front texture cannot alone pass profile geometry.
3. **Repair hands and transform the rest pose into the scene pose.** The book currently hangs beside the body near a loose hand. It is not visibly gripped between fingers, held in reading position, or supported by a lap. Dark finger-side strips make parts of both hands look gloved/unfinished. Inspect palms, thumb-web and every contact finger from front/back/side; separate fused digits and remove albedo contamination. After the head replacement, rig hips/knees/ankles into a seated pose with chair/floor contact. Bend shoulders/elbows/wrists so the book is physically held at a readable angle and both gaze and head point at it. The existing image of a book near a hand is not evidence of this contact.
4. **Check costume after skinning.** Four pocket flaps and cuff/pendant edges are mostly texture-defined and may smear when the shoulders/elbows/hips bend. Maintain a clean shirt hem, trousers around seated thighs, soles against the floor and no rings/chains merging into flesh. Retain the coherent front/back costume where it works; do not destroy the face or silhouette merely to reduce triangles before fixing these boundaries.
5. **Review the exact final exported rig in the real container.** Require seated reading, book grip, recognizable face from the ordinary car-entry camera, actual pizza placement/contact, completion and safe departure while the truck remains physical. Add mobile-sized and night views. The five current neutral standing renders do not contain the container, chair or gameplay handoff and cannot establish those checks. No FPS, thermal or physical-phone quality conclusion follows from these offline renders.

## Acceptance state

Film identity/close face: unapproved. Hair/material continuity: fails in current side views. Complete standing costume: useful draft with unfinished sides. Full articulated reading pose/book/hands: missing. In-game handoff/mobile/night evidence: missing. Production manifest and release fingerprints were not changed by this review. A new head, UV/material edit or rig changes the exact candidate and requires a fresh review of those new bytes.

## New head composite follow-up

Actual candidate: `/tmp/roadster-art-pipeline-validation/pushpa-composite-reader-v1.glb`, SHA-256 `f612fe5eedc2d2443a1ee35a76f70fc58a45db783a489ed710c8b4daa9f71fe6`. All five supplied offline views were actually inspected; the large Pushpa2 poster and native Mythri139s profile were reopened for comparison. The reviewer did not produce this art or these renders.

| Actual view | Preserved evidence | SHA-256 |
| --- | --- | --- |
| front | `evidence/independent-pushpa-composite-reader-v1/front.png` | `6a1b18b81923e68125bde36824c5d6211024b648d0b2d6eb57ca6fa32b508457` |
| three-quarter | `evidence/independent-pushpa-composite-reader-v1/three-quarter.png` | `25a813cb8c3e165b99d493faeadc32aafa7f79b4401c7d6d060b4714890bec6a` |
| profile | `evidence/independent-pushpa-composite-reader-v1/profile.png` | `54fc6e58fe0fbe0d1337e19bd3c528705bcceef371ce8ab53c74c76a3e22ea31` |
| full-body | `evidence/independent-pushpa-composite-reader-v1/full-body.png` | `7e22a03f0a7c8c7eea7f8977ca0dd8e34cd817eb905eb90612cbe12f4ee0e46f` |
| back | `evidence/independent-pushpa-composite-reader-v1/back.png` | `8645b1a5cf72c2f1e67c77b7ebbc3a2eb8ac0b246129e204aa503c78b63f37b0` |

**Component decision: worth continuing to repair, still not a close-match or release pass.** This head has genuine side and rear volume, a readable nose–lip–chin profile, swept/curly hair, round red glasses and a Pushpa-style beard. Those make it a much more promising anatomical starting point than the previous planar face or failed slab. Hair and profile no longer depend entirely on seeing a frontal photograph. The full-body silhouette remains a viable costume draft.

The face is still a softer/rounder idealized interpretation. The poster's brow/cheek/mouth read sharper and sterner; this model has lighter/pinker lips and a smooth block-like beard, particularly in the front view. Do not infer exact likeness from red glasses and hairstyle alone. The no-glasses Mythri profile is useful for anatomy but has different teal-shirt styling; retain a coherent chosen appearance.

Visible defects requiring another export/review:

1. Numerous black pits/triangular marks cross forehead, cheeks, nose, hair and beard. The supplied images cannot establish whether each mark is an atlas-gutter/albedo leak, backface/normal defect or real hole. Inspect the same angles using unlit base color and a neutral single-color clay material before selecting the fix. Dilate valid UV-island borders and correct sampler/UV coverage where the cause is texture; repair normals/topology if marks persist with clay. Do not hide defects with a bright light.
2. The bottom of the head has a conspicuous dark open cap/ring and a discontinuous neck-to-shirt join. Fit/cap the actual neck geometry, preserve anatomical scale and continuous skin material, and check head turns/deformation for collar penetration or gaps. Do not stretch the head to disguise the seam.
3. Hair is coherent in outline but looks like coarse layered clay ridges with pitted surfaces. Preserve the improved overall volume while cleaning the damaged surface/material; inspect rear/ear/temple transitions. The glasses require physical thickness and temple arms rather than only colored lens pixels.
4. Re-baking a large-pixel front guide can be a useful material repair, but it does not prove facial proportions and must not smear frontal eyes/lips onto the side/back. Preserve or supply coherent lateral textures, realistic ear depth and beard thickness. Re-review front, profile, rear and unlit views of the exact baked output.
5. Body black lateral bands, hanging book/loose hand and missing seated reading interaction remain separate issues in this version. The producer/root report later fixes in progress; those later bytes have not been reviewed here. A new head improves one component and does not approve the old hands, book, rig or container handoff.

Final release remains withheld: all actual posed reading/contact, normal in-game camera, mobile/night and pizza-handoff requirements are outstanding for this exact candidate. No numerical resemblance score was invented and no production review manifest was changed.

### Neutral-clay diagnostic follow-up

The supplied clay three-quarter render was independently opened. Black/pitted facet marks persist across the otherwise white face, hair and beard, confirming that the current artifact is not solely colored albedo. Saved as `evidence/independent-pushpa-composite-reader-v1/clay-three-quarter.png`, SHA-256 `7a51a7765c8485aa2cd2c0d785b4524039a2d61e72ea7995e78b444b5a7a3b87`. This observation does not by itself identify the exact geometric/normal cause. Root reports a weld-before-normals/decimation repair in progress; its new exported result still needs visual review.

### Repaired V2 clay and unlit diagnostic

The supplied actual repaired clay and unlit three-quarter images were independently opened. The previously dense black face/hair chips are absent from the repaired clay surface and the unlit color view. This supports retaining the reported geometry/normal correction rather than attributing success to bright lighting. Root reports duplicate UV-split vertices were welded before consistent normals/decimation; the independent visual conclusion is limited to the actual displayed improvement, not a new reconstruction of the tool history. The open dark neck/collar cap remains plainly visible and is still unapproved.

| Actual diagnostic | Saved evidence | SHA-256 |
| --- | --- | --- |
| clay-three-quarter-v2 | `evidence/independent-pushpa-composite-reader-v1/clay-three-quarter-v2.png` | `b4b028b71325b7209291e5edfcc24ba57d993732990c4a36bc6eb249f1030775` |
| unlit-three-quarter-v2 | `evidence/independent-pushpa-composite-reader-v1/unlit-three-quarter-v2.png` | `1d8c7892cc639b015b330b8f121a4cd5221e6fa6685fd635e2b57d00cce766e0` |

These targeted diagnostics do not establish all-angle likeness, complete neck integration, hand anatomy or the in-game scene. The latest exact pose/candidate reviews remain pending those checks.

### V3 neck fit — targeted rest-view review

Root supplied exact candidate SHA-256 `7adb9c7085dec1bf365b152af00ee564b68cae1163453b69d889ad9c73ed05e9`. The actual three-quarter and profile rest renders were independently opened. The conspicuous dark neck-cap/ring under the beard is no longer visible; the head/collar reads connected in both supplied views. Retain the lower fit as an improvement. The broad plain shoulder lateral strip still reads unfinished and is reportedly being repaired separately. These two rest images do not establish neck behavior during Read, head turns or actual container camera/contact, and grant no final character approval.

| Inspected rest view | Preserved evidence | SHA-256 |
| --- | --- | --- |
| three-quarter | `evidence/independent-pushpa-composite-rest-v3/three-quarter.png` | `7f06ad7b1f46d8a05da089afdeec40fff92d3c2e61c668ee9cef4b4056e7f4e7` |
| profile | `evidence/independent-pushpa-composite-rest-v3/profile.png` | `9a30f9ad062170a82b3bfae86ffe907226f5562e53dae316b65b3a5b4c5188a3` |

### V4 lateral costume repair — three actual views

Exact GLB SHA-256 `75465efb6fb302e652dc8717184a681b12bca03180113e3048bcf251107186c9`. Actual three-quarter, profile and back renders were independently opened. The reviewer did not author the model, synthetic guides, projection or renders.

| Inspected actual rest view | Preserved evidence | SHA-256 |
| --- | --- | --- |
| three-quarter | `evidence/independent-pushpa-composite-rest-v4/three-quarter.png` | `a16178e405caa2e9d6d7209e92af658cae33e88d3e1f8640d9ca00c8d39245b6` |
| profile | `evidence/independent-pushpa-composite-rest-v4/profile.png` | `70d71a2791451885e3a00bbab1498e9c4c8a43c2e821f9aa4dd9c4b923303f54` |
| back | `evidence/independent-pushpa-composite-rest-v4/back.png` | `ff6e9988e11d5bfdca4dc6f45051891fbb7d7df144a0042ba7d4844ac083200d` |

**Component verdict: the dominant lateral material-coverage defect is corrected in these views; keep this repair for hand/pose integration.** The side shoulder/sleeve has brown woven fabric, shading and seam detail rather than a broad flat black/tan band. Back, arm and trouser transitions read substantially more continuous. The lower head fit still looks connected. This is an actual observed improvement, not approval from a texture-bake report alone.

The close profile still shows slightly doubled/stretched dark lines around the epaulet/collar/shoulder boundary, plus tiny sharp marks near the pocket/underarm. Inspect posed/unlit close views for remaining projection seams; they are smaller than the earlier dominant unfinished panel. The supplied three images do not show the complete updated reading pose or actual handoff.

The synthetic left/right side guide PNGs were also independently opened. They supply plausible brown woven side fabric, sleeve tabs, seams and loafers; they are authored modeling aids, not new film photographs. Exact guide hashes: left `31071c05e4feb6383690ea9d034b58a653ac3ff7da26aa8f1f0a73acfdd070af`; right `d975d1cb611a7039d314907a4d0fdbbe8501be86cd9c2f91a9898ac1de2e88b9`. Side tab/button geometry, cargo-pocket asymmetry and unseen seam/sole/jewelry placement therefore remain inferred. Do not cite a generated side guide as primary evidence for a film-accurate unseen surface.

No complete-character, hand anatomy, likeness or production scene approval follows from this material component verdict. The new exact final hand/rig/pose bytes and actual container/car-camera sequence still require independent visual review.
