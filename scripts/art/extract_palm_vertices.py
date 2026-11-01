"""Record actual native anatomical palm vertices for exact exported-skin tests.

Blender --background SOURCE.blend --python THIS -- --output NEW.json
No geometry, source model, image, weight or clip is edited. This is producer
geometry evidence, not a likeness or contact acceptance.
"""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--side',choices=['Left','Right','both'],default='both');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
if a.output.exists():raise RuntimeError('Use a new palm evidence output')
source=Path(bpy.data.filepath)
if not source.with_suffix('.glb').is_file():raise RuntimeError('Native blend must have its exact exported GLB beside it')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
for bone in rig.pose.bones:bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
bpy.context.view_layer.update();hands=[]
for side in ['Left','Right'] if a.side=='both' else [a.side]:
 obj=bpy.data.objects.get(side+'AuthoredAnatomicalHand');bone=rig.data.bones.get(side+'Hand')
 if obj is None or bone is None:raise RuntimeError('Expected actual anatomical hand and bound hand bone')
 origin=rig.matrix_world@bone.head_local;along=(rig.matrix_world.to_3x3()@(bone.tail_local-bone.head_local)).normalized();normal=Vector((0,1,0));normal=(normal-along*normal.dot(along)).normalized();across=along.cross(normal).normalized();vertices=[]
 for vertex in obj.data.vertices:
  point=obj.matrix_world@vertex.co;delta=point-origin
  if abs(delta.dot(across))<.015 and .024<delta.dot(along)<.043 and delta.dot(normal)>.008:
   vertices.append({'nativeVertexIndex':vertex.index,'nativeBlenderRestWorld':list(point),'exportThreeRestWorld':[point.x,point.z,-point.y]})
 if len(vertices)<5:raise RuntimeError('Actual palm support surface was not established')
 hands.append({'side':side,'meshName':obj.name,'boneName':bone.name,'vertices':vertices})
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
a.output.write_text(json.dumps({'status':'PRODUCER actual native palm surface evidence, not visual/scene approval','sourceBlend':str(source),'sourceBlendSha256':sha(source),'sourceGlbSha256':sha(source.with_suffix('.glb')),'coordinateConvention':'Native Blender XYZ → Three XYZ=(x,z,-y)','selection':'Actual anatomical hand rest frame: |across|<15mm,24mm<along<43mm,normal>8mm','hands':hands,'producerSha256':sha(Path(__file__))},indent=2));print('PALM_SOURCE_EVIDENCE',[(h['side'],len(h['vertices'])) for h in hands])
