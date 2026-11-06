"""Close authored wrist transitions with small bound anatomical skin volumes.
New outputs only; actual render/pose review remains required.
"""
import argparse,sys,json,hashlib,math
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if a.output.exists() or a.output.with_suffix('.blend').exists():raise RuntimeError('New immutable candidate output required')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for b in rig.pose.bones:b.location=(0,0,0);b.rotation_euler=(0,0,0);b.scale=(1,1,1)
bpy.context.view_layer.update();records=[]
for side in ['Left','Right']:
 hand=rig.data.bones[side+'Hand'];fore=rig.data.bones[side+'ForeArm'];direction=(hand.head_local-fore.head_local).normalized();wrist=rig.matrix_world@hand.head_local;world_dir=(rig.matrix_world.to_3x3()@direction).normalized();points=[];source_weights={}
 for body in bpy.context.scene.objects:
  if body.type!='MESH' or 'review-mesh' not in body.name:continue
  bm=bmesh.new();bm.from_mesh(body.data)
  for v in bm.verts:
   point=body.matrix_world@v.co
   if not any(e.is_boundary for e in v.link_edges) or (point-wrist).length>=.1:continue
   points.append(point);source_weights[tuple(round(c,5) for c in point)]={body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[v.index].groups if g.weight>0}
  bm.free()
 # Bare-forearm replacements already have a continuous wrist. Adding a solid
 # cylinder there makes a second oversized "mitten" over the real palm.
 points=list({tuple(round(c,5) for c in p):p for p in points}.values())
 if len(points)<8:
  records.append({'side':side,'added':False,'reason':'No open original cuff near wrist; retain the existing continuous anatomical forearm'});continue
 center=sum(points,Vector())/len(points);x=world_dir.cross(Vector((0,0,1)))
 if x.length<.01:x=world_dir.cross(Vector((0,1,0)))
 x.normalize();y=world_dir.cross(x).normalized();points.sort(key=lambda p:math.atan2((p-center).dot(y),(p-center).dot(x)))
 inner_center=wrist+world_dir*.018;verts=[tuple(p) for p in points]
 for p in points:
  radial=p-center-world_dir*(p-center).dot(world_dir)
  if radial.length<1e-6:radial=x.copy()
  verts.append(tuple(inner_center+radial.normalized()*.025))
 count=len(points);faces=[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
 mesh=bpy.data.meshes.new(side+'ActualCuffToWristBridge');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(side+'AnatomicalWristTransition',mesh);bpy.context.scene.collection.objects.link(o)
 sample=next((o for o in bpy.context.scene.objects if o.name.startswith(side+'AuthoredAnatomicalHand')),None)
 mat=sample.data.materials[0] if sample and sample.data.materials else bpy.data.materials.new('Authored wrist skin')
 if not mat.use_nodes:mat.diffuse_color=(.45,.3,.2,1)
 o.data.materials.append(mat)
 groups={}
 for i,point in enumerate(points):
  weights=source_weights.get(tuple(round(c,5) for c in point)) or {side+'ForeArm':1}
  for name,weight in weights.items():
   if name not in groups:groups[name]=o.vertex_groups.new(name=name)
   groups[name].add([i],weight,'REPLACE')
 if side+'Hand' not in groups:groups[side+'Hand']=o.vertex_groups.new(name=side+'Hand')
 groups[side+'Hand'].add(list(range(count,count*2)),1,'REPLACE')
 m=o.modifiers.new('Actual wrist skin','ARMATURE');m.object=rig;matrix=o.matrix_world.copy();o.parent=rig;o.matrix_world=matrix
 for f in o.data.polygons:f.use_smooth=True
 records.append({'side':side,'added':True,'center':list(center),'innerCenter':list(inner_center),'innerRadius':.025,'actualBoundarySamples':len(points),'boundBones':[side+'ForeArm',side+'Hand']})
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_yup=True)
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-wrist-transition-v1';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n')
a.output.with_suffix('.wrist-seal.json').write_text(json.dumps({'status':'UNREVIEWED anatomy seam closure; actual grip/scene evidence required','source':str(source),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'wrists':records},indent=2)+'\n')
