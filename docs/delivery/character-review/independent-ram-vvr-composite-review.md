# Independent Ram / Vinaya Vidheya Rama composite review

Reviewed on 2026-10-31 by the independent appearance reviewer, who did not author this model or its guides.

**Current verdict: reject V3 as a release candidate; retain its useful components for repair.** No production appearance approval is issued. This is an actual rendered-asset comparison, not an inference from polygon count, rig tests, a synthetic guide, or a producer's self-review.

## Exact asset and evidence

- Actual candidate: `/tmp/roadster-ram-production/ram-vvr-composite-v3.glb`.
- SHA-256: `18814eca29824fe7ec2ed6baa12350d31196f7e6fd2b092a4428836d66706f01`.
- Independently opened native renders: `ram-vvr-composite-fit-v3/{three-quarter,profile,full-body}.png` and `ram-vvr-composite-other-v3/{front,back}.png` under `/tmp/roadster-ram-production/`.
- Independently opened primary film frame: `production/references/ram-dvv-92s.png`, SHA-256 `0a98ace96d012ddecdcb8e00ef96b0354b660e1ec961e012353db37b83a78ba8`. It is the actual 92-second frame from DVV Entertainment's [Vinaya Vidheya Rama trailer](https://www.youtube.com/watch?v=aV5HMqRas5g), as recorded in the production source index. The old mismatched 52-second reference is excluded.
- All six inspected images and their hashes are preserved in `evidence/independent-ram-vvr-composite-v3/inspection-manifest.json`.

## Observed component findings

| Component | Observation and decision |
| --- | --- |
| Face / identity | The candidate has a plausible Ram Charan base: thick swept hair, strong nose and jaw, close beard and moustache, and a coherent serious expression. It is recognizable enough to continue repair rather than discard the entire head. It does not yet establish the user's close-match requirement: the model's brow/eye treatment reads narrower and more pinched, and its mouth more pursed, than the supplied film close-up. Film lighting and expression differ, so this is a targeted repair/check request, not a numerical likeness score. |
| Hair | It has actual depth and a swept front mass, but the profile and three-quarter views show exaggerated, evenly spaced ridges over nearly the whole scalp, with a comb-like rear edge. The primary frame has a thick directed quiff and tighter side taper. Reduce the uniform grooves, preserve larger irregular swept locks, and verify temple/ear transitions rather than repainting a flat hair silhouette. |
| Head / neck | A continuous dark ring at the base of the head is obvious in front and three-quarter views. The rear neck also stops abruptly at the collar edge. Join/reconcile neck geometry, normals and skin coloration beneath the jaw and into the shirt opening; do not disguise it as a necklace. |
| Wardrobe contamination — blocking | The front and full-body views show extra donor fingers/hands printed onto the lower shirt and upper jeans, including finger shapes between the thighs, while the new anatomical hands hang beside the body. Skin-coloured donor arm strips also appear on the shirt sides under the sleeves. This reads as additional hands/body parts. Remove those donor projections from the wardrobe UVs and replace them with continuous shirt fabric or denim. Re-render the unchanged pose to prove the repair; hiding them through a different pose is insufficient. |
| Shirt | The gray-green collared shirt is a coherent interpretation of the visible film upper body. Four-view fabric avoids a large blank rear panel. However, cuff undersides and collar interiors are unusually dark and need a clay/close inspection to distinguish normal openings from cut geometry. Do not flatten the whole material to hide them. |
| Lower costume / back | Jeans, boots, full rear garment and unseen details are inferred extensions. The 92-second close-up proves neither a full-body train costume nor footwear. They may be suitable game choices, but must not be labelled an exact verified film costume from this reference. |
| Stance / proportions | Standing full-body views have plausible proportions and a stable shoulder-width stance, with no obvious collapsed elbows in the shown rest pose. They do not prove foot contact on the curved train roof, support during reversal, or balance/gait. |
| Hands | Separate native fingers are visible and remain distinct from the wrists. The rest view alone cannot establish pizza support, thumb opposition, cuff continuity when reaching, or lack of mesh intersection during handoff. Named TakePizza and actual-dimension pizza contact evidence are still required. |

## Required next evidence

1. The same five angles after donor hands/skin have been removed from wardrobe and the neck ring repaired. Preserve existing useful face volume; compare a genuinely close face view against DVV92 before judging identity final.
2. Focused cuff and wrist clay views in rest and TakePizza, with the real-size pizza box visibly supported by fingers and palm. Inspect the approach, contact and release portions of the animation, not only a favorable final frame.
3. Actual Vande Bharat scene at ordinary gameplay scale: car lands on a rear coach, drives across coach gaps to Ram, Ram remains supported and recognizable, pizza visibly transfers, and the train/actor remain physical through completion and terminal reversal. Include desktop and compact layout/night where applicable.

An offline rig or gait passing its numeric tests does not satisfy item 3. There has been no independent inspection of this Ram candidate in the live train scene, and no physical-phone or sustained performance claim is made here.

## Additional primary costume evidence

After the candidate review, I independently decoded and opened the original **90-second native full frame** from the same verified DVV trailer. It is saved unedited as `production/references/ram-dvv-90s.png` and indexed in `production/independent-reference-sources.json`. Ram is the elevated kicking man behind the foreground chainsaw carrier: his gray-green rolled-sleeve shirt, gray denim and dark boots with ridged sole support the candidate's broad costume combination. The foreground man wearing bright red shoes is a different character. This new frame narrows the lower-costume uncertainty above, but does not prove fine boot design, the full rear, a train-roof costume, or gameplay contact. No source injury/weapon choreography needs to be carried into the delivery scene.

## V4 targeted wardrobe repair

Independently inspected `/tmp/roadster-ram-production/ram-vvr-semantic-idle-v4/{front,full-body}.png` for actual GLB `/tmp/roadster-ram-production/ram-vvr-semantic-v4.glb`, SHA-256 `c6dea88dc1bd88fe708b6b98370df8acc12124be179056c128b250d868fec72d`. Both images are preserved with their exact hashes in `evidence/independent-ram-vvr-semantic-v4/inspection-manifest.json`.

The extra donor fingers on the thighs and lower shirt, and the exposed donor arm strips along the shirt sides, are visibly removed. **That specific wardrobe repair passes.** However, the semantic cleanup now paints gray fabric into the exposed neck/chest V, producing an unnatural triangular bib/strip and small isolated skin wedge. Restore a coherent bare neck/chest opening while retaining the successful garment/denim cleanup. The dark head-base ring and earlier face/hair qualifications remain; TakePizza, gait and actual train-scene evidence are still outstanding. This targeted improvement does not grant release approval.

## V5 chest correction

Actual V5 GLB SHA independently verified: `e8213de40ea619573bf64e07c71f83eaedcb3beb0357cfe93da7b992a9de4758`, `/tmp/roadster-ram-production/ram-vvr-semantic-v5.glb`. Independently opened `ram-vvr-semantic-v5-chest/{three-quarter,full-body}.png`; preserved exact images/hashes in `evidence/independent-ram-vvr-semantic-v5/inspection-manifest.json`.

The exposed bare neck/chest V is restored without bringing back the old projected hands on shirt/jeans. **Both targeted wardrobe corrections now pass.** The head-base ring, corrugated hair qualifications and missing actual train handoff/scene evidence remain. This is a bounded repair pass, not complete appearance approval.


## Final V7 finite offline pass

Exact `8fb9fe21aa9c48fc2413b6dba8cbc8e1c1a3f49a55f3dbd2fe9927b2daf10fb4` was compared against re-opened actual DVV92. All five actual mixer Idle angles, two Walk poses, supported handoff full-body/underside and native portrait were opened. Face, swept hair, short beard and selected grey-green rolled shirt remain recognizable Ram Charan/VVR. The previously raised neck ring silhouette is removed; a mild chest/neck colour transition is accepted game stylization. Current Walk/Take views do not show the old donor-hand/hip cloth defects. Separate palms plausibly support the .4m carton under the existing explicit box-center contract. No new art change requested. Updated actual moving-train gameplay/readability/complete bundle remain pending. Exact observed subset is archived in `evidence/independent-ram-final-v7/inspection-manifest.json`; the available but uninspected handoff-palms image is not counted as viewed.


## Current V7 actual train: mechanics pass, night appearance pending

Native Safari fixed23:00 Q2 used explicit Prepare/Stage and assisted Land above rearcoach7, then normal W/Space across multiple coach joints to5m matched readiness. F transferred the carton and completed; Next left real moving train support intact. Export `campaign-qa-mvwhxh4j` verifies exact8fb9 model/e292 private rig, manual handoff, multiple roof facts and no missing physical facts. **Appearance still fails at night:** the actor is nearly pure white under car beams at11m/5m and only about45–55px tall, so close facial likeness cannot be evaluated from that ready view. Root received a bounded scene-only headlight gain/focus task; accepted actor meshes/materials should stay unchanged. Current negative screenshots and evidence remain `evidence/independent-ram-final-v7/native-before-roof-light-fix/`. This is not a whole-actor approval.


## Final native V7: exact bundle approved

Three-file bundle `83463991a33c76fbe015818867b1535c96296689df3afc48ffcfac0e38b0586d` passes final bounded visual review. The old pure-white actor and reduced-gain dark face remain archived negatives. Final real coach-mounted fixtures and matched-only close framing show a readable face/selected costume; normal F600ms completion, Next same-coach retention/Idle, manual orbit and mouse GO/Brake were observed. Final `campaign-qa-mvwilr56` explicitly uses art-only customer-coach staging and leaves multiple-coach proof missing; it is not misrepresented as a natural full roof run. Separate earlier exactV7 export contains the successful normal multi-coach/manual completion evidence. Final screenshot01 is a clean delivery-ready view; screenshot02 is honestly a completion result, not an invented last carton-contact frame. Exact five-view/palms/portrait and public/private semantic rig parity support approval. Full schema record: `evidence/independent-ram-final-v7/independent-approved-review.json`. No publication or phone/FPS/full-campaign assertion.
