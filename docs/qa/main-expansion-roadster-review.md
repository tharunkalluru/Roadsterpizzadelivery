# Optional player Roadster appearance inspection

Date: 2026-11-02. Scope: the player Roadster only. Traffic vehicle refinement is reviewed separately.

## Decision

Preserve the existing Roadster appearance in this pass. The current model already has a closed coupe body, genuine wheel-arch openings, seated cabin, windscreen and side glazing, paired mounted mirrors, split-spoke wheels, brake discs/calipers, attached front/rear lamp surfaces, retracting eight-port thrusters and supported active spoiler. The four exact-geometry inspection views did not reveal a structural defect that warrants changing its appearance while the primary traffic and campaign work is being validated.

This is a bounded no-change finding, not a claim of photographic accuracy or a performance approval. Independent final review of these views and native gameplay remains separate.

## Evidence inspected

All four CPU views were opened and visually inspected: `evidence/main-expansion/roadster-structure-current/front-quarter.png`, `rear-quarter.png`, `side.png`, and `flight-deployed.png`. They use the actual production mesh positions, indices and split normals exported from `roadster()` in `src/world/vehicles.ts`, at deployment 0 and 1. Coordinates are converted from Three.js Y-up to Blender Z-up without remodeling. Existing material colors, metallic and roughness settings are retained, under neutral Cycles CPU lighting (12 samples, two threads).

Canvas-generated plate/sticker textures are intentionally replaced by plain material surfaces in these offline renders. The gold side/rear rectangles are not proposed replacement stickers. These images therefore assess structure and attachment, not label legibility or exact WebGL rendering. The actual `tfigames.com` side labels, `pizzadeliveryboy` rear label, pizza equipment and label code remain unchanged.

The exported visible geometry has 13,646 triangles and 150 meshes in either deployment state (before any runtime treatment). There are four wheel roots and eight nozzle roots. All exported positions and normals were checked finite. The root-space wheel centers remain at x ±0.945, y −0.19, z ±1.4. Retracted non-decal bounds are x ±1.13, y −0.55 to 0.78433, z −2.34 to 2.44; deployment changes only the existing spoiler/nozzle envelope. These are model inventory figures, not measured draw calls, frame rates or phone budgets.

## Preserved behavior and exact source

No production file was edited by this review. In particular, driving acceleration/braking, flight, jump/kickflip, camera timing, collision/support bounds, wheel/suspension animation, pizza case, decals, lights and deployment functions retain their existing implementation. `git diff -- src/world/vehicles.ts src/world/roadster-decals.ts src/game/player-lights.ts` was empty at review time.

Exact SHA-256 values:

- `src/world/vehicles.ts`: `093061b04ffc7c16d3d0cd6a565e48a255edd83878bb9cca21b4d3cb84558e4b`.
- `src/world/roadster-decals.ts`: `f082bd092216dfddc64a1f3ad6fbf696dd75824c86bbf39f48877068a121051e`.
- `src/game/player-lights.ts`: `8fdc182f46945a1cb889078cd05f02274cbcf8c23052f8a63bc94cda6513d26b`.

Per-image hashes and geometry checks are recorded in `evidence/main-expansion/roadster-structure-current/manifest.json`. Raw exact geometry and CPU export/render scripts remain under `/tmp/roadster-appearance-current`, `/tmp/roadster-appearance-export.ts` and `/tmp/roadster-appearance-render.py`; they are local review intermediates, not shipped runtime assets.

Native final gameplay should still verify clear stickers and retained pizza equipment, night head/brake/reverse lamps, wheel rolling/steering, and unchanged kickflip/flight deployment. This review does not substitute for those checks.
