"""Render a bounded portrait directly from the exact accepted runtime GLB.

No source image/identity substitution or GLB mutation is performed.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import bpy
from mathutils import Vector

p = argparse.ArgumentParser()
p.add_argument('--input', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--angle-offset', type=float, default=0)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
if a.output.exists():
    raise RuntimeError('Portrait evidence is immutable; choose a new output')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.input.resolve()))
scene = bpy.context.scene
rig = next(o for o in scene.objects if o.type == 'ARMATURE')
rig.animation_data_create()
for track in rig.animation_data.nla_tracks:
    track.mute = True
action = bpy.data.actions.get('Idle')
if action is None:
    raise RuntimeError('Exact actor requires its authored Idle pose')
rig.animation_data.action = action
if action.slots:
    rig.animation_data.action_slot = action.slots[0]
scene.frame_set(12)
deps = bpy.context.evaluated_depsgraph_get()
points = [o.evaluated_get(deps).matrix_world @ v.co for o in scene.objects if o.type == 'MESH' and not o.hide_render for v in o.evaluated_get(deps).data.vertices]
top = max(p.z for p in points)
target = Vector((0, 0, top - .25))
detail = next((o for o in scene.objects if o.type == 'MESH' and o.name == 'AuthoredDetailedHead'), None)
if detail:
    evaluated = detail.evaluated_get(deps)
    upper = [evaluated.matrix_world @ v.co for v in evaluated.data.vertices if (evaluated.matrix_world @ v.co).z > top - .28]
    if upper:
        center = sum(upper, Vector()) / len(upper)
        target.x, target.y = center.x, center.y
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = scene.render.resolution_y = 320
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.compression = 100
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.032, .018, .06, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
scene.view_settings.view_transform = 'AgX'
for name, position, power in [('Key', (2, -4, 4), 500), ('Fill', (-3, -2, 3), 320), ('Rim', (0, 3, 4), 400)]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = power
    light.shape = 'DISK'
    light.size = 3
    o = bpy.data.objects.new(name, light)
    scene.collection.objects.link(o)
    o.location = position
    o.rotation_euler = (target - o.location).to_track_quat('-Z', 'Y').to_euler()
camera_data = bpy.data.cameras.new('ExactActorPortrait')
camera = bpy.data.objects.new('ExactActorPortrait', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.lens = 65
angle = .20 + a.angle_offset
camera.location = target + Vector((math.sin(angle) * 1.408, -math.cos(angle) * 1.408, .035))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
a.output.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(a.output.resolve())
bpy.ops.render.render(write_still=True)
if a.output.stat().st_size > 150_000:
    raise RuntimeError('Portrait exceeds bounded public-art budget')
a.output.with_suffix('.render.json').write_text(json.dumps({'source': str(a.input), 'glbSha256': hashlib.sha256(a.input.read_bytes()).hexdigest(), 'portraitSha256': hashlib.sha256(a.output.read_bytes()).hexdigest(), 'bytes': a.output.stat().st_size, 'method': 'Direct exact GLB authored Idle portrait render'}, indent=2) + '\n')
