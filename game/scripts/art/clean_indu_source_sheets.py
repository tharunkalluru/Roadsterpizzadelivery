"""Remove the two measured, disconnected background slabs from Indu v31.

This is a scoped source repair. It refuses ambiguous anatomy and keeps the
complete foot-connected body. Always emits a new unapproved candidate.
"""
import argparse, sys, json, hashlib
from pathlib import Path
import bpy, bmesh
p=argparse.ArgumentParser();p.add_argument('--output',required=True,type=Path)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if any(x.exists() for x in [a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json')]):raise RuntimeError('New immutable output required')
body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and 'review-mesh' in o.name)
bm=bmesh.new();bm.from_mesh(body.data);unseen=set(bm.verts);parts=[]
while unseen:
 seed=unseen.pop();todo=[seed];part=[seed]
 while todo:
  v=todo.pop()
  for edge in v.link_edges:
   other=edge.other_vert(v)
   if other in unseen:unseen.remove(other);todo.append(other);part.append(other)
 parts.append(part)
parts.sort(key=len,reverse=True)
if len(parts)!=3 or len(parts[0])<15000:raise RuntimeError('Not the independently diagnosed three-component source')
records=[]
for index,part in enumerate(parts):
 points=[body.matrix_world@v.co for v in part];lo=[min(v[i] for v in points)for i in range(3)];hi=[max(v[i] for v in points)for i in range(3)]
 if index==0:
  if lo[2]>.02 or hi[2]<1.6:raise RuntimeError('Complete foot-connected main body missing')
 elif not(3000<len(part)<7000 and .35<lo[2]<.5 and 1.5<hi[2]<1.7 and hi[0]-lo[0]>.45):raise RuntimeError('Detached component is not the measured source background slab')
 records.append({'vertices':len(part),'min':lo,'max':hi,'removed':index!=0})
bmesh.ops.delete(bm,geom=[v for part in parts[1:] for v in part],context='VERTS');bm.to_mesh(body.data);bm.free();body.data.update()
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True)
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-measured-background-cleanup';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n')
a.output.with_suffix('.source-cleanup.json').write_text(json.dumps({'status':'UNAPPROVED source repair; five-view and scene review still required','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'components':records,'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest()},indent=2)+'\n')
