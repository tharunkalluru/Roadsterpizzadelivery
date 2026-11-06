"""Native offline motion/floor review, not gameplay, device evidence or approval.

The export stays in place. Only this temporary scene translates a walking
actor by the exact authored metres-per-cycle so stance can be judged against
a half-metre floor grid. Source GLB/blend/clips are never saved or modified.
"""
import argparse,hashlib,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path);p.add_argument('--clip',default='Walk');p.add_argument('--frames',default='1,7,13,19,25');p.add_argument('--metres-per-cycle',type=float,default=0);p.add_argument('--angle',type=float,default=.75)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if a.output.exists():raise RuntimeError('Use a new review directory; old evidence is immutable')
a.output.mkdir(parents=True);scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE')
for track in rig.animation_data.nla_tracks:track.mute=True
rig.animation_data.action=None
for bone in rig.pose.bones:bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
action=bpy.data.actions.get(a.clip)
if not action:raise RuntimeError('The exact authored clip must exist')
rig.animation_data.action=action
if action.slots:rig.animation_data.action_slot=action.slots[0]
actors=list(scene.objects);travel=bpy.data.objects.new('INSPECTION_ONLY_world_travel',None);scene.collection.objects.link(travel)
for obj in actors:
 if obj.parent is None:
  matrix=obj.matrix_world.copy();obj.parent=travel;obj.matrix_world=matrix
bpy.ops.mesh.primitive_plane_add(size=4,location=(0,-.4,-.001));floor=bpy.context.object;floor.name='DIAGNOSTIC_half_metre_floor'
material=bpy.data.materials.new('DIAGNOSTIC floor checker');material.use_nodes=True;nodes=material.node_tree.nodes;links=material.node_tree.links
checker=nodes.new('ShaderNodeTexChecker');checker.inputs['Color1'].default_value=(.27,.27,.27,1);checker.inputs['Color2'].default_value=(.50,.50,.50,1);checker.inputs['Scale'].default_value=8;links.new(checker.outputs['Color'],nodes['Principled BSDF'].inputs['Base Color']);nodes['Principled BSDF'].inputs['Roughness'].default_value=1;floor.data.materials.append(material)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=2;scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.35,.35,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
for name,position,power in [('Key',(3,-4,5),500),('Fill',(-3,-2,3),300)]:
 light=bpy.data.lights.new(name,'AREA');light.energy=power;light.size=4;obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('DIAGNOSTIC motion camera',bpy.data.cameras.new('DIAGNOSTIC motion camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.lens=60
records=[]
for frame in [int(f) for f in a.frames.split(',')]:
 scene.frame_set(frame);travel.location.y=-a.metres_per_cycle*(frame-1)/24;target=Vector((0,travel.location.y,.83));camera.location=target+Vector((math.sin(a.angle)*3.8,-math.cos(a.angle)*3.8,.16));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(a.output/(a.clip+'-'+str(frame).zfill(3)+'.png'));bpy.ops.render.render(write_still=True);records.append({'frame':frame,'clipSeconds':(frame-1)/24,'inspectionTravelY':travel.location.y,'path':scene.render.filepath})
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
(a.output/'inspection.json').write_text(json.dumps({'status':'OFFLINE native motion review only; real scene/device/likeness acceptance remains separate','sourceBlend':str(source),'sourceBlendSha256':sha(source),'sourceGlbSha256':sha(source.with_suffix('.glb')),'clip':a.clip,'authoredMetresPerCycle':a.metres_per_cycle,'floor':'Diagnostic half-metre grid, not an in-game environment','exportedSourceRootMotion':'unchanged/in-place; only temporary inspection root translated','frames':records,'producerScriptSha256':sha(Path(__file__))},indent=2));print('NATIVE_MOTION_REVIEW '+str(a.output))
