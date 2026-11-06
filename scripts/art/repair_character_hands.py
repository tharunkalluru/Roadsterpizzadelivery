"""Author new anatomical hands on an existing rig; never overwrite a candidate.

Blender --background INPUT.blend --threads 2 --python THIS.py --
  --contract INPUT.rig.json --output /absolute/NEW.glb

Native Blender geometry/skin authoring, not an appearance approval. Source head,
wardrobe, arm poses, locomotion curves and old evidence remain untouched.
"""
import argparse, hashlib, json, math, statistics, struct, sys
from array import array
from pathlib import Path
import bmesh
import bpy
from mathutils import Matrix, Vector


def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def action_curves(action):
    result=[]
    for layer in getattr(action,'layers',[]):
        for strip in layer.strips:
            for bag in getattr(strip,'channelbags',[]): result.extend(bag.fcurves)
    return result or list(getattr(action,'fcurves',[]))

def action_hash(action):
    return hashlib.sha256(json.dumps([(f.data_path,f.array_index,[(list(p.co),list(p.handle_left),list(p.handle_right),p.interpolation) for p in f.keyframe_points]) for f in action_curves(action)],sort_keys=True).encode()).hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--contract',required=True,type=Path);parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--landmarks',type=Path,help='Optional visually checked native Blender metre-space wrist/elbow JSON')
    parser.add_argument('--skin-region',choices=['hands','bare-forearms'],default='hands',help='Default retains sleeves/forearms; explicit bare-forearms is intended for Pushpa')
    parser.add_argument('--accessories',choices=['none','pushpa'],default='none',help='Role-specific jewelry is explicit; do not put Pushpa costume on every actor')
    parser.add_argument('--hand-width-scale',type=float,default=1,help='Explicit anatomical palm/digit width calibration; preserves existing default')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath)
    if not .65<=args.hand_width_scale<=1.25:raise RuntimeError('Hand width scale must stay within an anatomical calibration range')
    if args.skin_region=='bare-forearms' and args.hand_width_scale!=1:raise RuntimeError('Calibrate slender hands on retained forearms; do not silently scale an entire authored forearm')
    paths=[args.output,args.output.with_suffix('.blend'),args.output.with_suffix('.rig.json'),args.output.with_suffix('.production.json'),args.output.with_suffix('.hand-script.py'),args.output.with_suffix('.landmarks.json')]
    if not source.is_file() or not args.contract.is_file():raise RuntimeError('Source blend and contract required')
    if any(p.exists() for p in paths):raise RuntimeError('Refusing to overwrite a candidate/evidence')
    authored=json.loads(args.landmarks.read_text()) if args.landmarks else {}
    if authored and (authored.get('units')!='metres' or authored.get('space')!='blender-world'):
        raise RuntimeError('Landmarks must explicitly use metres and blender-world coordinates')
    def landmark(side,name):
        value=authored.get(side,{}).get(name)
        if value is not None and (not isinstance(value,list) or len(value)!=3 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in value)):
            raise RuntimeError('Landmark must be a finite xyz triple: '+side+'.'+name)
        return Vector(value) if value is not None else None
    args.output.parent.mkdir(parents=True,exist_ok=True)
    scene=bpy.context.scene;scene.cycles.device='CPU'
    rig=next(o for o in scene.objects if o.type=='ARMATURE')
    if bpy.data.objects.get('LeftAuthoredAnatomicalHand'):
        raise RuntimeError('Apply hand replacement to a fresh source body, not a previous replacement')
    body=next(o for o in scene.objects if o.type=='MESH' and o.vertex_groups.get('LeftHand') and o.vertex_groups.get('RightHand'))
    preserved={name:action_hash(bpy.data.actions[name]) for name in ['Walk','Dance']}
    for track in rig.animation_data.nla_tracks:track.mute=True
    rig.animation_data.action=None
    for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
    scene.frame_set(1);bpy.context.view_layer.update()
    bones={};frames={};skin_meshes=[];removed={};wrist_calibration={};elbow_calibration={};skin_colors={}
    # Image-to-3D anatomy isn't exactly the generic rig scaffold. Recover its
    # actual wrist slice before authoring new palms, rather than creating a
    # detached hand at a nominal joint ten centimetres outside the real arm.
    for side,sign in [('Left',1),('Right',-1)]:
        bone=rig.data.bones[side+'Hand'];z=(rig.matrix_world@bone.head_local).z
        group=body.vertex_groups[side+'Hand'].index
        samples=[body.matrix_world@v.co for v in body.data.vertices
                 if abs((body.matrix_world@v.co).z-z)<.012 and (body.matrix_world@v.co).x*sign>.22
                 and any(g.group==group and g.weight>.15 for g in v.groups)]
        explicit=landmark(side,'wrist')
        if explicit is None and len(samples)<8:raise RuntimeError('Cannot establish an actual source wrist cross-section')
        new=explicit if explicit is not None else sum(samples,Vector())/len(samples);old=rig.matrix_world@bone.head_local
        if (new-old).length>.25:raise RuntimeError('Wrist scaffold mismatch needs separate rig inspection')
        wrist_calibration[side]={'old':list(old),'new':list(new),'samples':len(samples)}
        elbow=rig.data.bones[side+'ForeArm'];ez=(rig.matrix_world@elbow.head_local).z
        egroup=body.vertex_groups[side+'ForeArm'].index
        esamples=[body.matrix_world@v.co for v in body.data.vertices
                  if abs((body.matrix_world@v.co).z-ez)<.012 and (body.matrix_world@v.co).x*sign>.22
                  and any(g.group==egroup and g.weight>.15 for g in v.groups)]
        explicit=landmark(side,'elbow')
        if explicit is None and len(esamples)<8:raise RuntimeError('Cannot establish actual elbow/cuff anatomy')
        elbow_calibration[side]={'old':list(rig.matrix_world@elbow.head_local),'new':list(explicit if explicit is not None else sum(esamples,Vector())/len(esamples)),'samples':len(esamples)}
        texture=next((node.image for material in body.data.materials if material and material.use_nodes
                      for node in material.node_tree.nodes if node.type=='TEX_IMAGE' and node.image),None)
        colors=[]
        if texture and body.data.uv_layers.active:
            width,height=texture.size
            pixels=array('f',[0.0])*(width*height*4)
            texture.pixels.foreach_get(pixels)
            uv=body.data.uv_layers.active.data
            for loop in body.data.loops:
                p=body.matrix_world@body.data.vertices[loop.vertex_index].co
                if .025<p.z-new.z<.095 and p.x*sign>.25 and (p-new).length<.17:
                    sample=uv[loop.index].uv;x=min(width-1,max(0,int(sample.x*width)));y=min(height-1,max(0,int(sample.y*height)))
                    color=pixels[(y*width+x)*4:(y*width+x)*4+3]
                    if color[0]>.12 and .35<color[1]/color[0]<.88 and color[2]<color[1]:colors.append(color)
        override=authored.get('skinSrgb')
        if override is not None and (not isinstance(override,list) or len(override)!=3 or not all(isinstance(v,(int,float)) and math.isfinite(v) and 0<=v<=1 for v in override)):
            raise RuntimeError('Optional skinSrgb must be three bounded finite color values')
        if override is None and len(colors)<10:raise RuntimeError('Need actual source wrist skin samples before choosing a replacement material')
        skin_colors[side]=override or [statistics.median(c[i] for c in colors) for i in range(3)]
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    for side in wrist_calibration:
        hand=rig.data.edit_bones[side+'Hand'];delta=hand.tail-hand.head
        wrist=rig.matrix_world.inverted()@Vector(wrist_calibration[side]['new'])
        hand.head=wrist;hand.tail=wrist+delta
        forearm=rig.data.edit_bones[side+'ForeArm'];forearm.tail=wrist
        actual_elbow=rig.matrix_world.inverted()@Vector(elbow_calibration[side]['new'])
        forearm.head=actual_elbow;rig.data.edit_bones[side+'Arm'].tail=actual_elbow
        twist=rig.data.edit_bones.new(side+'WristTwist')
        twist.head=wrist-(wrist-forearm.head).normalized()*.055;twist.tail=wrist
        twist.parent=forearm;twist.align_roll(Vector((0,1,0)))
        hand.parent=twist;hand.use_connect=False
    bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
    # Anatomical frames: +Y wrist->fingers, +Z palm face, X across the palm.
    for side,sign in [('Left',1),('Right',-1)]:
        bone=rig.data.bones[side+'Hand'];origin=rig.matrix_world@bone.head_local
        along=(rig.matrix_world.to_3x3()@(bone.tail_local-bone.head_local)).normalized()
        normal=Vector((0,1,0));normal=(normal-along*normal.dot(along)).normalized()
        across=along.cross(normal).normalized()
        frame=Matrix((across,along,normal)).transposed().to_4x4();frame.translation=origin
        frames[side]=frame
        group=body.vertex_groups[side+'Hand'].index
        fore_group=body.vertex_groups[side+'ForeArm'].index
        fore=rig.data.bones[side+'ForeArm'];fa=rig.matrix_world@fore.head_local;fb=rig.matrix_world@fore.tail_local;faxis=(fb-fa).normalized()
        # Trim the fused source digits beyond the real wrist. Forearm/cuff,
        # their UVs and all untouched vertex weights stay in the source mesh.
        bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table()
        deform=bm.verts.layers.deform.active
        doomed=[]
        for vertex in bm.verts:
            point=body.matrix_world@vertex.co;delta=point-origin
            cut_origin,cut_axis=(fa,faxis) if args.skin_region=='bare-forearms' else (origin,along)
            advance=(point-cut_origin).dot(cut_axis);radial=(point-cut_origin-cut_axis*advance).length
            # Auto heat may give a piece of a fused finger to ForeArm, so a
            # group threshold alone leaves a hollow claw beside the new hand.
            arm_weight=vertex[deform].get(group,0)+vertex[deform].get(fore_group,0)
            cutoff=authored.get(side,{}).get('cuffAdvance',.010) if args.skin_region=='bare-forearms' else -.003
            if not isinstance(cutoff,(int,float)) or not math.isfinite(cutoff) or not -.02<=cutoff<=.10:raise RuntimeError('Invalid cuffAdvance')
            if advance>cutoff and radial<.105 and point.x*sign>.22 and arm_weight>.15:
                doomed.append(vertex)
        removed[side]=len(doomed);bmesh.ops.delete(bm,geom=doomed,context='VERTS');bm.to_mesh(body.data);bm.free();body.data.update()
        if removed[side]<10:raise RuntimeError('Source hand trim failed; inspect before producing an overlay')
        thumb_sign=-sign
        local_bones={};parts=[]
        def anatomy_point(p):
            p=Vector(p);p.x*=args.hand_width_scale;p.z*=math.sqrt(args.hand_width_scale);return p
        def world(p):return frame@anatomy_point(p)
        def segment(name,a,b,r1,r2):
            a,b=Vector(a),Vector(b);delta=b-a
            bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=r1,radius2=r2,depth=delta.length,location=(a+b)/2)
            obj=bpy.context.object;obj.name=name;obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler();parts.append(obj)
        def ellipsoid(name,center,scale):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=center)
            obj=bpy.context.object;obj.name=name;obj.scale=scale;parts.append(obj)
        # Connected palm/wrist cushion and readable knuckle row.
        ellipsoid(side+' anatomical palm',(0,.028,0),(.038,.034,.016))
        segment(side+' anatomical wrist',(0,-.035,0),(0,.024,0),.030,.026)
        # The old neural forearm/cuff was twisted into a folded shell. Author a
        # continuous bare forearm up to the retained rolled-shirt edge instead
        # of attaching a correct hand to that malformed shell.
        inv_frame=frame.inverted()
        if args.skin_region=='bare-forearms':
            start=inv_frame@(fa-faxis*.040);end=Vector((0,-.025,0))
            points=[start.lerp(end,t) for t in [0,.28,.65,1]]
            radii=[.041,.039,.031,.025]
            for i in range(3):segment(side+' bare forearm '+str(i),points[i],points[i+1],radii[i],radii[i+1])
            ellipsoid(side+' elbow skin transition',points[0],(.041,.041,.041))
        lengths={'Index':[.027,.019,.014],'Middle':[.030,.021,.015],'Ring':[.028,.019,.014],'Pinky':[.022,.016,.012]}
        for digit,offset,radius in [('Index',.031,.0083),('Middle',.0105,.0088),('Ring',-.011,.0083),('Pinky',-.032,.007)]:
            x=thumb_sign*offset;point=Vector((x,.060-abs(offset)*.10,0))
            splay=Vector((x*.18,1,0)).normalized()
            for i,length in enumerate(lengths[digit],1):
                end=point+splay*length
                name=f'{side}{digit}{i}';parent=side+'Hand' if i==1 else f'{side}{digit}{i-1}'
                local_bones[name]=(point.copy(),end.copy(),parent)
                segment(name+' surface',point,end,radius*(1-(i-1)*.13),radius*(1-i*.13))
                ellipsoid(name+' knuckle',point,(radius,radius,radius*.91))
                if i==3:ellipsoid(name+' fingertip',end,(radius*.63,radius*.76,radius*.65))
                point=end
        # Three independently skinned segments give an opposable thumb, not a
        # fifth parallel finger. Its pad turns toward the book's cover edge.
        points=[Vector((thumb_sign*.028,.012,.001)),Vector((thumb_sign*.045,.032,.004)),Vector((thumb_sign*.053,.051,.004)),Vector((thumb_sign*.051,.069,.003))]
        for i in range(1,4):
            name=f'{side}Thumb{i}';parent=side+'Hand' if i==1 else f'{side}Thumb{i-1}'
            local_bones[name]=(points[i-1].copy(),points[i].copy(),parent)
            radius=.0105-(i-1)*.0018
            segment(name+' surface',points[i-1],points[i],radius,radius*.83)
            ellipsoid(name+' joint',points[i-1],(radius,radius,radius))
            if i==3:ellipsoid(name+' pad',points[i],(.008,.010,.007))
        # Fuse primitives in actual 3D. A modest resolution preserves clear
        # digit gaps; no billboard or flat texture substitutes for anatomy.
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts:obj.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();hand=bpy.context.object;hand.name=side+'AuthoredAnatomicalHand'
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        # A 2.4mm voxel union filled the old sub-millimetre finger gaps and
        # created thin webs that wide neutral renders failed to reveal. Actual
        # 3–5mm digit gaps plus a 1.2mm union retain independent bent fingers.
        modifier=hand.modifiers.new('Anatomical union','REMESH');modifier.mode='VOXEL';modifier.voxel_size=.0012;modifier.use_smooth_shade=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        budget=5000 if args.skin_region=='bare-forearms' else 3500
        modifier=hand.modifiers.new('Budget anatomical detail','DECIMATE');modifier.ratio=min(1,budget/max(1,sum(len(p.vertices)-2 for p in hand.data.polygons)));bpy.ops.object.modifier_apply(modifier=modifier.name)
        modifier=hand.modifiers.new('Smooth authored skin surface','SMOOTH');modifier.factor=.65;modifier.iterations=5
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for p in hand.data.polygons:p.use_smooth=True
        # Geometry was authored in its own anatomical coordinates then moved to
        # the actual rest wrist, so the existing armature and skin remain valid.
        for vertex in hand.data.vertices:vertex.co=frame@anatomy_point(hand.matrix_world@vertex.co)
        hand.matrix_world=Matrix.Identity(4)
        skin=bpy.data.materials.new(side+' authored warm skin');skin.use_nodes=True
        def linear(value):return value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4
        common_skin=[sum(skin_colors[s][i] for s in skin_colors)/len(skin_colors) for i in range(3)]
        principled=skin.node_tree.nodes['Principled BSDF'];principled.inputs['Base Color'].default_value=(*[linear(v) for v in common_skin],1);principled.inputs['Roughness'].default_value=.64
        if 'Subsurface Weight' in principled.inputs:principled.inputs['Subsurface Weight'].default_value=.04
        hand.data.materials.clear();hand.data.materials.append(skin)
        bones.update({name:(world(a),world(b),parent) for name,(a,b,parent) in local_bones.items()})
        skin_meshes.append((side,hand,local_bones))
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    for name,(a,b,parent) in bones.items():
        bnew=rig.data.edit_bones.new(name);bnew.head=rig.matrix_world.inverted()@a;bnew.tail=rig.matrix_world.inverted()@b;bnew.parent=rig.data.edit_bones[parent];bnew.use_connect=False
        # Curl about local X around the across-palm direction.
        bnew.align_roll((rig.matrix_world.inverted().to_3x3()@frames[name[:4] if name.startswith('Left') else 'Right'].to_3x3()@Vector((0,0,1))).normalized())
    bpy.ops.object.mode_set(mode='OBJECT')
    def distance(point,a,b):
        d=b-a;t=max(0,min(1,(point-a).dot(d)/d.length_squared));return (point-(a+d*t)).length
    for side,hand,local in skin_meshes:
        names=[bone.name for bone in rig.data.bones]
        groups={n:hand.vertex_groups.new(name=n) for n in names}
        segments={n:(rig.matrix_world@rig.data.bones[n].head_local,rig.matrix_world@rig.data.bones[n].tail_local) for n in names}
        skin_supports={n:segments[n] for n in [side+'WristTwist',side+'Hand',*local]}
        hand_origin=rig.matrix_world@rig.data.bones[side+'Hand'].head_local
        hand_axis=(rig.matrix_world.to_3x3()@(rig.data.bones[side+'Hand'].tail_local-rig.data.bones[side+'Hand'].head_local)).normalized()
        skin_supports[side+'Hand']=(hand_origin,hand_origin+hand_axis*.045)
        inv=frames[side].inverted()
        a,b=segments[side+'ForeArm'];forearm=b-a
        for vertex in hand.data.vertices:
            p=vertex.co;anatomic=inv@p
            if args.skin_region=='bare-forearms' and anatomic.y<-.014:
                t=(p-a).dot(forearm)/forearm.length_squared
                if t<.12:
                    mix=max(0,min(1,(t+.18)/.30))
                    groups[side+'Arm'].add([vertex.index],1-mix,'REPLACE')
                    groups[side+'ForeArm'].add([vertex.index],mix,'REPLACE')
                    continue
                amount=max(0,min(1,(t-.50)/.45))
                groups[side+'ForeArm'].add([vertex.index],1-amount,'REPLACE')
                groups[side+'WristTwist'].add([vertex.index],amount,'REPLACE')
                continue
            # Continuous local skin supports are essential at the thumb/palm
            # web. A categorical closest-digit selector made neighbouring2mm
            # vertices jump between Hand and Thumb1, stretching a bent web10x.
            # The actual palm support is45mm; the legacy Hand joint's long
            # rest bone must not claim the middle fingertip. This exact smooth
            # field was independently stress-tested in the deep neck grip.
            weights=sorted([(n,1/(distance(p,*support)**2+.005**2)**2) for n,support in skin_supports.items()],key=lambda item:item[1],reverse=True)[:4]
            total=sum(w for n,w in weights)
            for n,w in weights:groups[n].add([vertex.index],w/total,'REPLACE')
        mod=hand.modifiers.new('Real finger skin','ARMATURE');mod.object=rig
        hand.parent=rig;hand.matrix_parent_inverse=rig.matrix_world.inverted()
    # Rebuild the removed projected jewelry as modest real 3D accessories.
    # These are costume drafts, not new film-reference or appearance approvals.
    def material(name,color,metal=0,rough=.5):
        mat=bpy.data.materials.new(name);mat.use_nodes=True;p=mat.node_tree.nodes['Principled BSDF']
        p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
        return mat
    gold=material('Authored warm gold jewelry',(.55,.32,.09),.82,.3)
    black=material('Authored watch strap and dial',(.018,.013,.01),.15,.46)
    nail=material('Authored subtle nail plates',(.46,.25,.17),0,.44)
    accessories=[]
    def attach(obj,bone,mat):
        obj.data.materials.append(mat);bpy.context.view_layer.update();world=obj.matrix_world.copy()
        obj.parent=rig;obj.parent_type='BONE';obj.parent_bone=bone;bpy.context.view_layer.update();obj.matrix_world=world
        for p in obj.data.polygons:p.use_smooth=True
        accessories.append(obj.name)
    for side in ['Left','Right']:
        fore=rig.data.bones[side+'ForeArm'];axis=(fore.tail_local-fore.head_local).normalized();normal=Vector((0,1,0));normal=(normal-axis*normal.dot(axis)).normalized()
        center=fore.tail_local-axis*.030
        if args.accessories=='pushpa':
            bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=center,major_radius=.028,minor_radius=.0035 if side=='Left' else .0026)
            obj=bpy.context.object;obj.name=side+'AuthoredWatchBand' if side=='Left' else side+'AuthoredGoldBangle';obj.rotation_euler=axis.to_track_quat('Z','Y').to_euler();attach(obj,side+'WristTwist',black if side=='Left' else gold)
        if side=='Left' and args.accessories=='pushpa':
            frame=Matrix((axis.cross(normal).normalized(),axis,normal)).transposed().to_4x4();frame.translation=center-normal*.029
            for label,dimensions,depth,mat in [('GoldWatchCase',(.033,.031,.010),0,gold),('DarkWatchFace',(.026,.024,.011),-.004,black)]:
                bpy.ops.mesh.primitive_cube_add(size=1);obj=bpy.context.object;obj.name=side+label;obj.matrix_world=frame.copy();obj.location-=normal*(-depth);obj.dimensions=dimensions
                bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);attach(obj,side+'WristTwist',mat)
        for digit in ['Index','Middle','Ring','Pinky','Thumb']:
            bone=rig.data.bones[f'{side}{digit}3'];axis=(bone.tail_local-bone.head_local).normalized();palm=frames[side].to_3x3()@Vector((0,0,1));center=bone.head_local.lerp(bone.tail_local,.52)-palm*.0057
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,location=center);obj=bpy.context.object;obj.name=side+digit+'NailPlate';obj.scale=(.0047,.0065,.00065)
            obj.rotation_euler=Matrix((axis.cross(palm).normalized(),axis,palm)).transposed().to_quaternion().to_euler();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);attach(obj,bone.name,nail)
    if args.accessories=='pushpa':
        bone=rig.data.bones['RightMiddle1'];axis=(bone.tail_local-bone.head_local).normalized()
        bpy.ops.mesh.primitive_torus_add(major_segments=16,minor_segments=6,major_radius=.009,minor_radius=.0013,location=bone.head_local.lerp(bone.tail_local,.45))
        obj=bpy.context.object;obj.name='RightAuthoredGoldFingerRing';obj.rotation_euler=axis.to_track_quat('Z','Y').to_euler();attach(obj,bone.name,gold)
    for p in rig.pose.bones:p.rotation_mode='XYZ'
    finger_names=list(bones)
    for action_name in ['Idle','Read','TakePizza','ReaderHandoffPreview']:
        action=bpy.data.actions.get(action_name)
        if not action:continue
        rig.animation_data.action=action
        if action.slots:rig.animation_data.action_slot=action.slots[0]
        frames_to_key=range(1,26,2) if action_name in ['TakePizza','ReaderHandoffPreview'] else range(1,50,3)
        for f in frames_to_key:
            scene.frame_set(f);t=(f-1)/24 if action_name in ['TakePizza','ReaderHandoffPreview'] else 0;t=t*t*(3-2*t)
            for name in finger_names:
                if action_name=='TakePizza' and name.startswith('Left'):continue
                p=rig.pose.bones[name];digit=name[4:] if name.startswith('Left') else name[5:];i=int(name[-1])
                # Relaxed pages grip, then right fingers open to support pizza.
                curl=([.10,.28,.18][i-1] if digit.startswith('Thumb') else [-.02,-.06,-.05][i-1])
                if name.startswith('Right'):curl=curl*(1-t)+[.03,.05,.035][i-1]*t
                p.rotation_euler=(curl,0,0);p.keyframe_insert(data_path='rotation_euler',frame=f,group=name)
        rig.animation_data.action=None
    after={name:action_hash(bpy.data.actions[name]) for name in preserved}
    if after!=preserved:raise RuntimeError('Original locomotion curves changed')
    contract=json.loads(args.contract.read_text());contract['id']+='-anatomical-hands-v1'
    mask=contract['pose']['upperBodyNodes'];mask.extend(n for n in finger_names if n.startswith('Right'))
    mask.append('RightWristTwist')
    rig.animation_data.action=None
    for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(1,1,1)
    for track in rig.animation_data.nla_tracks:track.mute=True
    scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False)
    data=args.output.read_bytes();size=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+size])
    for a in gltf.get('animations',[]):
        if a.get('name')=='TakePizza':a['channels']=[c for c in a['channels'] if gltf['nodes'][c['target']['node']].get('name') in mask]
    encoded=json.dumps(gltf,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=data[20+size:]
    args.output.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+tail)
    args.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2))
    landmarks={'units':'metres','space':'blender-world','status':'PRODUCER LANDMARKS; require visual anatomy validation','sourceBlendSha256':sha(source),**{side:{'wrist':wrist_calibration[side]['new'],'elbow':elbow_calibration[side]['new'],'cuffAdvance':authored.get(side,{}).get('cuffAdvance',.010)} for side in ['Left','Right']}}
    args.output.with_suffix('.landmarks.json').write_text(json.dumps(landmarks,indent=2))
    report={'status':'UNREVIEWED; native anatomy/skin authoring is not likeness or scene acceptance','input':str(source),'inputSha256':sha(source),'sourceContractSha256':sha(args.contract),'outputSha256':sha(args.output),'scriptSha256':sha(Path(__file__)),'skinRegion':args.skin_region,'producerArguments':sys.argv[sys.argv.index('--')+1:],'handWidthScale':args.hand_width_scale,'digitTopology':{'voxelUnionMetres':.0012,'nominalAdjacentDigitClearanceBeforeUnionMetres':[v*args.hand_width_scale for v in [.0034,.0044,.0057]],'skinWeights':'continuous same-hand rest-segment support; actual45mm palm,5mm regularization,4 strongest influences; stress-tested draft still requires visual review'},'wristRestCalibration':wrist_calibration,'elbowRestCalibration':elbow_calibration,'skinColorsSrgb':skin_colors,'skinColourSource':'explicit authored landmark override' if authored.get('skinSrgb') is not None else 'median of actual wrist texture samples','sourceTextureSampledSkinSrgb':skin_colors if authored.get('skinSrgb') is None else None,'removedFusedHandVertices':removed,'newFingerBones':finger_names,'nativeAnatomyAccessories':accessories,'preservedWalkDance':after,'handMeshes':[{'name':h.name,'triangles':sum(len(p.vertices)-2 for p in h.data.polygons)} for s,h,b in skin_meshes],'catchAnchorRequiresSceneUndersideAlignment':True}
    args.output.with_suffix('.production.json').write_text(json.dumps(report,indent=2));args.output.with_suffix('.hand-script.py').write_bytes(Path(__file__).read_bytes());print('HAND_CANDIDATE '+json.dumps(report))

if __name__=='__main__':main()
