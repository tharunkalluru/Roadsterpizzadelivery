# Character likeness release gate

The user requires a close match to the actual film character, reviewed by a separate agent. A detailed mesh, a green test, a celebrity name in the data, or a matching shirt color does not satisfy that requirement. **No current character has an approval.**

## Current independent verdict (31 October 2026)

The reviewer opened the production geometry in a live browser and inspected front, three-quarter, profile, body and handoff poses beside actual reference images. These are fresh renders, not code-only conclusions. The evidence includes four neutral views in one sheet; the handoff pose is a neutral rig pose, **not** an in-game handoff validation.

| Identity | Verdict | Concrete finding |
| --- | --- | --- |
| Pushpa Raj | Rejected | Shared generic face, stylized short fringe, thin angular beard and faceted temple/profile do not closely resemble the actor; costume lines look like scaffolding. |
| Ram (VVR) | Rejected | Actual DVV official trailer at 0:52 was observed. Generic wide eyes, fringe and beard do not match Ram Charan; candidate blue shirt differs from the dark open-collar look observed in that film frame. The exact train-scene appearance remains to be reviewed. |
| Devara | Rejected | Existing actor is an orange-shirt Simhadri look, the wrong movie/role. A forehead mark and moustache cannot substitute for Devara's appearance. No matching underwater skeleton-grip review exists. |
| Vakeel Saab | Rejected | Existing actor is khaki-police Gabbar, the wrong film/occupation. Current geometry, hair and beard fail the close-match requirement; lawyer costume is missing. |
| Nani (Jersey) | Rejected | Bat/cricket whites establish the sport, but face and hairstyle remain a shared generic actor. Correct Jersey stills, scene motion and in-game handoff are unreviewed. |
| Arundhati, Jessie, Hasini, Bhanumathi, Sukumar, Maruthi, Arjun Reddy | Pending | No character-specific candidate with an independent reference review exists. |
| Three Vakeel Saab companions | Pending | No individually reviewed meshes. A shared generic woman is not an accepted substitute. |

Evidence is in [evidence](./evidence/). Exact asset, screenshot and reference SHA-256 values are in [the review manifest](../../../src/delivery/art/character-reviews.json). The local press/interview portraits have existing credits in `public/delivery/celebrities/credits.json`. They are supplementary identity checks, not correct-film costume or scene-pose evidence. The DVV frame is review evidence, not a game texture.

Srikanth's bucket scene and Salaar's walled property do not require a visible human under the approved scene brief. They do not need an invented person to fill the frame.

## Runtime integration

```ts
import { canDisplayCharacter, REVIEWED_PROCEDURAL_CANDIDATE } from './art/release-gate';

if (canDisplayCharacter('pushpa-raj', REVIEWED_PROCEDURAL_CANDIDATE)) {
  // Only here may the corresponding reviewed mesh enter the production scene.
}
```

`getCharacterReleaseDecision(characterId, candidate)` supplies the status and explicit reasons. Unknown identities, missing assets, changed fingerprints, pending/rejected reviews, duplicate review records, incomplete evidence, wrong films and missing independent reviewers all fail closed. Do not use a portrait billboard or a generic stand-in as a fallback. Scene geometry may be tested while the actor is withheld, but it must be reported as an unfinished character scene.

Identity IDs: `pushpa-raj`, `ram-vvr`, `devara`, `arundhati`, `jessie`, `hasini`, `bhanumathi`, `sukumar`, `vakeel-saab`, `vakeel-woman-1`, `vakeel-woman-2`, `vakeel-woman-3`, `maruthi`, `arjun-reddy`, `nani-jersey`.

The reviewed procedural bundle hashes the ordered source-file paths and their individual byte hashes. This preserves the rejection against the actual reviewed geometry. Subsequent geometry changes are a **new candidate**, not an improvement that silently inherits any verdict. Historical rejected evidence can remain after source edits; an approved source bundle must still match the current bytes at validation time.

## Required independent iteration loop

1. Freeze a candidate artifact with a unique asset ID and SHA-256. Include the model, textures, hair, costume, rig and animation files that affect its appearance. Record author and origin/license. Never change files behind an existing approved artifact ID.
2. Collect correct-film primary references: front/three-quarter face, side profile, full costume, scene pose and motion. Record source URL, publisher and frame/time when applicable; save a local review copy and SHA-256. Generic actor photos may supplement these, but do not replace them. Mark `visuallyVerified` only after the reviewer actually sees the images.
3. The artist supplies renders from the production renderer: front, three-quarter, profile and full body. Supply an actual in-game handoff at the player's expected distance, day/night conditions as appropriate, and the mobile camera. Include scene props that can obscure the silhouette.
4. A separate reviewer compares the actual images. Check identity, correct film role, hair/face, costume/body, scene pose and in-game readability. Describe visible mismatches concretely. Avoid numerical similarity claims; no validated metric is available here.
5. If any check is weak, record `rejected`, save the comparison evidence and send feedback to the artist. Keep the actor out of production. Iterate on the specific mismatches, then repeat **all affected** views and the in-game check. A model generator output is a candidate, not an approval.
6. Only when every check is a close match, the independent reviewer records `approved`, their distinct reviewer ID, date, exact candidate fingerprint, primary-film reference hashes and screenshot hashes. Every required view must point to the reviewed candidate and observed film reference. The gate then permits only that exact identity/artifact pair.
7. Run the release-gate tests and manually re-open the scene after integration. A material, hairstyle, rig, texture, animation, camera-distance or rendering change affecting appearance requires a fresh candidate/review.

The manifest is an evidence-backed human/agent verdict log, not an automated recognition system. Its structural tests prevent accidental bypasses and stale approvals; they cannot determine whether the reviewer is honest or whether a person resembles a film character.

## Review tools

Run the existing local dev server, then open `/docs/delivery/character-review/review.html`. It imports production `createSceneCharacter` directly so raw candidates stay reviewable even while the production scene gate withholds them. This page avoids the existing old comparison fixture's missing optional baseline import. A neutral multi-angle page is useful for rejection/iteration, but does not meet the in-game evidence requirement by itself.

Run `node scripts/test-v21-fixes.mjs character-release-gate`. The deliberately complete approval used in unit tests is a **synthetic validation fixture** kept inside the test file; it is never a production approval or a likeness claim.

## Asset gap and source checks

The locally bundled MakeHuman-derived head is a licensed neutral human topology, explicitly documented as **not a celebrity scan**. Existing authored actors all share that topology and procedural hair/wardrobe. Increasing its polygon count does not create a close actor likeness.

No acceptable free, licensed, correct-film, rigged actor asset was verified in this pass. A targeted search found a [Pawan Kalyan Sketchfab listing](https://sketchfab.com/3d-models/pawan-kalyan-80ae038196014e86b74ac6137643c839), but access returned 403 and its download/license/rig/film appearance could not be checked. An [older NTR Maya rig listing](https://jobs.highend3d.com/maya/marketplace/character-rigs/c/ntr-nandamuri-taraka-ramarao-rigged-for-maya) is not an established Devara asset and could not be inspected. Printable bust/STL listings are not automatically usable rigged game characters. No listing was purchased, no account was created and no unverified model was imported.

The remaining work is real art production: actor-specific mesh sculpting, hair, costume, materials and rig/pose work with reference images, followed by the independent loop. Image-to-3D tools such as [Microsoft TRELLIS](https://github.com/microsoft/TRELLIS) may produce candidates, but do not establish likeness, correct unseen views, rigging or acceptable mobile rendering.

## Actual generation follow-up

Three real textured GLB candidates have now been produced through the official-project-linked TRELLIS Space on free access: two full-body poster attempts and one portrait-derived head/bust attempt. They are stored under `candidates/` for review, **outside public game assets**. Exact inputs, parameters, output hashes and failed intermediate attempts are recorded in `candidate-attempts.json`. Both full-body models were independently rejected by the separate scene-review agent. The portrait-derived head is clearer and useful as a component candidate, but remains pending cleanup; its complete character scene is rejected. No generation has created an approval. The independent findings and saved head comparison screenshots are in [independent-generated-review.md](./independent-generated-review.md).

The successful access path was [Microsoft's official project page](https://microsoft.github.io/TRELLIS/) → its Demo link → `Microsoft/TRELLIS`, which redirects to `trellis-community/TRELLIS`. A normal macOS file picker uploaded the authorized public film poster without changing extension permissions. The first standalone Gradio run succeeded. Higher-detail standalone retries showed generic `Error` in both output panels; a final attempt inside the authenticated Hugging Face wrapper succeeded. The UI did not disclose a specific quota/OOM diagnosis, so none is asserted.

Open `/docs/delivery/character-review/generated.html` for the first real GLB, or append `?second=1` for the corrected candidate. Both use actual downloaded meshes. Unlit source-texture mode is explicitly labeled so a material-lighting issue is not confused with geometry/texture quality; the toggle also shows original exported PBR. The generator omits `metallicFactor`, which the installed Three.js loader defaults to `1.0`; original PBR therefore appears very dark without an environment. Production loading never silently repairs this material—corrected export bytes require a new review.

Append `?head=1` for the single portrait-derived head/bust attempt. Its input was the unaltered, already credited Allu Arjun portrait. The actual filename and preview were verified before the one generation request; no wrong-person generation occurred. The viewer pairs that portrait with an actual correct-film profile from the verified Mythri trailer at 2:19. A useful head component, if eventually accepted, would still require proper retopology/attachment to a separately reviewed scene body, hair/neck continuity, a seated reading pose and a real in-game handoff. The operator cannot approve their own generated candidate.

The production integration path is implemented and documented in [gltf-rig-contract.md](./gltf-rig-contract.md). It accepts only exact independently approved, fingerprinted GLB/rig-contract pairs. Its production asset list remains empty; the current candidates have no skin or animation and do not satisfy the seated reader/handoff contract.

Primary film reference leads:

- [Pushpa 2 — Mythri trailer](https://www.youtube.com/watch?v=g3JUbgOHgdw): exact container-scene face/costume/reading pose stills remain to be checked.
- [Vinaya Vidheya Rama — DVV official trailer](https://www.youtube.com/watch?v=aV5HMqRas5g&t=52s): verified channel/page and actual frame at 0:52 observed and saved. Exact train pose remains outstanding.
- [Devara — NTR Arts release trailer](https://www.youtube.com/watch?v=HNYA6bqL6bU): exact underwater skeleton-neck-grip frame remains outstanding.
- [Arundhati — Sun NXT scene](https://www.youtube.com/watch?v=0lI0qd7VG8s): candidate and exact frame review outstanding.
- [Vakeel Saab — official trailer lead](https://www.youtube.com/watch?v=P1xKV0Dmetg): lawyer and three companions' exact scene references remain outstanding.
- [Jersey — official Sithara teaser](https://www.youtube.com/watch?v=Rl6T0bM94Qs): verified publisher from search result; exact cricket scene frame not yet visually reviewed.

Links are reference leads unless explicitly marked observed above. Do not convert a discovered URL into a checked frame or a visual approval.
