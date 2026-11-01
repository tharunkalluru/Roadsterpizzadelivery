# Pushpa: actual mixer contact and local costume correction

This is production evidence, **not an independent character/scene release approval**. The current candidate remains subject to the independent exact-byte review and real container gameplay capture.

## Candidate lineage

| Artifact | SHA-256 | Status |
| --- | --- | --- |
| Glance source, `pushpa-v4-reader-glance-v1.glb` | `4b439a313e9d4d1d222b525dac3550731e7c0377d144dd246b2e5fab2dbf141a` | Prior appearance/pose candidate; old catch uses box centre |
| Palm-parent descendant | `a78623fb419f2113720d2fd90564779926479b03b2669ae9675da93817134ca8` | Only catch parent/translation authored; every binary payload byte unchanged |
| Local trouser correction, `pushpa-glance-palm-costume-verified-v4.glb` | `19e49192f092aa8689a7c879daec605b24e948864aaab07e4d212cf03133ff8d` | Final candidate for independent review; 10,100,880 bytes |

The files and reports currently live in `/tmp/roadster-reader-pose-work/`. No production approval record or public asset was added by the producer.

## What the actual gameplay mixer proves

The previous native `ReaderHandoffPreview` was a full-body diagnostic action. It is insufficient on its own to establish the runtime combination of a continuing `Read` action and the reviewed masked `TakePizza` action.

`scripts/art/anchor_palm_contact.mjs` loads the real GLB with Three.js `GLTFLoader` and calls the actual `createAuthoredMotionPlayer` from the game. Eighteen real native right-palm source vertex identities are matched against exported rest vertices; current skinned positions are then measured at `Read` times 0, 0.35 and 1 second while sampling `TakePizza(1)`. The base clock is checked before and after every catch sample.

- The old anchor is 35.00006 mm above the measured palm at all three phases. The actual mixer does **not** reproduce a 0.2 m anchor error, so a mixed-Chest hypothesis is not supported by these measurements.
- The new catch is parented to the actual `RightHand` with explicit `catchPointSpace: "palm-contact"`. Measured anchor-to-palm distance is below `6e-12` m in this test; continuing Read time is unchanged.
- The .4 × .07 × .4 m package centre is the palm point plus .035 m in world-up. The anchor is an underside contact, so callers must not apply another centre-space interpretation.
- The old/new contact proof is geometric evidence, not a claim that any particular top-view screenshot shows all contact surfaces. A visible wrist can be offset from the true palm underneath the package.

Exact native points and source fingerprints: `pushpa-right-palm-rest-v2.json`. Final-byte proof: `pushpa-glance-palm-costume-verified-v4.contact-proof.json`.

## Actual layered-pose visual bridge

`scripts/art/export_authored_pose.mjs` evaluates the real mixer and freezes current skinned vertices, normals and prop hierarchy transforms into a **diagnostic** GLB. It retains source PBR images and materials. It removes skin playback from the snapshot so Blender cannot deform it a second time or mistake `TakePizza` alone for the actual layered pose.

The first inspected bridge uses `Read(.35) + masked TakePizza(1)`. Its native views are in `pushpa-actual-layered-contact-review-v3/`:

- `posed-full-body.png`: seated hips, feet, left-hand book and right-hand package are visible together.
- `palm-front.png` and `palm-underside.png`: the real .4 m package is centred over the actual palm support; individual fingers are visible beneath it.

The package, eighteen support-point markers, chair and floor in those views are explicitly **diagnostic props**, not a real truck-scene acceptance substitute. The diagnostic source snapshot is `aa716445a5cf708a44ae373d21d057057a48fb28e04ace35d8e4ab3059a94325`.

The final UV-corrected snapshot is `58062c9b6ba6ca73153a350607da98c3cf9ddf88e13cd58a2f4aefc46f5e6c2d`; its five posed-bound camera views are in `pushpa-final-actual-layered-review-v4/`. They must be visually reviewed before declaring the trouser correction accepted.

## Finite left-trouser UV repair

An actual exported view exposed a donor hand/watch printed onto the **left trouser surface**. A native Blender triangle-to-UV operation reprojects only that observed garment region from original, unmodified front trouser columns. It edits no input photo, head image, mesh, skin weights, animation or prop.

The recipient is explicitly bounded in native Blender metres: x `.045–.34`, y `-.30–.075`, z `.63–.96`, with a `.015` m blend border. The source is the existing front scaffold's trouser columns u `.53–.68`, with the same full-body height mapping. This is artist-authored garment repair, not new film evidence.

- 9,680 targeted atlas texels; 9,285 decoded RGBA pixels actually changed.
- Decoded pixels outside the targeted native UV operation remain unchanged.
- `replace_glb_image.mjs` replaces the one existing embedded atlas and verifies every unrelated bufferView byte-for-byte. It does not retain an unused duplicate atlas. The candidate grows by 220,932 bytes.
- All geometry, all existing clips and animation buffers, all nodes/catch hierarchy, all skins, the head, native hands, JapaneseBook and other images remain unchanged.

Details: `pushpa-left-thigh-repaired-v1.uv-proof.json` and the final candidate `.production.json`. The failed initial lookup of the Blender image name is retained in `repair_left_thigh_uv_v1.log`; the successful native producer is `repair_left_thigh_uv_v2.py`.

## Bounds and remaining acceptance

The final `19e491...` GLB has newly bound offline motion evidence in `pushpa-glance-palm-costume-verified-v4.motion-bounds.json`: 7,062 sampled rest/clip/masked poses and 233 independent validation poses; maximum measured radius fraction `.92780449`. This establishes sampled deformation coverage only. It is not visual, FPS, thermal or real-phone evidence.

Remaining: independent final five-view costume/contact judgment, exact same bytes in the real closed container under game camera/lighting, actual handover/return-to-reading and exit checks. Calls/dialogue remain deferred as requested. No release approval is inferred from this document, successful scripts or bounds tests.
