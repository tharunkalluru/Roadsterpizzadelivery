"""Author NEW seated Raja driving / Indu bus-window poses, never approval.
Preserves actual seated hips/knees/feet from the source Idle action. Real limb IK
is baked offline; runtime keeps its existing animation clock and skeleton.
"""
import argparse,sys,json,math,hashlib
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion
p=argparse.ArgumentParser();p.add_argument('--role',choices=['raja','indu'],required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--reset-generated-elbows',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if any(f.exists() for f in [a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json')]):raise RuntimeError('New candidate path required')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data_create()
for t in rig.animation_data.nla_tracks:t.mute=True
original=bpy.data.actions.get('PreservedSeatedSourceIdle') or bpy.data.actions.get('Idle')
if not original:raise RuntimeError('Actual seated source Idle missing')
original.name='PreservedSeatedSourceIdle';original.use_fake_user=True
# Revisions start from the preserved actual seated source, not a previously
# twisted role pose. Re-authoring must never double the chest/head rotation.
for name in ['Idle','InduWave']:
 stale=bpy.data.actions.get(name)
 if stale and stale!=original:bpy.data.actions.remove(stale)
if a.reset_generated_elbows:
 for side in ['Left','Right']:
  obj=bpy.data.objects.get(side+'AuthoredElbowTransition')
  if not obj or obj.type!='MESH':raise RuntimeError('Expected exact previous generated elbow bridge')
  bpy.data.objects.remove(obj,do_unlink=True)
rest={b.name:b.matrix_local.copy() for b in rig.data.bones};inv=rig.matrix_world.inverted();point=lambda xyz:inv@Vector(xyz)
def select(action):
 rig.animation_data.action=action
 if hasattr(action,'slots') and action.slots:rig.animation_data.action_slot=action.slots[0]
def sample(frame):
 select(original);bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
 return {b.name:b.matrix.copy() for b in rig.pose.bones}
base_samples={f:sample(f) for f in [1,7,13,19,25,37,49]}
new_actions=[];anchors=[]
for clip,frames in [('Idle',[1,13,25,37,49])]+([('InduWave',[1,7,13,19,25])] if a.role=='indu' else []):
 action=bpy.data.actions.new(clip);action.use_fake_user=True
 if hasattr(action,'slots'):action.slots.new('OBJECT',rig.name)
 for frame in frames:
  base=base_samples[frame];explicit={};phase=(frame-1)/(48 if clip=='Idle' else 24)*math.tau
  def fk(n):
   if n in explicit:return explicit[n]
   parent=rig.data.bones[n].parent
   return fk(parent.name)@base[parent.name].inverted()@base[n] if parent else base[n].copy()
  def tilt(n,axis,angle):
   m=fk(n);r=Quaternion(Vector(axis),angle).to_matrix()@m.to_3x3();result=r.to_4x4();result.translation=m.translation;explicit[n]=result
  def orient(n,head,tail,palm=None,weight=1):
   current=fk(n).to_3x3();target=(tail-head).normalized();rot=(current@Vector((0,1,0))).rotation_difference(target).to_matrix()@current
   if palm is not None:
    local=rest[n].to_3x3().inverted()@(inv.to_3x3()@Vector((0,1,0))).normalized();u=rot@local;u=(u-target*u.dot(target)).normalized();v=(palm-target*palm.dot(target)).normalized();angle=math.atan2(target.dot(u.cross(v)),u.dot(v));rot=Quaternion(target,angle*weight).to_matrix()@rot
   matrix=rot.to_4x4();matrix.translation=head;explicit[n]=matrix
  def arm(side,target,pole,handDirection,palmDirection):
   first,second=side+'Arm',side+'ForeArm';start=fk(first).translation;l1,l2=rig.data.bones[first].length,rig.data.bones[second].length
   delta=point(target)-start;d=max(abs(l1-l2)+.001,min(delta.length,l1+l2-.001));along=delta.normalized();bend=point(pole)-start;bend=(bend-along*bend.dot(along)).normalized();advance=(l1*l1-l2*l2+d*d)/(2*d);elbow=start+along*advance+bend*math.sqrt(max(0,l1*l1-advance*advance));wrist=start+along*d;palm=(inv.to_3x3()@Vector(palmDirection)).normalized()
   orient(first,start,elbow,palm,.33);orient(second,elbow,wrist,palm,.5)
   if side+'WristTwist' in rest:orient(side+'WristTwist',fk(side+'WristTwist').translation,wrist,palm,.75)
   orient(side+'Hand',wrist,wrist+inv.to_3x3()@Vector(handDirection).normalized()*rig.data.bones[side+'Hand'].length,palm)
  if a.role=='raja':
   for side,sign in [('Left',1),('Right',-1)]:arm(side,(sign*.22,-.40,.83),(sign*.40,-.12,.76),(0,-1,0),(0,0,-1))
  else:
   tilt('Chest',(0,0,1),-.65);explicit['Chest'].translation.x-=.09
   tilt('Neck',(0,0,1),-.45);tilt('Head',(0,0,1),-.6);explicit['Head'].translation.x-=.025
   arm('Left',(.13,-.22,.55),(.31,-.10,.64),(0,-1,0),(0,0,-1))
   wave=clip=='InduWave';arm('Right',(-.34-(.035*math.sin(phase) if wave else 0),-.25,1.02+(.07*math.sin(phase*2) if wave else 0)),(-.34,-.10,.82),(0,0,1),(-1,.2,0))
  result={n:fk(n) for n in rest};select(action)
  for n,matrix in result.items():
   bone=rig.pose.bones[n];parent=bone.bone.parent;kwargs={'parent_matrix':result[parent.name],'parent_matrix_local':rest[parent.name]} if parent else {}
   basis=bone.bone.convert_local_to_pose(matrix,rest[n],invert=True,**kwargs);bone.rotation_mode='XYZ';bone.location=basis.to_translation();bone.rotation_euler=basis.to_euler('XYZ');bone.scale=(1,1,1)
   if a.role=='raja' and any(part in n for part in ['Index','Middle','Ring','Pinky','Thumb']) and n[-1:].isdigit():bone.rotation_euler.x+=.3 if 'Thumb' in n else .6
   bone.keyframe_insert('rotation_euler',frame=frame,group=n);bone.keyframe_insert('location',frame=frame,group=n)
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
 new_actions.append(action)
select(new_actions[0]);bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
for side in ['Left','Right']:
 obj=bpy.data.objects.new('DrivingGrip'+side,None);bpy.context.scene.collection.objects.link(obj);hand=rig.pose.bones[side+'Hand'];world=rig.matrix_world@hand.matrix.copy();world.translation=rig.matrix_world@hand.head.lerp(hand.tail,.4);obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=side+'Hand';bpy.context.view_layer.update();obj.matrix_world=world;anchors.append({'name':obj.name,'world':list(world.translation),'bone':side+'Hand'})
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-seated-role-v1'
if a.role=='indu':contract['pose']={'mode':'handoff-clip','clipName':'InduWave','upperBodyNodes':[n for n in rest if n.startswith('Right')and not any(k in n for k in ['Thigh','Shin','Foot'])]}
# glTF loaders validate the rest skeleton BEFORE the Idle clip is installed.
# Preserve the source's measured rest-unit range; record seated height only
# as posture evidence, never substitute it for the initial loader contract.
deps=bpy.context.evaluated_depsgraph_get();corners=[o.evaluated_get(deps).matrix_world@Vector(c) for o in bpy.context.scene.objects if o.type=='MESH' for c in o.evaluated_get(deps).bound_box];height=max(c.z for c in corners)-min(c.z for c in corners)
a.output.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True)
a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n')
a.output.with_suffix('.seated-role.json').write_text(json.dumps({'status':'UNAPPROVED seated role candidate; independent likeness/pose/deformation/gameplay review still required','source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'role':a.role,'hipAndLegs':'source seated Idle transforms retained, not compressed standing mesh','seatedHeight':height,'roleClips':[x.name for x in new_actions],'grips':anchors,'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest()},indent=2)+'\n')
