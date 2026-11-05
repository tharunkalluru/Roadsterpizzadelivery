"""Remove small disconnected raw-body remnants from a NEW candidate only.
Does not touch authored head, hands, clothing props or scene objects. Review all
views after cleanup; counts alone never approve appearance.
"""
import argparse,sys,json,hashlib
from pathlib import Path
import bpy,bmesh
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--max-vertices',type=int,default=300);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if a.output.exists() or a.output.with_suffix('.blend').exists():raise RuntimeError('Fresh immutable candidate required')
records=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH' or 'review-mesh' not in o.name:continue
 bm=bmesh.new();bm.from_mesh(o.data);unseen=set(bm.verts);components=[]
 while unseen:
  seed=unseen.pop();stack=[seed];component=[seed]
  while stack:
   v=stack.pop()
   for e in v.link_edges:
    w=e.other_vert(v)
    if w in unseen:unseen.remove(w);stack.append(w);component.append(w)
  components.append(component)
 if not components or max(map(len,components))<3000:raise RuntimeError('Ambiguous fragmented primary body; manual review required')
 removed=[v for c in components if len(c)<=a.max_vertices for v in c]
 records.append({'mesh':o.name,'components':sorted(map(len,components),reverse=True),'removedVertices':len(removed),'threshold':a.max_vertices})
 if removed:bmesh.ops.delete(bm,geom=removed,context='VERTS')
 bm.to_mesh(o.data);bm.free();o.data.update()
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True)
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-fragment-cleanup-v1';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n')
a.output.with_suffix('.fragment-cleanup.json').write_text(json.dumps({'status':'UNREVIEWED source remnant removal; visually compare all views','source':str(source),'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'bodies':records},indent=2)+'\n');print(records)
