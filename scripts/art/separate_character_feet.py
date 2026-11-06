"""Separate scanned footwear from a fused garment at its concealed ankle join.

The real source foot/sandal mesh and UVs remain. A small native ankle continues
under the garment instead of stretching a4mm scan edge into a12cm cloth web.
All outputs are NEW unapproved candidates; inspect actual walking views.
"""
import argparse,hashlib,json,runpy,sys
from pathlib import Path
import bmesh,bpy
from mathutils import Matrix,Vector

p=argparse.ArgumentParser();p.add_argument('--contract',required=True,type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--skin-srgb',nargs=3,type=float,required=True);p.add_argument('--ankle-top',type=float,default=.21)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
paths=[a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json'),a.output.with_suffix('.production.json'),a.output.with_suffix('.feet-script.py')]
if any(path.exists() for path in paths):raise RuntimeError('Only new candidate paths are allowed')
if not source.is_file() or not a.contract.is_file():raise RuntimeError('Existing source blend and contract required')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for bone in rig.pose.bones:bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
body=max((o for o in bpy.context.scene.objects if o.type=='MESH' and o.vertex_groups.get('SkirtFrontLeft')),key=lambda o:len(o.data.vertices))
if bpy.data.objects.get('AuthoredSeparateFeet'):raise RuntimeError('Use the original fused garment, not a previously repaired candidate')
indices={side:body.vertex_groups[side+'Foot'].index for side in ['Left','Right']}
def selected(face,deform,index):return sum(v[deform].get(index,0) for v in face.verts)/len(face.verts)>.25
def remove_orphans(mesh):
 loose=[v for v in mesh.verts if not v.link_faces]
 if loose:bmesh.ops.delete(mesh,geom=loose,context='VERTS')
def linear(value):return value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4
skin=bpy.data.materials.new('Authored ankle skin');skin.use_nodes=True
bsdf=skin.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*[linear(v) for v in a.skin_srgb],1);bsdf.inputs['Roughness'].default_value=.68
parts=[];counts={}
for side,index in indices.items():
 foot=body.copy();foot.data=body.data.copy();foot.name=side+'OriginalFootwear';bpy.context.collection.objects.link(foot)
 mesh=bmesh.new();mesh.from_mesh(foot.data);deform=mesh.verts.layers.deform.active
 remove=[face for face in mesh.faces if not selected(face,deform,index)]
 bmesh.ops.delete(mesh,geom=remove,context='FACES');remove_orphans(mesh)
 if len(mesh.faces)<20:raise RuntimeError('The original visible foot volume could not be isolated')
 foot.data.materials.append(skin);skin_index=len(foot.data.materials)-1
 boundary=[edge for edge in mesh.edges if edge.is_boundary and all(v.co.z>.045 for v in edge.verts)]
 if boundary:
  filled=bmesh.ops.holes_fill(mesh,edges=boundary,sides=0)
  for face in filled['faces']:face.material_index=skin_index
 bmesh.ops.recalc_face_normals(mesh,faces=list(mesh.faces));mesh.to_mesh(foot.data);mesh.free();foot.data.update()
 for group in foot.vertex_groups:group.remove(list(range(len(foot.data.vertices))))
 foot.vertex_groups[side+'Foot'].add(list(range(len(foot.data.vertices))),1,'REPLACE')
 counts[side]={'retainedSourceVertices':len(foot.data.vertices),'retainedFootwearTriangles':sum(len(f.vertices)-2 for f in foot.data.polygons),'capBoundaryEdges':len(boundary)};parts.append(foot)
 ankle=rig.matrix_world@rig.data.bones[side+'Foot'].head_local
 bottom=min(.065,ankle.z-.012);top=a.ankle_top
 if not .09<top-bottom<.24:raise RuntimeError('Ankle continuation must remain a modest concealed anatomical segment')
 bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.025,radius2=.031,depth=top-bottom,location=(ankle.x,ankle.y,(top+bottom)/2))
 tube=bpy.context.object;tube.name=side+'AnkleContinuation';bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 tube.data.materials.append(skin);tube.vertex_groups.new(name=side+'Foot').add(list(range(len(tube.data.vertices))),1,'REPLACE');parts.append(tube)
 for face in tube.data.polygons:face.use_smooth=True
mesh=bmesh.new();mesh.from_mesh(body.data);deform=mesh.verts.layers.deform.active
remove=[face for face in mesh.faces if any(selected(face,deform,index) for index in indices.values())]
removed=len(remove);bmesh.ops.delete(mesh,geom=remove,context='FACES');remove_orphans(mesh);mesh.to_mesh(body.data);mesh.free();body.data.update()
bpy.ops.object.select_all(action='DESELECT')
for part in parts:part.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();feet=bpy.context.object;feet.name='AuthoredSeparateFeet'
for face in feet.data.polygons:face.use_smooth=True
a.output.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(a.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False)
contract=json.loads(a.contract.read_text());helper=runpy.run_path(str(Path(__file__).with_name('rig_character.py')),run_name='rig_helper');helper['restrict_handoff_channels'](a.output,contract['pose']['upperBodyNodes'])
a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2));a.output.with_suffix('.feet-script.py').write_bytes(Path(__file__).read_bytes());sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
a.output.with_suffix('.production.json').write_text(json.dumps({'status':'UNREVIEWED actual-footwear separation and native ankle continuation; requires close gait/hem/floor review','sourceBlend':str(source),'sourceBlendSha256':sha(source),'sourceContractSha256':sha(a.contract),'outputGlbSha256':sha(a.output),'producerScriptSha256':sha(Path(__file__)),'sourceFootwear':counts,'removedFusedBodyFaces':removed,'ankleTopZ':a.ankle_top,'ankleSkinSrgb':a.skin_srgb,'limits':'Sandal/foot UVs retained; hidden ankle continuation is authored anatomy, not film-verified clothing or a production approval'},indent=2))
print('NEW_SEPARATE_FOOTWEAR_CANDIDATE '+str(a.output))
