# Independent character repair and scene evidence work order

Reviewer: `/root/container_underwater_scenes`. Date: 2026-10-31.

**No character is approved by this document.** This is an independent visual work order, separate from asset generation and the proposed Blender composite/rigging work. Pending or rejected actors must remain withheld from the production scene. Working mechanics, a valid GLB, more triangles and successful tests do not establish visual likeness.

This audit uses the actual three candidate reviews in [independent-generated-review.md](independent-generated-review.md), the saved third-candidate comparisons, the current level content, and the current review manifest. It does not claim new browser captures or new film-reference verification. Calls and dialogue are deferred by the user's latest instructions; lip-sync is not a requirement for this scene pass.

## Third Pushpa candidate: component repair instructions

Exact reviewed file: `candidates/pushpa-trellis-portrait-head.glb`.

SHA-256: `267b8fd71c403b1220a705ffd3a0e4295867c928237008d19cb09d388594a737`.

Observed evidence: [unlit five-angle comparison](evidence/independent-pushpa-head-unlit-review.jpg) and [original-material comparison](evidence/independent-pushpa-head-material-review.jpg). The embedded supplementary portrait is `public/delivery/celebrities/allu-arjun.jpg`; the supplied correct-film profile is `evidence/pushpa-official-profile-139s.jpg`, observed from the [Mythri trailer at 2:19](https://www.youtube.com/watch?v=g3JUbgOHgdw&t=139s). The press portrait is useful identity evidence but does not establish the requested seated-reader costume.

The file contains one indexed triangle primitive and one material, with position and UV attributes, one embedded 2048 × 2048 base-color atlas, and no authored normal attribute, skin or animation. These are implementation facts, not visual acceptance scores. The omitted metallic factor defaults to 1 under the [Khronos glTF material specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#reference-material-pbrmetallicroughness). The viewer scales the entire available bust to 1.85 m for comparison framing; this must not become the production head scale.

| Component | Salvageable starting point | Required repair and comparison |
| --- | --- | --- |
| Forehead, cheeks, chin | The face is more readable than the poster-derived candidates. The front facial mass and corresponding UV islands are useful starting material. | Re-align the mesh into a neutral head coordinate frame before comparing. Correct the inflated lip volume and nose-to-mouth proportions against front, three-quarter and profile references. Do not stretch the entire head to fix one feature. Recheck after attachment to the body. |
| Glasses | The source intentionally has orange/red round lenses. The tint is not an error. | The generated drooping/angular, uneven frames are an error. Build separate left/right frames, bridge, temples and lens surfaces, fitted to the head in 3D. Check circle/ellipse projection from neutral and turned views. Do not force image-space symmetry onto a turned head. If the chosen verified film look has no glasses, supply complete eyes/eyelids and corrected skin underneath; the obscured portrait cannot provide those details by itself. |
| Lips, mouth and beard boundary | The broad mouth and beard location provide a guide. | Reduce the prominent pink inflated lip shape, restore plausible mouth corners and separate moustache, lips and beard. The supplied source smiles with visible teeth; the generated mouth is not an equivalent smile. A neutral reading expression may be authored, but must retain the actor's proportions. |
| Hair | Some swept hair mass and texture direction can serve as a scaffold. | The press-event quiff is not automatically the film hairstyle. Match the selected film reference's hairline, front height, sideburns and longer rear silhouette. Inspect both sides and rear. Avoid a featureless black cap or unreferenced wedge. |
| Ears and rear head | Preserve topology only where anatomical shape remains useful. | The strong red ear is visible in the unlit inspection and resembles background contamination; repaint/reproject its base color using an actual ear reference. The almost uniform black rear also remains black in unlit mode. Supply real rear hair/skin detail and correct UVs. Increasing global light intensity cannot recreate missing base-color information. |
| Press shirt, microphone, hand and torso | No scene-use approval. | Remove these from the character component. They belong to the press-portrait pose and are truncated. They must not be hidden inside a truck or used as the final reader body. Remove disconnected fragments and cap the anatomical cut cleanly. |
| Neck/body seam | No production-ready neck/body attachment is supplied. | Cut below a useful anatomical neck section; rebuild the missing section if necessary. Match circumference, skin tone and shading to the correct body/collar. The collar may conceal a seam but cannot substitute for continuous geometry. Inspect head turn, reading bend and handoff pose without a floating head or visible neck gap. |
| Material and normals | The front atlas can be preserved selectively after contamination repair. | The current material omits `metallicFactor`; glTF's default is 1. Use nonmetal skin, hair and cloth materials and sensible roughness. Regenerate normals after repair. Check under unlit base-color and ordinary game lighting. Preserve the game's exposure/camera/timing; do not make global rendering changes to disguise one bad model. |
| Body and reading pose | Not supplied by this bust. | Build a complete correctly dressed body, chair contact, seated legs/feet, book and articulated arms/hands. Check knees, lap and book do not intersect the table, chair, logs or truck wall. The request is a seated Japanese learner, so the rifle-walking pose of the first two candidates is unsuitable. |
| Pizza interaction | Not supplied. | Author reading/rest, acknowledging the car, receiving/placing the pizza and returning to a stable pose. The pizza must arrive at actual hands or an intentional nearby placement surface. Keep the book/hand arrangement physically plausible. Face animation beyond the required idle/scene expression is optional while calls are deferred. |

Suggested repair order: establish a consistent correct-film style reference; isolate and correct the head; fix atlas contamination and materials; attach to the complete movie-appropriate body; author reading and handoff; inspect the final exported asset again. A corrected head-component review is useful before investing in the complete body, but it cannot approve the final scene by itself.

Do not blindly reduce the current dense mesh before correcting the face, neck and prop boundaries. Optimize a corrected asset with silhouette and normal/UV checks. Review the exported runtime asset rather than accepting a Blender viewport whose materials differ from the game.

### A-pose body guide assessment

Independently inspected the actual `production/pushpa-a-pose-guide-v1.png` through local image viewing, beside the large cinema-distributed Pushpa 2 poster and the supplied Mythri profile. No Chrome/native input was used for this assessment.

Fingerprints:

- Synthetic guide: `408ebdc0ec28176f8218b37ee7953b98062cb2bad2c3704909afde44ed77f38b`.
- Large poster: `de2f31cadba09b24f7877784cce68e89fc7b494c2ec094402bf1ef53df6daea3`.
- Supplied Mythri profile capture: `fd96fce796e83a0a3a358e1d8663da232f4738ffbe308bc28fd39b130d5d4d6a`.

**Guide verdict: useful body-generation scaffold; not a character release verdict or film-reference approval.** It gives an isolated complete body with separated arms/hands, broadly matching brown four-pocket shirt/trousers, jewelry, round red lenses and crest loafers. It avoids the source poster's rifle, overlapping background and footer contamination. This is a better geometric starting composition than the poster for extracting a body.

The guide is a generated interpretation, not another verified photograph of the actor. Its idealized stern face must not become the sole identity reference. Its tall swept hair and accessories follow the promotional-poster interpretation; do not blend these indiscriminately with the different styling of the supplied no-glasses film profile. Select one coherent film appearance for the final asset. The exact seated reader's outfit remains unverified.

Generation/reconstruction must still be checked for fused shirt pocket flaps, flattened cuffs, jewelry fused into skin, chains or pendant turning into surface noise, and finger/ring merging. Inspect both hands from rear and side; a clear-looking front image cannot establish full finger anatomy. Side/back costume detail, soles and unseen ear/hair surfaces are not supplied by this single front guide. Supply/review them rather than accepting a black or invented rear.

The A-pose itself is not the final scene pose. A full body generated from it still needs a stable rig, seated hips/knees/feet, chair contact, book grip, readable head direction and receiving/placing gesture. Compare the exported posed model to the actual film appearance and the game scene after rigging. None of these checks has passed merely because this guide is suitable to try.

## What constitutes a complete comparison pack

Each renderable identity needs a stable character ID, the exact candidate hash, the model/texture/rig/animation file hashes, the artist ID and an independent reviewer ID. Reference captures need a source URL, publisher, observed timestamp/frame where applicable, local evidence hash and a note stating what the reference actually proves. A downloaded trailer or a file named after a character is not a visually verified reference.

For each final candidate, provide front, three-quarter, profile, full-body and in-game handoff comparisons. Add rear inspection because these generated assets have known unseen-side failures. Capture neutral/unlit base color as a diagnostic alongside ordinary game lighting. A collage may contain several views if every labelled pane actually contains the claimed view of the exact candidate. A pane showing only a bust must not be labelled as evidence of complete legs/body.

The actual scene pack must show normal driving-camera entry, the relevant pose/animation, pizza interaction, completion and departure/exit. Check a mobile-size viewport and day/night readability. Review real in-game contact: hands, feet, chair, train roof, metro platform, gate or ground must meet their intended surfaces. Keep appearance acceptance separate from functional assertions and physical-phone performance claims.

The game scenes are user-authored fiction. References establish the movie character's appearance; they do not need to show a pizza delivery, a contemporary Vande Bharat or the exact invented game choreography. Do not change the user's requested choreography to match an unrelated available promotional pose.

## Current appearance inventory

The manifest currently contains **15 renderable identity records: 5 rejected and 10 pending; none approved**. There are 12 main-character appearances plus the three distinct Vakeel Saab companions. Srikanth Odela's bucket scene and the Salaar compound have explicit no-face requirements and do not need invented visible celebrity substitutes.

The old rejected candidates have four labelled comparison angles but no accepted in-game-handoff evidence. Ten pending identities have no candidate, reference or view evidence. The generated Pushpa files were reviewed separately and rejected/pending as described above; they have not earned production approval. A fourth native TRELLIS.2 export was independently reviewed at 08:31–08:33 UTC and rejected: all actual orientations show thin textured slabs rather than a useful anatomical head. See the detailed review and three saved evidence captures in [independent-generated-review.md](independent-generated-review.md). The component-repair recommendations for the third head must not be mistaken for permission to salvage the unrelated malformed fourth candidate. These counts describe the manifest read during this audit and must be refreshed when new candidates are added.

## Scene-by-scene evidence still required

All rows below are **unapproved or unreviewed** for final visual acceptance. Functional completion of a module is not a substitute for the captures listed here.

| Level / scene | Existing relevant evidence | Missing appearance and actual scene evidence |
| --- | --- | --- |
| 1 — Pushpa Raj / closed moving sandalwood container | Actor portrait, supplied Mythri film profile and actual independent reviews of three generated candidates. First two rejected; third head requires repair. | A consistent correct-film head/costume and complete seated reader; actual chair/book/Japanese-study staging; logs framing a car-sized aisle; closed substantial roof/walls and automatically opening rear doors/ramp. Capture car entering, actual pizza placement/handoff, and safely exiting while truck remains physical/moving. Do not use the press microphone, open-top flatbed or rifle-walking pose. |
| 2 — Ram / Vinaya Vidheya Rama, train roof | Supplementary current-actor portrait; legacy procedural candidate rejected. **The old browser capture labelled 0:52 has a mismatched timestamp and must not be used as verified 0:52 evidence.** See correction below. Newly supplied native 28 s and 92 s frames have been visually inspected, but they do not prove the requested train pose. | Close film-specific face/hair/body/costume; standing balance on the real Vande Bharat roof; actual car landing on rear coaches, crossing coach gaps and reaching Ram; hand-to-pizza contact. Capture reversal/terminal support without floating, coach disappearance or unsupported character. The requested Ghatkesar–HITEC shuttle is a game requirement, not a claim about the film's train model. |
| 3 — Devara / underwater skeleton grip | Supplementary NTR portrait only; old orange-shirt Simhadri actor rejected as the wrong role. | Visually verified Devara face/hair/costume and exact gripping composition reference; the correct model behind an intact anatomical skeleton with hands at its neck. Capture DIVE from the surface, normal submerged car-camera view, pizza placed beside him without breaking the pose, and safe return to surface. No substituted Simhadri costume or emergence/shout animation is required by the revised scene. |
| 4 — Srikanth Odela / Paradise rope bucket | No visible celebrity face is required. | Environment and mechanism captures: recognizable Paradise restaurant, rope anchored at its actual roof, large lowered bucket in reachable position, pizza visibly entering bucket and bucket being pulled up. An anonymous receiving apparatus is acceptable; do not add an unreviewed director face. |
| 5 — Arundhati / haunted gate | Pending record; no candidate/reference pack. | Correct-film Arundhati face, hair, dress and pose from verified reference; visibly behind the gate. Capture fictional haunted Hyderabad property, convincing webs/lighting/decay, car parking outside and pizza left at the specified outside point. No forced walk-through-gate or collection animation. Distinguish the chosen film appearance from an arbitrary ghost costume. |
| 6 — Jessie / Ye Maaya Chesave | Pending record; no candidate/reference pack. | Telugu Jessie appearance (Samantha), blue saree, casually loose hair, appropriate face/body/costume. Capture walking slowly along a quiet lane, player following alongside at matching speed and physically plausible pizza handoff without forcing her to stop. Verify the actual Telugu character instead of substituting the Tamil-version character. |
| 7 — Hasini / Bommarillu | Pending record; no candidate/reference pack. | Hasini's film-specific face, hair and clothing, plus complete body/gesture evidence. Capture at an actual selected degree-college entrance, visible behind gate/pillar, and pizza reaching the intended receiver/drop surface. Gate geometry must not swallow hands or require the car to drive through a solid pillar. |
| 8 — Bhanumathi / Fidaa | Pending record; no candidate/reference pack. | Film-specific face/hair/wedding-scene costume and grounded dancing pose. Capture the wedding as an outdoor **street procession** near the city, with coherent dancing people, decorated road context and her actual receiving action. A static generic woman at an indoor wedding venue does not satisfy this scene. |
| 9 — Sukumar / production courtyard | Pending record; no primary public-appearance reference or candidate views. | A verified primary director appearance rather than a fictional movie costume; close face/hair/body/clothes. Capture visible director in production courtyard, 45-degree parked car and handoff at ground level. The choreography is invented; do not claim it is a reproduced film scene. |
| 10 — Vakeel Saab / metro next-station exit | Supplementary Pawan public portrait; old khaki Gabbar police model rejected as wrong role. Companion records all pending. | Film-specific lawyer appearance and three individually referenced women, with coherent body scale and clothing. Capture player landing on a genuinely boardable train, riding to next served station, same four characters exiting actual train doors to platform, then grounded handoff. Show waiting/late arrival without four people overlapping or walking through a closed door. Each companion must pass separately (see below). |
| 11 — Maruthi / Kondapur villa | Pending record; no primary public-appearance reference or candidate views. | Verified primary director appearance and close model. Capture Villa 79 near the agreed Kolla Luxuria area, clear gate/address cue, correctly grounded receiver and pizza contact. Current content labels the property fictional; do not report a verified exact private villa architecture without evidence. |
| 12 — Salaar / high-wall compound | User explicitly says no Prabhas model needs to be shown. | Environment-only comparison: a fictional industrial fortified compound with high walls and readable gate/interior mood inspired by verified Salaar styling. Capture approach, gate/drop behavior and exit. Do not substitute Golconda or add an unapproved Prabhas placeholder to claim completeness. |
| 13 — Arjun Reddy / Osmania Medical College | Pending record; no candidate/reference pack. | Film-specific Arjun Reddy appearance, complete body and correct medical-college context. Capture outside a classroom in the specified Osmania Medical College setting, with receiver grounded and handoff visible. A generic beard in front of an unrelated campus sign is insufficient. |
| 14 — Nani / Jersey, Uppal Stadium | Supplementary interview portrait; generic procedural cricketer rejected. | Correct Jersey face/hair/cricket clothing and full-body stance. Capture the real in-game Uppal field, repeatable between-overs timing window, actor standing on the actual turf/pavilion surface and grounded pizza handoff. No duplicate floating pitch, internal road traffic or rooftop target masquerading as field play. |

### The three metro companions are separate reviews

| Appearance ID | Evidence gap |
| --- | --- |
| `vakeel-woman-1` | Select a stable specific member of the actual Vakeel Saab trio from an observed primary film reference. Record face/hair/clothing and a stable mapping to this ID; generate/review all comparison views and the actual group exit/handoff. No candidate or reference is currently recorded. |
| `vakeel-woman-2` | Independently identify and reference the second member; she cannot be the first model recolored or another arbitrary actress. Require the same close-match and actual metro-exit evidence. No candidate or reference is currently recorded. |
| `vakeel-woman-3` | Independently identify and reference the third member; preserve distinct appearance, proportions and clothes. Require the same close-match and actual metro-exit evidence. No candidate or reference is currently recorded. |

Names should be recorded only after reference verification; this review does not infer actress identity from an unlabelled thumbnail. One group frame may support all three if each is clearly identified and visible, but it does not supply three independently modelled candidates or unseen angles.

## Correction: Ram trailer timestamp and guide v1

The producer's native trailer extraction exposed a seek/capture mismatch. I independently opened the old browser capture `evidence/ram-vvr-official-trailer-52s.jpg`, the supplied native `production/references/ram-dvv-52s.png`, the native 28 s and 92 s frames, the supplementary Ram Charan portrait, and `production/ram-vvr-a-pose-guide-v1.png`.

Exact inspected hashes: old browser image `044aefced346f4a54bc5cae895f37ccedac56148387b7b52de18c02d35f36c77`; native 28 s `b2c76edeace77637d25427a667442066b2258d2000e38b22158e0e208e635ac4`; native 52 s `357798caea17152ed02ae10a2ab3d862d41b0fd08adcb8631a1f04c009edf73d`; native 92 s `0a98ace96d012ddecdcb8e00ef96b0354b660e1ec961e012353db37b83a78ba8`; synthetic guide v1 `caa9eca059016a2f107b529743767f411e14fea6be5031c2ca10ef00ea5ce3d1`.

The old browser capture visibly shows a bearded man in a dark open shirt wielding a weapon. The native 52 s capture shows a different moustached man wearing a brown jacket/light shirt. These are clearly different images. The visible browser time cannot establish the displayed frame's true time; **the previous claim that the old image was a verified 0:52 Ram reference is withdrawn**. The review manifest's reference note and any comparison relying on that claimed timestamp require correction by their owner. Retain the old file as an audit artifact, not accepted timestamp evidence.

The old browser image and generated guide visually resemble the Ram Charan appearance in the separately supplied native 92 s close-up; they do not show the brown-jacket man in the native 52 s image. Therefore this review does not label the actual old image pixels as that different character merely because the timestamps conflict. Guide v1 is **quarantined from production acceptance pending corrected reference provenance**, not approved. Regenerating v2 from an unambiguously captured/identified Ram frame avoids carrying the unresolved reference chain into new art. A synthetic guide also cannot approve its own face or costume.

The native 28 s frame supplies an orange sleeveless/hooded film look; the native 92 s frame supplies a close face and dark open-shirt look. They are alternate costume contexts. Select a coherent look, verify the native frame's source/time, and do not mix the orange garment with the dark-shirt body's clothes by accident. No native frame inspected here demonstrates the train-roof game choreography or a complete standing/handoff rig.

## Gate policy issue for the two directors

The earlier `release-gate.ts` accepted primary `film-still` references only. That prevented legitimate Sukumar/Maruthi public-appearance references from passing unless they were mislabelled as film stills. The implementation owner has now added an explicit primary-public-appearance policy for these two IDs while retaining exact hashes, independent reviewer, all views and all six visual checks. I ran the updated gate tests, including the distinct director/film-role policy; they passed. This corrects the reference type and grants no appearance approval. The independent reviewer must not fabricate a film role to work around validation.

## Review decision process

1. Artist submits a new immutable candidate and the actual reference/capture pack.
2. Independent reviewer compares the exported model and scene visually, records specific per-check results and feedback, and retains rejected evidence.
3. Any model, texture, rig, animation or costume repair changes the candidate fingerprint and invalidates the old verdict for that candidate.
4. Only all close-match checks plus actual scene evidence permit that exact character to be displayed. A head-only pass does not release a body, another role or a revised asset.
5. Keep unresolved appearance work explicit. Do not describe a mechanically playable but actor-withheld scene as the user's fully finished immersive scene.

## Native reference curation follow-up — 2026-10-31

The inventory/table above records the earlier manifest audit and must not be read as saying no reference work has since happened. The independent reviewer has now actually inspected and indexed seven official public uploads and 32 selected native frames for Jessie, Hasini, Bhanumathi, Vakeel Saab, each of the three distinct companions, and Nani/Jersey. See [independent-primary-reference-handoff.md](independent-primary-reference-handoff.md) and its exact-hash JSON index for the source pack, stable companion mapping, costume alternatives and remaining gaps. The original pending manifest records still have no accepted production candidate; primary reference curation grants no character or scene approval. Separately supplied native NTR Arts 45 s evidence has also been inspected for the Devara scaffold review, but does not establish the requested underwater grip pose or full costume.
