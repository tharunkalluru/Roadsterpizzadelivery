# Independent Pushpa reader pose review

Reviewer: `/root/container_underwater_scenes`. Date:2026-10-31. The producer authored the pose/IK and supplied the offline renders. The independent reviewer opened every supplied view and did not author the model, weights, pose or art. No browser/native input was used.

Exact model: `/tmp/roadster-reader-pose-work/reader-grip-v3.glb`, SHA-256 `e7f041a9a8e9c1340ebe1feeb0a85f8b633a5312805aa07c4d2c9a4174573c70`.

| Actual supplied Read view | Preserved independent evidence | SHA-256 |
| --- | --- | --- |
| front | `evidence/independent-reader-grip-v3/front.png` | `322945dc86e9a22b995ed596a0e9f14e2ac963b91beb3bb8e93e6a57f07abc28` |
| three-quarter | `evidence/independent-reader-grip-v3/three-quarter.png` | `a3b3d22cdb07ce2ad19d55fe0311f858d79b4219a5c09a6921bca24654ffff80` |
| profile | `evidence/independent-reader-grip-v3/profile.png` | `4f6971b32bdeb1f03deffc9fd9f99624283931a7afd299a2eb0105746867b227` |
| full-body | `evidence/independent-reader-grip-v3/full-body.png` | `c2e641b702493fb71bce0ec1de0b78af3379b10ccc4570dd114610885978a685` |
| back | `evidence/independent-reader-grip-v3/back.png` | `6ef1da94b4fe3133d862751bcfa652642974a925715c6cc6868589b4885e5f4d` |

**Pose decision: useful repair draft; no production or completed contact approval.** The seated posture, book held up in front of the torso and slightly downward head/gaze now make the intended reading action understandable. Pages face the reader, unlike the previous loose book hanging beside the standing character. Bent knees and feet have a coherent seated arrangement. The book has two visible covers/pages rather than an invisible interaction marker. These are worthwhile improvements.

Remaining concrete issues:

1. In the complete three-quarter body view, the forearms/inner elbows have a very thin ribbon-like bend and sharp pale triangular junctions under the sleeves. This may combine the known unfinished lateral material strips with actual skin deformation. Inspect the same posed view with neutral clay: if the silhouette still pinches or has a hard triangle, adjust elbow position, skin weights or mesh deformation rather than covering it with a texture. Hands at the correct world target do not prove intermediate elbow/forearm shape.
2. Hands are at the outside book edges, but the fingers/thumbs do not yet clearly wrap a cover/page in the provided views. Open/claw-like silhouettes and black hand-side textures obscure real contact. A tiny minimum hand-to-page distance can come from one point or penetration; it does not establish a convincing grasp. Supply close front/side/back hand views showing both thumbs/fingers, page thickness and no stabbing through the book. The known source hand mesh/material may need repair beyond pose edits.
3. The neutral render contains no chair or ground surface. It therefore cannot establish that hips contact the actual chair, knees clear the container furniture, or soles meet the actual truck floor. The reported numerical foot heights are useful calibration data, not visual proof of scene contact. Review in the true container after rig integration.
4. Reading is user-authored game choreography; the film references need not show a pizza-delivery reader. They still constrain the character's actual face/hair/costume. The current head pits/open neck seam and old black body-side strips are independent known art failures, and this pose assessment does not approve them.
5. The offered handoff animation has not yet been viewed at this review point. Require the actual exported full sequence/contact views, book remaining plausibly held/placed during receiving, and normal camera entry, pizza placement/completion and departure. A single offline Read pose is not end-to-end delivery acceptance.

No production manifest was changed. New skin, model, book, pose or animation bytes need a fresh exact-fingerprint review, including mobile/night readability in the actual scene.

## V4 and V5 targeted follow-up

V4 GLB SHA-256 `34b0687f2d34bf11b7258d397d01b2307930b2561e58dbb66cbb45fa25e6500a`. V5 GLB SHA-256 `dd598bd4e401d8d6b55b71a943eaea05b8a4eede622da95583e833455cd042f7`. Only the actual targeted views listed below were independently inspected; this is not a claim to have completed all five views of either version. The reviewer did not produce or modify these poses.

| Inspected actual view | Saved evidence | SHA-256 |
| --- | --- | --- |
| v4-read-three-quarter | `evidence/independent-reader-grip-followups/v4-read-three-quarter.png` | `9df4ab5a6c695634d36be6df4538bed67cc7a90244fdaf89cafc3da81606dd89` |
| v4-read-full-body | `evidence/independent-reader-grip-followups/v4-read-full-body.png` | `8f53700228ee08361ec0675012d7e60d0c02e5e33cf6cba8179465b8fc935abd` |
| v4-read-profile | `evidence/independent-reader-grip-followups/v4-read-profile.png` | `c577c0d23374ab2eb2626fcc47da1f8806af35571f565286466693ffd6ec1099` |
| v4-handoff-front | `evidence/independent-reader-grip-followups/v4-handoff-front.png` | `14369f22ba0bd15781b24b8d27082b144f3fc8f9b190de3408977f9afe3d702b` |
| v4-handoff-full-body | `evidence/independent-reader-grip-followups/v4-handoff-full-body.png` | `8eebc67d0e9c1fe5b932aaa47990b8c0c0be1867fedd35fcd4373f23c054ad14` |
| v5-read-full-body | `evidence/independent-reader-grip-followups/v5-read-full-body.png` | `8571a797fd9f22a57a764acf196698b654ccfc3444a1b138407fcff51a07210a` |

In the V4 head three-quarter/profile the numerous black face/hair chips are visibly removed or greatly improved compared to V3. This supports retaining the geometry/normal repair. The dark neck/collar gap remains. Brown side fill has replaced the old black side strips, but broad plain panels and front/back texture seams are still visible. It is a material improvement, not final costume approval.

V4 Read and Handoff full-body views confirm that the elbow problem is not solved by the texture changes: the reaching arm becomes a narrow curved ribbon tapering to an almost point-like elbow and enlarged mitten/fist. The producer has acknowledged the deformation issue rather than claiming a contact-metric pass. No actual pizza object/contact is visible in these Handoff renders, so the handoff check remains incomplete.

V5's actual Read full-body shows a significant forearm-volume correction: the prior ribbon silhouette is absent in that pose. The wrists/hands now bend sharply upward beneath the book, and the near hand is narrow/paddle-like rather than showing a natural thumb/finger grasp of an outer/lower cover. Continue pose/weight repair without reinstating forearm collapse. Moving/tilting the book and distributing arm twist can be considered by the artist, but actual hand anatomy/contact must decide the result. One improved full-body image cannot grant an all-angle grip pass.

All these candidates remain unapproved for production. The exact later bytes require fresh front/profile/rear hand evidence, complete animated handoff, chair/ground contacts and the real container/car-camera interaction.

### V6 single-view check

Producer supplied V6 GLB SHA-256 `1a9042aba0baae9ba766c669301b69a17f239c46e3c31c337e74393add6d4b97`. I actually opened its Read full-body render and preserved `evidence/independent-reader-grip-followups/v6-read-full-body.png`, SHA-256 `bc1e4081782bb89623f64d14fd869787c685a3e46ab314bdad4be07453983f86`. The distributed arm twist makes the elbow/forearm volumes plausible in this view and brings the near wrist much closer to a natural book-support angle. The prior point-like elbow ribbon is not visible here. This is a meaningful pose improvement worth keeping. The promised close fingers/page, clay and handoff/pizza evidence has not yet been inspected, so this single-view check grants no final hand-contact, likeness or scene approval.

### V6 close hand/contact verdict

Both promised actual hand/page closeups were independently inspected.

| Actual close view | Saved evidence | SHA-256 |
| --- | --- | --- |
| v6-left-grip | `evidence/independent-reader-grip-followups/v6-left-grip.png` | `a1f41e7f9f9fcf34e1a1a458b7da1b34114fdedc3cc368a3253873533f61c466` |
| v6-right-grip | `evidence/independent-reader-grip-followups/v6-right-grip.png` | `2eda6befe85bd75bb885a361d5e66ab4173e84c5946e2ac63c222fb4d36d4fb7` |

**Hand contact fails for this source geometry.** The hands are fused two-lobed mitten/claw forms without individually readable fingers or a functional separate thumb. The book sits across/near upper lobes rather than being visibly gripped between thumb and fingers. Material/geometry chips also remain on these hand surfaces. This confirms the concern from the wider view; a minimum-distance number did not establish a plausible grasp.

Keep V6's improved arm/elbow volume, but replace or repair the actual hand anatomy/topology, assign appropriate finger/thumb deformation, then retarget the book grip. Further whole-arm posing cannot manufacture missing fingers in a fused mesh. The producer and root were notified; no approval was granted. Actual chair/floor and pizza handoff still require separate review after anatomy repair.
