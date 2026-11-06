"""Author continuous skin transitions at actual elbow bones in NEW candidates.

The source short sleeves and forearms remain untouched. The small closed skin
tubes overlap both real surfaces and blend Arm→ForeArm at the elbow instead of
leaving the replacement forearm's cut end exposed. Independent review required.
"""
import argparse,sys,json,math,hashlib
from pathlib import Path
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if any(x.exists() for x in [a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json')]):raise RuntimeError('Fresh immutable candidate required')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');action=rig.animation_data.action;mutes=[t.mute for t in rig.animation_data.nla_tracks];pose={b.name:b.matrix_basis.copy()for b in rig.pose.bones}
rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
for bone in rig.pose.bones:bone.matrix_basis.identity()
bpy.context.view_layer.update();records=[]
for side in ['Left','Right']:
 if bpy.data.objects.get(side+'AuthoredElbowTransition'):raise RuntimeError('Source already has elbow transition')
 upper,lower=rig.data.bones[side+'Arm'],rig.data.bones[side+'ForeArm'];elbow=rig.matrix_world@lower.head_local
 up=(rig.matrix_world.to_3x3()@(upper.tail_local-upper.head_local)).normalized();forward=(rig.matrix_world.to_3x3()@(lower.tail_local-lower.head_local)).normalized()
 across=forward.cross(Vector((0,1,0))).normalized();normal=across.cross(forward).normalized();vertices=[];faces=[];weights=[]
 offsets=[-.10,-.08,-.05,-.025,0,.02,.045,.07]
 for offset in offsets:
  centre=elbow+(up if offset<0 else forward)*offset;radius=.031 if offset<0 else .031-(offset/.07)*.004
  lower_weight=max(0,min(1,(offset+.05)/.10))
  for k in range(16):
   angle=k/16*math.tau;vertices.append(tuple(centre+across*math.cos(angle)*radius+normal*math.sin(angle)*radius));weights.append(lower_weight)
 for row in range(len(offsets)-1):
  for k in range(16):faces.append((row*16+k,row*16+(k+1)%16,(row+1)*16+(k+1)%16,(row+1)*16+k))
 faces.extend([tuple(reversed(range(16))),tuple((len(offsets)-1)*16+k for k in range(16))])
 mesh=bpy.data.meshes.new(side+' actual elbow skin transition');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(side+'AuthoredElbowTransition',mesh);bpy.context.scene.collection.objects.link(obj)
 skin=bpy.data.materials.get(side+' authored warm skin')
 if not skin:raise RuntimeError('Measured anatomical skin material required')
 mesh.materials.append(skin)
 for face in mesh.polygons:face.use_smooth=True
 for name,isLower in [(side+'Arm',False),(side+'ForeArm',True)]:
  group=obj.vertex_groups.new(name=name)
  for i,w in enumerate(weights):group.add([i],w if isLower else 1-w,'REPLACE')
 modifier=obj.modifiers.new('Actual elbow blend','ARMATURE');modifier.object=rig;obj.parent=rig
 records.append({'side':side,'actualElbow':list(elbow),'upperOverlapMetres':.10,'forearmOverlapMetres':.07,'radiusMetres':.031,'closedSkinMesh':True,'weighting':'continuous Arm to ForeArm blend'})
for bone in rig.pose.bones:bone.matrix_basis=pose[bone.name]
for track,mute in zip(rig.animation_data.nla_tracks,mutes):track.mute=mute
rig.animation_data.action=action;bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()));bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True)
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-continuous-elbows-v1';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n')
a.output.with_suffix('.elbow-transition.json').write_text(json.dumps({'status':'UNAPPROVED; deformed skin continuity and real scene still require independent review','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'transitions':records,'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest()},indent=2)+'\n')
