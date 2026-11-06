# Approved GLTF actor integration

`src/delivery/art/released-gltf.ts` is the production path for independently approved models. `character-assets.json` remains empty while appearance reviews are incomplete. Unapproved candidates can be inspected only in the clearly marked, isolated development scene catalog; that catalog never registers production art or qualifies as accepted campaign evidence.

## What must be authored and reviewed

- A self-contained binary glTF 2.0 file below 16 MiB. Embed textures and buffers; external file references are rejected. Export the intended units, orientation, material settings and full scene pose. The importer never rescales, rotates, changes metalness, replaces materials, or invents a character pose.
- A unique named scene. Its name is the `sceneName` in the contract.
- Unique left arm, right arm and pizza catch anchor names. An optional named book node can be exposed. For a skeletal character, both arm bones must belong to an actual skinned mesh's skeleton; empty detached transform labels do not satisfy this.
- `catchPointSpace` is either `"palm-contact"` (default for existing contracts) or `"box-center"`. The current physical box is 0.4 × 0.07 × 0.4 metres: a palm contact needs the additional 0.035 metre half-height; a centre anchor already includes it. Both generic and moving-truck handoffs honor this explicit, fingerprinted convention. A walking actor's anchor must follow its actual animated palm rather than remain on the scene root. Check layered walk-plus-catch contact through the whole stride.
- `requireSkin: true` for an animated reader/handoff. A truly stationary actor may use `false` with an independently approved static pose and named transforms. A walking/rifle statue cannot be relabeled as a seated reader.
- An authored handoff clip, with the exact unique `clipName`, positive duration and real tracks. The clip starts in the scene's reviewed rest/reading pose at zero and reaches the catch pose at its end. The game samples it through the existing `catchPose(0…1)` interface. No generic arm-rotation substitute is applied.
- For a stationary scene, `pose.mode: "authored-static"` intentionally has a no-op `catchPose`. This mode must have been visually reviewed for that exact scene rather than chosen to circumvent missing animation.
- A finite upright height range in meters matching the authored model. Out-of-range assets are rejected; they are not normalized after approval.

Review the actual face, hair, clothing, props, proportions, deformations and lighting at front/three-quarter/profile/full-body and the real handoff distance. An accepted portrait is insufficient. Keep the exact appearance and rig metadata with the approved artifact.

## Data contract

An entry has this shape. This is documentation, not an approval or a production entry:

```json
{
  "characterId": "pushpa-raj",
  "candidate": { "assetId": "unique-reviewed-artifact-id", "sha256": "SHA256_OF_ORDERED_ARTIFACT_LIST" },
  "glb": { "url": "/delivery/characters/pushpa/actor.glb", "sha256": "SHA256_OF_ACTOR_GLB_BYTES" },
  "contractPath": "public/delivery/characters/pushpa/rig-contract.json",
  "contract": {
    "id": "pushpa-seated-reader-handoff-v1",
    "sceneName": "PushpaReaderScene",
    "requireSkin": true,
    "nodes": { "leftArm": "LeftArm", "rightArm": "RightArm", "catchPoint": "PizzaCatch", "book": "JapaneseBook" },
    "pose": { "mode": "handoff-clip", "clipName": "ReadingToPizzaCatch" },
    "height": { "min": 1.15, "max": 1.55 },
    "materialTreatment": "as-authored"
  }
}
```

The height numbers above are an illustrative seated actor range, not automatic acceptance criteria for Pushpa. The artist and reviewer must set the actual exported bounds.

1. Serialize the contract through `serializeCharacterRigContract(contract)`. Save those exact UTF-8 bytes as the contract file. The helper fixes key order and excludes unused fields.
2. Compute SHA-256 of the exact GLB and serialized contract. Put both `{ path, sha256 }` entries into the review record's ordered `candidateFiles` list. The GLB path must equal `public` plus its same-origin URL; the contract path must equal `contractPath`.
3. Compute the candidate fingerprint as SHA-256 of UTF-8 `JSON.stringify(candidateFiles)`. Use the same candidate ID and fingerprint in the asset entry and independent review record.
4. The separate reviewer records the actual visual verdict and exact reference/evidence fingerprints. `approved` is permitted only after every required view and check passes. Never generate an approval from a passing importer test.
5. Only then add the published GLB, contract and asset entry. Any mesh, texture, clip, node mapping, material or pose change produces a new candidate and review.

For each requested identity the loader checks the visual release gate first, then verifies contract metadata against the reviewed artifact list, checks the candidate bundle fingerprint, downloads the GLB, verifies its actual bytes, rejects external payloads, parses it and validates scene/rig/clip/height. Unapproved actors cause no download or parsing. A missing scene, incorrect byte or missing arm/catch node yields a diagnostic and no actor.

## Startup and scene ownership

Warm only the current scene's identities with `prewarmReleasedGltfAssets(identities)` while the loading screen covers preparation. Omitting the identity list warms every registry entry and should be reserved for controlled review/testing. Its result contains `ready`, `withheld` and `failed` identities. Network and parsing work is limited to two concurrent preparations, with duplicate in-flight requests shared per identity.

Parsing is not GPU readiness. Use `prepareReleasedGltfGpu(identities, callback)` to warm the exact immutable source root, materials, geometry and textures through the real game renderer. Its asynchronous callback borrows those source resources so retirement cannot dispose them while shader/texture preparation is running. Do not warm disposable scene clones and assume their replacement owns the same GPU buffers. Release input only after both actor preparation and the existing world readiness checks succeed.

`createReleasedGltfCharacter(identity, resources)` returns `null` until an approved template is ready. It uses `SkeletonUtils.clone` for independent skeletons, poses and animation mixers. Scene instances share immutable template geometry and textures; these must never be mutated or registered for per-instance disposal. Every instance receives its own cloned materials through the existing resource callback. That callback accepts `THREE.Material`, including authored `MeshStandardMaterial`, `MeshBasicMaterial` and other supported glTF materials.

The owning module disposes only its registered per-instance materials during teardown. Disposal listeners release that instance's mixer and skeleton exactly once. `retireReleasedGltfAssets(identities)` cancels only the listed identities, immediately disallows new instances, and disposes unused templates. Shared geometry/textures remain alive while an instance or GPU-preparation borrow uses them. `retainReleasedGltfAssets(identities)` retires everything outside the retained scene set; `disposeReleasedGltfAssets()` retires all identities. Per-identity epochs, abort signals and job identity checks prevent cancelled downloads/parsers from restoring a retired template without cancelling unrelated preparations.

`releasedGltfAssetDiagnostics()` reports loading/ready/retiring state, instance counts and approximate geometry, texture, animation and bone-buffer memory. The resident/GPU figures are estimates based on typed buffer lengths, RGBA dimensions/mip levels and CPU/GPU copies. They exclude driver/decoder/object overhead and must not be presented as measured phone GPU memory or FPS. Transfer file size is recorded separately from retained memory.

Keep the default registry for production. The injectable registry dependencies and synthetic approval in `released-gltf.test.ts` exist to validate failure behavior and resource ownership; the fixtures are not character art and never enter the shipping asset manifest.

Tests cover no fetch for unapproved art, changed GLB bytes, changed contract metadata, unreviewed external resources, missing scene/skeleton/catch/clip, independent deformations, shared immutable geometry/texture lifetime, exact-source GPU borrowing, approval revocation, per-identity retirement/cancellation and bounded preparation concurrency.
