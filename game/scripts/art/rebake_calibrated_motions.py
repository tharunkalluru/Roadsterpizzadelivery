"""Reapply actual standing/body poses after anatomy edits; no source overwrite.
Blender --background INPUT.blend --threads 2 --python THIS.py --
 --contract INPUT.rig.json --output NEW.glb [--height 1.82]
No appearance approval is implied. Seated readers use their dedicated refiner.
"""
import argparse,hashlib,json,runpy,sys
from pathlib import Path
import bpy
from mathutils import Matrix,Vector

args_parser=argparse.ArgumentParser();args_parser.add_argument('--contract',required=True,type=Path);args_parser.add_argument('--output',required=True,type=Path);args_parser.add_argument('--height',type=float,default=1.82)
args_parser.add_argument('--cloth-profile',type=Path,help='Preserve the authored connected-garment gait and hem clearance after hand replacement')
args_parser.add_argument('--motion-profile',type=Path,help='Retain explicit in-place gait variation when anatomy is replaced')
args_parser.add_argument('--hand-space-catch',action='store_true',help='Keep actual measured endpoint under RightHand so continuing walk bob carries it')
args_parser.add_argument('--catch-origin',choices=['centre','palm'],default='centre',help='Generic gameplay adds half the box height, so its receiver anchor must use palm')
args=args_parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
if bpy.data.objects.get('JapaneseBook'):raise RuntimeError('Do not overwrite a seated reader with standing poses')
outputs=[args.output,args.output.with_suffix('.blend'),args.output.with_suffix('.rig.json'),args.output.with_suffix('.production.json'),args.output.with_suffix('.motion-script.py')]
if any(p.exists() for p in outputs):raise RuntimeError('Use new output paths; no existing art/evidence will be overwritten')
if not source.is_file() or not args.contract.is_file():raise RuntimeError('Existing source blend/rig contract required')
helper=runpy.run_path(str(Path(__file__).with_name('rig_character.py')),run_name='rig_helper');rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');scene=bpy.context.scene;scene.cycles.device='CPU'
cloth=json.loads(args.cloth_profile.read_text()) if args.cloth_profile else None
motion=json.loads(args.motion_profile.read_text()) if args.motion_profile else None
if motion and (motion.get('units')!='metres' or motion.get('space')!='blender-world'):raise RuntimeError('Gait profile must explicitly use native Blender-world metres')
for t in list(rig.animation_data.nla_tracks):
 t.mute=True
 if t.name in ['Idle','Read','Walk','TakePizza',*(['Dance'] if cloth else [])]:rig.animation_data.nla_tracks.remove(t)
rig.animation_data.action=None
for name in ['Idle','Read','Walk','TakePizza','StandingHandoffPreview',*(['Dance'] if cloth else [])]:
 old=bpy.data.actions.get(name)
 if old:old.name='UnmodifiedSource_'+name;old.use_fake_user=True
pose=helper['ActualLimbPose'](rig,args.height/1.82,cloth,motion)
fingers=[b.name for b in rig.data.bones if any(d in b.name for d in ['Index','Middle','Ring','Pinky','Thumb'])]
upper=[b.name for b in rig.data.bones if b.name=='Chest' or b.name.startswith(('LeftShoulder','LeftArm','LeftForeArm','LeftHand','LeftWristTwist','RightShoulder','RightArm','RightForeArm','RightHand','RightWristTwist')) or b.name in fingers]
def bake(name,frames,reach=False,walking=False,dancing=False,mask=None,track=True):
 action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action
 for f in frames:
  scene.frame_set(f);amount=(f-1)/24 if reach else 0;amount=amount*amount*(3-2*amount)
  pose.apply(f,reach=amount,walking=walking,dancing=dancing)
  for p in rig.pose.bones:
   if mask and p.name not in mask:continue
   p.keyframe_insert(data_path='rotation_euler',frame=f,group=p.name)
   if p.name=='Hips' or cloth:p.keyframe_insert(data_path='location',frame=f,group=p.name)
   if cloth:p.keyframe_insert(data_path='scale',frame=f,group=p.name)
 rig.animation_data.action=None
 if track:
  t=rig.animation_data.nla_tracks.new();t.name=name;s=t.strips.new(name,1,action);s.action_frame_start=min(frames);s.action_frame_end=max(frames);t.mute=True
bake('Idle',range(1,50,3));bake('Read',range(1,50,3));bake('Walk',range(1,26),walking=True);bake('TakePizza',range(1,26),reach=True,mask=upper);bake('StandingHandoffPreview',range(1,26),reach=True,track=False)
if cloth:bake('Dance',range(1,50),dancing=True)
# Actual native palm surfaces set the resting box underside, not a guessed
# remote point on a generic wrist scaffold.
rig.animation_data.action=None;pose.apply(25,reach=1);deps=bpy.context.evaluated_depsgraph_get();palms=[]
for side in ['Left','Right']:
 obj=bpy.data.objects.get(side+'AuthoredAnatomicalHand')
 if not obj:continue
 b=rig.data.bones[side+'Hand'];origin=rig.matrix_world@b.head_local;along=(rig.matrix_world.to_3x3()@(b.tail_local-b.head_local)).normalized();normal=Vector((0,1,0));normal=(normal-along*normal.dot(along)).normalized();across=along.cross(normal);ev=obj.evaluated_get(deps);p=[]
 for v in obj.data.vertices:
  d=obj.matrix_world@v.co-origin
  if abs(d.dot(across))<.015 and .024<d.dot(along)<.043 and d.dot(normal)>.008:p.append(ev.matrix_world@ev.data.vertices[v.index].co)
 if not p:raise RuntimeError('Native hand has no verifiable palm pad region')
 palms.append(sum(p,Vector())/len(p))
catch=bpy.data.objects['PizzaCatch'];catch.parent=rig;catch.parent_type='OBJECT';catch.parent_bone='';catch.matrix_parent_inverse=Matrix.Identity(4)
offset=0 if args.catch_origin=='palm' else .035
if palms:catch.matrix_world=Matrix.Translation(sum(palms,Vector())/len(palms)+Vector((0,0,offset)))
else:
 p=[rig.pose.bones[s+'Hand'].head.lerp(rig.pose.bones[s+'Hand'].tail,.4) for s in ['Left','Right']];catch.matrix_world=Matrix.Translation((p[0]+p[1])/2+Vector((0,0,.045)))
catch_world=list(catch.matrix_world.translation)
catch_parent_error=0
if args.hand_space_catch:
 bpy.context.view_layer.update();matrix=catch.matrix_world.copy();catch.parent=rig;catch.parent_type='BONE';catch.parent_bone='RightHand';bpy.context.view_layer.update();catch.matrix_world=matrix;bpy.context.view_layer.update()
 catch_parent_error=max(abs(catch.matrix_world[i][j]-matrix[i][j]) for i in range(4) for j in range(4))
 if catch_parent_error>1e-5:raise RuntimeError('Hand-space parenting changed the calibrated contact endpoint')
rig.animation_data.action=None
for p in rig.pose.bones:p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
scene.frame_set(1);bpy.context.view_layer.update();args.output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')));bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False);helper['restrict_handoff_channels'](args.output,upper)
contract=json.loads(args.contract.read_text());contract['id']+='-calibrated-standing';contract['pose']['upperBodyNodes']=upper;contract['motions']['clips']['walk']['metresPerCycle']=pose.metres_per_cycle
contract['catchPointSpace']='palm-contact' if args.catch_origin=='palm' else 'box-center'
if args.hand_space_catch:contract['id']+='-hand-space-'+args.catch_origin
args.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();args.output.with_suffix('.motion-script.py').write_bytes(Path(__file__).read_bytes())
args.output.with_suffix('.production.json').write_text(json.dumps({'status':'UNREVIEWED native pose rebake; actual face/skin/contact/gait/game scene still require independent review','input':str(source),'inputSha256':sha(source),'rigContractSha256':sha(args.contract),'outputSha256':sha(args.output),'producerSha256':sha(Path(__file__)),'producerArguments':sys.argv[sys.argv.index('--')+1:],'rigHelperSha256':sha(Path(__file__).with_name('rig_character.py')),'clothProfile':{'path':str(args.cloth_profile),'sha256':sha(args.cloth_profile),'settings':cloth} if cloth else None,'motionProfile':{'path':str(args.motion_profile),'sha256':sha(args.motion_profile),'settings':motion} if args.motion_profile else None,'metresPerCycle':pose.metres_per_cycle,'nativePalmCount':len(palms),'catchWorld':catch_world,'catchOrigin':args.catch_origin,'catchParent':'RightHand bone' if args.hand_space_catch else 'rig root','catchParentWorldMatrixError':catch_parent_error,'inspectionOnlyClip':'StandingHandoffPreview (not exported)','upperBodyNodes':upper},indent=2))
print('NEW_CALIBRATED_STANDING '+str(args.output))
