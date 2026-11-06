"""Refine the actual head's native UV atlas from its own front source guide.

Preserves 3D identity geometry, bones, clips and the authored rear hair. Only
front-facing head texels receive a bounded orthographic source projection.
Requires a new candidate and fresh independent comparison, never approval.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
import numpy as np

p = argparse.ArgumentParser()
p.add_argument('--guide', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--projection-bottom', type=float, required=True)
p.add_argument('--projection-top', type=float, required=True)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = Path(bpy.data.filepath)
if a.output.exists() or a.output.with_suffix('.blend').exists():
    raise RuntimeError('New immutable candidate required')
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
action = rig.animation_data.action
poses = {b.name: b.matrix_basis.copy() for b in rig.pose.bones}
mutes = [t.mute for t in rig.animation_data.nla_tracks]
rig.animation_data.action = None
for t in rig.animation_data.nla_tracks:
    t.mute = True
for b in rig.pose.bones:
    b.location = (0, 0, 0)
    b.rotation_euler = (0, 0, 0)
    b.scale = (1, 1, 1)
bpy.context.view_layer.update()
head = bpy.data.objects['AuthoredDetailedHead']
material = head.data.materials[0].copy()
head.data.materials[0] = material
node = next(n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
image = node.image.copy()
node.image = image
def pixels(im):
    v = np.empty(im.size[0] * im.size[1] * 4, np.float32)
    im.pixels.foreach_get(v)
    return v.reshape(im.size[1], im.size[0], 4)
atlas = pixels(image)
guide = pixels(bpy.data.images.load(str(a.guide.resolve()), check_existing=True))
rows, cols = np.nonzero(guide[..., 3] > .5)
if not len(rows) or len(rows) == guide.shape[0] * guide.shape[1]:
    raise RuntimeError('Actual transparent authoring guide required')
box = [cols.min() / guide.shape[1], cols.max() / guide.shape[1], rows.min() / guide.shape[0], rows.max() / guide.shape[0]]
points = np.array([tuple(head.matrix_world @ v.co) for v in head.data.vertices])
xlo, xhi = points[:, 0].min(), points[:, 0].max()
normal_matrix = head.matrix_world.to_3x3().inverted().transposed()
head.data.calc_loop_triangles()
uv = head.data.uv_layers.active.data
h, w = atlas.shape[:2]
nearest = np.full((h, w), np.inf)
changed = np.zeros((h, w), bool)
for tri in head.data.loop_triangles:
    coordinates = np.array([tuple(uv[i].uv) for i in tri.loops])
    lo = np.maximum(np.floor(coordinates.min(axis=0) * [w, h]).astype(int) - 1, 0)
    hi = np.minimum(np.ceil(coordinates.max(axis=0) * [w, h]).astype(int) + 1, [w - 1, h - 1])
    xs, ys = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
    xx, yy = (xs + .5) / w, (ys + .5) / h
    (x0, y0), (x1, y1), (x2, y2) = coordinates
    den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(den) < 1e-13:
        continue
    b0 = ((y1 - y2) * (xx - x2) + (x2 - x1) * (yy - y2)) / den
    b1 = ((y2 - y0) * (xx - x2) + (x0 - x2) * (yy - y2)) / den
    weights = np.maximum(np.stack([b0, b1, 1 - b0 - b1], axis=-1), 0)
    weights /= np.maximum(weights.sum(axis=-1, keepdims=True), 1e-9)
    projected_uv = weights @ coordinates
    distance = (projected_uv[..., 0] * w - (xs + .5)) ** 2 + (projected_uv[..., 1] * h - (ys + .5)) ** 2
    native = weights @ points[list(tri.vertices)]
    normals = weights @ np.array([tuple(normal_matrix @ head.data.corner_normals[i].vector) for i in tri.loops])
    normals /= np.maximum(np.linalg.norm(normals, axis=-1, keepdims=True), 1e-9)
    u = (native[..., 0] - xlo) / (xhi - xlo)
    v = (native[..., 2] - a.projection_bottom) / (a.projection_top - a.projection_bottom)
    # Side/rear hair and the extended lower tail retain native neural texture.
    face_weight = np.clip((-normals[..., 1] - .12) / .53, 0, 1)
    face_weight *= np.clip((v - .30) / .06, 0, 1) * np.clip((.90 - v) / .07, 0, 1)
    face_weight *= np.clip((u - .17) / .07, 0, 1) * np.clip((.83 - u) / .07, 0, 1)
    gu = np.clip((box[0] + u * (box[1] - box[0])) * guide.shape[1] - .5, 0, guide.shape[1] - 1)
    gv = np.clip((box[2] + v * (box[3] - box[2])) * guide.shape[0] - .5, 0, guide.shape[0] - 1)
    gx, gy = gu.astype(int), gv.astype(int)
    gx1, gy1 = np.minimum(gx + 1, guide.shape[1] - 1), np.minimum(gy + 1, guide.shape[0] - 1)
    tx, ty = (gu - gx)[..., None], (gv - gy)[..., None]
    donor = (guide[gy, gx] * (1 - tx) + guide[gy, gx1] * tx) * (1 - ty) + (guide[gy1, gx] * (1 - tx) + guide[gy1, gx1] * tx) * ty
    face_weight *= donor[..., 3] > .95
    mask = (distance <= 2.25) & (distance < nearest[ys, xs] - 1e-7) & (face_weight > .001)
    blend = face_weight[mask, None]
    atlas[ys[mask], xs[mask], :3] = atlas[ys[mask], xs[mask], :3] * (1 - blend) + donor[..., :3][mask] * blend
    nearest[ys[mask], xs[mask]] = distance[mask]
    changed[ys[mask], xs[mask]] = True
image.pixels.foreach_set(atlas.ravel())
image.update()
image.pack()
for b in rig.pose.bones:
    b.matrix_basis = poses[b.name]
for t, muted in zip(rig.animation_data.nla_tracks, mutes):
    t.mute = muted
rig.animation_data.action = action
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()), export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_yup=True, export_extras=True)
contract = json.loads(source.with_suffix('.rig.json').read_text())
contract['id'] += '-native-front-face-projection-v1'
a.output.with_suffix('.rig.json').write_text(json.dumps(contract, indent=2) + '\n')
a.output.with_suffix('.head-projection.json').write_text(json.dumps({'status': 'UNAPPROVED native front head UV refinement; exact face/scene review required', 'source': str(source), 'guide': str(a.guide), 'guideSha256': hashlib.sha256(a.guide.read_bytes()).hexdigest(), 'sourceGeometryUnchanged': True, 'projectionBottom': a.projection_bottom, 'projectionTop': a.projection_top, 'changedTexels': int(changed.sum()), 'outputSha256': hashlib.sha256(a.output.read_bytes()).hexdigest()}, indent=2) + '\n')
