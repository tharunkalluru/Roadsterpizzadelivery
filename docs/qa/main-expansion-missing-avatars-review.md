# Independent missing-avatar review — candidate v1

**Verdict: FAIL for both candidates. Do not register or publish either actor.**

Reviewer: `/root/missing_avatars_independent_review`, separate from the producer. This is an isolated, exact-GLB art review. It is not an actual story-scene, mobile-camera, performance or production-renderer approval. The current production registries and public assets were not edited.

## Evidence actually inspected

I opened all five supplied Idle views and both TakePizza/box views for each candidate: front, three-quarter, profile, back, full body, frontal handoff and three-quarter/full-body handoff. I also opened all three retained official photographic images. Generated guides were not used as likeness evidence.

- Srikanth Odela: far-right subject of [SLV Cinemas' official interview thumbnail](https://www.youtube.com/watch?v=B1mtJLeagSQ), retained under `references/srikanth-official-slv-interview-thumbnail.jpg`.
- Prabhas as Salaar: right-foreground subject in [Hombale Films' official film-page poster](https://www.hombalefilms.com/movies/salaar-part-1-ceasefire), retained as the source AVIF and a viewable PNG copy.
- Salaar supplementary costume/hair: [Hombale Films' official trailer thumbnail](https://www.youtube.com/watch?v=4GPvYMKtrtI).

All 18 supplied model/contract/render hashes were verified against the handoff manifest and match. The machine-readable companion, [main-expansion-missing-avatars-review.json](./main-expansion-missing-avatars-review.json), records every observed view and exact reference hash.

## Srikanth Odela — FAIL

Exact model SHA-256: `77ef157d732e868f8488f63af47c18c9dd954dbb2322febdb0ba7fdda01f2da3`.

Exact canonical-contract SHA-256: `83284b70594f785ff89ddae7f4e1555fe32bdb78415431064a540cc3907cad22`.

Candidate identity SHA-256: `43c75f0115b0cde7ad63dc765bee0748a5854749ab2ae2152b9e9d2843706bcf`.

The navy collared shirt, jeans, short hair and trimmed beard give the intended broad identity cues. The fully clothed body is substantially more human than the old primitive placeholders. Those facts do not meet the user's close-match requirement.

Blocking observations:

1. **Beard, neck and collar do not form a continuous human surface.** The three-quarter/profile views show a dark outward lip under the chin, a separately shaded smooth neck and abrupt skin/gray patches at the shirt opening. The head visibly reads as grafted. Repair the topology and material/normal continuity; do not hide the seam with a distant camera.
2. **Close identity remains unproven.** The candidate's smooth pale face, squared dark chin band and frontal temple/hair distribution do not yet produce a close, independently defensible match to the actual photographic subject. Only one small seated three-quarter thumbnail is supplied. Obtain closer official front and side/three-quarter frames, inspect them, then refine the face, hairline and short beard against those photographs. Generated guides cannot close this gap.
3. **Wrist joins remain visible.** Both wrists have an abrupt pinched cuff/ring and a change in shape/skin treatment before the attached hand. Blend or weld a continuous forearm-to-wrist-to-hand taper and match the material. Recheck Idle and TakePizza from both sides.
4. **Rear hair and shoulder artifacts remain.** The profile/back views show repeated dark hair perforations/grooves. A flat gray shoulder patch has an angular edge unrelated to a plausible garment seam. Repair/remesh and rebake those surfaces.

Inspect these exact images for the next repair pass:

- `srikanth-odela-final-exact-glb-views-v1/three-quarter.png`
- `srikanth-odela-final-exact-glb-views-v1/profile.png`
- `srikanth-odela-final-exact-glb-views-v1/back.png`
- `srikanth-odela-final-exact-glb-handoff-v1/full-body.png`

All are under `docs/delivery/character-review/production/missing-avatars-20261102/`.

## Prabhas as Salaar — FAIL

Exact model SHA-256: `6aa73a1218a191a556f082f1aa1a10d655b35bcde969ca0bce7c6d4cf51afbd2`.

Exact canonical-contract SHA-256: `c7712739ec0cd08493b99b14e18434e669200e9ba391f25eaf78729d0d5efba8`.

Candidate identity SHA-256: `c8bfd5e2c9e755e6c682b103397bb20d45c04fc3691f1ad77fb4ae8508f278d9`.

The face, swept hair, full beard, physique and charcoal clothing are recognizably directed toward the correct Salaar character. The head still has visible authoring defects that prevent accepting the complete avatar.

Blocking observations:

1. **The exposed neck is plainly cylindrical.** Front, three-quarter, profile and full-body views show a tall featureless brown connector, a straight dark shelf under the beard and an abrupt shirt/skin transition. Replace it with continuous neck, trapezius and collarbone anatomy blended into the actual jaw and shirt neckline. Re-bake skin, normals and roughness together.
2. **Rear/side hair has deep repeated cavities.** The profile and back show rows of dark holes and comb-like vertical grooves. The official poster has coherent layered hair and a natural nape silhouette. Repair the geometry and rebake it; a front portrait alone cannot approve this mesh.
3. **Wrist and shoulder continuity is unfinished.** The forearm/hand join has an abrupt cuff and shape/color change. The upper shoulder has a large hard-edged patch. Blend/weld the wrist and rebake the shoulder surface with plausible fabric folds.

Inspect these exact images for the next repair pass:

- `prabhas-salaar-final-exact-glb-views-v1/three-quarter.png`
- `prabhas-salaar-final-exact-glb-views-v1/profile.png`
- `prabhas-salaar-final-exact-glb-views-v1/back.png`
- `prabhas-salaar-final-exact-glb-handoff-v1/full-body.png`

## Handoff and remaining acceptance

Both frontal handoff images show palms beneath the orange prop and roughly horizontal forearms. The producer's numerical palm/catch-marker contact proof was read; it was not independently rerun. A zero marker-distance result does not validate surface joins, finger deformation, wrist shape or actual in-game carton orientation.

Odela's three-quarter handoff image has an apparent bend/V in the orange prop. Verify a rigid, flat production carton in the real engine before accepting handoff presentation. This isolated render does not establish that the production carton is deformed, so it is a verification item rather than a claimed runtime defect.

After repairs, export **new immutable candidates with new hashes**, then repeat all affected views. Continuous Idle/TakePizza/Walk/Read motion, actual Three.js materials/light, the Paradise roof/bucket scene and the Salaar compound story scene remain unverified. Root must capture actual player-distance day/night and mobile views, including the physical handoff and indefinite Next hold. Only a complete independent pass may create a production approval.

The old README's statement that no existing characters have approvals is stale; this review applies only to these two new candidate hashes. It does not revoke or modify the existing 15 approved assets.
