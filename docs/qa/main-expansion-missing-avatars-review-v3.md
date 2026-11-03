# Independent missing-avatar review — round 3

**Odela: isolated art PASS, pending actual story-scene acceptance. Salaar: isolated art FAIL; keep withheld.**

Reviewer: `/root/missing_avatars_independent_review`, independent of the producer. This review applies only to the final Odela v7 and Salaar v8 listed in `independent-review-handoff-v3.json`. Both earlier rejection reports remain intact. An isolated pass does **not** authorize a production approval or public registration.

I independently opened all sixteen final images: five Idle views, the opposite profile and two TakePizza views per actor. All twenty model/contract/render hashes match the handoff. Six official photographic frames were reopened for this comparison; all twelve photographs viewed in round 2 remain byte-identical. Generated guides were not used as identity ground truth. The [machine-readable report](./main-expansion-missing-avatars-review-v3.json) lists the exact views, hashes, references and scope.

## Srikanth Odela v7 — isolated PASS

Model SHA-256: `7e353fb1274c0ee2633eb39111ebba7b1b6ae1a660edc6eb6134618b7853ef0b`.

Canonical-contract SHA-256: `87136dfe45f86a4d11c901ca16239864303a079f26fc51314038794cff6c3bda`.

Candidate identity: `srikanth-odela-visible-scene-v3` / `5a2e6048d5472efb592ebd2be5065d354deb176ab296da952b3a586d8eee59dc`.

The navy collared shirt/jeans, short dark hair, light beard, face/profile proportions and dark eye treatment now form an acceptable recognizable authored interpretation of the actual director in the [SLV close interview frames](https://www.youtube.com/watch?v=B1mtJLeagSQ&t=2002s) and [Shreyas profile/rear sequence](https://www.youtube.com/watch?v=jn6K-K7668U&t=23s). This is a visual review, not a numerical similarity claim or a scanned likeness.

The former repeated scalp slots are no longer visible in either profile or the back. The large branching back gouge and angular silhouette damage are removed. The front/back/TakePizza sleeves no longer show the earlier large skin spikes or floating segmentation band; small edge irregularities at this render scale are not material blockers. The repaired neck/jaw and wrist connections remain intact. The inner torso stays clothed during the supplied TakePizza poses.

This exact artifact may proceed to **local actual-scene acceptance**. Root still needs to show him on the Paradise rooftop, with feet on the deck, correct bucket/pulley interaction, readable day/night/mobile face, continuous motion and the indefinite result/Next hold. Those results must be independently reviewed before a production approval is recorded.

## Prabhas as Salaar v8 — isolated FAIL

Model SHA-256: `a8708feff32d78cabc6863e122dd5270a0bcbadd7bb6b5e7efd0c37a534bdce8`.

Canonical-contract SHA-256: `2c2e233067b8ad4383076a2c8ea985d4622ae61bd5738053f5080c159087813b`.

Candidate identity: `prabhas-salaar-visible-scene-v3` / `826ffbfa522309addd5d54462a05c7bbb26d1db5a0a58a9d1348cda863431966`.

The face, beard and frontal swept hair remain recognizable as the intended [Hombale Salaar character](https://www.hombalefilms.com/movies/salaar-part-1-ceasefire). The original cylindrical neck, detached jaw shelf, attached-hand cuff and large back cuts are repaired. The previous repeating hair slots are also gone.

**One material blocker remains: the repaired posterior hair now reads as a smooth hood/cape fused into the shirt across the nape and upper shoulders.** The back image has no readable lower hairline/collar separation. Both profiles show an uninterrupted sloping dark mass into the garment, unlike a natural layered nape. The repair removed cavities but has not yet produced coherent hair anatomy/material separation.

Inspect these exact images under `docs/delivery/character-review/production/missing-avatars-20261102/`:

- `prabhas-salaar-round3-final-exact-glb-views/profile.png`
- `prabhas-salaar-round3-final-opposite-profile/opposite-profile.png`
- `prabhas-salaar-round3-final-exact-glb-views/back.png`

Preserve the repaired neck skin, face, wrists and garment topology. Re-author the posterior hair envelope to end at a readable nape/hairline with coherent layered texture/relief and a clear shirt-collar/material boundary. Remove the hair-colored shoulder/cape extension. Do not conceal the rear through a camera restriction. Export new immutable bytes and re-render both profiles, back, front/three-quarter and TakePizza.

## Fresh independent palm checks — PASS

I reran `scripts/art/probe_authored_contact.mjs` on these exact final GLBs/contracts/palm evidence using the actual gameplay motion player, walk at 0.7m/s and five phases. Both numerical probes pass:

| Actor | Maximum palm-anchor error | Maximum absolute underside gap | Both palms in box footprint | Motion clock preserved |
| --- | ---: | ---: | --- | --- |
| Odela v7 | 0.00004516m | 0.00649283m | Yes | Yes |
| Salaar v8 | 0.00005426m | 0.00045987m | Yes | Yes |

[Odela exact rerun](./srikanth-odela-round3-reviewer-walk-contact.json), [Salaar exact rerun](./prabhas-salaar-round3-reviewer-walk-contact.json). These are CPU skin/marker tests, not a continuous visual animation or gameplay performance verdict. They cannot override Salaar's visible nape defect.

No production asset, registry, previous review or existing approval was modified. Actual Three.js materials, rigid production carton, day/night/mobile camera, physical story handoff and result hold remain unapproved for both identities.
