"""Author a NEW unapproved role Idle clip with actual hand-bound prop anchors.

Blender --background SOURCE.blend --python this.py -- --role balayya|shankar|athadu --output NEW.glb
This preserves source meshes and adds no props. A pose export is not acceptance.
"""
import argparse,sys,json,math,hashlib
from pathlib import Path
import bpy
from mathutils import Vector,Quaternion,Matrix

p=argparse.ArgumentParser();p.add_argument('--role',choices=['balayya','shankar','athadu'],required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if a.output.exists() or a.output.with_suffix('.blend').exists():raise RuntimeError('New output required; existing art is immutable')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
for n in ['LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand']:
 if n not in rest:raise RuntimeError('Real bound hand chain required: '+n)
rig.animation_data_create()
for t in rig.animation_data.nla_tracks:t.mute=True
old=bpy.data.actions.get('Idle')
if old:old.name='PreservedOriginalIdle';old.use_fake_user=True
action=bpy.data.actions.new('Idle');action.use_fake_user=True;rig.animation_data.action=action
if hasattr(action,'slots'):
 slot=action.slots.new('OBJECT',rig.name);rig.animation_data.action_slot=slot
for bone in rig.pose.bones:bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
inv=rig.matrix_world.inverted();point=lambda xyz:inv@Vector(xyz)
for frame in [1,25,49]:
 explicit={};phase=(frame-1)/48*math.tau
 def fk(n):
  if n in explicit:return explicit[n]
  parent=rig.data.bones[n].parent
  return fk(parent.name)@rest[parent.name].inverted()@rest[n] if parent else rest[n].copy()
 def orient(n,head,tail,palm=None,weight=1):
  base=fk(n).to_3x3();y=(tail-head).normalized();rotation=(base@Vector((0,1,0))).rotation_difference(y).to_matrix()@base
  if palm is not None:
   local=rest[n].to_3x3().inverted()@(inv.to_3x3()@Vector((0,1,0))).normalized();current=rotation@local
   current=(current-y*current.dot(y)).normalized();desired=(palm-y*palm.dot(y)).normalized()
   twist=math.atan2(y.dot(current.cross(desired)),current.dot(desired));rotation=Quaternion(y,twist*weight).to_matrix()@rotation
  m=rotation.to_4x4();m.translation=head;explicit[n]=m
 def arm(side,target,pole,handDirection,palmDirection=(0,-1,0)):
  first,second=side+'Arm',side+'ForeArm';o=fk(first).translation;l1,l2=rig.data.bones[first].length,rig.data.bones[second].length
  delta=point(target)-o;d=max(abs(l1-l2)+.001,min(delta.length,l1+l2-.001));along=delta.normalized();toward=point(pole)-o;toward=(toward-along*toward.dot(along)).normalized()
  advance=(l1*l1-l2*l2+d*d)/(2*d);elbow=o+along*advance+toward*math.sqrt(max(0,l1*l1-advance*advance));wrist=o+along*d
  palm=(inv.to_3x3()@Vector(palmDirection)).normalized()
  orient(first,o,elbow,palm,.33);orient(second,elbow,wrist,palm,.5)
  if side+'WristTwist' in rest:orient(side+'WristTwist',fk(side+'WristTwist').translation,wrist,palm,.75)
  orient(side+'Hand',wrist,wrist+inv.to_3x3()@Vector(handDirection).normalized()*rig.data.bones[side+'Hand'].length,palm)
 if a.role in ['balayya','athadu']:
  arm('Right',(-.20,-.015,1.64),(-.43,-.18,1.15),(0,0,1),(1,0,0))
 if a.role=='balayya':arm('Left',(.21,-.29,1.05),(.43,-.10,1.04),(0,0,1))
 elif a.role=='shankar':
  arm('Left',(.17,-.30,1.20),(.43,-.08,1.05),(0,0,1))
  arm('Right',(-.16,-.22,1.08),(-.43,-.10,1.01),(0,-1,0))
 elif a.role=='athadu':arm('Left',(.17,-.08,.87),(.38,-.04,1.03),(0,0,-1))
 result={n:fk(n) for n in rest}
 for n,m in result.items():
  b=rig.pose.bones[n];parent=b.bone.parent;kwargs={'parent_matrix':result[parent.name],'parent_matrix_local':rest[parent.name]} if parent else {}
  basis=b.bone.convert_local_to_pose(m,rest[n],invert=True,**kwargs);b.location=basis.to_translation();b.rotation_euler=basis.to_euler('XYZ');b.scale=(1,1,1)
  if any(part in n for part in ['Index','Middle','Ring','Pinky','Thumb']) and n[-1:].isdigit():
   i=int(n[-1])-1
   if 'Thumb' in n:b.rotation_euler.x+=[.35,.45,.3][i]
   else:b.rotation_euler.x+=[.65,.95,.70][i]
  b.keyframe_insert('rotation_euler',frame=frame,group=n);b.keyframe_insert('location',frame=frame,group=n)
 bpy.context.view_layer.update()
anchors=[]
for name,side in [('PropPhone','Right'),('PropBottle','Left')] if a.role=='balayya' else [('PropXray','Left')] if a.role=='shankar' else [('PropPhone','Right')]:
 obj=bpy.data.objects.new(name,None);bpy.context.scene.collection.objects.link(obj)
 hand=rig.pose.bones[side+'Hand'];m=hand.matrix.copy();m.translation=hand.head.lerp(hand.tail,.42)
 if name=='PropBottle':m.translation+=inv.to_3x3()@Vector((0,-.025,-.14))
 if name=='PropPhone':m.translation+=inv.to_3x3()@Vector((.025,0,0))
 if name=='PropXray':m.translation+=inv.to_3x3()@Vector((-.16,-.015,0))
 # glTF bone axes are retained, while Empty node axes are converted to Y-up.
 # Cancel that local quarter turn so runtime Three.js Y-up props follow the
 # actual upright hand Y axis, rather than lying horizontally across the palm.
 world=rig.matrix_world@m@Matrix.Rotation(-math.pi/2,4,'X');obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=side+'Hand';bpy.context.view_layer.update();obj.matrix_world=world
 anchors.append({'name':name,'bone':side+'Hand','origin':'palm centre; bottle origin18cm below grip','status':'UNREVIEWED prop centre; calibrate against actual palm and prop mesh'})
bpy.context.scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend').resolve()))
bpy.ops.export_scene.gltf(filepath=str(a.output.resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_yup=True,export_extras=True)
contract=json.loads(source.with_suffix('.rig.json').read_text());contract['id']+='-role-idle-v1';a.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2)+'\n')
a.output.with_suffix('.role-pose.json').write_text(json.dumps({'role':a.role,'source':str(source),'sourceUnchanged':True,'status':'UNAPPROVED actual authored hand pose; inspect model deformation and scene props','anchors':anchors,'outputSha256':hashlib.sha256(a.output.read_bytes()).hexdigest()},indent=2)+'\n')
