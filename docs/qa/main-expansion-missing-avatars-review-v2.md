# Independent missing-avatar review — round 2 / final artifact v4

**Both candidates still FAIL the isolated visual gate. Keep them out of production.**

Reviewer: `/root/missing_avatars_independent_review`, independent of the producer. This review uses the final `*-review-candidate-v4.glb` bytes listed in `independent-review-handoff-v2.json`, not the intermediate v2/v3 artifacts. The [v1 rejection](./main-expansion-missing-avatars-review.md) is preserved.

I opened all fourteen supplied exact-GLB images: five Idle and two TakePizza views per actor. I also opened all ten new actual Odela frames from the official SLV interview and Shreyas event, and reopened the two official Hombale Salaar images. All eighteen model/contract/render hashes match the handoff; all ten new photographic hashes match their manifests. [The companion JSON](./main-expansion-missing-avatars-review-v2.json) records the individual views, references, hashes and findings.

## Repairs that now pass

The separated cylinder neck and horizontal chin-base shelf from v1 are no longer visibly present. Both avatars now have connected neck/jaw/shoulder silhouettes. The old separate hand/forearm cuff connection is also repaired, and the conspicuous angular shoulder UV patch is removed. These findings are resolved; the next pass should preserve those repairs.

The new Odela photographs resolve the old reference-coverage gap. The [SLV near-front frame at 2002s](https://www.youtube.com/watch?v=B1mtJLeagSQ&t=2002s), natural three-quarter at 1372s, and [Shreyas front/profile/rear sequence at 22–24s](https://www.youtube.com/watch?v=jn6K-K7668U&t=23s) provide real identity, hair, beard and nape evidence. Generated guides were not treated as photographic evidence.

## Srikanth Odela — FAIL

Model SHA-256: `1e5b8448f32e3bc2f5723081cd4793595c8bb21603e191d601c50be6e69ff0fa`.

Canonical-contract SHA-256: `f4d7940778fa2de635b1017cb61b83a6ce53e3fc2d8e4be96af67962cef06fe5`.

The shorter dark hair, lighter stubble and more connected anatomy improve the intended identity. Remaining visible blockers:

1. **Broken-looking sleeve boundaries.** Both sleeves have sawtooth skin-colored intrusions above an abrupt brown/dark ring. This is visible in the full-body front/back and TakePizza pictures. It reads as texture segmentation, not a sewn or rolled hem. Re-author the sleeve geometry/atlas boundary with a continuous plausible hem; remove the triangular skin spikes and band.
2. **Residual rear-hair slots.** The profile and back still show repeated dark slots around/behind the ear. The photographic short hair has coherent irregular texture. Repair residual cavity patterns in geometry and baked color, retain the natural nape, then inspect both profiles and back.
3. **Gouged-looking upper back.** The back image retains a large branching cut/tear-looking feature with angular edges; the profile also shows irregular projections along the rear shirt silhouette. Repair/remesh and rebake continuous fabric folds, rather than darkening the patch.
4. **Close eye appearance.** The irises still read pale gray/light in front and three-quarter renders, compared with the dark eyes in the actual close photographs. Correct iris/pupil paint and eyelid integration against those frames, and repeat the neutral production-lit close views. Preserve the improved identity head rather than replacing the whole body again.

Evidence folders: `srikanth-odela-round2-exact-glb-views/` and `srikanth-odela-round2-exact-glb-handoff/` under the supplied production bundle.

## Prabhas as Salaar — FAIL

Model SHA-256: `31997dc2cddfe6049aec39fa844c588c15968501fe5a67134f8e8e2103c56a07`.

Canonical-contract SHA-256: `7495a5b88ae81fb2b76b865ab29096c0e583e9d443793cadf8be71aec8de5512`.

The face, swept top hair, full beard and dark costume remain recognizable as the intended character, and the neck repair is substantial. Remaining blockers:

1. **Rear/side hair is still cavity-patterned.** The exact profile contains conspicuous rows of black oval/vertical slots above and behind the ear; they are also visible in the back view. This repeats the pattern rejected in v1. The [official Hombale poster](https://www.hombalefilms.com/movies/salaar-part-1-ceasefire) shows coherent swept layers. Repair actual hair/scalp topology and baked dark slots, then review both profiles and the complete back.
2. **Back garment artifact and abrupt detail transition.** The upper back has a deep branching cut/gouge-looking strip and angular silhouette projections. The upper chest/shoulder is almost featureless flat gray while lower fabric is strongly textured, so the repaired region is conspicuous. Repair the back surface and blend fabric detail/roughness across the shoulder/chest. Re-render full back, profile and three-quarter views.

Evidence folders: `prabhas-salaar-round2-exact-glb-views/` and `prabhas-salaar-round2-exact-glb-handoff/` under the supplied production bundle.

## Independently rerun palm checks — numerical PASS

I reran `scripts/art/probe_authored_contact.mjs` against both exact v4 GLBs and canonical contracts, using the gameplay `createAuthoredMotionPlayer`, **walk mode at 0.7m/s** and five elapsed phases (0, .25, .5, .75, 1s). This adds an independent continuing-motion check to the producer's Idle-mode proof.

| Actor | Maximum palm-anchor error | Maximum absolute palm/box underside gap | Both palms inside footprint | Catch preserves motion clock |
| --- | ---: | ---: | --- | --- |
| Odela | 0.00004516m | 0.00649283m | Yes | Yes |
| Salaar | 0.00005426m | 0.00045987m | Yes | Yes |

Reports: [Odela walk-contact](./srikanth-odela-round2-reviewer-walk-contact.json), [Salaar walk-contact](./prabhas-salaar-round2-reviewer-walk-contact.json). The numerical tests pass. They do not override the visible art rejection or establish continuous visual animation quality.

## Next gate

Export new immutable artifacts after the specific remaining repairs and repeat affected views. No production registry/public asset was changed by this reviewer. Neither candidate has an isolated PASS, and neither has actual story-scene approval.

After an isolated visual pass, Root still needs the actual Three.js day/night/mobile camera, rigid production carton, continuous handoff, Paradise/Salaar placement, feet/prop contact and indefinite result/Next hold. The fourteen offline stills cannot replace that acceptance.
