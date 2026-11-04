# Neutral anatomical head mesh

`anatomical-head.json` is a head-only, simplified derivative of MakeHuman's bundled `hm08` base mesh. It supplies continuous neutral human facial topology (nose, eyelids, lips, jaw and ears), not a celebrity scan or photographic likeness. Roadster applies its own head proportions, face colors, facial hair and hairstyle geometry at scene setup.

- Upstream: https://github.com/makehumancommunity/makehuman
- Source mesh: https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
- Upstream asset license statement: https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md, section C, bundled assets, including the base mesh: CC0 1.0 Universal.
- Full asset license: `LICENSE-MAKEHUMAN-HEAD.md`, from upstream `LICENSE.ASSETS.md`.
- Source mesh header explicitly releases this asset as CC0 (September 2020), with copyright holders Data Collection AB, Joel Palmius and Jonas Hauquier.

Only body-group faces above the neck are retained. Hidden back/head and broad facial surfaces are simplified with vertex clustering, while eyelid, mouth and nose loops retain source precision. No MakeHuman program code or external clothes, textures, proxies, expressions or third-party assets are included.

The source OBJ SHA-256, retained vertex/triangle counts and extraction settings are stored in the JSON metadata. The runtime uses one merged opaque vertex-lit actor mesh, no external fetch or image texture.

## Runtime ownership and loading

`prewarmSceneCharacterAssets()` prepares only the nine production style/pose pairs, yielding one pair per animation frame in a browser. The initial loading screen awaits it in parallel with core-city loading; collecting an order then only clones the lightweight scene graph and creates GPU-owner wrappers. Repeated or concurrent calls share one promise.

Templates are immutable CPU data. Indexed geometry keeps the prepared typed-array pool at about 3.43 MiB for those nine pairs. An instance receives its own geometry, BufferAttribute, index and material objects, sharing only read-only typed arrays. Animation changes shoulder transforms and a cached hand anchor; it never mutates these arrays or recomputes normals. A module can dispose its instance GPU resources without affecting another actor or the CPU templates. Alternative poses requested by the developer-only review fixture are created on demand; the full finite style/pose space is 18 pairs.

`tests/v21-fixes/delivery-character-art.test.ts` checks draw/triangle bounds, opaque material treatment, adult proportions, outward geometry, real hand-anchor alignment, reading pose, prewarm idempotence, immutable sharing, pose independence and disposal isolation. `tests/browser/character-art.html` renders the production actors for visual review, including a test-only optional historical comparison.
