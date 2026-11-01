"""CPU-only reader-pose authoring for a NEW, independently reviewed candidate.

Blender --background INPUT.blend --threads 2 --python THIS.py --
  --contract INPUT.rig.json --output /absolute/NEW.glb

Uses analytic two-bone IK in Blender armature space, then bakes the result to
the existing real skin. It does not alter source geometry, weights or textures.
No source file is overwritten. An exported pose is not an appearance approval.
"""
import argparse
import hashlib
import json
import math
import runpy
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree


RIGHT = ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def curves(action):
    if hasattr(action, 'layers'):
        result = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    result.extend(bag.fcurves)
        if result:
            return result
    return list(getattr(action, 'fcurves', []))


def action_digest(action):
    data = [(fc.data_path, fc.array_index, [(list(k.co), list(k.handle_left),
             list(k.handle_right), k.interpolation) for k in fc.keyframe_points])
            for fc in curves(action)]
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def author_handoff_glance(args, source, rig):
    """Add only a natural Head/Neck handoff glance to already reviewed poses."""
    scene=bpy.context.scene
    preserved={name:action_digest(bpy.data.actions[name]) for name in ['Idle','Read','Walk','Dance']}
    read=bpy.data.actions['Read'];samples={};old_matrices={}
    for track in rig.animation_data.nla_tracks:track.mute=True
    def activate(action):
        rig.animation_data.action=action
        if action.slots:rig.animation_data.action_slot=action.slots[0]
    activate(read)
    for frame in range(1,26):
        scene.frame_set(frame);bpy.context.view_layer.update()
        samples[frame]={name:rig.pose.bones[name].rotation_euler.copy() for name in ['Head','Neck']}
    preview=bpy.data.actions.get('ReaderHandoffPreview')
    if not preview:raise RuntimeError('Exact reviewed full-body handoff preview is required; do not rebuild reviewed arms/legs')
    activate(preview)
    for frame in [1,13,25]:
        scene.frame_set(frame);bpy.context.view_layer.update()
        old_matrices[frame]={name:rig.pose.bones[name].matrix.copy() for name in ['Hips','Chest','LeftHand','RightHand']}
    for action_name in ['TakePizza','ReaderHandoffPreview']:
        old=bpy.data.actions[action_name];new=old.copy();old.name='UnmodifiedSource_'+action_name;old.use_fake_user=True;new.name=action_name;new.use_fake_user=True
        if action_name=='TakePizza':
            for track in list(rig.animation_data.nla_tracks):
                if track.name=='TakePizza':rig.animation_data.nla_tracks.remove(track)
        activate(new)
        for frame in range(1,26):
            scene.frame_set(frame);amount=(frame-1)/24;amount=amount*amount*(3-2*amount)
            for name,target in [('Head',0.0),('Neck',-.02)]:
                rotation=samples[frame][name].copy();rotation.x=rotation.x*(1-amount)+target*amount
                bone=rig.pose.bones[name];bone.rotation_mode='XYZ';bone.rotation_euler=rotation
                bone.keyframe_insert(data_path='rotation_euler',frame=frame,group=name)
        if action_name=='TakePizza':
            track=rig.animation_data.nla_tracks.new();track.name='TakePizza';strip=track.strips.new('TakePizza',1,new);strip.action_frame_start=1;strip.action_frame_end=25;track.mute=True
    activate(bpy.data.actions['ReaderHandoffPreview']);delta=0
    for frame in [1,13,25]:
        scene.frame_set(frame);bpy.context.view_layer.update()
        for name,old in old_matrices[frame].items():delta=max(delta,max(abs(rig.pose.bones[name].matrix[i][j]-old[i][j]) for i in range(4) for j in range(4)))
    after={name:action_digest(bpy.data.actions[name]) for name in preserved}
    if after!=preserved or delta>1e-6:raise RuntimeError('Handoff glance changed reviewed non-head motion')
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0);bone.scale=(1,1,1)
    scene.frame_set(1);bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False)
    contract=json.loads(args.contract.read_text());mask=list(dict.fromkeys([*contract['pose']['upperBodyNodes'],'Neck','Head']))
    contract['id']+='-handoff-glance-v1';contract['pose']['upperBodyNodes']=mask
    helper=runpy.run_path(str(Path(__file__).with_name('rig_character.py')),run_name='rig_helper');helper['restrict_handoff_channels'](args.output,mask)
    args.output.with_suffix('.rig.json').write_text(json.dumps(contract,indent=2));args.output.with_suffix('.pose-script.py').write_bytes(Path(__file__).read_bytes())
    args.output.with_suffix('.production.json').write_text(json.dumps({'status':'UNREVIEWED handoff glance only; actual focused face and container-camera capture required','sourceBlend':str(source),'sourceBlendSha256':digest(source),'sourceContractSha256':digest(args.contract),'outputGlbSha256':digest(args.output),'producerScriptSha256':digest(Path(__file__)),'producerArguments':sys.argv[sys.argv.index('--')+1:],'unchangedActionDigests':after,'maximumNonHeadJointMatrixDelta':delta,'headLocalPitchEnd':0,'neckLocalPitchEnd':-.02,'durationSeconds':1,'mask':mask,'limits':'Exact original reader mesh/materials/book and limb motions retained. No new likeness approval or player/camera timing change.'},indent=2))
    print('NEW_READER_HANDOFF_GLANCE '+str(args.output))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--contract', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--handoff-look-up-only',action='store_true',help='Preserve reviewed Read/Idle/arms/book, add only a natural head/neck glance during the existing handoff')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source = Path(bpy.data.filepath)
    if not source.is_file() or not args.contract.is_file():
        raise RuntimeError('An existing source blend and rig contract are required.')
    outputs = [args.output, args.output.with_suffix('.blend'),
               args.output.with_suffix('.rig.json'), args.output.with_suffix('.production.json'),
               args.output.with_suffix('.pose-script.py')]
    if any(path.exists() for path in outputs):
        raise RuntimeError('Refusing to overwrite a previous candidate or its evidence.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.cycles.device = 'CPU'
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    if args.handoff_look_up_only:
        author_handoff_glance(args,source,rig);return
    # Optional authored digit geometry has real skin joints. Include right
    # fingers in the handoff mask while the left grip continues reading.
    fingers=[bone.name for bone in rig.data.bones
             if any(digit in bone.name for digit in ['Index','Middle','Ring','Pinky','Thumb'])]
    RIGHT.extend(name for name in fingers if name.startswith('Right'))
    if rig.data.bones.get('RightWristTwist'):RIGHT.append('RightWristTwist')
    book = bpy.data.objects['JapaneseBook']
    catch = bpy.data.objects['PizzaCatch']
    rig.animation_data_create()
    preserved = {name: action_digest(bpy.data.actions[name]) for name in ['Walk', 'Dance']}
    for track in list(rig.animation_data.nla_tracks):
        track.mute = True
        if track.name in ['Read', 'Idle', 'TakePizza']:
            rig.animation_data.nla_tracks.remove(track)
    rig.animation_data.action = None
    for name in ['Read', 'Idle', 'TakePizza', 'ReaderHandoffPreview']:
        old = bpy.data.actions.get(name)
        if old:
            old.name = 'UnmodifiedSource_' + name
            old.use_fake_user = True
    for p in rig.pose.bones:
        # Existing Walk/Dance are Euler actions. Changing this global bone mode
        # would silently disable those clips, even with their keyframes intact.
        p.rotation_mode = 'XYZ'

    rest = {bone.name: bone.matrix_local.copy() for bone in rig.data.bones}
    inv_world = rig.matrix_world.inverted()
    point = lambda xyz: inv_world @ Vector(xyz)
    direction = lambda xyz: (inv_world.to_3x3() @ Vector(xyz)).normalized()
    floor_shift = {'Left': 0.0, 'Right': 0.0}
    grip_shift = {'Left': Vector(), 'Right': Vector()}
    # The reader is behind the book (+Y), so its printed top faces toward him.
    # Turning the local page layout also keeps the text upright from his side.
    book_world = (Matrix.Translation((0.0, -.35, 1.02))
                  @ Matrix.Rotation(math.radians(-18), 4, 'X')
                  @ Matrix.Rotation(math.pi, 4, 'Z'))
    book_normal = (inv_world.to_3x3() @ book_world.to_3x3() @ Vector((0, 0, 1))).normalized()

    def pose(frame=1, reach=0.0):
        explicit = {}

        def fk(name):
            if name in explicit:
                return explicit[name]
            parent = rig.data.bones[name].parent
            return (fk(parent.name) @ rest[parent.name].inverted() @ rest[name]
                    if parent else rest[name].copy())

        def tilt(name, angle):
            m = fk(name)
            rotation = Quaternion(direction((1, 0, 0)), angle).to_matrix()
            explicit[name] = (rotation @ m.to_3x3()).to_4x4()
            explicit[name].translation = m.translation

        phase = (frame - 1) / 48 * math.tau
        explicit['Hips'] = rest['Hips'].copy()
        explicit['Hips'].translation = point((0, 0, .58))
        tilt('Spine', .015)
        tilt('Chest', .025 + .003 * math.sin(phase))
        tilt('Neck', .055)
        tilt('Head', .32 + .008 * math.sin(phase))

        def orient(name, head, tail, palm=None, palm_weight=1.0):
            base = fk(name).to_3x3()
            y = (tail - head).normalized()
            rotation = (base @ Vector((0, 1, 0))).rotation_difference(y).to_matrix() @ base
            if palm is not None:
                local_palm = rest[name].to_3x3().inverted() @ direction((0, 1, 0))
                current = rotation @ local_palm
                current = (current - y * current.dot(y)).normalized()
                desired = (palm - y * palm.dot(y)).normalized()
                twist = math.atan2(y.dot(current.cross(desired)), current.dot(desired))
                rotation = Quaternion(y, twist * palm_weight).to_matrix() @ rotation
            result = rotation.to_4x4()
            result.translation = head
            explicit[name] = result

        def limb(first, second, target, pole, palm=None):
            origin = fk(first).translation
            l1, l2 = rig.data.bones[first].length, rig.data.bones[second].length
            delta = target - origin
            distance = max(abs(l1 - l2) + .001, min(delta.length, l1 + l2 - .001))
            along = delta.normalized()
            toward = pole - origin
            toward = (toward - along * toward.dot(along)).normalized()
            advance = (l1*l1 - l2*l2 + distance*distance) / (2*distance)
            bend = math.sqrt(max(0.0, l1*l1 - advance*advance))
            elbow = origin + along * advance + toward * bend
            actual_target = origin + along * distance
            # Divide axial presentation through the whole real chain. A full
            # twist on one joint creates a candy-wrapper pinch under glTF LBS.
            orient(first, origin, elbow, palm, .33)
            orient(second, elbow, actual_target, palm, .50)
            return actual_target

        for side, sign in [('Left', 1), ('Right', -1)]:
            ankle = point((sign*.14, -.42, .13 + floor_shift[side]))
            actual = limb(side+'Thigh', side+'Shin', ankle, point((sign*.16, -.9, .61)))
            toe = actual + direction((0, -.18, -.06)) * rig.data.bones[side+'Foot'].length
            orient(side+'Foot', actual, toe)
            wrist = Vector((sign*.185, -.305, 1.0))
            finger_direction = Vector((-sign*.055, -.080, .012)).normalized()
            normal = book_normal
            if side == 'Right':
                wrist = wrist.lerp(Vector((-.42, -.43, 1.06)), reach)
                finger_direction = finger_direction.lerp(Vector((.035, -.10, .01)).normalized(), reach).normalized()
                normal = book_normal.lerp(direction((0, 0, 1)), reach).normalized()
            wrist += grip_shift[side] * (1-reach if side == 'Right' else 1)
            wrist = limb(side+'Arm', side+'ForeArm', point(wrist),
                         point((sign*.30, -.1, .72)), normal)
            if side+'WristTwist' in rest:
                twist_head=fk(side+'WristTwist').translation
                orient(side+'WristTwist',twist_head,wrist,normal,.75)
            finger = wrist + direction(finger_direction) * rig.data.bones[side+'Hand'].length
            orient(side+'Hand', wrist, finger, normal)

        for name in fingers:
            i=int(name[-1]);thumb='Thumb' in name
            curl=([.10,.28,.18][i-1] if thumb else [-.02,-.06,-.05][i-1])
            if name.startswith('Right'):
                curl=curl*(1-reach)+[.03,.05,.035][i-1]*reach
            m=fk(name)
            rotation=m.to_3x3() @ Matrix.Rotation(curl,3,'X')
            explicit[name]=rotation.to_4x4();explicit[name].translation=m.translation

        result = {name: fk(name) for name in rest}
        for name, matrix in result.items():
            p = rig.pose.bones[name]
            parent = p.bone.parent
            kwargs = {'parent_matrix': result[parent.name], 'parent_matrix_local': rest[parent.name]} if parent else {}
            basis = p.bone.convert_local_to_pose(matrix, rest[name], invert=True, **kwargs)
            p.location = basis.to_translation()
            p.rotation_euler = basis.to_euler('XYZ', p.rotation_euler.copy())
            p.scale = (1, 1, 1)
        bpy.context.view_layer.update()
        return result

    def weighted_vertices(name, minimum=.3):
        deps = bpy.context.evaluated_depsgraph_get()
        result = []
        for obj in scene.objects:
            if obj.type != 'MESH' or not obj.vertex_groups.get(name):
                continue
            group = obj.vertex_groups[name].index
            evaluated = obj.evaluated_get(deps)
            for vertex in obj.data.vertices:
                if any(item.group == group and item.weight >= minimum for item in vertex.groups):
                    result.append(evaluated.matrix_world @ evaluated.data.vertices[vertex.index].co)
        return result

    pose()

    def book_bvh():
        deps = bpy.context.evaluated_depsgraph_get()
        verts, polygons = [], []
        for child in book.children_recursive:
            if child.type != 'MESH':
                continue
            mesh = child.evaluated_get(deps)
            offset = len(verts)
            verts.extend(mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices)
            polygons.extend([offset+i for i in polygon.vertices] for polygon in mesh.data.polygons)
        return BVHTree.FromPolygons(verts, polygons)

    # Calibrate the actual skinned hand surfaces, not merely their joint heads.
    # Keep the book detached/fixed during solving, then attach it to the achieved
    # left-hand pose. Otherwise the object would move away with each correction.
    book.parent = None
    book.matrix_parent_inverse = Matrix.Identity(4)
    book.matrix_world = book_world
    bpy.context.view_layer.update()
    for iteration in range(6):
        pose()
        bvh = book_bvh()
        for side in grip_shift:
            nearest = [(bvh.find_nearest(v), v) for v in weighted_vertices(side+'Hand')]
            hit, vertex = min(nearest, key=lambda pair: pair[0][3])
            if hit[3] > .002:
                grip_shift[side] += (hit[0] - vertex) * .85
    pose()
    for side in floor_shift:
        vertices = weighted_vertices(side+'Foot')
        if not vertices:
            raise RuntimeError('No weighted foot vertices; do not invent a floor calibration.')
        # Current truck floor is -.02 in actor coordinates; a 2mm clearance
        # avoids z-fighting without the old visibly floating 4cm shoe gap.
        shift = -.018 - min(vertex.z for vertex in vertices)
        if abs(shift) > .20:
            raise RuntimeError('Foot binding needs inspection before applying a large correction.')
        floor_shift[side] = shift
    pose()

    def bone_parent_keep_world(obj, bone, matrix):
        obj.parent = None
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_world = matrix.copy()
        bpy.context.view_layer.update()
        before = obj.matrix_world.copy()
        obj.parent = rig
        obj.parent_type = 'BONE'
        obj.parent_bone = bone
        bpy.context.view_layer.update()
        obj.matrix_world = before
        bpy.context.view_layer.update()
        error = max(abs(obj.matrix_world[i][j]-before[i][j]) for i in range(4) for j in range(4))
        if error > 1e-5:
            raise RuntimeError('Bone-parent operation changed the desired world transform.')
        return error

    book_parent_error = bone_parent_keep_world(book, 'LeftHand', book_world)
    for obj in book.children_recursive:
        if obj.type == 'FONT':
            obj.data.extrude = 0
            obj.data.bevel_depth = 0
            obj.data.resolution_u = 2
            obj.data.bevel_resolution = 0
    wrist = rig.matrix_world @ rig.pose.bones['RightHand'].head
    fingertip = rig.matrix_world @ rig.pose.bones['RightHand'].tail
    catch_matrix = Matrix.Translation(wrist.lerp(fingertip, .55) + Vector((0, 0, .025)))
    authored_hand=bpy.data.objects.get('RightAuthoredAnatomicalHand')
    if authored_hand:
        pose(25,1)
        bone=rig.data.bones['RightHand']
        along=(rig.matrix_world.to_3x3()@(bone.tail_local-bone.head_local)).normalized()
        normal=Vector((0,1,0));normal=(normal-along*normal.dot(along)).normalized()
        origin=rig.matrix_world@bone.head_local
        across=along.cross(normal).normalized()
        deps=bpy.context.evaluated_depsgraph_get();evaluated=authored_hand.evaluated_get(deps)
        palm=[]
        for vertex in authored_hand.data.vertices:
            delta=authored_hand.matrix_world@vertex.co-origin
            if abs(delta.dot(across))<.015 and .024<delta.dot(along)<.043 and delta.dot(normal)>.008:
                palm.append(evaluated.matrix_world@evaluated.data.vertices[vertex.index].co)
        if not palm:raise RuntimeError('Authored palm surface is missing; cannot invent a catch point')
        center=sum(palm,Vector())/len(palm)
        catch_matrix=Matrix.Translation(center+Vector((0,0,.035)))
    catch_parent_error = bone_parent_keep_world(catch, 'RightHand', catch_matrix)
    pose()

    def bake(name, frames, reach=False, only=None, track=True):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        for frame in frames:
            scene.frame_set(frame)
            amount = ((frame-1)/24) if reach else 0
            # Smooth approach, continuous displacement; no clock resets.
            amount = amount*amount*(3-2*amount)
            pose(frame, amount)
            for p in rig.pose.bones:
                if only and p.name not in only:
                    continue
                p.keyframe_insert(data_path='rotation_euler', frame=frame, group=p.name)
                if p.name == 'Hips':
                    p.keyframe_insert(data_path='location', frame=frame, group=p.name)
        rig.animation_data.action = None
        if track:
            nla = rig.animation_data.nla_tracks.new()
            nla.name = name
            strip = nla.strips.new(name, 1, action)
            strip.action_frame_start = min(frames)
            strip.action_frame_end = max(frames)
            nla.mute = True
        return action

    bake('Idle', range(1, 50, 3))
    bake('Read', range(1, 50, 3))
    bake('TakePizza', range(1, 26, 2), reach=True, only=RIGHT)
    # Inspection helper only: the actual upper-body handoff layered on the
    # advancing reading pose. It has no NLA strip and is not shipped as a clip.
    bake('ReaderHandoffPreview', range(1, 26, 2), reach=True, track=False)

    def metrics(action_name, frame):
        rig.animation_data.action = bpy.data.actions[action_name]
        if rig.animation_data.action.slots:
            rig.animation_data.action_slot = rig.animation_data.action.slots[0]
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        bvh = book_bvh()
        contact = {}
        for side in ['Left', 'Right']:
            points = weighted_vertices(side+'Hand')
            distances = [bvh.find_nearest(v)[3] for v in points]
            contact[side] = {'weightedHandToPageMinMeters': min(distances) if distances else None,
                             'wristWorld': list(rig.matrix_world @ rig.pose.bones[side+'Hand'].head),
                             'fingertipWorld': list(rig.matrix_world @ rig.pose.bones[side+'Hand'].tail),
                             'footMinZ': min(v.z for v in weighted_vertices(side+'Foot'))}
        return {'action': action_name, 'frame': frame, 'bookCenterWorld': list(book.matrix_world.translation),
                'hipJointWorld': list(rig.matrix_world @ rig.pose.bones['Hips'].head),
                'catchWorld': list(catch.matrix_world.translation), 'contacts': contact}

    evidence = [metrics('Read', f) for f in [1, 25, 49]]
    evidence += [metrics('ReaderHandoffPreview', f) for f in [1, 13, 25]]
    rig.animation_data.action = None
    for p in rig.pose.bones:
        p.location = (0, 0, 0)
        p.rotation_euler = (0, 0, 0)
        p.scale = (1, 1, 1)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    after = {name: action_digest(bpy.data.actions[name]) for name in preserved}
    if after != preserved:
        raise RuntimeError('A locomotion action changed; do not export.')
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(args.output), export_format='GLB',
        export_animations=True, export_animation_mode='NLA_TRACKS', export_nla_strips=True,
        export_force_sampling=False, export_skins=True, export_morph=False,
        export_yup=True, export_apply=False)

    data = args.output.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    model = json.loads(data[20:20+size])
    for animation in model.get('animations', []):
        if animation.get('name') == 'TakePizza':
            animation['channels'] = [c for c in animation['channels']
                if model['nodes'][c['target']['node']].get('name') in RIGHT]
    names = [a['name'] for a in model.get('animations', [])]
    if set(names) != {'Idle', 'Read', 'Walk', 'Dance', 'TakePizza'}:
        raise RuntimeError('Unexpected exported clip set: '+str(names))
    encoded = json.dumps(model, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = data[20+size:]
    args.output.write_bytes(struct.pack('<III', 0x46546C67, 2, 20+len(encoded)+len(tail))
        + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
    contract = json.loads(args.contract.read_text())
    contract['id'] += '-ik-book-grip-v2'
    contract['pose']['upperBodyNodes'] = RIGHT
    args.output.with_suffix('.rig.json').write_text(json.dumps(contract, separators=(',', ':')))
    report = {'inputBlend': str(source), 'inputBlendSha256': digest(source),
        'inputContractSha256': digest(args.contract), 'outputGlb': str(args.output),
        'outputGlbSha256': digest(args.output), 'scriptSha256': digest(Path(__file__)),
        'method': 'Analytic two-bone IK baked to existing Euler skin channels; world-space grip targets; no mesh/material/weight edits',
        'bookParentWorldMatrixError': book_parent_error, 'catchParentWorldMatrixError': catch_parent_error,
        'footCalibrationMeters': floor_shift, 'unchangedLocomotionActionDigests': after,
        'handGripCalibrationWorldMeters': {side: list(shift) for side, shift in grip_shift.items()},
        'exportedClips': names, 'handoffUpperBodyNodes': RIGHT,
        'inspectionOnlyAction': 'ReaderHandoffPreview', 'evidence': evidence,
        'status': 'UNREVIEWED; numeric contacts and successful export do not grant visual approval'}
    args.output.with_suffix('.production.json').write_text(json.dumps(report, indent=2))
    args.output.with_suffix('.pose-script.py').write_bytes(Path(__file__).read_bytes())
    print('READER_POSE_CANDIDATE '+json.dumps(report))


if __name__ == '__main__':
    main()
