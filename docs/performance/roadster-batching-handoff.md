# Roadster static mesh batching

The coordinator applied the reviewed patch after the bounded actual-Player/Engine image comparison. It batches opaque static direct-child meshes only, using the same geometry, materials and local transforms. Moving wheel/steering groups, deployment and kickflip transforms remain separate. The transparent physical canopy, pizza box, eight individually animated pod glows and two animated wing supports keep their original Mesh references. There is no geometry simplification, texture replacement or resolution change.

The helper groups only matching material, shadow, render-order, layer and vertex-attribute signatures within the explicitly selected body, wing and four wheel-roller parents. It rejects negative/singular transforms, hidden/custom-rendered/transparent meshes, morphing/skinned/instanced meshes and partial draw ranges. Shared removed geometry is disposed once only after no retained mesh references it. Batching runs before Player caches its bounds and jump collision meshes.

## Structural and visual evidence

- Node prototype: 170 meshes become 89 through 11 batches of 92 source meshes; ground-visible car draw candidates fall from 146 to 65. Across 25,480 tested transformed vertices, the maximum position difference is **1.200e-7 metres**, maximum normal difference **3.571e-8**, UV difference zero and index mismatch count zero. All 11 protected mesh references remain intact. No retained geometry was disposed, and no removed geometry was disposed twice.
- Three focused behavioral tests pass: transformed geometry/signatures/protected references; unsafe eligibility exclusions; and shared geometry lifetime. The coordinator reran these after applying the production patch.
- Isolated headless Chrome captured nine paired views at 1280×720, DPR 1, High graphics using the actual Player and Engine: ground front/rear by day/night, partial deployment, steered/rolled wheel closeups, full deployment and an outer kickflip pose. Real labels, physical canopy, PMREM environment, shadow maps and bloom were included. Captures ran **2026-10-28 10:58:34–10:58:55 UTC** with the gameplay browser paused. This is a synthetic visual fixture, not a delivery or performance test.
- Three pairs are RGB-identical. Other pairs differ at only **1–43 of 921,600 pixels**, with maximum channel difference **4/255** in the day wheel closeup. Maximum whole-image mean absolute channel error is **0.000024957/255**. These small floating-point differences do not justify claiming universal pixel identity.
- The same ground fixture records **318 → 156 renderer calls**, including shadow passes, with **28,154 triangles unchanged**. This is an isolated fixture draw reduction; it is **not a whole-game FPS improvement percentage**.
- Kickflip centre (**0.11716533184051509**) and jump body top (**2.199999984800815**) are exactly unchanged in both variants. No console/page errors were recorded during the 18 captures. A standalone fixture favicon 404 during setup was not a game error.

The headless session and fixture HTTP server were closed before handing the host back for gameplay measurements. No real-phone FPS, battery, thermal or broad all-pose visual claim follows from these fixtures. The final integrated build and gameplay smoke test are the coordinator's acceptance gates.

## Durable evidence

Representative front/day, front/night, deployed night, day/night wheel and kickflip original pairs, plus the derived contact sheet, are copied byte-for-byte under [evidence/roadster-batching](evidence/roadster-batching/). [sha256-index.json](evidence/roadster-batching/sha256-index.json) records original paths, copy hashes and sizes; all 13 copied images match their sources. The contact sheet was already derived for comparison; preserved screenshots were not edited.

Detailed results: [roadster-visual-comparison.json](roadster-visual-comparison.json) and [roadster-batching-prototype.json](roadster-batching-prototype.json). The comparison fixture used pre-patch vehicles.ts SHA-256 `1e4c7b18eb813e21a909f83173eca326dfcfe1d3398f6c369182c74e482c9720`; candidate batching was injected in memory before Player construction. The prepared patch was subsequently applied by the coordinator, with no further source edits by this agent.
