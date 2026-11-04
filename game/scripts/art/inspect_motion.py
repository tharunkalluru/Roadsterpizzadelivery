"""Observe actual deformed geometry in a NEW diagnostic JSON, never approval.

Blender --background candidate.blend --threads 2 --python THIS.py --
 --clip Walk --frames 1,7,13,19,25 --output new-observations.json
No source meshes, clips, images or evidence are overwritten.
"""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy

p=argparse.ArgumentParser();p.add_argument('--clip',default='Walk');p.add_argument('--frames',default='1,7,13,19,25');p.add_argument('--output',required=True,type=Path)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if a.output.exists():raise RuntimeError('Diagnostic output must be new; old evidence is immutable')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for track in rig.animation_data.nla_tracks:track.mute=True
rig.animation_data.action=None
for bone in rig.pose.bones:bone.location=(0,0,0);bone.rotation_euler=(0,0,0);bone.scale=(1,1,1)
bpy.context.view_layer.update()
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
rest={o.name:[o.matrix_world@v.co for v in o.data.vertices] for o in meshes}
regions={};edges={}
for o in meshes:
 groups={g.index:g.name for g in o.vertex_groups}
 regions[o.name]={'LeftFoot':[],'RightFoot':[],'Skirt':[]}
 for v in o.data.vertices:
  for name in ['LeftFoot','RightFoot']:
   if sum(g.weight for g in v.groups if groups.get(g.group)==name)>.75:regions[o.name][name].append(v.index)
  if sum(g.weight for g in v.groups if groups.get(g.group,'').startswith('Skirt'))>.75:regions[o.name]['Skirt'].append(v.index)
 edges[o.name]=[(edge.vertices[0],edge.vertices[1],(rest[o.name][edge.vertices[0]]-rest[o.name][edge.vertices[1]]).length) for edge in o.data.edges]
action=bpy.data.actions.get(a.clip)
if not action:raise RuntimeError('Requested actual authored clip is absent')
rig.animation_data.action=action
if action.slots:rig.animation_data.action_slot=action.slots[0]
frames=[int(f) for f in a.frames.split(',')];observations=[];snapshots={}
for frame in frames:
 bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
 points={o.name:[o.evaluated_get(deps).matrix_world@v.co for v in o.evaluated_get(deps).data.vertices] for o in meshes}
 region_obs={}
 for name in ['LeftFoot','RightFoot','Skirt']:
  selected=[points[o.name][index] for o in meshes for index in regions[o.name][name]]
  if selected:region_obs[name]={'vertexCount':len(selected),'minimumZ':min(p.z for p in selected),'maximumZ':max(p.z for p in selected),'centroid':[sum(p[i] for p in selected)/len(selected) for i in range(3)]}
 worst=[]
 for o in meshes:
  for i,j,length in edges[o.name]:
   if length<.0005:continue
   posed=(points[o.name][i]-points[o.name][j]).length;ratio=posed/length
   if ratio>2:worst.append({'mesh':o.name,'vertices':[i,j],'restMetres':length,'posedMetres':posed,'ratio':ratio})
 worst.sort(key=lambda item:item['ratio'],reverse=True)
 scales={b.name:list(b.matrix.to_scale()) for b in rig.pose.bones if b.name.endswith(('Thigh','Shin'))}
 observations.append({'frame':frame,'regions':region_obs,'edgeStretchAbove2Count':len(worst),'largestEdgeStretches':worst[:12],'actualLegWorldScales':scales})
 if frame in [frames[0],frames[-1]]:snapshots[frame]=points
loop=max(((p-q).length for name in snapshots[frames[0]] for p,q in zip(snapshots[frames[0]][name],snapshots[frames[-1]][name])),default=0)
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
result={'status':'OBSERVATIONS ONLY; actual multi-angle animation, floor/cloth/hand contacts and in-game review are still required','sourceBlend':str(source),'sourceBlendSha256':sha(source),'sourceGlbSha256':sha(source.with_suffix('.glb')) if source.with_suffix('.glb').exists() else None,'clip':a.clip,'frames':observations,'firstToLastMaximumVertexDisplacementMetres':loop,'firstToLastIsLoopTest':a.clip=='Walk' and frames[0]==1 and frames[-1]==25,'producerScriptSha256':sha(Path(__file__)),'limits':'No FPS/device/performance or likeness claim. A high tiny-edge ratio is a review flag, not alone proof of a visible defect.'}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2));print('NEW_DEFORMATION_OBSERVATIONS '+str(a.output))
