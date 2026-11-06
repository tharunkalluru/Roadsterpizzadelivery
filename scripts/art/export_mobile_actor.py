"""Package a new unapproved self-contained actor with native JPEG89 textures.
Retains source mesh, rig and clips. Requires a fresh exact visual verdict.
"""
import argparse,sys,json,hashlib,struct,runpy
from pathlib import Path
import bpy
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--max-bytes',type=int,default=2800000);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if a.output.exists():raise RuntimeError('New output required; previous reviewed bytes are immutable')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');source_action=rig.animation_data.action;source_pose={b.name:b.matrix_basis.copy() for b in rig.pose.bones};source_mutes=[t.mute for t in rig.animation_data.nla_tracks];rig.animation_data.action=None
for t in rig.animation_data.nla_tracks:t.mute=True
for b in rig.pose.bones:b.location=(0,0,0);b.rotation_euler=(0,0,0);b.scale=(1,1,1)
bpy.context.view_layer.update();reductions=[]
for o in bpy.context.scene.objects:
 if o.type!='MESH':continue
 target=15000 if o.name=='AuthoredDetailedHead' else 20000 if 'review-mesh' in o.name else None
 if not target:continue
 triangles=sum(len(f.vertices)-2 for f in o.data.polygons)
 if triangles<=target:continue
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 m=o.modifiers.new('Explicit mobile geometry budget','DECIMATE');m.ratio=target/triangles;bpy.ops.object.modifier_apply(modifier=m.name)
 reductions.append({'mesh':o.name,'before':triangles,'target':target,'after':sum(len(f.vertices)-2 for f in o.data.polygons)})
for b in rig.pose.bones:b.matrix_basis=source_pose[b.name]
for t,mute in zip(rig.animation_data.nla_tracks,source_mutes):t.mute=mute
rig.animation_data.action=source_action;bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=89,export_image_quality=89,export_unused_images=False)
source_contract=json.loads(source.with_suffix('.rig.json').read_text())
helper=runpy.run_path(str(Path(__file__).with_name('rig_character.py')),run_name='rig_helper')
helper['restrict_handoff_channels'](a.output,source_contract['pose'].get('upperBodyNodes',[]),source_contract['pose'].get('clipName','TakePizza'))
raw=a.output.read_bytes();size=struct.unpack_from('<I',raw,12)[0];data=json.loads(raw[20:20+size])
if any(r.get('uri') and not r['uri'].startswith('data:') for r in [*data.get('buffers',[]),*data.get('images',[])]):raise RuntimeError('Actor must remain self-contained')
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-mobile-jpeg89-v1';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n')
report={'status':'UNAPPROVED exact mobile export; compare views and actual handoff before registry','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'maxBytes':a.max_bytes,'withinBudget':len(raw)<=a.max_bytes,'jpegQuality':89,'geometryReductions':reductions,'imageFormats':[i.get('mimeType') for i in data.get('images',[])]}
a.output.with_suffix('.mobile-export.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
if len(raw)>a.max_bytes:raise RuntimeError('Draft exceeds per-actor publication budget; do not register')
