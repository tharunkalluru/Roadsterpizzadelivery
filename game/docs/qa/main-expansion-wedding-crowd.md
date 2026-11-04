# Wedding procession crowd replacement

Status: **implementation candidate; native scene/independent appearance review pending**. No self-approval or real-phone performance claim.

The remaining cuboid/stick figures in Level 8 `WeddingHandoff` now reuse the approved generic anatomical people source through `src/delivery/art/wedding-crowd.ts`. There are exactly sixteen original procession slots, represented by four shared reduced-detail guest templates and four instanced draws. Templates have native joined head/neck/body surfaces, hands and feet, attached hair, regional clothing and separate vertex colours for skin/hair/top/lower clothes; there is no whole-person instance tint. The designs include adult sari/kurta guests, a teenage salwar guest and an elder shirt/trouser guest with different scale/build/skin/hair.

Four restrained celebratory upper-body poses are baked once using the existing anatomical joint influences. The runtime crowd does not allocate live skeletons/bone textures or deform geometry each frame. Existing procession center path, all sixteen per-slot positions, phase, sway, bob and rotation formulas are preserved. `WeddingCrowd.update` receives the existing absolute scene time and safely retains its last valid time for nonfinite input; it introduces no new delta integration/easing clock.

The helper owns exactly four instance buffers, four geometries and one opaque vertex-colour material, with idempotent disposal. It uses local human roughness .82/metalness0 and adds no light/shadow pass. Existing Bhanumathi dance, target/handoff rules, receiver movement, static procession lights, cameraFocus branches and the new alongside car point were preserved. Street-scene integration was made only after the camera owner handed off the file; no generic NPC foundation file was changed.

Geometry: templates contain 3,504 / 2,926 / 3,138 / 2,636 triangles. Four instances of each produce **48,816 visible crowd triangles in four draws**. This is an explicit local geometry increase over primitive sticks and must be included in the integrated/mobile performance gate; instancing alone does not prove identical FPS. No existing global car/bus/NPC budgets were raised.

Producer actually opened all three actual-buffer CPU/Blender images in `evidence/main-expansion/wedding-crowd-producer/`: front poses, profile poses and all-sixteen procession overview at scene time12. These show connected anatomical silhouettes and distinct internal skin/clothing colours rather than primitive rods. The overview uses an elevated camera to expose the original two-side rows; production camera/path code is unchanged. `manifest.json` records exact source, buffer-export and image hashes. Source buffers are exported by `scripts/art/export-wedding-crowd.ts` and rendered with existing Blender 4.5.9 LTS Cycles CPU (two threads, twelve samples) via `scripts/art/render-npc-production.py`. This is structural producer evidence, not native visual approval.

Checks:

- `node scripts/test-v21-fixes.mjs wedding-crowd`: **3/3 pass** — sixteen/four instancing, real finite reduced anatomy and local triangle bound, internal costume colours, all original slots/timing, invalid time handling and exact one-time resource disposal.
- `node scripts/test-v21-fixes.mjs street-scenes`: **27/27 pass**, including retryable moving wedding handoff and complete teardown/reuse.
- `node scripts/test-v21-fixes.mjs story-actor-camera`: **10/10 pass**, preserving latest L6/L8 camera and Wedding car-offset fixes.
- `npm run typecheck`: **pass**.

Runtime files were held for Root freeze15. The native scene QA agent was asked to inspect actual L8 approach/story/dance/hold in day/night as practical: guests must remain anatomically connected and clearly secondary, no arm spikes or whole-person tint, no obstruction of Bhanumathi or the alongside car/camera. Root and the independent reviewer own that verdict and subsequent performance acceptance.
