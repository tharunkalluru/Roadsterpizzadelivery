# Independent generated Pushpa review

Verdict: **REJECT for production display. All appearance releases remain unapproved.**

Reviewer: `/root/container_underwater_scenes`, acting independently of the TRELLIS generation/asset author. Reviewed on 2026-10-31 at approximately 07:40–07:43 UTC. This reviewer did not generate, change, retouch, rig or approve the asset.

Candidate: `docs/delivery/character-review/candidates/pushpa-trellis-first-pass.glb`

SHA-256: `5f54c86cbe9f8f0c6791703c41cd7da52782980d0f4faff42c81f055166ad6c3`

## Evidence actually inspected

- Opened the actual multiangle GLB viewer in Chrome through computer-use tools at `http://127.0.0.1:4201/docs/delivery/character-review/generated.html`.
- Visually inspected its front face, three-quarter face, profile face, full-body and rear views together with the embedded reference. These are rendered views of the GLB, not an inference from file size or triangle counts.
- Inspected both the viewer's unlit source-texture mode and its original material mode. Original material mode made the already dark face and rear still less readable.
- Inspected the full-resolution local generation reference `candidate-inputs/pushpa-promotional-poster.jpg`. Its visible title and cinema-hosted source establish that it is a Pushpa 2 promotional poster. Source: <https://poster.gsc.com.my/2024/241202_Pushpa2Telugu_big.jpg>. This is a cinema-distributed promotional reference, not evidence for the requested seated Japanese-reading scene or a texture/release licence.
- No actual seated-reader, in-truck or in-game handoff view was available in this viewer. Those checks were not performed and cannot be marked passed. No screenshot file was persisted by this reviewer; the actual full-page comparison images were observed in the computer-use tool results.

## Visual findings

| Required check | Result | Observation |
| --- | --- | --- |
| Identity | Needs work | The front and three-quarter face do not retain a sufficiently readable, close facial structure. Nose, glasses, cheeks, moustache and beard boundaries merge into high-contrast patches. A brown shirt and beard alone are insufficient. |
| Correct film role | Needs work | The reference is the correct film, but the generated model carries a rifle in a walking poster pose. It does not represent the requested seated reader inside the sandalwood container. |
| Hair and face | Needs work | Hair reads as a rounded cap with a protruding wedge at the rear/profile, rather than the reference's shaped textured hair. The lower face is a broad almost featureless black mass. The reference does contain red-tinted round sunglasses: the red tint itself is not the defect. The candidate loses the readable round frames/lenses and the distinction between glasses, skin and facial form. |
| Body and costume | Needs work | The broad brown outfit and walking silhouette follow the poster, but the hands and limb boundaries are crude. The rear is nearly uniformly black and cannot support a close costume/likeness comparison. The unseen rear cannot be assumed correct from a front poster. |
| Seated Japanese-reader pose | Wrong current pose | The actual rendered figure is standing/walking with a rifle. No chair contact, bent seated legs, reading book, Japanese-study prop, appropriate hands or reading-to-handoff transition was demonstrated. |
| In-game handoff/readability | Not reviewed | A model viewer does not show a correct catch inside the moving closed container, interaction with the chair/book, the normal driving camera, night appearance or mobile-distance readability. |

## Concrete next iteration

1. Use verified film evidence for the requested role and reading setup, with clean face, three-quarter/profile, costume and seated-body references. Do not treat the promotional walk as the scene's final pose.
2. Repair/rebuild facial form and texture separation: retain the correct sunglasses, nose, moustache and beard outline under neutral game lighting. Changing only metallicity cannot repair missing geometry or baked black texture detail.
3. Supply usable rear/side costume information and remove the large featureless black regions. Inspect the unseen side directly rather than assuming symmetry.
4. Create the seated rig and physical chair/book contacts. Remove the rifle from the reading setup; preserve the Japanese-study prop when transitioning to a plausible handoff.
5. Re-present front, three-quarter, profile and full-body views, then the actual in-truck reading and handoff at the normal gameplay camera. Include mobile-sized and night views before release.

This verdict is a visual rejection of the current candidate. It is not an approval based on the fact that a GLB was generated or loads successfully. The existing runtime withholding remains required.

## Second candidate: independently reviewed and rejected

Reviewed at approximately 07:45–07:46 UTC on 2026-10-31 through the same actual viewer with `?second=1`. Candidate: `candidates/pushpa-trellis-second-pass.glb`; SHA-256: `5a318d6b52f532f4a6ec8e21869a90fdd3bf222acf6b10f7898fcad7576222e1`.

**Verdict: REJECT for production display.** I inspected all five rendered angles—front, three-quarter, profile, full body and rear—against the embedded correct-film poster, then toggled the original material for a second lighting inspection. No seated reading or in-game handoff evidence was supplied, so those required checks remain unreviewed rather than passed.

The second version improves the side-of-head silhouette and adds some beard, hair and shirt texture detail. These improvements do not establish a close facial match. In the unlit inspection the front has large pale/overexposed patches with poor separation of glasses, brow, cheeks and nose. The beard remains a long, dark, flat-ended mass, especially in profile; the ear/sideburn area has conspicuous pale texture streaks. Red-tinted glasses are intentional in the source; their tint is not being rejected.

The full-body view still has the walking/rifle pose rather than the requested seated reader. Small red fragments appear around the feet in both full-body and rear views; they look like poster/footer remnants reconstructed as unrelated geometry and must be removed. The rear shirt and much of the body remain almost uniformly black, with inconsistent pale/orange leg patches. The original material makes the face and rear darker and does not repair the shape/texture problems.

All six required visual checks therefore retain the first review's results: identity, role presentation, hair/face and body/costume need work; the current scene pose is wrong; in-game handoff/readability has not been demonstrated. A larger texture or additional triangles is not evidence that these checks passed. Continue withholding this candidate and retain the corrective actions above.

## Third candidate: portrait head/bust

Candidate: `candidates/pushpa-trellis-portrait-head.glb`; independently verified SHA-256: `267b8fd71c403b1220a705ffd3a0e4295867c928237008d19cb09d388594a737`.

Observed at approximately 07:55–07:56 UTC on 2026-10-31.

Inspected through Chrome/CUA at `generated.html?head=1` after the generation operator explicitly released browser-input ownership. I viewed front, three-quarter, profile, whole available bust and rear, together with both the credited press portrait and the supplied Mythri Pushpa 2 film-profile frame. I also inspected the original-material mode. This was an actual GLB render inspection, not approval inferred from the mesh's reported statistics.

**Complete character/scene verdict: REJECT for release; keep withholding. Potential head-component verdict: PENDING further correction and review.** No appearance is approved by this report.

The third candidate is a substantial improvement in facial readability over the two poster-based full-body attempts. Glasses, beard, hair and separate facial features can now be read in the unlit view. This makes it a potentially useful starting head mesh; it does not satisfy the required close-match or scene checks.

The generated glasses are warped/asymmetric, with a drooping/angular lens outline that differs from the supplied portrait's round lenses. The lips are inflated and strongly pink; the nose/mouth relationship and face proportions need correction against the source. The profile ear is strongly red. The rear is almost uniformly black, and original-material mode makes the face substantially darker. These issues remain visible in actual multiple-angle renders rather than being assumptions about the asset format.

The source and resulting bust depict a black-shirt press appearance with a microphone; that is supplementary appearance evidence, not the seated Japanese-reader costume. The supplied correct-film profile has different styling context and does not establish the desired seated costume. The available "Full body" pane is only the whole bust: it has no lower body, seated legs, chair contact, book, articulated reading/catch hands or in-game handoff. The microphone/press-pose geometry must not simply be placed in the container as a substitute for those missing components.

Saved independent screenshots:

- [Unlit multi-angle head, portrait and film-profile comparison](evidence/independent-pushpa-head-unlit-review.jpg)
- [Original-material comparison](evidence/independent-pushpa-head-material-review.jpg)

Screenshot SHA-256 values: unlit `2d6c5c88eae32fd8223d4e2f8b906ea64711479550e05766cd952e85d29462d8`; original material `83b997728c2eb47667d8b3f32214da87f04900884aa9952d6fea22c22aad5a43`.

| Required check | Third-candidate result |
| --- | --- |
| Close facial/identity match | Needs work; more readable than the first two, but glasses/mouth/nose proportions are not yet a close match |
| Correct film role | Not established by the press-portrait bust |
| Hair and face | Needs corrective geometry, texture and neutral-light review |
| Body and costume | Incomplete; press shirt/microphone bust only |
| Seated Japanese-reader pose | Not demonstrated |
| In-game handoff/readability | Not demonstrated |

Next iteration should correct and review the head as a component, then bind it to an appropriate fully modelled/rigged seated reader with actual book/chair contacts. The final full character still requires all five comparison views plus the real in-container reading and handoff checks. Do not treat the head-component improvement as a complete-scene pass.

## Fourth candidate: native TRELLIS.2 portrait reconstruction

Candidate: `candidates/pushpa-trellis2-portrait-head-v1.glb`.

Independently verified SHA-256: `a97ed38066fc068620fc5daec7016cc97465058c2671eca718253d3829bb244c`.

**Verdict: REJECT for production and as the proposed anatomical head component.** This verdict follows the actual rendered model, not the producer's preliminary report or its file statistics.

Observed at approximately 08:31–08:33 UTC on 2026-10-31.

I opened a separate Chrome/CUA review tab at `production/trellis2-review.html` after the producer explicitly released browser/native input. I inspected the five rendered views (front, three-quarter, profile, complete raw component and rear) in native PBR with the neutral room environment, switched from the default Z-up display to Y-up, then inspected an additional 90-degree rotation in unlit texture mode. The actual credited press input and supplied native Mythri film profile were visible beside the model. These controls changed display framing only; I did not edit the asset, materials, geometry or generation inputs.

The result consists of thin rectangular textured slabs/planes, with projecting rectangular boundaries. The turned view reveals the nearly flat edge; changing the up axis does not produce an anatomical head. Dark, grey/white and red texture fragments are stretched across these surfaces. No coherent facial volume, nose/eye/mouth relationship, ear, hair or beard silhouette can be accepted from these actual views. Unlit inspection retains the malformed texture/shape, so this is not solved by raising exposure, changing metalness or rotating the model.

The raw export also has no complete human body, usable reader rig/animation, book/chair contacts or actual in-container handoff. A reported 282,808 triangles, native PBR and 14,823,972-byte file are not evidence of a close-match head or finished scene. Do not bind this slab into the movie body or simplify it into a proxy character. Obtain a genuinely volumetric head candidate, verify preprocessing/foreground and the exported artifact, and review that exact new asset independently. The visual review does not establish which upstream processing step caused this failed reconstruction.

| Required check | Fourth-candidate result |
| --- | --- |
| Identity | Needs work; no coherent anatomical likeness in the rendered slab |
| Correct film role | Not established by the press input or malformed reconstruction |
| Hair and face | Needs work; lacks accepted three-dimensional facial/hair structure |
| Body and costume | Incomplete; no usable complete movie body |
| Seated Japanese-reader pose | Not demonstrated; no reader rig or contacts |
| In-game handoff/readability | Not demonstrated |

Saved independent screenshots:

- [Native PBR, default Z-up, all five views](evidence/independent-pushpa-trellis2-pbr.jpg)
- [Native PBR with alternate Y-up display](evidence/independent-pushpa-trellis2-y-up.jpg)
- [Unlit texture, Y-up and 90-degree rotation](evidence/independent-pushpa-trellis2-unlit.jpg)

Screenshot SHA-256 values: native Z-up `dddd594e6b3757889381f02fad0d00c8876dc26e23254c0df3f30dc115bfae3e`; native Y-up `94681ca55b5742e06821e7922b26c832b3326f10cdea3ca884d1192c17f7d932`; unlit/turned `2aa5777da8ca721a76f32e11142286041aed66af4a7b2426cc4b9af2f9472230`.

All appearance releases remain unapproved. Browser/native input ownership was released again after this inspection.
