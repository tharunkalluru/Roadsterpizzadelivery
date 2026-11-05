"""Repair bright projection spill only on native trouser triangles.

This creates a new immutable candidate. It does not change source guides,
geometry, rig, pose, facial pixels or accepted upper-body costume.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
import numpy as np

p = argparse.ArgumentParser()
p.add_argument('--output', type=Path, required=True)
p.add_argument('--below', type=float, default=.87)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(bpy.data.filepath)
if a.output.exists() or a.output.with_suffix('.blend').exists():
    raise RuntimeError('New immutable candidate output required')
body = max((o for o in bpy.context.scene.objects if o.type == 'MESH' and 'review-mesh' in o.name), key=lambda o: len(o.data.vertices))
material = body.data.materials[0].copy()
body.data.materials[0] = material
node = next(n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
image = node.image.copy()
node.image = image
w, h = image.size
pixels = np.empty(w * h * 4, dtype=np.float32)
image.pixels.foreach_get(pixels)
pixels = pixels.reshape(h, w, 4)
changed = np.zeros((h, w), bool)
uv = body.data.uv_layers.active.data
body.data.calc_loop_triangles()
for tri in body.data.loop_triangles:
    points = np.array([tuple(body.matrix_world @ body.data.vertices[i].co) for i in tri.vertices])
    if points[:, 2].min() >= a.below:
        continue
    coords = np.array([tuple(uv[i].uv) for i in tri.loops])
    low = np.maximum(np.floor(coords.min(axis=0) * [w, h]).astype(int) - 1, 0)
    high = np.minimum(np.ceil(coords.max(axis=0) * [w, h]).astype(int) + 1, [w - 1, h - 1])
    xs, ys = np.meshgrid(np.arange(low[0], high[0] + 1), np.arange(low[1], high[1] + 1))
    x, y = (xs + .5) / w, (ys + .5) / h
    (x0, y0), (x1, y1), (x2, y2) = coords
    den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(den) < 1e-13:
        continue
    b0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / den
    b1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / den
    b2 = 1 - b0 - b1
    # One texel footprint prevents a bright fringe around small UV islands.
    weights = np.maximum(np.stack([b0, b1, b2], axis=-1), 0)
    weights /= np.maximum(weights.sum(axis=-1, keepdims=True), 1e-9)
    nearest_uv = weights @ coords
    distance = ((nearest_uv[..., 0] * w - (xs + .5)) ** 2 + (nearest_uv[..., 1] * h - (ys + .5)) ** 2)
    native = weights @ points
    rgb = pixels[ys, xs, :3]
    brightness = rgb.mean(axis=-1)
    neutral = rgb.max(axis=-1) - rgb.min(axis=-1) < .22
    mask = (distance <= 1.5) & (native[..., 2] < a.below) & (brightness > .42) & neutral
    # Retain folds as bounded dark fabric variation, instead of flat black.
    shade = .075 + np.clip(brightness, 0, 1) * .055
    for channel, scale in enumerate([.95, .97, 1.0]):
        pixels[ys[mask], xs[mask], channel] = shade[mask] * scale
    changed[ys[mask], xs[mask]] = True
image.pixels.foreach_set(pixels.ravel())
image.update()
image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()), export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_yup=True, export_extras=True)
contract = json.loads(source.with_suffix('.rig.json').read_text())
contract['id'] += '-native-trouser-spill-repair-v1'
a.output.with_suffix('.rig.json').write_text(json.dumps(contract, indent=2) + '\n')
a.output.with_suffix('.trouser-uv.json').write_text(json.dumps({'status': 'UNAPPROVED narrow native material repair', 'source': str(source), 'belowMetres': a.below, 'changedTexels': int(changed.sum()), 'outputSha256': hashlib.sha256(a.output.read_bytes()).hexdigest()}, indent=2) + '\n')
