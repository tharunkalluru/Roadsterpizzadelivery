"""Bounded native repairs on NEW Devara candidates; inputs are immutable.

Blender 4.5, fixed authored Idle only. Repairs actual neckline/cuff surfaces,
adds a small closed anatomical neck continuation under the detailed head and
smooths only the localized wrist transition in the already authored grip.
No template poses, skin weights, joints, finger tips or lower cloth are changed.
Every output still requires independent clay/authored/runtime visual review.
"""
import argparse,hashlib,json,math,struct,sys
from pathlib import Path
import bmesh,bpy
from mathutils import Matrix,Vector

p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);src=Path(bpy.data.filepath)
outputs=[a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json'),a.output.with_suffix('.production.json'),a.output.with_suffix('.repair-script.py')]
if any(x.exists() for x in outputs):raise RuntimeError('Use NEW output paths; existing candidates/evidence must remain unchanged.')
sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
scene=bpy.context.scene;rig=next(o for o in scene.objects if o.type=='ARMATURE')
rig.animation_data_create()
for t in rig.animation_data.nla_tracks:t.mute=True
rig.animation_data.action=bpy.data.actions['Idle']
if hasattr(rig.animation_data.action,'slots') and rig.animation_data.action.slots:rig.animation_data.action_slot=rig.animation_data.action.slots[0]
scene.frame_set(12);bpy.context.view_layer.update()
pose_before={b.name:list(v for row in b.matrix for v in row) for b in rig.pose.bones}
body=max((o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)),key=lambda o:len(o.data.vertices))
body_before=[v.co.copy() for v in body.data.vertices]
weights_before=[[(g.group,g.weight) for g in v.groups] for v in body.data.vertices]

def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;pr=m.node_tree.nodes.get('Principled BSDF');pr.inputs['Base Color'].default_value=(*color,1);pr.inputs['Roughness'].default_value=.85;return m
skin_colors=[tuple(bpy.data.materials[s+' authored warm skin'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value[:3]) for s in ['Left','Right']]
skin=material('Bounded neck and leg skin continuity',tuple(sum(x[i] for x in skin_colors)/2 for i in range(3)))
cloth=material('Bounded dark shirt inner hem',(.018,.017,.016))
body.data.materials.append(cloth);cloth_index=len(body.data.materials)-1
body.data.materials.append(skin);skin_index=len(body.data.materials)-1
bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table()
boundary=set(e for e in bm.edges if e.is_boundary);components=[]
while boundary:
 es={boundary.pop()};todo=list(es)
 while todo:
  e=todo.pop()
  for v in e.verts:
   for n in v.link_edges:
    if n in boundary:boundary.remove(n);es.add(n);todo.append(n)
 components.append(es)
report=[]
for es in components:
 vs={v for e in es for v in e.verts};lo=[min(v.co[i] for v in vs) for i in range(3)];hi=[max(v.co[i] for v in vs) for i in range(3)]
 neck=lo[2]>1.48;side='Left' if lo[0]>.20 else 'Right' if hi[0]<-.20 else None
 cuff=side is not None and lo[2]>1.10 and hi[2]<1.26
 if not(neck or cuff):continue
 if neck and len(vs)<80:
  fill=bmesh.ops.holes_fill(bm,edges=list(es),sides=0)
  for f in fill.get('faces',[]):f.material_index=cloth_index;f.smooth=True
  report.append({'region':'small neckline tear','vertices':len(vs),'facesAdded':len(fill.get('faces',[]))});continue
 # Follow actual cyclic boundary, then smooth the edge without changing bones.
 first=next(iter(vs));ordered=[first];last=None;current=first
 while True:
  choices=[e.other_vert(current) for e in current.link_edges if e in es and e.other_vert(current)!=last]
  if not choices:raise RuntimeError('Boundary is not a simple loop')
  nxt=choices[0]
  if nxt==first:break
  if nxt in ordered:raise RuntimeError('Boundary crossing')
  ordered.append(nxt);last,current=current,nxt
 if len(ordered)!=len(vs):raise RuntimeError('Boundary loop incomplete')
 old={v:v.co.copy() for v in vs}
 for _ in range(8):
  co=[v.co.copy() for v in ordered]
  for i,v in enumerate(ordered):v.co=co[i].lerp((co[i-1]+co[(i+1)%len(co)])/2,.48)
 if cuff:
  bone=rig.data.bones[side+'ForeArm'];origin=bone.head_local;axis=(bone.tail_local-origin).normalized()
  for v in ordered:
   d=v.co-origin;rad=d-axis*d.dot(axis)
   v.co=origin+axis*.014+rad.normalized()*max(.045,min(.054,rad.length))
 # Carry the neighboring cloth into the clean boundary, smoothly bounded.
 displacement={v:v.co-old[v] for v in vs};front=set(vs);seen=set(vs)
 for depth,factor in [(1,.58),(2,.25),(3,.08)]:
  ring={e.other_vert(v) for v in front for e in v.link_edges}-seen
  for v in ring:
   neighbors=[e.other_vert(v) for e in v.link_edges if e.other_vert(v) in displacement]
   if neighbors:
    d=sum((displacement[n] for n in neighbors),Vector())/len(neighbors)*factor
    v.co+=d;displacement[v]=d
  seen.update(ring);front=ring
 # The explicit annulus closes the ripped seam onto the real neck/arm volume.
 deform=bm.verts.layers.deform.active;uv=bm.loops.layers.uv.active
 new=[]
 for v in ordered:
  if neck:
   theta=math.atan2(v.co.y-.018,v.co.x)
   q=Vector((.067*math.cos(theta),.018+.051*math.sin(theta),1.511+.013*math.sin(theta)))
  else:
   d=v.co-origin;rad=(d-axis*d.dot(axis)).normalized();q=origin+axis*.021+rad*.042
  n=bm.verts.new(q)
  if deform:
   for g,w in v[deform].items():n[deform][g]=w
  new.append(n)
 for i,v in enumerate(ordered):
  f=bm.faces.new((v,ordered[(i+1)%len(ordered)],new[(i+1)%len(new)],new[i]))
  # The open-shirt front is actual exposed neck, not a dark choker. Retain
  # cloth on the side/back collar and skin on the front-facing continuation.
  f.material_index=skin_index if neck and f.calc_center_median().y<.016 else cloth_index;f.smooth=True
  if uv:
   for l in f.loops:l[uv].uv=(.5,.5)
 report.append({'region':'main neckline' if neck else side+' sleeve rim','vertices':len(vs),'newAnnulusVertices':len(new),'neighborVerticesMoved':len(seen)-len(vs),'maximumBoundaryShiftMeters':max((v.co-old[v]).length for v in vs)})
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free();body.data.update()
# Preserve source topology/UV on legs; change only visibly misprojected dark
# patches below the cloth to an explicit skin material on actual lower-leg faces.
leg_faces=[]
for f in body.data.polygons:
 center=f.center
 if center.z<.52 and abs(center.x)>.065:
  f.material_index=skin_index;leg_faces.append(f.index)
# A real closed neck continuation; entirely below jaw/hair and within the
# measured stump. It overlaps the source's closed tapered stump by millimetres.
verts=[];faces=[];rings=[(1.455,.051,.033),(1.475,.060,.043),(1.495,.067,.049),(1.515,.071,.059),(1.535,.072,.065),(1.557,.070,.064)];count=48
for z,rx,ry in rings:
 for i in range(count):
  t=2*math.pi*i/count;verts.append((rx*math.cos(t),.018+ry*math.sin(t),z))
for k in range(len(rings)-1):
 for i in range(count):faces.append((k*count+i,k*count+(i+1)%count,(k+1)*count+(i+1)%count,(k+1)*count+i))
faces.extend([tuple(reversed(range(count))),tuple((len(rings)-1)*count+i for i in range(count))])
mesh=bpy.data.meshes.new('Closed anatomical neck continuation');mesh.from_pydata(verts,[],faces);mesh.materials.append(skin);neck=bpy.data.objects.new('Closed anatomical neck continuation',mesh);scene.collection.objects.link(neck)
for f in mesh.polygons:f.use_smooth=True
world=neck.matrix_world.copy();neck.parent=rig;neck.parent_type='BONE';neck.parent_bone='Neck';bpy.context.view_layer.update();neck.matrix_world=world
# Smooth only a 50mm wrist band in actual posed space. Finger/palm skin and all
# joint/weight data remain exact. Inverse blended skin matrices move rest points
# to the desired posed surface rather than accidentally smoothing another frame.
wrist=[]
for side in ['Left','Right']:
 hand=bpy.data.objects[side+'AuthoredAnatomicalHand'];bone=rig.data.bones[side+'Hand'];origin=rig.matrix_world@bone.head_local
 along=(rig.matrix_world.to_3x3()@(bone.tail_local-bone.head_local)).normalized()
 adj=[set() for v in hand.data.vertices]
 for e in hand.data.edges:
  i,j=e.vertices;adj[i].add(j);adj[j].add(i)
 bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get();ev=hand.evaluated_get(dep);em=ev.to_mesh();posed=[ev.matrix_world@v.co for v in em.vertices];ev.to_mesh_clear()
 mask={v.index:max(0,1-abs(((hand.matrix_world@v.co)-origin).dot(along)+.012)/.028) for v in hand.data.vertices}
 mask={i:w for i,w in mask.items() if w>0}
 wanted=[v.copy() for v in posed]
 for _ in range(5):
  old=[v.copy() for v in wanted]
  for i,w in mask.items():
   if adj[i]:wanted[i]=old[i].lerp(sum((old[n] for n in adj[i]),Vector())/len(adj[i]),.38*w)
 maxd=0
 for i,w in mask.items():
  d=wanted[i]-posed[i]
  if d.length>.003:d*=.003/d.length
  v=hand.data.vertices[i];skin_matrix=Matrix(((0,0,0),(0,0,0),(0,0,0)))
  for g in v.groups:
   name=hand.vertex_groups[g.group].name
   if name in rig.pose.bones:
    m=rig.matrix_world@rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()@rig.matrix_world.inverted()@hand.matrix_world
    skin_matrix+=m.to_3x3()*g.weight
  v.co+=skin_matrix.inverted_safe()@d;maxd=max(maxd,d.length)
 hand.data.update();wrist.append({'side':side,'affectedVertices':len(mask),'posedShiftCapMeters':.003,'maxActualShiftMeters':maxd,'weightsChanged':0,'fingerTipsAndPalmOutsideBandUnchanged':True})
pose_after={b.name:list(v for row in b.matrix for v in row) for b in rig.pose.bones}
if pose_before!=pose_after:raise RuntimeError('Bone matrices changed during local surface repair')
body_preserved_weights=all([(g.group,g.weight) for g in body.data.vertices[i].groups]==w for i,w in enumerate(weights_before))
if not body_preserved_weights:raise RuntimeError('Original body weights changed')
lowshift=max((body.data.vertices[i].co-v).length for i,v in enumerate(body_before) if v.z<.93)
if lowshift>1e-7:raise RuntimeError('Lower cloth geometry moved')
contract=json.loads(src.with_suffix('.rig.json').read_text());contract['id']+='-closed-collar-v1'
a.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend')))
rig.animation_data.action=None
bpy.ops.export_scene.gltf(filepath=str(a.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False)
data=a.output.read_bytes();size=struct.unpack_from('<I',data,12)[0];model=json.loads(data[20:20+size])
names=[x.get('name') for x in model.get('animations',[])]
if names!=['Idle']:raise RuntimeError('Only the exact fixed Idle clip may ship: '+str(names))
a.output.with_suffix('.rig.json').write_text(json.dumps(contract,separators=(',',':')))
a.output.with_suffix('.repair-script.py').write_bytes(Path(__file__).read_bytes())
a.output.with_suffix('.production.json').write_text(json.dumps({'status':'UNREVIEWED bounded actual geometry candidate; no likeness approval','sourceBlend':str(src),'sourceBlendSha256':sha(src),'sourceGlbSha256':sha(src.with_suffix('.glb')),'outputSha256':sha(a.output),'producerSha256':sha(__file__),'exportedClips':names,'boundaries':report,'closedNeck':{'rings':rings,'segments':count,'triangles':sum(len(f)-2 for f in faces),'maxRadiusMeters':.072,'noSourceHeadGeometryChanges':True},'wrists':wrist,'legFacesRecolored':len(leg_faces),'originalBodyWeightsPreserved':body_preserved_weights,'lowerClothMaxShiftMeters':lowshift,'jointMatricesIdentical':pose_before==pose_after,'blender':bpy.app.version_string},indent=2))
print('NEW_BOUNDED_GEOMETRY_CANDIDATE',a.output)
