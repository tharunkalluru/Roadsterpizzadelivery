"""Blender: render a new candidate's authored pose without editing its GLB.

Blender --background actor.blend --python scripts/art/render_character.py --
  --output /absolute/new-review-directory [--clip Read] [--frame 12]
Outputs are production inspection renders, never in-game handoff evidence.
"""
import argparse
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True,type=Path)
parser.add_argument('--clip',default='Idle')
parser.add_argument('--frame',type=int,default=12)
parser.add_argument('--material',choices=['authored','clay','unlit'],default='authored')
parser.add_argument('--views',default='front,three-quarter,profile,back,full-body')
parser.add_argument('--fit-visible-vertices',action='store_true',help='Imported GLB review: frame evaluated nonempty visible mesh vertices, with distance fitted to actual full-body span')
parser.add_argument('--angle-offset',type=float,default=0,help='Explicit orbit offset in radians for supplementary head-facing views of a turned seated pose')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
if args.output.exists(): raise RuntimeError('Use a NEW review directory; old evidence is immutable.')
args.output.mkdir(parents=True)
scene=bpy.context.scene
rig=next((obj for obj in scene.objects if obj.type=='ARMATURE'),None)
if rig:
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:track.mute=True
    action=bpy.data.actions.get(args.clip) if args.clip!='rest' else None
    if not action and args.clip!='rest':raise RuntimeError('The requested authored clip is missing.')
    rig.animation_data.action=action
    if action and hasattr(action,'slots') and action.slots:rig.animation_data.action_slot=action.slots[0]
scene.frame_set(args.frame)
if args.material=='clay':
    material=bpy.data.materials.new('Diagnostic neutral clay');material.use_nodes=True
    principled=material.node_tree.nodes.get('Principled BSDF');principled.inputs['Base Color'].default_value=(.5,.5,.5,1);principled.inputs['Metallic'].default_value=0;principled.inputs['Roughness'].default_value=1
    scene.view_layers[0].material_override=material
elif args.material=='unlit':
    for material in bpy.data.materials:
        if not material.use_nodes:continue
        nodes=material.node_tree.nodes;links=material.node_tree.links
        principled=next((node for node in nodes if node.type=='BSDF_PRINCIPLED'),None)
        output=next((node for node in nodes if node.type=='OUTPUT_MATERIAL'),None)
        if not principled or not output:continue
        emission=nodes.new('ShaderNodeEmission')
        source=principled.inputs['Base Color']
        if source.links:links.new(source.links[0].from_socket,emission.inputs['Color'])
        else:emission.inputs['Color'].default_value=source.default_value
        links.new(emission.outputs[0],output.inputs['Surface'])
deps=bpy.context.evaluated_depsgraph_get()
corners=[obj.evaluated_get(deps).matrix_world@Vector(corner) for obj in scene.objects if obj.type=='MESH' for corner in obj.evaluated_get(deps).bound_box]
if args.fit_visible_vertices:
    corners=[obj.evaluated_get(deps).matrix_world@v.co for obj in scene.objects if obj.type=='MESH' and not obj.hide_render for v in obj.evaluated_get(deps).data.vertices]
bottom=min(point.z for point in corners);top=max(point.z for point in corners)
face_center=Vector((0,0,top-.17))
if args.fit_visible_vertices:
    detail=next((obj for obj in scene.objects if obj.type=='MESH' and obj.name=='AuthoredDetailedHead'),None)
    if detail:
        evaluated=detail.evaluated_get(deps)
        upper=[evaluated.matrix_world@v.co for v in evaluated.data.vertices if (evaluated.matrix_world@v.co).z>top-.28]
        if upper:
            center=sum(upper,Vector())/len(upper)
            face_center=Vector((center.x,center.y,top-.17))
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.resolution_x=768;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.38,.38,.38,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.65
scene.view_settings.view_transform='AgX'
for name,position,power,size in [('Key',(3,-4,5),550,4),('Fill',(-3,-2,3),350,4),('Rim',(1,3,4),450,3)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=position
    obj.rotation_euler=(Vector((0,0,1.1))-obj.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('ReviewCamera');camera=bpy.data.objects.new('ReviewCamera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
camera_data.lens=65
for name,angle,face in [('front',0,False),('three-quarter',.6,True),('profile',math.pi/2,True),('back',math.pi,False),('full-body',.6,False)]:
    if name not in args.views.split(','):continue
    angle+=args.angle_offset
    target=face_center.copy() if face else Vector((0,0,(top+bottom)/2))
    distance=1.5 if face else max(3.9,(top-bottom)*2.6) if args.fit_visible_vertices else 3.9
    camera.location=target+Vector((math.sin(angle)*distance,-math.cos(angle)*distance,.04))
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str((args.output/(name+'.png')).resolve())
    bpy.ops.render.render(write_still=True)
print('REVIEW_RENDERS '+str(args.output))
