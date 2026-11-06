# Unpublished Pushpa container comparison

This developer-only route loads one fingerprinted candidate into the actual moving container, city, Roadster camera, driving and handover. It does not register a production character, change the approval manifest or count as an approved campaign run.

Open after the local server is running and offline GPU production is idle:

`http://127.0.0.1:4201/?qaDelivery=1&qaScene=1&qaCampaign=1&qaArt=pushpa-reader-v1&q=low`

Add `&qaTouch=1` for the touch-control layout. Mouse use in that layout remains mouse evidence.

1. Prepare the order and stage behind the actual moving container using the visible development controls. Both shortcuts are recorded as assistance.
2. Drive up the lowered ramp with normal acceleration/braking. Inspect the reader from the actual driving camera, then orbit the camera without moving him artificially.
3. Compare the native film reference against his face, shirt, hair, seated proportions, shoe/floor contact, book support and both wrists. Observe the authored Read clip rather than a static pose.
4. Complete a manual pizza handover. Inspect the catch endpoint, upper-body movement, persistent book support and retained truck. Reverse down the ramp and leave normally.
5. Save screenshots and the evidence JSON. Independent art approval must still name exact candidate hashes and required views. A persistent **UNREVIEWED CHARACTER ART · local visual comparison** banner identifies this session.

The fixed descriptor is `/docs/delivery/character-review/candidates/pushpa-reader-in-container-v1.json`. Its only allowed assets are the same basename `.glb` and `.rig.json` in that folder. The descriptor contains `schemaVersion:1`, `id:"pushpa-reader-in-container-v1"`, `characterId:"pushpa-raj"`, and `glb`/`rig` objects with exact `url` and lower-case SHA256 fields. The rig file is the unchanged `CharacterRigContract` JSON.

The loader checks both raw file fingerprints, embedded GLB resources, one authored scene, actual skin and arm bones, named book/catch anchors, height and authored Read/catch clips before GPU preparation. Only the local TruckInterior Pushpa factory uses this template. Other styles and later deliveries continue through the normal release gate. Per-instance material/skeleton/mixer ownership preserves immutable template buffers until all actual scene clones have disposed them.

The recorder includes candidate fingerprints in `metadata.artPreview` and sets `acceptance.unreviewedArtPreview:true`. Even synthetic approval inputs cannot make a preview count as `allScenarioEvidence` or `fullCampaignAccepted`. This page does not prove likeness, true touch, a physical phone or sustained performance.

The actual container adds its reading lamp before a second graphics-preparation gate. Its reader stays hidden and handover stays unavailable until that scene-specific preparation succeeds. A failed attempt retries after five active gameplay seconds; a scene that has been torn down cannot reveal a stale reader. The private template remains owned while a graphics job borrows it, even if its last scene instance is removed meanwhile.

For an isolated native shared-buffer check, open `http://127.0.0.1:4201/tests/browser/character-gpu-readiness.html` while offline GPU production is idle. This test uses the exact descriptor and actual WebGL context. It counts buffer uploads during initial template preparation, the added cabin-light variant, the first visible authored clone, a second frame, and a second independently skinned clone. Download its JSON with the visible button. Per-instance bone textures and vertex-array bindings remain separate work. These isolated counts avoid attributing city-streaming uploads to the actor; they do not replace actual container entry, night readability, camera, handover or exit checks.
