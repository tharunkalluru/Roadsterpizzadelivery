"""New candidate only: close driving sleeves or bind actual long hair to Head.
No source mutation, opacity mask, flat portrait or appearance approval.
"""
import argparse,sys,json,hashlib,math
from pathlib import Path
import bpy,bmesh
from array import array
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--role',choices=['raja','indu'],required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if any(f.exists() for f in [a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json')]):raise RuntimeError('Immutable new output only')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
for b in rig.pose.bones:b.location=(0,0,0);b.rotation_euler=(0,0,0);b.scale=(1,1,1)
bpy.context.view_layer.update();body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'review-mesh' in o.name);records=[]
def bind(obj,weights):
 for g in list(obj.vertex_groups):obj.vertex_groups.remove(g)
 for name,w in weights.items():g=obj.vertex_groups.new(name=name);g.add(list(range(len(obj.data.vertices))),w,'REPLACE')
 for m in list(obj.modifiers):obj.modifiers.remove(m)
 m=obj.modifiers.new('Bound authored costume','ARMATURE');m.object=rig;matrix=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=matrix
skin=next((o.data.materials[0] for o in bpy.context.scene.objects if o.name.startswith('LeftAuthoredAnatomicalHand') and o.data.materials),None)
if a.role=='raja':
 cloth=bpy.data.materials.new('Raja authored short sleeve khaki');cloth.use_nodes=True;cloth.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.43,.34,.23,1);cloth.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9
 for side,sign in [('Left',1),('Right',-1)]:
  group=body.vertex_groups.get(side+'Arm');bm=bmesh.new();bm.from_mesh(body.data);deform=bm.verts.layers.deform.verify();doomed=[]
  for v in bm.verts:
   w=body.matrix_world@v.co
   if w.x*sign>.225 and w.z>1.03 and v[deform].get(group.index,0)>.12:doomed.append(v)
  bmesh.ops.delete(bm,geom=doomed,context='VERTS');bm.to_mesh(body.data);bm.free()
  start=rig.matrix_world@rig.data.bones[side+'Arm'].head_local;end=rig.matrix_world@rig.data.bones[side+'ForeArm'].head_local;axis=(end-start).normalized();start-=axis*.035;end+=axis*.025;right=axis.cross(Vector((0,1,0))).normalized();up=axis.cross(right).normalized();verts=[];faces=[]
  for k in range(7):
   t=k/6;center=start.lerp(end,t);radius=.103*(1-t)+.067*t
   for j in range(20):
    angle=j/20*math.tau;r=radius+.0025*math.sin(angle*3+k*.7);verts.append(center+right*math.cos(angle)*r+up*math.sin(angle)*r)
  for k in range(6):
   for j in range(20):faces.append((k*20+j,k*20+(j+1)%20,(k+1)*20+(j+1)%20,(k+1)*20+j))
  mesh=bpy.data.meshes.new(side+'ClosedSleeve');mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(side+'AuthoredClosedKhakiSleeve',mesh);bpy.context.scene.collection.objects.link(obj);obj.data.materials.append(cloth)
  for face in obj.data.polygons:face.use_smooth=True
  bind(obj,{side+'Arm':1});solid=obj.modifiers.new('Actual cuff thickness','SOLIDIFY');solid.thickness=.004;records.append({'sleeve':side,'removedSourceVertices':len(doomed),'cuffRadius':.067})
else:
 image=next(n.image for material in body.data.materials if material and material.use_nodes for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image);width,height=image.size;pixels=array('f',[0.0])*(width*height*4);image.pixels.foreach_get(pixels);uv=body.data.uv_layers.active.data;hair_faces=[]
 for f in body.data.polygons:
  point=body.matrix_world@f.center
  if point.z<.94 or abs(point.x)>.25:continue
  colors=[]
  for i in f.loop_indices:
   u,v=uv[i].uv;x=max(0,min(width-1,int(u*width)));y=max(0,min(height-1,int(v*height)));colors.append(pixels[(y*width+x)*4:(y*width+x)*4+3])
  c=[sum(x[i] for x in colors)/len(colors) for i in range(3)];luma=.2126*c[0]+.7152*c[1]+.0722*c[2]
  if luma<.17 and c[0]/max(.001,c[1])<1.5 and (point.y>.015 or abs(point.x)>.11 and point.z>1.05):hair_faces.append(f.index)
 if len(hair_faces)<20:raise RuntimeError('Cannot identify actual UV-textured long hair safely')
 hair=body.copy();hair.data=body.data.copy();hair.name='InduActualLongHairHeadBound';bpy.context.scene.collection.objects.link(hair);bm=bmesh.new();bm.from_mesh(hair.data);bm.faces.ensure_lookup_table();keep=set(hair_faces);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in keep],context='FACES');bm.to_mesh(hair.data);bm.free()
 for v in hair.data.vertices:v.co+=v.normal*.001
 bind(hair,{'Head':1})
 white=bpy.data.materials.new('Indu original hair underlayer white dupatta');white.use_nodes=True;white.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.82,.81,.78,1);white.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;body.data.materials.append(white)
 for i in hair_faces:body.data.polygons[i].material_index=len(body.data.materials)-1
 records.append({'actualTexturedHairFacesMoved':len(hair_faces),'sourceUnderlayer':'white dupatta surface retained; no torso holes','binding':'actual Head bone'})
# A small real skinned neck joins the head/collar through head turns.
z=1.48 if a.role=='raja' else 1.335
bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=.062,radius2=.052,depth=.125,location=(0,0,z));neck=bpy.context.object;neck.name='AuthoredSeatedNeckTransition'
if skin:neck.data.materials.append(skin)
for f in neck.data.polygons:f.use_smooth=True
bind(neck,{'Neck':.65,'Head':.35})
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True)
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-costume-repair-v1';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n');a.output.with_suffix('.costume-repair.json').write_text(json.dumps({'status':'UNAPPROVED geometry repair; independent source and actual scene review required','role':a.role,'source':str(source),'changes':records,'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest()},indent=2)+'\n')
