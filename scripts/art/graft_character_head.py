"""Blender: attach a detailed real 3D head to a new clothed/rigged candidate.

Never mutates either input. This keeps the actual head mesh/UVs, cuts the old
body at its collar, binds the replacement to the authored Head bone, and exports
new fingerprintable art. Seam, anatomy, likeness and deformation remain review
requirements. It does not substitute an image plane for a head.

Blender --background body.blend --python scripts/art/graft_character_head.py --
 --head /absolute/head.glb --output /absolute/new-actor.glb
 [--head-height .37] [--neck-z 1.49] [--body-cut-z 1.54]
 [--head-up-axis y] [--head-yaw -1.57079632679] [--head-triangles 40000]
"""
import argparse
import hashlib
import json
import math
import runpy
import sys
from pathlib import Path
import bmesh
import bpy
from mathutils import Matrix,Vector

parser=argparse.ArgumentParser()
parser.add_argument('--head',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
parser.add_argument('--head-height',type=float,default=.37)
parser.add_argument('--neck-z',type=float,default=1.49)
parser.add_argument('--body-cut-z',type=float,default=1.54)
parser.add_argument('--head-up-axis',choices=['y','z'],default='y')
parser.add_argument('--head-yaw',type=float,default=-math.pi/2)
parser.add_argument('--head-triangles',type=int,default=40000)
parser.add_argument('--neck-base-fraction',type=float,default=0,help='Explicit anatomical neck height as fraction of full source hair/head bounds; default0 preserves previous stump-only guides')
parser.add_argument('--hair-tail-extend',type=float,default=0,help='Explicit extra hair length below the anatomical neck; keeps face/head scale unchanged')
parser.add_argument('--preserve-collar',action='store_true',help='Retain actual outer raised collar wings below7cm above the central head cut; inspect all neck views')
parser.add_argument('--clear-front-neck',action='store_true',help='Explicit per-actor cleanup of old jaw protrusion while preserving the high shirt collar')
parser.add_argument('--front-neck-trim-z',type=float,default=1.49)
parser.add_argument('--front-neck-trim-x',type=float,default=.105)
parser.add_argument('--front-neck-trim-y',type=float,default=-.035)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
original=Path(bpy.data.filepath)
contract_path=original.with_suffix('.rig.json')
if not args.head.exists() or not contract_path.exists():raise RuntimeError('Existing head mesh and body rig contract are required.')
outputs=[args.output,args.output.with_suffix('.blend'),args.output.with_suffix('.rig.json'),args.output.with_suffix('.production.json'),args.output.with_suffix('.graft-script.py')]
if any(path.exists() for path in outputs):raise RuntimeError('Use new output paths; an existing candidate cannot be overwritten.')
contract=json.loads(contract_path.read_text())
rig=next(obj for obj in bpy.context.scene.objects if obj.type=='ARMATURE')
body=max((obj for obj in bpy.context.scene.objects if obj.type=='MESH' and any(mod.type=='ARMATURE' for mod in obj.modifiers)),key=lambda obj:len(obj.data.vertices))
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
bpy.context.view_layer.update()
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(args.head.resolve()))
imported=[obj for obj in bpy.context.scene.objects if obj not in before]
meshes=[obj for obj in imported if obj.type=='MESH']
if not meshes:raise RuntimeError('Head has no real mesh.')
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:obj.select_set(True)
bpy.context.view_layer.objects.active=meshes[0]
if len(meshes)>1:bpy.ops.object.join()
head=bpy.context.object
points=[head.matrix_world@vertex.co for vertex in head.data.vertices]
head.parent=None;head.matrix_world=Matrix.Identity(4)
rotation=Matrix.Rotation(args.head_yaw,4,'Z')@(Matrix.Rotation(-math.pi/2,4,'X') if args.head_up_axis=='y' else Matrix.Identity(4))
points=[rotation@point for point in points]
lo=Vector(tuple(min(point[i] for point in points) for i in range(3)))
hi=Vector(tuple(max(point[i] for point in points) for i in range(3)))
if hi.z-lo.z<1e-6:raise RuntimeError('Head has no upright volume.')
scale=args.head_height/(hi.z-lo.z)
neck_base=lo.z+(hi.z-lo.z)*args.neck_base_fraction
base=[point for point in points if abs(point.z-neck_base)<(hi.z-lo.z)*.04 and abs(point.x-(lo.x+hi.x)/2)<(hi.x-lo.x)*.08] if args.neck_base_fraction else [point for point in points if point.z<lo.z+(hi.z-lo.z)*.08]
if not base:raise RuntimeError('An anatomical neck stump is required.')
center=sum(base,Vector())/len(base)
for vertex,point in zip(head.data.vertices,points):
 z=(point.z-neck_base)*scale+args.neck_z
 if args.hair_tail_extend and point.z<neck_base and abs((point.x-center.x)*scale)>.055:z-=args.hair_tail_extend*min(1,(neck_base-point.z)/max(.001,neck_base-lo.z))
 vertex.co=Vector(((point.x-center.x)*scale,(point.y-center.y)*scale,z))
head.name='AuthoredDetailedHead'
# glTF splits vertices at UV seams. Weld geometric duplicates while preserving
# per-face UV loops BEFORE smoothing/decimation: treating every UV island as a
# disconnected shell can flip its normals and create false black "pits".
weld=bmesh.new();weld.from_mesh(head.data)
bmesh.ops.remove_doubles(weld,verts=list(weld.verts),dist=.000001)
bmesh.ops.recalc_face_normals(weld,faces=list(weld.faces))
weld.to_mesh(head.data);weld.free();head.data.update()
source_triangles=sum(len(poly.vertices)-2 for poly in head.data.polygons)
if source_triangles>args.head_triangles:
    modifier=head.modifiers.new('Reviewed head topology budget','DECIMATE');modifier.ratio=args.head_triangles/source_triangles
    bpy.ops.object.modifier_apply(modifier=modifier.name)
for polygon in head.data.polygons:polygon.use_smooth=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
for obj in imported:
    if obj!=head and obj.name in bpy.data.objects:bpy.data.objects.remove(obj,do_unlink=True)
mesh=bmesh.new();mesh.from_mesh(body.data)
bmesh.ops.bisect_plane(mesh,geom=list(mesh.verts)+list(mesh.edges)+list(mesh.faces),dist=.0001,plane_co=(0,0,args.body_cut_z+(.07 if args.preserve_collar else 0)),plane_no=(0,0,1),clear_outer=True,clear_inner=False)
if args.preserve_collar:
 old_neck=[f for f in mesh.faces if f.calc_center_median().z>args.body_cut_z and abs(f.calc_center_median().x)<.095]
 bmesh.ops.delete(mesh,geom=old_neck,context='FACES')
trimmed_faces=0
if args.clear_front_neck:
    selected=[face for face in mesh.faces if face.calc_center_median().z>args.front_neck_trim_z and abs(face.calc_center_median().x)<args.front_neck_trim_x and face.calc_center_median().y<args.front_neck_trim_y]
    trimmed_faces=len(selected);bmesh.ops.delete(mesh,geom=selected,context='FACES')
mesh.to_mesh(body.data);mesh.free();body.data.update()
bpy.context.view_layer.update()
bpy.context.view_layer.update();matrix=head.matrix_world.copy()
head.parent=rig;head.parent_type='BONE';head.parent_bone='Head';bpy.context.view_layer.update()
head.matrix_world=matrix;bpy.context.view_layer.update()
parent_error=max(abs(head.matrix_world[i][j]-matrix[i][j]) for i in range(4) for j in range(4))
if parent_error>1e-5:raise RuntimeError('Head parenting changed the authored world transform')
args.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False)
helper=runpy.run_path(str(Path(__file__).with_name('rig_character.py')),run_name='rig_helper')
helper['restrict_handoff_channels'](args.output,contract['pose'].get('upperBodyNodes',[]))
args.output.with_suffix('.rig.json').write_text(json.dumps(contract,separators=(',',':')))
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
args.output.with_suffix('.graft-script.py').write_bytes(Path(__file__).read_bytes())
args.output.with_suffix('.production.json').write_text(json.dumps({'bodyBlend':str(original),'bodyBlendSha256':sha(original),'headSource':str(args.head),'headSourceSha256':sha(args.head),'headHeight':args.head_height,'neckZ':args.neck_z,'bodyCutZ':args.body_cut_z,'sourceHeadTriangles':source_triangles,'headTriangleBudget':args.head_triangles,'headUpAxis':args.head_up_axis,'headYaw':args.head_yaw,'blender':bpy.app.version_string,'frontNeckCleanup':{'enabled':args.clear_front_neck,'zMin':args.front_neck_trim_z,'xHalf':args.front_neck_trim_x,'yMax':args.front_neck_trim_y,'removedFaces':trimmed_faces},'parentWorldMatrixError':parent_error,'producerSha256':sha(Path(__file__)),'outputGlbSha256':sha(args.output),'producerArguments':sys.argv[sys.argv.index('--')+1:],'status':'UNREVIEWED new composite. Neck seam, face, costume, deformations, 5angles and real in-game handoff must pass independently.'},indent=2))
print('NEW_COMPOSITE_CANDIDATE '+str(args.output))
