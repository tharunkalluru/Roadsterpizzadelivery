"""New seated candidates only. Correct source cloth weights, remove residual
forearm strips, and author a continuous long-hair layer for Indu. No approval.
"""
import argparse,sys,json,math,hashlib
from pathlib import Path
from array import array
import bpy,bmesh
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--role',choices=['raja','indu'],required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--existing-longhair-head',action='store_true');p.add_argument('--round-neck-height',type=float);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if any(x.exists() for x in [a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json')]):raise RuntimeError('New immutable output required')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
for bone in rig.pose.bones:bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
bpy.context.view_layer.update();body=next(o for o in bpy.context.scene.objects if o.type=='MESH'and'review-mesh'in o.name);records=[]
if a.round_neck_height is not None:
 if a.role!='indu' or not 1.3<=a.round_neck_height<=1.4:raise RuntimeError('Explicit round-neck cleanup applies only to measured Indu source')
 bm=bmesh.new();bm.from_mesh(body.data);doomed=[v for v in bm.verts if (body.matrix_world@v.co).z>a.round_neck_height];bmesh.ops.delete(bm,geom=doomed,context='VERTS');bm.to_mesh(body.data);bm.free();body.data.update();records.append({'roundNeckHeight':a.round_neck_height,'oldJawRemnantVerticesRemoved':len(doomed),'detailedHeadUnchanged':True})
for side,sign in [('Left',1),('Right',-1)]:
 start=rig.matrix_world@rig.data.bones[side+'ForeArm'].head_local;end=rig.matrix_world@rig.data.bones[side+'Hand'].head_local;axis=end-start;length=axis.length;axis.normalize();bm=bmesh.new();bm.from_mesh(body.data);doomed=[]
 for v in bm.verts:
  point=body.matrix_world@v.co;delta=point-start;t=delta.dot(axis);radial=(delta-axis*t).length
  if point.x*sign>.235 and .005<t<length+.10 and radial<.18:doomed.append(v)
 bmesh.ops.delete(bm,geom=doomed,context='VERTS');bm.to_mesh(body.data);bm.free();body.data.update()
 upper=body.vertex_groups[side+'Arm'];start=rig.matrix_world@rig.data.bones[side+'Arm'].head_local;end=rig.matrix_world@rig.data.bones[side+'ForeArm'].head_local;axis=end-start;length=axis.length;axis.normalize();changed=[]
 for v in body.data.vertices:
  point=body.matrix_world@v.co;delta=point-start;t=delta.dot(axis);radial=(delta-axis*t).length
  if point.x*sign>.22 and -.025<t<length+.035 and radial<.13:changed.append(v.index)
 for g in body.vertex_groups:
  if changed:g.remove(changed)
 if changed:upper.add(changed,1,'REPLACE')
 records.append({'side':side,'residualForearmVerticesRemoved':len(doomed),'originalSleeveVerticesRebound':len(changed),'noCylinderSleeve':True})
if a.role=='raja':
 head=next(o for o in bpy.context.scene.objects if o.name=='AuthoredDetailedHead');image=next(n.image for m in head.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE'and n.image);width,height=image.size;pixels=array('f',[0])*(width*height*4);image.pixels.foreach_get(pixels);uv=head.data.uv_layers.active.data;samples=[]
 for f in head.data.polygons:
  point=head.matrix_world@f.center
  if not(1.60<point.z<1.72 and .025<abs(point.x)<.09 and point.y<-.03):continue
  for i in f.loop_indices:
   u,v=uv[i].uv;x=max(0,min(width-1,int(u*width)));y=max(0,min(height-1,int(v*height)));c=pixels[(y*width+x)*4:(y*width+x)*4+3]
   if c[0]>.25 and c[0]>c[1]*1.12:samples.append(c)
 if len(samples)<8:raise RuntimeError('No measured head skin samples for the real neck transition')
 import statistics
 color=[statistics.median(c[i]for c in samples)for i in range(3)];mat=bpy.data.materials.new('Raja actual cheek-sampled lower neck');mat.use_nodes=True;linear=lambda v:v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*[linear(v)for v in color],1);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.7;head.data.materials.append(mat);changed=0
 for f in head.data.polygons:
  point=head.matrix_world@f.center
  if point.z<1.527 and abs(point.x)<.095 and point.y<.055:f.material_index=len(head.data.materials)-1;changed+=1
 records.append({'neckTextureArtifactFaces':changed,'skinSource':'measured actual head cheek UVs','medianSrgb':color,'hairFaceUnchanged':True})
if a.role=='indu':
 white=bpy.data.materials.new('Indu white dupatta underlayer');white.use_nodes=True;white.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.82,.81,.78,1);white.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.92
 image=next(n.image for m in body.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE'and n.image);width,height=image.size;pixels=array('f',[0])*(width*height*4);image.pixels.foreach_get(pixels);uv=body.data.uv_layers.active.data;body.data.materials.append(white);painted=0
 for f in body.data.polygons:
  c=body.matrix_world@f.center
  if c.z<.94 or abs(c.x)>.25 or not(c.y>.025 or abs(c.x)>.12 and c.z>1.05):continue
  colors=[]
  for i in f.loop_indices:
   u,v=uv[i].uv;x=max(0,min(width-1,int(u*width)));y=max(0,min(height-1,int(v*height)));colors.append(pixels[(y*width+x)*4:(y*width+x)*4+3])
  color=[sum(p[k]for p in colors)/len(colors)for k in range(3)];luma=.2126*color[0]+.7152*color[1]+.0722*color[2]
  if luma<.34 and color[0]/max(.001,color[1])<1.6:f.material_index=len(body.data.materials)-1;painted+=1
 if not a.existing_longhair_head:
  hairmat=bpy.data.materials.new('Indu authored continuous long dark hair');hairmat.use_nodes=True;bs=hairmat.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.027,.019,.014,1);bs.inputs['Roughness'].default_value=.55
  verts=[];faces=[];weights=[]
  for strand in range(29):
   x0=(strand-14)/14*.122
   for k in range(13):
    t=k/12;x=x0*(1+.47*t)+.005*math.sin(t*9+strand*.7);y=.135+.065*t+.014*math.sin(t*math.pi);z=1.44-.46*t+.012*math.sin(strand*.8)*t;radius=.0095*(1-.65*t)+.002*math.sin(t*math.pi)
    for j in range(7):
     angle=j/7*math.tau;verts.append((x+math.cos(angle)*radius,y+math.sin(angle)*radius,z));head=max(.1,1-t*.9);weights.append({'Head':head,'Neck':(1-head)*.25,'Chest':(1-head)*.75})
   base=strand*13*7
   for k in range(12):
    for j in range(7):faces.append((base+k*7+j,base+k*7+(j+1)%7,base+(k+1)*7+(j+1)%7,base+(k+1)*7+j))
  mesh=bpy.data.meshes.new('InduContinuousLongHair');mesh.from_pydata(verts,[],faces);mesh.update();hair=bpy.data.objects.new('InduContinuousLongHair',mesh);bpy.context.scene.collection.objects.link(hair);hair.data.materials.append(hairmat)
  for f in hair.data.polygons:f.use_smooth=True
  for n in ['Head','Neck','Chest']:
   g=hair.vertex_groups.new(name=n)
   for i,w in enumerate(weights):g.add([i],w[n],'REPLACE')
  m=hair.modifiers.new('Continuous actual hair skin','ARMATURE');m.object=rig;hair.parent=rig
  records.append({'oldHairUvFacesReplacedWithClothing':painted,'hair':'29 connected native strands, Head→Neck→Chest gradient, not a second head','triangles':len(faces)*2})
 else:records.append({'oldHairUnderlayerFaces':painted,'hair':'single supplied coherent long-hair head retained; no duplicate procedural hair added'})
a.output.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()));bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True)
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-seated-cloth-refinement-v1';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n');a.output.with_suffix('.costume-refinement.json').write_text(json.dumps({'status':'UNAPPROVED candidate; independent actual scene/film review required','role':a.role,'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'changes':records,'producerSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},indent=2)+'\n');a.output.with_suffix('.costume-script.py').write_text(Path(__file__).read_text())
