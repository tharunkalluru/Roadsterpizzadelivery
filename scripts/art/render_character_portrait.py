"""Render an exact exported actor for the post-delivery collection card.

Blender --background --factory-startup --threads 2 --python-exit-code 3
  --python scripts/art/render_character_portrait.py --
  --input NEW.glb --rig NEW.rig.json --output NEW-portrait.png

This imports the actual GLB and its actual Idle. It never repairs, edits or
re-exports the model. The resulting portrait still needs independent review.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

p = argparse.ArgumentParser()
p.add_argument('--input', required=True, type=Path)
p.add_argument('--rig', required=True, type=Path)
p.add_argument('--output', required=True, type=Path)
p.add_argument('--extent', type=float, default=.54)
p.add_argument('--yaw', type=float, default=.12)
p.add_argument('--center-z', type=float)
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
report = a.output.with_suffix('.portrait.json')
if a.output.exists() or report.exists():
    raise RuntimeError('Portrait evidence is immutable; choose a new output.')
if not .3 <= a.extent <= .9:
    raise RuntimeError('Use a measured human head framing extent.')
contract = json.loads(a.rig.read_text())
clip = contract.get('motions', {}).get('clips', {}).get('idle', {}).get('clipName')
if not clip:
    raise RuntimeError('An actual authored Idle is required for the portrait.')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(a.input.resolve()))
rigs = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
if len(rigs) != 1:
    raise RuntimeError('Expected one exported character armature.')
rig = rigs[0]
rig.animation_data_create()
actions = []
for track in rig.animation_data.nla_tracks:
    if track.name == clip:
        actions.extend(strip.action for strip in track.strips if strip.action)
    track.mute = True
if not actions:
    actions = [action for action in bpy.data.actions
               if action.name == clip or action.name.startswith(clip + '_')]
actions = list({action.as_pointer(): action for action in actions}.values())
if len(actions) != 1:
    raise RuntimeError('The exported Idle cannot be resolved unambiguously.')
rig.animation_data.action = actions[0]
if hasattr(actions[0], 'slots') and actions[0].slots:
    rig.animation_data.action_slot = actions[0].slots[0]
scene = bpy.context.scene
scene.frame_set(1)
deps = bpy.context.evaluated_depsgraph_get()
head = rig.pose.bones.get('Head')
if not head:
    raise RuntimeError('The actual Head bone is required for face framing.')
target = rig.matrix_world @ ((head.head + head.tail) * .5)
if a.center_z is not None:
    target.z = a.center_z
if not all(math.isfinite(x) for x in target):
    raise RuntimeError('Nonfinite face framing.')
camera_data = bpy.data.cameras.new('Collection portrait camera')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = a.extent
camera = bpy.data.objects.new('Collection portrait camera', camera_data)
scene.collection.objects.link(camera)
camera.location = target + Vector((math.sin(a.yaw) * 2, -math.cos(a.yaw) * 2, .025))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera
world = bpy.data.worlds.new('Portrait studio world')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.45, .45, .45, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
scene.world = world
for name, offset, energy in [('Key', (2, -3, 2), 350), ('Fill', (-2, -2, 1), 220), ('Rim', (1, 2, 2), 250)]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy
    light.shape = 'DISK'
    light.size = 3
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    obj.location = target + Vector(offset)
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 2
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'AgX'
a.output.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(a.output.resolve())
bpy.ops.render.render(write_still=True)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
report.write_text(json.dumps({
    'status': 'Unreviewed native portrait; no model or appearance approval implied',
    'sourceGlbSha256': sha(a.input), 'sourceContractSha256': sha(a.rig),
    'portraitSha256': sha(a.output), 'clip': clip, 'resolvedAction': actions[0].name,
    'targetBlender': list(target), 'extentMetres': a.extent, 'yawRadians': a.yaw,
    'treatment': 'Exact exported geometry/materials/Idle; transparent native studio render; no photo retouching',
}, indent=2) + '\n')
print('PORTRAIT_READY ' + str(a.output))
