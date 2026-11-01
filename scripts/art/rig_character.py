"""Blender 4.5 production tool for a NEW review candidate, never an approval.

Usage: Blender --background --factory-startup --python scripts/art/rig_character.py --
  --input /absolute/source.glb --output /absolute/new-candidate.glb --identity pushpa-raj
  --height 1.82 [--yaw 0] [--triangles 65000] [--seated] [--render-dir /absolute/new-dir]

Preserves the generated mesh/UV/materials. Authors an actual bound skeleton and
in-place clips. Heat weighting is attempted first; any deterministic fallback is
recorded for deformation review. All outputs must be new files. A script success
does not imply likeness, skinning, costume, pose or game-readability acceptance.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix, Quaternion


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--identity', required=True)
    parser.add_argument('--height', type=float, default=1.82)
    parser.add_argument('--yaw', type=float, default=0)
    parser.add_argument('--up-axis', choices=['auto', 'z', 'y'], default='auto')
    parser.add_argument('--triangles', type=int, default=65000)
    parser.add_argument('--seated', action='store_true')
    parser.add_argument('--infer-landmarks', action='store_true', help='Opt-in surface-slice A-pose limb calibration; ambiguous clothing must use authored landmarks')
    parser.add_argument('--landmarks', type=Path, help='Optional native Blender metre-space actual anatomy JSON')
    parser.add_argument('--calibrated-motions', action='store_true', help='Opt-in anatomy-space neutral stance and handoff; legacy clip authoring remains the default')
    parser.add_argument('--rigid-footwear', action='store_true', help='Explicit boots/shoes only: retain rigid soles; do not use on a floor-length skirt')
    parser.add_argument('--cloth-profile',type=Path,help='Explicit floor-length garment/foot regions and smaller planted gait; never infers hidden legs from cloth')
    parser.add_argument('--motion-profile',type=Path,help='Optional explicitly authored gait variation; adds no cloth bones and never changes gameplay timing')
    return parser.parse_args(sys.argv[sys.argv.index('--') + 1:])


def distance_to_segment(point, a, b):
    delta = b - a
    t = min(1, max(0, (point - a).dot(delta) / max(1e-8, delta.length_squared)))
    return (point - a - delta * t).length


def infer_surface_landmarks(points, scale, overrides=None):
    """Return producer limb centres, never an anatomical/appearance approval.

    This expects an isolated upright A-pose. It explicitly refuses an arm slice
    connected to a broad skirt/torso rather than silently placing a wrist in
    clothing. Authored points override these in the same metre-space format.
    """
    def quantile(values, q):
        values=sorted(values);return values[min(len(values)-1,max(0,int((len(values)-1)*q)))]
    def slice_at(z,sign,arm=False):
        if not arm and sum(abs(p.x)<.018*scale and abs(p.z-z)<.014*scale for p in points)>=3:
            raise RuntimeError('Connected lower garment conceals the legs; provide authored limb landmarks and a cloth-aware rig')
        row=[p for p in points if abs(p.z-z)<.014*scale and p.x*sign>.025*scale]
        if len(row)<8:raise RuntimeError('Insufficient actual geometry around a requested limb slice')
        threshold=.025*scale
        if arm:
            xs=sorted(p.x*sign for p in row)
            gaps=[(b-a,(a+b)/2) for a,b in zip(xs,xs[1:]) if .13*scale<a<.50*scale]
            if not gaps or max(gaps)[0]<.018*scale:
                raise RuntimeError('Ambiguous connected arm/clothing slice; provide actual --landmarks')
            threshold=max(gaps)[1]
        row=[p for p in row if p.x*sign>threshold]
        if len(row)<8:raise RuntimeError('An isolated arm/leg surface could not be established')
        lo=Vector([quantile([p[i] for p in row],.08) for i in range(3)])
        hi=Vector([quantile([p[i] for p in row],.92) for i in range(3)])
        center=(lo+hi)/2;center.z=z
        return center,{'sampleCount':len(row),'boundsMin':list(lo),'boundsMax':list(hi),'sliceZ':z,'separationX':threshold}
    result={'units':'metres','space':'blender-world','status':'UNREVIEWED producer surface landmarks; inspect actual joints and gait','sliceEvidence':{}}
    for side,sign in [('Left',1),('Right',-1)]:
        result[side]={};result['sliceEvidence'][side]={}
        for name,z,is_arm in [('wrist',.94,True),('elbow',1.18,True),('knee',.55,False),('ankle',.13,False)]:
            if name in (overrides or {}).get(side,{}):
                result[side][name]=overrides[side][name];continue
            point,evidence=slice_at(z*scale,sign,is_arm)
            result[side][name]=list(point);result['sliceEvidence'][side][name]=evidence
        ankle=Vector(result[side]['ankle'])
        if 'footTip' in (overrides or {}).get(side,{}):
            result[side]['footTip']=overrides[side]['footTip'];continue
        shoe=[p for p in points if p.z<.11*scale and p.x*sign>.025*scale and abs(p.x-ankle.x)<.11*scale]
        if len(shoe)<10:raise RuntimeError('Actual shoe/toe volume is missing; provide footTip landmarks')
        front_y=quantile([p.y for p in shoe],.12)
        toes=[p for p in shoe if p.y<=front_y+.018*scale]
        toe=Vector((quantile([p.x for p in toes],.5),front_y+.012*scale,.065*scale))
        result[side]['footTip']=list(toe)
    return result


def apply_actual_landmarks(bones, landmarks):
    if not landmarks:return
    if landmarks.get('units')!='metres' or landmarks.get('space')!='blender-world':
        raise RuntimeError('Landmarks must explicitly use metres and blender-world coordinates')
    def point(value):
        if not isinstance(value,list) or len(value)!=3 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in value):
            raise RuntimeError('An anatomy landmark must be a finite xyz triple')
        return Vector(value)
    def head(name,value):bones[name]=(point(value),bones[name][1],bones[name][2])
    def tail(name,value):bones[name]=(bones[name][0],point(value),bones[name][2])
    for side in ['Left','Right']:
        values=landmarks.get(side,{})
        for key,first,second in [('shoulder','Shoulder','Arm'),('elbow','Arm','ForeArm'),('wrist','ForeArm','Hand'),('knee','Thigh','Shin'),('ankle','Shin','Foot')]:
            if key not in values:continue
            if key=='wrist':
                delta=bones[side+'Hand'][1]-bones[side+'Hand'][0]
                tail(side+'Hand',list(point(values[key])+delta))
            tail(side+first,values[key]);head(side+second,values[key])
        if 'hip' in values:head(side+'Thigh',values['hip'])
        if 'footTip' in values:tail(side+'Foot',values['footTip'])
    for name,value in landmarks.get('bones',{}).items():
        if name not in bones:raise RuntimeError('Unknown explicit anatomy bone: '+name)
        if 'head' in value:head(name,value['head'])
        if 'tail' in value:tail(name,value['tail'])
    for name,(a,b,parent) in bones.items():
        if (b-a).length<.005:raise RuntimeError('Anatomy calibration collapsed a bone: '+name)


class ActualLimbPose:
    """Baked world-target draft poses; live gameplay never runs this solver."""
    def __init__(self,rig,scale,cloth_profile=None,motion_profile=None):
        self.rig=rig;self.scale=scale;self.rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
        self.cloth=cloth_profile or {}
        self.motion={**(motion_profile or {}),**self.cloth}
        self.length={b.name:b.length for b in rig.data.bones}
        leg=min(self.length[s+'Thigh']+self.length[s+'Shin'] for s in ['Left','Right'])
        self.amplitude=min(self.motion.get('walkAmplitude',.26*scale),leg*.31);self.metres_per_cycle=2*self.amplitude/.60

    def apply(self,frame,reach=0,walking=False,dancing=False):
        rig=self.rig;rest=self.rest;s=self.scale;explicit={};cycle=(frame-1)/24+self.motion.get('phaseOffsetCycles',0);phase=cycle*math.tau;foot_travel={}
        def fk(name):
            if name in explicit:return explicit[name]
            parent=rig.data.bones[name].parent
            return fk(parent.name)@rest[parent.name].inverted()@rest[name] if parent else rest[name].copy()
        def tilt(name,axis,angle):
            m=fk(name);explicit[name]=(Quaternion(Vector(axis),angle).to_matrix()@m.to_3x3()).to_4x4();explicit[name].translation=m.translation
        def orient(name,head,tail,palm=None,amount=1,stretch=1):
            base=fk(name).to_quaternion().to_matrix();axis=(tail-head).normalized()
            rotation=(base@Vector((0,1,0))).rotation_difference(axis).to_matrix()@base
            if palm is not None:
                local=rest[name].to_3x3().inverted()@Vector((0,1,0));current=rotation@local
                current=(current-axis*current.dot(axis)).normalized();desired=(palm-axis*palm.dot(axis)).normalized()
                angle=math.atan2(axis.dot(current.cross(desired)),current.dot(desired))
                rotation=Quaternion(axis,angle*amount).to_matrix()@rotation
            explicit[name]=(rotation@Matrix.Diagonal((1,stretch,1))).to_4x4();explicit[name].translation=head
        def limb(first,second,target,pole,palm=None,hidden_stretch=False):
            origin=fk(first).translation;delta=target-origin;l1,l2=self.length[first],self.length[second]
            stretch=max(1,delta.length/max(.001,l1+l2-.001)) if hidden_stretch else 1
            l1*=stretch;l2*=stretch
            distance=max(abs(l1-l2)+.001,min(delta.length,l1+l2-.001));axis=delta.normalized()
            bend=pole-origin;bend=(bend-axis*bend.dot(axis)).normalized()
            along=(l1*l1-l2*l2+distance*distance)/(2*distance);height=math.sqrt(max(0,l1*l1-along*along))
            elbow=origin+axis*along+bend*height;target=origin+axis*distance
            orient(first,origin,elbow,palm,.33,stretch);orient(second,elbow,target,palm,.50,stretch)
            return target
        if walking or dancing:
            explicit['Hips']=rest['Hips'].copy();explicit['Hips'].translation.z-=self.motion.get('hipDrop',.052*s)-self.motion.get('hipBob',.007*s)*math.cos(phase*2)
            tilt('Hips',(0,0,1),(.055 if dancing else self.motion.get('walkHipYaw',.018))*math.sin(phase));tilt('Chest',(0,0,1),(-.040 if dancing else -self.motion.get('walkChestYaw',.018))*math.sin(phase))
        else:tilt('Chest',(1,0,0),.007*math.sin((frame-1)/48*math.tau))
        for side,sign in [('Left',1),('Right',-1)]:
            rest_wrist=rig.data.bones[side+'Hand'].head_local.copy()
            neutral=rest_wrist.copy();neutral.x=sign*max(.24*s,min(.28*s,abs(rest_wrist.x)-.08*s))
            # Bringing an A-pose arm inward must also lower the wrist. Keeping
            # its old height instead produced a conspicuous flared-elbow pose.
            shoulder=fk(side+'Arm').translation
            neutral.z=min(neutral.z,shoulder.z-(self.length[side+'Arm']+self.length[side+'ForeArm'])*.96)
            if walking:neutral.y+=sign*self.motion.get('walkArmSwing',.10*s)*math.sin(phase)
            target=neutral.lerp(Vector((sign*.13*s,-.38*s,1.075*s)),reach)
            palm=Vector((-sign,0,0)).lerp(Vector((0,0,1)),reach).normalized()
            pole=Vector((sign*.23*s,.09*s,1.04*s)).lerp(Vector((sign*.36*s,-.06*s,1.01*s)),reach)
            if dancing:
                target=Vector((sign*(.29+.025*math.cos(phase))*s,-.22*s,(1.20+sign*.14*math.sin(phase))*s))
                palm=Vector((0,-1,.2)).normalized();pole=Vector((sign*.36*s,-.02*s,1.12*s))
            wrist=limb(side+'Arm',side+'ForeArm',target,pole,palm)
            if side+'WristTwist' in rest:orient(side+'WristTwist',fk(side+'WristTwist').translation,wrist,palm,.75)
            direction=Vector((0,0,-1)).lerp(Vector((0,-1,.02)),reach).normalized()
            if dancing:direction=Vector((sign*.15,-.15,1)).normalized()
            orient(side+'Hand',wrist,wrist+direction*self.length[side+'Hand'],palm)
            if walking or dancing:
                t=(cycle+(0 if side=='Left' else .5))%1
                ankle=rig.data.bones[side+'Foot'].head_local.copy();lift=0
                if not self.cloth:ankle.x=sign*max(.10*s,min(.14*s,abs(ankle.x)-.06*s))
                if dancing:
                    lift=self.motion.get('danceFootLift',.018*s)*max(0,math.sin(phase+(0 if side=='Left' else math.pi)))
                elif t<.60:ankle.y+=-self.amplitude+2*self.amplitude*t/.60
                else:
                    q=(t-.60)/.40;blend=q*q*(3-2*q)
                    ankle.y+=self.amplitude-2*self.amplitude*blend;lift=self.motion.get('walkLift',.105*s)*math.sin(q*math.pi)
                ankle.z+=lift
                foot_travel[side]=ankle.y-rig.data.bones[side+'Foot'].head_local.y
                knee=rig.data.bones[side+'Shin'].head_local.copy();pole=Vector((knee.x,-.65*s,knee.z))
                achieved=limb(side+'Thigh',side+'Shin',ankle,pole,hidden_stretch=self.cloth.get('allowHiddenLegStretch',False))
                # Aim alone retains shin-induced axial roll and tipped a rigid
                # sole ~6mm through the floor. Preserve the complete actual
                # rest shoe frame while translating to the solved ankle.
                explicit[side+'Foot']=rest[side+'Foot'].copy()
                explicit[side+'Foot'].translation=achieved
        if self.cloth:
            for name in ['SkirtFrontLeft','SkirtFrontRight','SkirtBackLeft','SkirtBackRight']:
                if name not in rest:continue
                offset=0 if 'Left' in name else math.pi
                # Authored small cloth sway; this is not advertised as a cloth
                # physics simulation. Connected lower cloth never follows an
                # independently swinging thigh through its opposite side.
                tilt(name,(0,1,0),self.cloth.get('danceSwayRadians',.018) * math.sin(phase+offset) if dancing else self.cloth.get('swayRadians',.012)*math.sin(phase+offset) if walking else 0)
                if walking and self.cloth.get('followFootFraction',0):
                    travel=foot_travel.get('Left' if 'Left' in name else 'Right',0)
                    travel=min(0,travel) if 'Front' in name else max(0,travel)
                    angle=math.atan2(travel*self.cloth['followFootFraction'],self.length[name])
                    tilt(name,(1,0,0),angle)
        for name in rest:
            if not any(d in name for d in ['Index','Middle','Ring','Pinky','Thumb']):continue
            i=int(name[-1]);thumb='Thumb' in name
            curl=([.12,.20,.12][i-1] if thumb else [.20,.30,.20][i-1])*(1-reach)+([.08,.12,.06][i-1] if thumb else [.03,.05,.035][i-1])*reach
            m=fk(name);explicit[name]=(m.to_3x3()@Matrix.Rotation(curl,3,'X')).to_4x4();explicit[name].translation=m.translation
        result={name:fk(name) for name in rest}
        for name,matrix in result.items():
            p=rig.pose.bones[name];parent=p.bone.parent
            kwargs={'parent_matrix':result[parent.name],'parent_matrix_local':rest[parent.name]} if parent else {}
            basis=p.bone.convert_local_to_pose(matrix,rest[name],invert=True,**kwargs)
            p.location=basis.to_translation();p.rotation_mode='XYZ';p.rotation_euler=basis.to_euler('XYZ',p.rotation_euler.copy());p.scale=basis.to_scale()
        bpy.context.view_layer.update()
        return result


def restrict_handoff_channels(path, names):
    """Blender bakes every skin joint; keep the authored upper-body action mask.

    This edits the newly exported glTF animation metadata only. Source geometry,
    textures, animation keyframes and the untouched input candidate are retained.
    """
    data = path.read_bytes()
    json_size, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A: raise RuntimeError('Expected glTF JSON chunk.')
    model = json.loads(data[20:20 + json_size])
    for animation in model.get('animations', []):
        if animation.get('name') == 'TakePizza':
            animation['channels'] = [channel for channel in animation['channels']
                if model['nodes'][channel['target']['node']].get('name') in names]
            if not animation['channels']: raise RuntimeError('Export omitted the real authored handoff tracks.')
    encoded = json.dumps(model, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = data[20 + json_size:]
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, 20 + len(encoded) + len(tail))
        + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)


def build(args):
    if args.seated and args.calibrated_motions:raise RuntimeError('Use the dedicated reader refinement for seated contact; standing motion must not invent a seated pose')
    if not args.input.is_file() or args.output.exists():
        raise RuntimeError('Input must exist and output must be a new candidate path.')
    for path in [args.output.with_suffix('.blend'), args.output.with_suffix('.rig.json'), args.output.with_suffix('.production.json'),args.output.with_suffix('.landmarks.json'),args.output.with_suffix('.rig-script.py')]:
        if path.exists():
            raise RuntimeError(f'Refusing to overwrite existing production evidence: {path}')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.cycles.device='CPU'
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not meshes:
        raise RuntimeError('Source has no mesh; a rig cannot replace missing artwork.')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = args.identity + '-review-mesh'
    # Flatten the COMPLETE imported hierarchy, not just the local mesh matrix.
    # Trimesh GLBs can include an axis-conversion parent. Applying local rotation
    # while retaining that parent would rotate the character a second time.
    points=[body.matrix_world@vertex.co for vertex in body.data.vertices]
    body.parent=None;body.matrix_world=Matrix.Identity(4)
    extent=Vector(tuple(max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)))
    # Some generated GLBs declare glTF but store their geometry Z-up. Blender's
    # standards-compliant importer then leaves the body along Blender Y.
    if args.up_axis == 'y' or args.up_axis == 'auto' and extent.y > extent.z * 1.3:
        rotation=Matrix.Rotation(-math.pi/2,4,'X');points=[rotation@point for point in points]
    rotation=Matrix.Rotation(args.yaw,4,'Z');points=[rotation@point for point in points]
    lower = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    upper = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    if upper.z - lower.z < 1e-5:
        raise RuntimeError('Source has no upright height; review its coordinate convention first.')
    scale = args.height / (upper.z - lower.z)
    center = Vector(((lower.x + upper.x) / 2, (lower.y + upper.y) / 2, lower.z))
    for vertex,point in zip(body.data.vertices,points):vertex.co=(point-center)*scale
    for obj in list(bpy.context.scene.objects):
        if obj!=body:bpy.data.objects.remove(obj,do_unlink=True)
    weld=bmesh.new();weld.from_mesh(body.data)
    bmesh.ops.remove_doubles(weld,verts=list(weld.verts),dist=.000001)
    bmesh.ops.recalc_face_normals(weld,faces=list(weld.faces))
    weld.to_mesh(body.data);weld.free();body.data.update()
    source_triangles = sum(len(poly.vertices) - 2 for poly in body.data.polygons)
    if source_triangles > args.triangles:
        modifier = body.modifiers.new('Reviewed mobile topology budget', 'DECIMATE')
        modifier.ratio = args.triangles / source_triangles
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    s = args.height / 1.82
    cloth=json.loads(args.cloth_profile.read_text()) if args.cloth_profile else None
    motion_path=getattr(args,'motion_profile',None)
    motion=json.loads(motion_path.read_text()) if motion_path else None
    if motion:
        if motion.get('units')!='metres' or motion.get('space')!='blender-world':raise RuntimeError('Authored gait must explicitly use native Blender-world metres')
        for key,value in motion.items():
            if key in ['walkAmplitude','walkLift','hipDrop','hipBob','walkArmSwing','walkHipYaw','walkChestYaw','phaseOffsetCycles'] and (not isinstance(value,(int,float)) or not math.isfinite(value) or value<0):raise RuntimeError('Invalid authored gait parameter: '+key)
        if motion.get('phaseOffsetCycles',0)>=1:raise RuntimeError('Gait phase must be within one cycle')
    if cloth and (cloth.get('units')!='metres' or cloth.get('space')!='blender-world'):
        raise RuntimeError('Cloth profile must use native Blender-world metres')
    if cloth and not args.landmarks:raise RuntimeError('Cloth-hidden anatomy needs explicit landmarks; it cannot be inferred from the garment shell')
    if cloth and args.rigid_footwear and (cloth.get('coverBelowHem',True) or cloth['hemZ']<=.30):raise RuntimeError('Use explicit floor-length cloth foot volumes; rigid footwear cutoff is only safe below an explicitly short garment')
    def v(x, y, z): return Vector((x * s, y * s, z * s))
    bones = {
        'Hips': (v(0, 0, .96), v(0, 0, 1.08), None),
        'Spine': (v(0, 0, 1.08), v(0, 0, 1.29), 'Hips'),
        'Chest': (v(0, 0, 1.29), v(0, 0, 1.48), 'Spine'),
        'Neck': (v(0, 0, 1.48), v(0, 0, 1.59), 'Chest'),
        'Head': (v(0, 0, 1.59), v(0, 0, 1.78), 'Neck'),
    }
    for side, sign in [('Left', 1), ('Right', -1)]:
        bones.update({
            side + 'Shoulder': (v(0, 0, 1.44), v(sign * .19, 0, 1.44), 'Chest'),
            side + 'Arm': (v(sign * .19, 0, 1.44), v(sign * .37, 0, 1.18), side + 'Shoulder'),
            side + 'ForeArm': (v(sign * .37, 0, 1.18), v(sign * .48, -.015, .94), side + 'Arm'),
            side + 'Hand': (v(sign * .48, -.015, .94), v(sign * .50, -.025, .83), side + 'ForeArm'),
            side + 'Thigh': (v(sign * .12, 0, .98), v(sign * .13, 0, .55), 'Hips'),
            side + 'Shin': (v(sign * .13, 0, .55), v(sign * .14, 0, .13), side + 'Thigh'),
            side + 'Foot': (v(sign * .14, 0, .13), v(sign * .14, -.18, .07), side + 'Shin'),
        })
    authored=json.loads(args.landmarks.read_text()) if args.landmarks else {}
    actual_landmarks=infer_surface_landmarks([body.matrix_world@vertex.co for vertex in body.data.vertices],s,authored) if args.infer_landmarks else {}
    if args.landmarks:
        # Explicit per-side points override inferred samples, not unrelated
        # default skeleton values or the unreviewed evidence provenance.
        for key,value in authored.items():
            if key in ['Left','Right','bones'] and key in actual_landmarks:actual_landmarks[key].update(value)
            else:actual_landmarks[key]=value
    apply_actual_landmarks(bones,actual_landmarks)
    if cloth:
        for name,x,y in [('SkirtFrontLeft',.11,-.065),('SkirtFrontRight',-.11,-.065),('SkirtBackLeft',.11,.065),('SkirtBackRight',-.11,.065)]:
            bones[name]=(Vector((x*s,y*s,cloth['waistZ'])),Vector((x*s,y*s,cloth['hemZ'])),'Hips')
    bpy.ops.object.armature_add(enter_editmode=True)
    rig = bpy.context.object
    rig.name = 'CharacterRig'
    for bone in list(rig.data.edit_bones): rig.data.edit_bones.remove(bone)
    for name, (head, tail, parent) in bones.items():
        bone = rig.data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent: bone.parent = rig.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    method = 'blender-bone-heat'
    heat_error=None
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError as error:heat_error=str(error)
    # Bone heat can leave a few disconnected reconstructed fragments unbound.
    # Preserve every valid authored heat weight rather than throwing away a
    # complete body's smooth solution because of one such vertex.
    body.parent=rig
    if not any(mod.type=='ARMATURE' for mod in body.modifiers):
        mod=body.modifiers.new('Character skin','ARMATURE');mod.object=rig
    groups={name:body.vertex_groups.get(name) or body.vertex_groups.new(name=name) for name in bones}
    valid_indices={group.index for group in groups.values()}
    fallback_vertices=[];preserved_heat=0
    for vertex in body.data.vertices:
        valid=[g for g in vertex.groups if g.group in valid_indices and math.isfinite(g.weight) and g.weight>0]
        if valid and sum(g.weight for g in valid)>.00001:
            preserved_heat+=1;continue
        fallback_vertices.append(vertex)
    for vertex in fallback_vertices:
        # A continuous field of actual rest-bone distances has no hard x/z
        # limb-region boundary. Adjacent shirt vertices cannot flip from 99%
        # Spine to 99% Arm merely by crossing x=.22. Explicit cloth semantics
        # below supersede this field on connected sarees/skirt surfaces.
        distances={name:distance_to_segment(vertex.co,a,b) for name,(a,b,parent) in bones.items()}
        nearest=min(distances.values());sigma=.065*s
        weights={name:math.exp(-min(80,(distance*distance-nearest*nearest)/(2*sigma*sigma))) for name,distance in distances.items()}
        total=sum(weights.values())
        for name,weight in weights.items():
            if weight/total>.00001:groups[name].add([vertex.index],weight/total,'REPLACE')
    if fallback_vertices:method='preserved-valid-bone-heat-plus-continuous-distance-fill-needs-deformation-review'
    rigid_footwear_counts={'Left':0,'Right':0}
    cloth_counts={'cloth':0,'LeftFoot':0,'RightFoot':0,'pinnedAccessories':0,'preservedArmSurfaces':0}
    if cloth:
        def within(point,volume):return all(volume['min'][axis]<=point[axis]<=volume['max'][axis] for axis in range(3))
        def smooth(value):
            value=max(0,min(1,value));return value*value*(3-2*value)
        def mix_original(vertex,target,amount):
            original={body.vertex_groups[g.group].name:g.weight for g in vertex.groups if math.isfinite(g.weight) and g.weight>0}
            total=sum(original.values());original={name:weight/total for name,weight in original.items()} if total else {}
            result={name:weight*(1-amount) for name,weight in original.items()}
            for name,weight in target.items():result[name]=result.get(name,0)+weight*amount
            return result
        for vertex in body.data.vertices:
            point=body.matrix_world@vertex.co
            foot=next((side for side in ['Left','Right'] if side in cloth.get('footVolumes',{}) and within(point,cloth['footVolumes'][side])),None)
            pin=next((volume for volume in cloth.get('pinnedVolumes',[]) if within(point,volume)),None)
            arm_distance=min(distance_to_segment(point,bones[side+part][0],bones[side+part][1]) for side in ['Left','Right'] for part in ['ForeArm','Hand'])
            arm_surface=arm_distance<cloth.get('armSurfaceRadius',.075)
            # Fabric/accessory ownership fades over real centimetres, not a
            # hard box edge. A previous Hips pin cut through the forearm and
            # made neighbouring4mm vertices separate by12cm in a walk.
            away_from_arm=smooth((arm_distance-cloth.get('armProtectionInner',.055))/cloth.get('armProtectionFeather',.045))
            if foot:
                weights={foot+'Foot':1};cloth_counts[foot+'Foot']+=1
            elif pin:
                inside=min(min(point[axis]-pin['min'][axis],pin['max'][axis]-point[axis]) for axis in range(3))
                amount=smooth(inside/pin.get('feather',.035))*away_from_arm
                weights=mix_original(vertex,{pin['bone']:1},amount);cloth_counts['pinnedAccessories']+=1
            elif arm_surface and away_from_arm<=1e-8:
                cloth_counts['preservedArmSurfaces']+=1;continue
            elif point.z<cloth['waistZ'] and (point.z>cloth['hemZ'] or cloth.get('coverBelowHem',True) and abs(point.x)<cloth.get('hemHalfWidth',.32)):
                # Smooth quadrant weights retain a single fabric surface. The
                # hidden knee/leg landmark positions do not split the saree.
                names=['SkirtFrontLeft','SkirtFrontRight','SkirtBackLeft','SkirtBackRight']
                weights={name:1/max(.035,distance_to_segment(point,bones[name][0],bones[name][1]))**2 for name in names}
                total=sum(weights.values());weights={name:weight/total for name,weight in weights.items()};cloth_counts['cloth']+=1
                amount=smooth((cloth['waistZ']-point.z)/cloth.get('waistFeather',.075))*away_from_arm
                if not cloth.get('coverBelowHem',True):amount*=smooth((point.z-cloth['hemZ'])/cloth.get('hemFeather',.065))
                weights=mix_original(vertex,weights,amount)
            else:continue
            for group in body.vertex_groups:group.remove([vertex.index])
            for name,weight in weights.items():body.vertex_groups[name].add([vertex.index],weight,'REPLACE')
    if args.rigid_footwear:
        for vertex in body.data.vertices:
            if vertex.co.z>=.11*s:continue
            side='Left' if vertex.co.x>0 else 'Right'
            for group in body.vertex_groups:group.remove([vertex.index])
            body.vertex_groups[side+'Foot'].add([vertex.index],1,'REPLACE');rigid_footwear_counts[side]+=1
    catch = bpy.data.objects.new('PizzaCatch', None)
    bpy.context.collection.objects.link(catch)
    catch.parent = rig
    catch.parent_type = 'BONE'
    catch.parent_bone = 'RightHand'
    catch.location = (0, .05 * s, .10 * s)
    upper_body = ['Chest', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'] if args.seated else ['Chest', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand']
    rig.animation_data_create()
    actual_motion=ActualLimbPose(rig,s,cloth,motion) if args.calibrated_motions else None
    def clip(name, frames, pose_at, only=None):
        action = bpy.data.actions.new(name)
        rig.animation_data.action = action
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            for bone in rig.pose.bones:
                bone.rotation_mode = 'XYZ'; bone.rotation_euler = (0, 0, 0); bone.location = (0, 0, 0)
            pose_at(frame)
            for bone in rig.pose.bones:
                if only and bone.name not in only: continue
                bone.keyframe_insert(data_path='rotation_euler', frame=frame, group=bone.name)
                if bone.name == 'Hips' or cloth: bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
                if cloth:bone.keyframe_insert(data_path='scale',frame=frame,group=bone.name)
        rig.animation_data.action = None
        track = rig.animation_data.nla_tracks.new(); track.name = name
        strip = track.strips.new(name, 1, action); strip.action_frame_start = min(frames); strip.action_frame_end = max(frames)
        track.mute = True
    def rot(name, axis, angle): rig.pose.bones[name].rotation_euler[axis] = angle
    def seated():
        if not args.seated: return
        rig.pose.bones['Hips'].location.y = -.42 * s
        for side in ['Left', 'Right']:
            rot(side + 'Thigh', 0, -math.pi / 2); rot(side + 'Shin', 0, math.pi / 2)
    def idle(frame):
        if actual_motion:actual_motion.apply(frame);return
        seated(); rot('Chest', 0, .012 * math.sin(frame / 48 * math.tau))
    clip('Idle', [1, 13, 25, 37, 49], idle)
    def walk(frame):
        if actual_motion:actual_motion.apply(frame,walking=True);return
        phase = (frame - 1) / 24 * math.tau
        for side, sign in [('Left', 1), ('Right', -1)]:
            swing = math.sin(phase) * sign
            rot(side + 'Thigh', 0, .30 * swing)
            rot(side + 'Shin', 0, max(0, -swing) * .48)
            rot(side + 'Arm', 0, -.22 * swing); rot(side + 'ForeArm', 0, -.12)
        rot('Hips', 1, .025 * math.sin(phase)); rot('Chest', 2, .025 * math.sin(phase))
    clip('Walk', list(range(1,26)) if actual_motion else list(range(1, 26, 3)), walk)
    def dance(frame):
        if actual_motion and cloth:
            actual_motion.apply(frame,dancing=True);return
        phase = (frame - 1) / 48 * math.tau
        for side, sign in [('Left', 1), ('Right', -1)]:
            rot(side + 'Thigh', 0, .16 * math.sin(phase) * sign)
            rot(side + 'Shin', 0, .12 + .10 * math.cos(phase))
            rot(side + 'Arm', 2, .35 * sign + .18 * math.sin(phase))
            rot(side + 'ForeArm', 0, -.55 + .12 * math.cos(phase))
        rot('Hips', 1, .08 * math.sin(phase)); rot('Chest', 2, .07 * math.sin(phase))
    clip('Dance', list(range(1, 50, 6)), dance)
    def read(frame):
        if actual_motion:actual_motion.apply(frame);return
        seated(); rot('Head', 0, .16 + .01 * math.sin(frame / 48 * math.tau))
        for side, sign in [('Left', 1), ('Right', -1)]:
            rot(side + 'Arm', 0, -.24); rot(side + 'Arm', 2, -.15 * sign); rot(side + 'ForeArm', 0, -1.0)
    clip('Read', [1, 13, 25, 37, 49], read)
    def handoff(frame):
        amount = (frame - 1) / 24
        if actual_motion:
            actual_motion.apply(frame,reach=amount*amount*(3-2*amount));return
        rot('Chest', 0, -.06 * amount)
        for side, sign in [('Left', 1), ('Right', -1)]:
            rot(side + 'Arm', 0, -.24 * (1 - amount) - .60 * amount if args.seated else -.60 * amount)
            rot(side + 'Arm', 2, -.15 * sign * (1 - amount) - .20 * sign * amount if args.seated else -.20 * sign * amount)
            rot(side + 'ForeArm', 0, -1.0 * (1 - amount) - .45 * amount if args.seated else -.45 * amount)
    clip('TakePizza', list(range(1,26)) if actual_motion else [1, 7, 13, 19, 25], handoff, upper_body)
    if actual_motion:
        actual_motion.apply(25,reach=1)
        palms=[rig.pose.bones[side+'Hand'].head.lerp(rig.pose.bones[side+'Hand'].tail,.4) for side in ['Left','Right']]
        catch.parent=rig;catch.parent_type='OBJECT';catch.parent_bone='';catch.matrix_parent_inverse=Matrix.Identity(4)
        catch.matrix_world=Matrix.Translation((palms[0]+palms[1])/2+Vector((0,0,.045*s)))
    if args.seated:
        # An actual open book remains in the left hand while the right receives
        # the pizza. It is not painted onto the torso or invented by the loader.
        read(1);bpy.context.view_layer.update()
        left = rig.matrix_world @ rig.pose.bones['LeftHand'].tail
        right = rig.matrix_world @ rig.pose.bones['RightHand'].tail
        book = bpy.data.objects.new('JapaneseBook', None);bpy.context.collection.objects.link(book)
        book.location = (left + right) / 2 + Vector((0, -.045*s, .025*s))
        book.rotation_euler.x = math.radians(18)
        paper=bpy.data.materials.new('Warm book paper');paper.diffuse_color=(.83,.79,.64,1)
        ink=bpy.data.materials.new('Japanese black print');ink.diffuse_color=(.02,.018,.015,1)
        for side in [-1,1]:
            bpy.ops.mesh.primitive_cube_add(size=1)
            page=bpy.context.object;page.name='JapaneseBookPages';page.parent=book
            page.location=(side*.086*s,0,0);page.scale=(.17*s,.23*s,.008*s);page.rotation_euler.y=side*.10
            page.data.materials.append(paper)
        fonts=list(Path('/System/Library/Fonts').glob('*角コ*W3.ttc'))
        font=bpy.data.fonts.load(str(fonts[0])) if fonts else None
        if not font:raise RuntimeError('Japanese glyph font is missing; do not replace it with tofu boxes.')
        for text,x,y,size in [('日本語',-.158,.065,.024),('入門',-.155,.025,.022),('こんにちは',.015,.060,.017),('ありがとう',.015,.025,.017),('ピザ',.015,-.015,.020)]:
            curve=bpy.data.curves.new('JapaneseBookText','FONT');curve.body=text;curve.font=font;curve.size=size*s;curve.extrude=.00015*s
            lettering=bpy.data.objects.new('JapaneseBookPrint',curve);bpy.context.collection.objects.link(lettering)
            lettering.parent=book;lettering.location=(x*s,y*s,.012*s);lettering.data.materials.append(ink)
        matrix=book.matrix_world.copy();book.parent=rig;book.parent_type='BONE';book.parent_bone='LeftHand';book.matrix_world=matrix
    for bone in rig.pose.bones: bone.rotation_euler = (0, 0, 0); bone.location = (0, 0, 0)
    scene = bpy.context.scene; scene.name = 'ReviewedCharacterScene'; scene.render.fps = 24
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(args.output), export_format='GLB', export_animations=True,
        export_animation_mode='NLA_TRACKS', export_nla_strips=True, export_force_sampling=False,
        export_skins=True, export_morph=False, export_yup=True, export_apply=False)
    restrict_handoff_channels(args.output, upper_body)
    contract = {'id': args.identity + '-authored-rig-v1', 'sceneName': scene.name, 'requireSkin': True,
        'nodes': {'leftArm': 'LeftArm', 'rightArm': 'RightArm', 'catchPoint': 'PizzaCatch', **({'book':'JapaneseBook'} if args.seated else {})},
        'pose': {'mode': 'handoff-clip', 'clipName': 'TakePizza', 'upperBodyNodes': upper_body},
        'motions': {'required': ['idle', 'walk', 'dance', 'read'], 'clips': {
            'idle': {'clipName': 'Idle'}, 'walk': {'clipName': 'Walk', 'metresPerCycle': actual_motion.metres_per_cycle if actual_motion else .9},
            'dance': {'clipName': 'Dance'}, 'read': {'clipName': 'Read'}}},
        'height': {'min': args.height * .95, 'max': args.height * 1.05}, 'materialTreatment': 'as-authored'}
    args.output.with_suffix('.rig.json').write_text(json.dumps(contract, separators=(',', ':')))
    if actual_landmarks:args.output.with_suffix('.landmarks.json').write_text(json.dumps(actual_landmarks,indent=2))
    args.output.with_suffix('.rig-script.py').write_bytes(Path(__file__).read_bytes())
    metadata = {'identity': args.identity, 'input': str(args.input), 'output': str(args.output),
        'sourceTriangles': source_triangles, 'finalTriangles': sum(len(p.vertices) - 2 for p in body.data.polygons),
        'weighting': method, 'height': args.height, 'yaw': args.yaw, 'seated': args.seated,
        'boneHeat':{'reportedError':heat_error,'preservedValidVertices':preserved_heat,'filledUnboundVertices':len(fallback_vertices),'fallbackField':'continuous actual-rest-bone distances; no hard x/z limb switches'},
        'inputSha256':hashlib.sha256(args.input.read_bytes()).hexdigest(),'outputSha256':hashlib.sha256(args.output.read_bytes()).hexdigest(),
        'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'actualLandmarks':actual_landmarks,'calibratedMotions':args.calibrated_motions,
        'motionProfile':{'path':str(motion_path),'sha256':hashlib.sha256(motion_path.read_bytes()).hexdigest(),'settings':motion} if motion_path else None,
        'gaitMetresPerCycle':actual_motion.metres_per_cycle if actual_motion else .9,'gaitApproval':'UNREVIEWED; inspect real deformed shoes, stance, swing and loop seam; a bound rig is not gait acceptance',
        'rigidFootwearVertices':rigid_footwear_counts,
        'clothProfile':{'path':str(args.cloth_profile),'sha256':hashlib.sha256(args.cloth_profile.read_bytes()).hexdigest(),'settings':cloth,'weightCounts':cloth_counts} if cloth else None,
        'blender': bpy.app.version_string, 'status': 'UNREVIEWED; not a release approval'}
    args.output.with_suffix('.production.json').write_text(json.dumps(metadata, indent=2))
    print('NEW_REVIEW_CANDIDATE ' + json.dumps(metadata))


if __name__ == '__main__':
    build(arguments())
