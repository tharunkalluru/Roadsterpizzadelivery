# Local character production (draft assets only)

The free official TRELLIS.2 session produced one malformed slab candidate, then exhausted its daily ZeroGPU allowance during the next image's preprocessing. Its exact failure screenshot and settings remain in this folder. Do not retry quota errors, create another account to work around them, or add paid access.

The replacement local toolchain lives **outside the game repository** at:
`/Users/tharun/Documents/Codex/2026-10-29/character-production-tools`.

## Working shape path

`Hunyuan3D-Swift/python/shape` is the author's Python MLX reference port, using the same verified model bytes as the native Swift package. Swift package compilation currently fails on this Mac's installed compiler/PackageDescription library compatibility; the Python port executes on the Apple GPU successfully. Its environment is `hy3d-venv` with Python 3.12.16 / MLX 0.31.4. No global Python packages or system settings were changed.

The model is pinned to the small-shape manifest revision and its actual downloaded SHA-256 was checked. Source code is MIT; **weights are Tencent Hunyuan Community licensed, not MIT**. Keep the complete model `LICENSE` and exact required `NOTICE` beside the private local weights. They do not belong in the website bundle. Exact revisions and hashes are in `local-production.json`.

Use a clean, independently source-checked character guide with a genuine transparent alpha channel. A synthetic guide helps mesh authoring but is never evidence that a film character matches. The first opaque-background Pushpa draft produced excessive depth; the transparent second draft has a plausible body envelope. Neither is approved.

Run one GPU job at a time. From `Hunyuan3D-Swift/python/shape` use the isolated interpreter to execute `-m hy3dmlx.pipeline INPUT --weights WEIGHT_DIRECTORY --out NEW_OUTPUT --steps 30 --guidance 5 --octree 256 --seed 42 --dtype float16 --quantize 8 --octree-decode`. Refuse existing output paths. Preserve raw output before Blender edits, and assign each edited/rigged/painted result a new candidate fingerprint. Output is untextured geometry requiring independent topology, likeness, material, rig and scene review.

## Texture-capable alternative

The official MIT TripoSR source and pretrained checkpoint are pinned separately. Its isolated `triposr-venv` has PyTorch 2.8 with MPS enabled. This Mac's native OpenGL 4.1 context successfully passed the texture-baker preflight.

Local adaptations are explicit in `TripoSR/LOCAL_PRODUCER_NOTES.md` and `local_character_generate.py`: CPU scikit-image marching cubes replaces the original C++ CUDA/CPU extension; neural weights are unchanged. The MPS adapter places texture queries on the model's device, then reads their output to CPU for the original UV atlas rasterizer. The input receives the upstream alpha crop/composite only in memory. Original reference and guide image files are not edited. These adaptations are production tools, not game runtime code or an equivalence/likeness claim.

The runner refuses existing GLBs, saves a vertex-color draft before UV baking, writes a native PBR textured GLB, and records source/output hashes, triangle counts and timings in a companion `.production.json`. New assets remain under `docs/delivery/character-review/candidates`; never copy them into `public` or add a release manifest entry without independent visual acceptance.

## Review boundary

The producer cannot approve its own generated assets. The separate reviewer must inspect actual front, three-quarter, profile, full body, rear and intended in-scene handoff/pose views against primary film references. Source/procedure success, a plausible envelope or a passing rig importer is not an appearance pass. A new material, mesh, pose, rig, texture or source assignment requires a new reviewed fingerprint.
