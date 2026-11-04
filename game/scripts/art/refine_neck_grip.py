"""Author an Idle-only fixed neck grip on a NEW Devara rig candidate.

CPU Blender --background SOURCE.blend --threads 2 --python THIS.py --
  --contract SOURCE.rig.json --output /absolute/NEW.glb

Only existing bones are posed; measured costume/inner-sleeve masks repair wrong
arm weights in the NEW candidate. The two isolated neural hand-trim fragments
are removed; the actual anatomical hands, authored UVs and materials stay intact.
A separate diagnostic blend includes a neck/skull/rib proxy; it is
never exported with the actor. Numeric contacts are not a likeness approval.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--contract', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--preserve-upper-skin', action='store_true', help='For a fresh heat-preserved source: retain all existing upper-body skin weights; only pin lower costume leakage')
    parser.add_argument('--smooth-hand-skin', action='store_true', help='Repair hard palm/thumb/finger weight boundaries on the existing real hand geometry')
    parser.add_argument('--hand-stagger', type=float, default=.0045, help='Opposing wrist vertical offset in metres; tune against actual hand meshes, not joints alone')
    parser.add_argument('--left-grip-yaw', type=float, default=0, help='Asymmetric left grip rotation around the neck axis in radians')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not math.isfinite(args.hand_stagger) or not 0 <= args.hand_stagger <= .015:
        raise RuntimeError('Hand stagger must be finite and between zero and fifteen millimetres.')
    if not math.isfinite(args.left_grip_yaw) or abs(args.left_grip_yaw) > .35:
        raise RuntimeError('Left grip yaw must be finite and within .35 radians.')
    source = Path(bpy.data.filepath)
    outputs = [args.output, args.output.with_suffix('.blend'), args.output.with_suffix('.rig.json'),
               args.output.with_suffix('.production.json'), args.output.with_suffix('.pose-script.py'),
               args.output.with_suffix('.cloth-weights.json'),
               args.output.with_suffix('.hand-weights.json'),
               args.output.with_suffix('.rejected-pose.blend'), args.output.with_suffix('.rejected-pose.json'),
               args.output.with_name(args.output.stem + '-diagnostic.blend')]
    if not source.is_file() or not args.contract.is_file():
        raise RuntimeError('An existing composite and its actual rig contract are required.')
    if any(path.exists() for path in outputs):
        raise RuntimeError('Use a NEW candidate path; previous art and evidence are immutable.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.cycles.device = 'CPU'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    rig = next(obj for obj in scene.objects if obj.type == 'ARMATURE')
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    rig.animation_data.action = None
    for action in bpy.data.actions:
        action.name = 'UnmodifiedSource_' + action.name
        action.use_fake_user = True
    for bone in rig.pose.bones:
        bone.rotation_mode = 'XYZ'
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    rest = {bone.name: bone.matrix_local.copy() for bone in rig.data.bones}
    inv_world = rig.matrix_world.inverted()
    point = lambda xyz: inv_world @ Vector(xyz)
    direction = lambda xyz: (inv_world.to_3x3() @ Vector(xyz)).normalized()
    neck_center = Vector((0, -.52, 1.52))
    neck_radius = .035
    wrist_shift = {'Left': 0.0, 'Right': 0.0}
    hand_meshes = {side: bpy.data.objects[side + 'AuthoredAnatomicalHand'] for side in ['Left', 'Right']}
    forearm_skin_snapshot = {}
    for side,mesh in hand_meshes.items():
        hand = rig.data.bones[side+'Hand']
        origin = rig.matrix_world@hand.head_local
        along = (rig.matrix_world.to_3x3()@(hand.tail_local-hand.head_local)).normalized()
        forearm_skin_snapshot[side] = {vertex.index: [(mesh.vertex_groups[item.group].name,item.weight) for item in vertex.groups]
            for vertex in mesh.data.vertices if (mesh.matrix_world@vertex.co-origin).dot(along)<-.014}
    hand_weight_changes = []
    if args.smooth_hand_skin:
        for side, mesh in hand_meshes.items():
            hand = rig.data.bones[side+'Hand']
            origin = rig.matrix_world@hand.head_local
            along = (rig.matrix_world.to_3x3()@(hand.tail_local-hand.head_local)).normalized()
            names = [side+'WristTwist', side+'Hand']+[name for name in rest if name.startswith(side) and any(digit in name for digit in ['Index','Middle','Ring','Pinky','Thumb'])]
            segments = {name: (rig.matrix_world@rig.data.bones[name].head_local,
                               rig.matrix_world@rig.data.bones[name].tail_local) for name in names}
            # The legacy Hand joint is .112m long, through the middle finger.
            # Its SKIN support is the actual .045m palm, not that whole bone.
            segments[side+'Hand'] = (origin, origin+along*.045)
            for vertex in mesh.data.vertices:
                position = mesh.matrix_world@vertex.co
                # A combined bare-forearm/hand source also contains real
                # ForeArm influences. Keep that calibrated volume field.
                if (position-origin).dot(along) < -.014:
                    continue
                support = []
                for name, (first, last) in segments.items():
                    delta = last-first
                    amount = max(0,min(1,(position-first).dot(delta)/delta.length_squared))
                    distance = (position-(first+delta*amount)).length
                    support.append((name,1/(distance*distance+.005*.005)**2))
                support = sorted(support,key=lambda item:item[1],reverse=True)[:4]
                total = sum(weight for name,weight in support)
                after = [(name,weight/total) for name,weight in support]
                before = [(mesh.vertex_groups[item.group].name,item.weight) for item in vertex.groups]
                for name,weight in before:
                    mesh.vertex_groups[name].remove([vertex.index])
                for name,weight in after:
                    mesh.vertex_groups[name].add([vertex.index],weight,'REPLACE')
                hand_weight_changes.append({'mesh':mesh.name,'vertex':vertex.index,'before':before,'after':after})
        bpy.context.view_layer.update()
    forearm_skin_unchanged = True
    for side, snapshot in forearm_skin_snapshot.items():
        mesh = hand_meshes[side]
        for index, before in snapshot.items():
            after = [(mesh.vertex_groups[item.group].name,item.weight) for item in mesh.data.vertices[index].groups]
            if after != before:
                forearm_skin_unchanged = False
    if not forearm_skin_unchanged:
        raise RuntimeError('The local palm/digit repair changed a calibrated proximal forearm field.')
    # The actual authored anatomical palm has a known skin-facing rest frame.
    palm_indices = {}
    for side, mesh in hand_meshes.items():
        bone = rig.data.bones[side + 'Hand']
        origin = rig.matrix_world @ bone.head_local
        along = (rig.matrix_world.to_3x3() @ (bone.tail_local - bone.head_local)).normalized()
        normal = Vector((0, 1, 0))
        normal = (normal - along * normal.dot(along)).normalized()
        across = along.cross(normal).normalized()
        palm_indices[side] = []
        for vertex in mesh.data.vertices:
            delta = mesh.matrix_world @ vertex.co - origin
            # Actual inner palm patch near the distal pad, not a joint proxy.
            if abs(delta.dot(across)) < .020 and .043 < delta.dot(along) < .061 and delta.dot(normal) > .009:
                palm_indices[side].append(vertex.index)
        if len(palm_indices[side]) < 5:
            raise RuntimeError('The existing real palm surface could not be located: ' + side)

    body = max((obj for obj in scene.objects if obj.type == 'MESH' and obj.vertex_groups), key=lambda obj: len(obj.data.vertices))
    adjacency = [[] for vertex in body.data.vertices]
    for edge in body.data.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    remaining = set(range(len(adjacency)))
    fragments, doomed = [], []
    while remaining:
        stack, component = [remaining.pop()], []
        while stack:
            index = stack.pop()
            component.append(index)
            for neighbor in adjacency[index]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    stack.append(neighbor)
        positions = [body.matrix_world @ body.data.vertices[index].co for index in component]
        if len(component) < 100 and all(abs(vertex.x) > .25 and .75 < vertex.z < .93 for vertex in positions):
            fragments.append({'vertices': len(component), 'boundsMin': [min(vertex[i] for vertex in positions) for i in range(3)], 'boundsMax': [max(vertex[i] for vertex in positions) for i in range(3)]})
            doomed.extend(component)
    if doomed:
        mesh = bmesh.new()
        mesh.from_mesh(body.data)
        mesh.verts.ensure_lookup_table()
        bmesh.ops.delete(mesh, geom=[mesh.verts[index] for index in doomed], context='VERTS')
        mesh.to_mesh(body.data)
        mesh.free()
        body.data.update()
        bpy.context.view_layer.update()
    lower_indices = [vertex.index for vertex in body.data.vertices if (body.matrix_world @ vertex.co).z < .85]

    def evaluated_points(obj, indices):
        deps = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(deps)
        return [evaluated.matrix_world @ evaluated.data.vertices[index].co for index in indices]

    lower_before = evaluated_points(body, lower_indices)

    def pose():
        explicit = {}

        def fk(name):
            if name in explicit:
                return explicit[name]
            parent = rig.data.bones[name].parent
            return fk(parent.name) @ rest[parent.name].inverted() @ rest[name] if parent else rest[name].copy()

        def orient(name, head, tail, palm=None, weight=1.0):
            base = fk(name).to_3x3()
            axis = (tail - head).normalized()
            rotation = (base @ Vector((0, 1, 0))).rotation_difference(axis).to_matrix() @ base
            if palm is not None:
                local_palm = rest[name].to_3x3().inverted() @ direction((0, 1, 0))
                current = rotation @ local_palm
                current = (current - axis * current.dot(axis)).normalized()
                desired = (palm - axis * palm.dot(axis)).normalized()
                twist = math.atan2(axis.dot(current.cross(desired)), current.dot(desired))
                rotation = Quaternion(axis, twist * weight).to_matrix() @ rotation
            matrix = rotation.to_4x4()
            matrix.translation = head
            explicit[name] = matrix

        def limb(first, second, target, pole, palm):
            origin = fk(first).translation
            l1, l2 = rig.data.bones[first].length, rig.data.bones[second].length
            delta = target - origin
            distance = max(abs(l1-l2)+.001, min(delta.length, l1+l2-.001))
            along = delta.normalized()
            toward = pole-origin
            toward = (toward-along*toward.dot(along)).normalized()
            advance = (l1*l1-l2*l2+distance*distance)/(2*distance)
            elbow = origin + along*advance + toward*math.sqrt(max(0, l1*l1-advance*advance))
            target = origin + along*distance
            orient(first, origin, elbow, palm, .33)
            orient(second, elbow, target, palm, .50)
            return target

        for side, sign in [('Left', 1), ('Right', -1)]:
            grip_rotation = Matrix.Rotation(args.left_grip_yaw if side=='Left' else 0,3,'Z')
            normal = direction(grip_rotation@Vector((-sign, 0, 0)))
            # A small stagger lets real opposing fingertips meet without
            # occupying exactly the same symmetric plane.
            wrist_world = Vector((sign*(.051+wrist_shift[side]), -.460, 1.520+sign*args.hand_stagger))
            wrist_world = neck_center + grip_rotation@(wrist_world-neck_center)
            target = point(wrist_world)
            wrist = limb(side+'Arm', side+'ForeArm', target, point((sign*.40, -.18, 1.15)), normal)
            twist = side+'WristTwist'
            orient(twist, fk(twist).translation, wrist, normal, .75)
            orient(side+'Hand', wrist, wrist + direction(grip_rotation@Vector((0, -1, 0)))*rig.data.bones[side+'Hand'].length, normal)
            # Solve the real digits around a finite-radius cervical surface.
            # Segment lengths remain the actual authored lengths; opposing
            # fingertips approach the front of the neck without swapping sides.
            for digit in ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']:
                winding = -1 if digit == 'Thumb' else 1
                for joint in range(1, 4):
                    name = f'{side}{digit}{joint}'
                    head = fk(name).translation
                    world_head = rig.matrix_world @ head
                    u, v = sign*world_head.x, -(world_head.y-neck_center.y)
                    radial = math.hypot(u, v)
                    radius = neck_radius + (.008 if digit == 'Thumb' else .0065)
                    length = rig.data.bones[name].length
                    cosine = max(-1, min(1, (radial*radial+radius*radius-length*length)/(2*max(radial,.00001)*radius)))
                    angle = math.atan2(v, u) + winding*math.acos(cosine)
                    if digit == 'Thumb':
                        # Stop on this hand's rear quadrant, then oppose down
                        # the neck. Symmetric thumbs wrapping past the middle
                        # would penetrate the opposite palm.
                        angle = max(-1.30, angle)
                    target = Vector((sign*radius*math.cos(angle), neck_center.y-radius*math.sin(angle), world_head.z))
                    if digit == 'Thumb':
                        planar = (target-world_head).length
                        target.z -= math.sqrt(max(0, length*length-planar*planar))
                    delta = target-world_head
                    if delta.length < 1e-6:
                        delta = Vector((-sign, 0, 0))
                    target = world_head + delta.normalized()*length
                    inward = Vector((-world_head.x, neck_center.y-world_head.y, 0)).normalized()
                    orient(name, head, point(target), direction(inward), .80)

        result = {name: fk(name) for name in rest}
        for name, matrix in result.items():
            bone = rig.pose.bones[name]
            parent = bone.bone.parent
            kwargs = {'parent_matrix': result[parent.name], 'parent_matrix_local': rest[parent.name]} if parent else {}
            basis = bone.bone.convert_local_to_pose(matrix, rest[name], invert=True, **kwargs)
            bone.location = basis.to_translation()
            bone.rotation_euler = basis.to_euler('XYZ', bone.rotation_euler.copy())
            bone.scale = (1, 1, 1)
        bpy.context.view_layer.update()
        return result

    # The source fallback partition assigned outer lungi folds to hands merely
    # because their X coordinate exceeded .22m. Actual measured garment slices
    # stay inside .240m through z.93; real cuffs begin outside .33m at z.95.
    # Repair that measured, spatially disjoint region on this candidate only.
    pose()
    leaked_lower = evaluated_points(body, lower_indices)
    source_lower_motion = max((after-before).length for before, after in zip(lower_before, leaked_lower))
    arm_names = {name for name in rest if any(part in name for part in ['Shoulder', 'Arm', 'Hand', 'Wrist', 'Index', 'Middle', 'Ring', 'Pinky', 'Thumb'])}
    cloth_changes = []
    repair_mask = ('body only: lower garment z<.93 abs(x)<.29; upper source skin preserved' if args.preserve_upper_skin else
                  'body only: lower garment z<.93 abs(x)<.29; inner sleeve/shoulder .93<=z<=1.54 '
                   '.13<abs(x)<.29+.13*smooth((z-1.18)/.10); measured row-gap borders, continuous shoulder '
                   'blend and collar taper; preserve outer bare forearm/wrist below the elbow')
    def smooth(value):
        value = max(0, min(1, value))
        return value*value*(3-2*value)
    # The empty gap between torso and forearm narrows with height. Above the
    # armpit there is no empty gap, so use a continuous shoulder skin blend.
    borders = [(.93,.275,.012), (1.0,.25213,.012), (1.05,.23693,.016),
               (1.10,.21747,.025), (1.13,.210,.040), (1.15,.20661,.055),
               (1.20,.205,.055), (1.30,.205,.055), (1.40,.18,.070), (1.54,.17,.090)]
    def arm_fraction(position):
        if abs(position.x) <= .13:
            return 0.0
        for first, second in zip(borders, borders[1:]):
            if position.z <= second[0]:
                amount = max(0, min(1, (position.z-first[0])/(second[0]-first[0])))
                center = first[1]+(second[1]-first[1])*amount
                width = first[2]+(second[2]-first[2])*amount
                return smooth((abs(position.x)-(center-width))/(2*width))*smooth((abs(position.x)-.13)/.04)
        return 0.0
    def distance_to_segment(position, first, second):
        delta = second-first
        amount = max(0, min(1, (position-first).dot(delta)/delta.length_squared))
        return (position-(first+delta*amount)).length
    for vertex in body.data.vertices:
        position = body.matrix_world @ vertex.co
        lower = position.z < .93 and abs(position.x) < .29
        outer_limit = .29 + .13*smooth((position.z-1.18)/.10)
        shirt_transition = not args.preserve_upper_skin and .93 <= position.z <= 1.54 and .13 < abs(position.x) < outer_limit
        if not lower and not shirt_transition:
            continue
        before = [(body.vertex_groups[item.group].name, item.weight) for item in vertex.groups]
        leakage = sum(weight for name, weight in before if name in arm_names)
        if lower and leakage < .000001:
            continue
        kept = [(name, weight) for name, weight in before if name not in arm_names and name in rest]
        total = sum(weight for name, weight in kept)
        torso = [(name, weight/total) for name, weight in kept] if total > .000001 else [('Hips' if lower else 'Chest', 1.0)]
        if lower:
            after = torso
        else:
            fraction = arm_fraction(position)
            side = 'Left' if position.x > 0 else 'Right'
            arm = []
            for name in [side+'Arm', side+'ForeArm']:
                bone = rig.data.bones[name]
                distance = distance_to_segment(position, rig.matrix_world@bone.head_local, rig.matrix_world@bone.tail_local)
                arm.append((name, 1/max(.002,distance)**4))
            arm_total = sum(weight for name, weight in arm)
            arm = [(name, weight/arm_total) for name, weight in arm]
            after = [(name, weight*(1-fraction)) for name, weight in torso] + [(name, weight*fraction) for name, weight in arm]
            after = [(name, weight) for name, weight in after if weight > .000001]
            # Retain outer bare forearm/wrist weights exactly and fade into
            # the corrected inner sleeve; the upper shirt is fully continuous.
            preserve = smooth((abs(position.x)-.26)/.03)*(1-smooth((position.z-1.18)/.10))
            if preserve > 0:
                blended = {name: weight*(1-preserve) for name, weight in after}
                for name, weight in before:
                    blended[name] = blended.get(name,0)+weight*preserve
                after = [(name, weight) for name, weight in blended.items() if weight > .000001]
            previous = dict(before)
            if max(abs(previous.get(name,0)-dict(after).get(name,0)) for name in set(previous)|{name for name, weight in after}) < .000001:
                continue
        for name, weight in before:
            body.vertex_groups[name].remove([vertex.index])
        for name, weight in after:
            body.vertex_groups[name].add([vertex.index], weight, 'REPLACE')
        cloth_changes.append({'vertex': vertex.index, 'restPosition': list(position), 'region': 'lower-costume' if lower else 'measured-inner-sleeve-shoulder-transition', 'before': before, 'after': after, 'originalArmWeight': leakage})
    if not cloth_changes and not args.preserve_upper_skin:
        raise RuntimeError('Expected source cloth leakage is missing; re-inspect before changing this mask.')
    bpy.context.view_layer.update()

    # Calibrate the contact against deformed skin, not just palm bone origins.
    for iteration in range(6):
        pose()
        for side, sign in [('Left', 1), ('Right', -1)]:
            patch = evaluated_points(hand_meshes[side], palm_indices[side])
            gaps = sorted(math.hypot(vertex.x, vertex.y-neck_center.y)-neck_radius for vertex in patch)
            correction = gaps[len(gaps)//2]
            wrist_shift[side] -= max(-.004, min(.004, correction))*.75
    pose()
    lower_after = evaluated_points(body, lower_indices)
    lower_motion = max((after-before).length for before, after in zip(lower_before, lower_after))
    if lower_motion > .005:
        print('LOWER_COSTUME_INFLUENCE_DIAGNOSTIC '+json.dumps([{'vertex': lower_indices[index], 'rest': list(lower_before[index]), 'posed': list(lower_after[index]), 'motion': (lower_after[index]-lower_before[index]).length, 'weights': [(body.vertex_groups[item.group].name, item.weight) for item in body.data.vertices[lower_indices[index]].groups]} for index in sorted(range(len(lower_indices)),key=lambda index:(lower_after[index]-lower_before[index]).length,reverse=True)[:8]]))
        raise RuntimeError('Arm posing deformed the supposedly static lower costume: '+str(lower_motion))

    def contact_metrics():
        output = {}
        for side, sign in [('Left', 1), ('Right', -1)]:
            mesh = hand_meshes[side]
            patch = evaluated_points(mesh, palm_indices[side])
            all_points = evaluated_points(mesh, range(len(mesh.data.vertices)))
            gaps = sorted(math.hypot(vertex.x, vertex.y-neck_center.y)-neck_radius for vertex in patch)
            neck_zone = [vertex for vertex in all_points if 1.47 < vertex.z < 1.57]
            distances = [math.hypot(vertex.x, vertex.y-neck_center.y)-neck_radius for vertex in neck_zone]
            output[side] = {'actualPalmPatchVertices': len(patch), 'palmSignedGapMedianMeters': gaps[len(gaps)//2],
                'palmSurfaceContactMinMeters': min(abs(gap) for gap in gaps), 'palmDeepestIntrusionMeters': max(0, -min(gaps)),
                'wholeHandNeckZoneDeepestIntrusionMeters': max(0, -min(distances)),
                'wristWorld': list(rig.matrix_world @ rig.pose.bones[side+'Hand'].head),
                'elbowWorld': list(rig.matrix_world @ rig.pose.bones[side+'ForeArm'].head),
                'fingerTipsWorld': {digit: list(rig.matrix_world @ rig.pose.bones[side+digit+'3'].tail) for digit in ['Index','Middle','Ring','Pinky','Thumb']},
                'armKeepsOwnSide': sign*(rig.matrix_world @ rig.pose.bones[side+'ForeArm'].head).x > .10}
        return output

    metrics = contact_metrics()
    if any(abs(value['palmSignedGapMedianMeters']) > .008 or not value['armKeepsOwnSide'] for value in metrics.values()):
        raise RuntimeError('The actual palm surface or noncrossing elbow guard failed: '+json.dumps(metrics))
    deps = bpy.context.evaluated_depsgraph_get()
    evaluated_body = body.evaluated_get(deps)
    stretch = []
    for edge in body.data.edges:
        a, b = edge.vertices
        before = (body.data.vertices[a].co-body.data.vertices[b].co).length
        after = (evaluated_body.data.vertices[a].co-evaluated_body.data.vertices[b].co).length
        if before > .001 and after > .02:
            stretch.append(after/before)
    hand_trees = []
    hand_stretch = {}
    for side in ['Left','Right']:
        evaluated = hand_meshes[side].evaluated_get(deps)
        hand_trees.append(BVHTree.FromPolygons([evaluated.matrix_world@vertex.co for vertex in evaluated.data.vertices],
                                              [list(polygon.vertices) for polygon in evaluated.data.polygons]))
        ratios = []
        for edge in hand_meshes[side].data.edges:
            a,b = edge.vertices
            before = (hand_meshes[side].data.vertices[a].co-hand_meshes[side].data.vertices[b].co).length
            after = (evaluated.data.vertices[a].co-evaluated.data.vertices[b].co).length
            if before > .0005:
                ratios.append(after/before)
        hand_stretch[side] = {'maxEdgeStretchRatio':max(ratios),'edgesAboveFiveTimesRestLength':sum(value>5 for value in ratios)}
    hand_overlap = len(hand_trees[0].overlap(hand_trees[1]))
    if hand_overlap or max(stretch) > 10 or (args.smooth_hand_skin and any(value['maxEdgeStretchRatio']>6 for value in hand_stretch.values())):
        pair_names = Counter()
        for left, right in hand_trees[0].overlap(hand_trees[1]):
            names = []
            for side, index in [('Left',left),('Right',right)]:
                mesh = hand_meshes[side]
                weights = Counter()
                for vertex in mesh.data.polygons[index].vertices:
                    for item in mesh.data.vertices[vertex].groups:
                        weights[mesh.vertex_groups[item.group].name] += item.weight
                names.append(weights.most_common(1)[0][0])
            pair_names['/'.join(names)] += 1
        rejected = {'status':'REJECTED component pose; no GLB exported','sourceBlend':str(source),'sourceBlendSha256':sha(source),
                    'handTriangleOverlapPairs':hand_overlap,'overlapJointPairs':dict(pair_names),'maxShirtEdgeStretch':max(stretch),
                    'handSkin':hand_stretch,'contacts':metrics,'producerSha256':sha(Path(__file__))}
        args.output.with_suffix('.rejected-pose.json').write_text(json.dumps(rejected,indent=2))
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.rejected-pose.blend')))
        raise RuntimeError('Opposing hands intersect or the skin still has an extreme tear: '+json.dumps(rejected))
    action = bpy.data.actions.new('Idle')
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in [1, 49]:
        scene.frame_set(frame)
        pose()
        for bone in rig.pose.bones:
            bone.keyframe_insert(data_path='location', frame=frame, group=bone.name)
            bone.keyframe_insert(data_path='rotation_euler', frame=frame, group=bone.name)
            bone.keyframe_insert(data_path='scale', frame=frame, group=bone.name)
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = 'Idle'
    strip = track.strips.new('Idle', 1, action)
    strip.action_frame_start, strip.action_frame_end = 1, 49
    track.mute = True
    scene.frame_set(1)
    pose()
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
    bpy.ops.export_scene.gltf(filepath=str(args.output), export_format='GLB', export_animations=True,
        export_animation_mode='NLA_TRACKS', export_nla_strips=True, export_force_sampling=False,
        export_skins=True, export_morph=False, export_yup=True, export_apply=False)
    data = args.output.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    model = json.loads(data[20:20+size])
    names = [animation.get('name') for animation in model.get('animations', [])]
    if names != ['Idle']:
        raise RuntimeError('Only the fixed grip Idle may be shipped: '+str(names))
    binary = data[28+size:]
    def accessor_rows(index):
        accessor = model['accessors'][index]
        view = model['bufferViews'][accessor['bufferView']]
        count = {'SCALAR':1,'VEC3':3,'VEC4':4}[accessor['type']]
        if accessor['componentType'] != 5126:
            raise RuntimeError('Expected float authored animation channels.')
        offset = view.get('byteOffset',0)+accessor.get('byteOffset',0)
        stride = view.get('byteStride',count*4)
        return [struct.unpack_from('<'+'f'*count,binary,offset+row*stride) for row in range(accessor['count'])]
    animation_delta = 0.0
    for channel in model['animations'][0]['channels']:
        sampler = model['animations'][0]['samplers'][channel['sampler']]
        rows = accessor_rows(sampler['output'])
        if sampler.get('interpolation') == 'CUBICSPLINE':
            rows = rows[1::3]
        animation_delta = max(animation_delta,max(abs(first-second) for row in rows for first,second in zip(row,rows[0])))
    if animation_delta > .000001:
        raise RuntimeError('The fixed grip animation changed across its Idle loop.')
    contract = json.loads(args.contract.read_text())
    contract['id'] += '-fixed-neck-grip-' + args.output.stem.rsplit('-',1)[-1]
    contract['pose'] = {'mode': 'authored-static'}
    contract['motions'] = {'required': ['idle'], 'clips': {'idle': {'clipName': 'Idle'}}}
    args.output.with_suffix('.rig.json').write_text(json.dumps(contract, separators=(',', ':')))
    args.output.with_suffix('.pose-script.py').write_bytes(Path(__file__).read_bytes())
    cloth_path = args.output.with_suffix('.cloth-weights.json')
    cloth_path.write_text(json.dumps({'sourceBlendSha256': sha(source), 'mask': repair_mask, 'armBorderHeightCenterHalfwidth': borders, 'changes': cloth_changes}, separators=(',', ':')))
    hand_path = args.output.with_suffix('.hand-weights.json')
    hand_path.write_text(json.dumps({'sourceBlendSha256':sha(source),'method':'Continuous regularized actual rest-segment support; .045m palm support; four strongest normalized influences, no hard palm/thumb candidate mask','changes':hand_weight_changes},separators=(',',':')))
    report = {'sourceBlend': str(source), 'sourceBlendSha256': sha(source), 'sourceContractSha256': sha(args.contract),
        'sourceGlbSha256': sha(source.with_suffix('.glb')) if source.with_suffix('.glb').exists() else None,
        'outputGlb': str(args.output), 'outputGlbSha256': sha(args.output), 'producerSha256': sha(Path(__file__)),
        'blender': bpy.app.version_string, 'space': 'blender-world metres; front -Y, up +Z',
        'neckCenterWorld': list(neck_center), 'neckRadiusMeters': neck_radius,
        'wristCalibrationMeters': wrist_shift, 'opposingWristVerticalStaggerMeters':args.hand_stagger,
        'leftGripYawRadians':args.left_grip_yaw,
        'contacts': metrics, 'lowerCostumeMaxDisplacementMeters': lower_motion,
        'sourcePartitionLowerCostumeMaxDisplacementMeters': source_lower_motion,
        'clothWeightRepair': {'mask': repair_mask, 'upperSourceSkinPreserved': args.preserve_upper_skin,
            'actualSourceSliceMaxAbsX': {'z.80': .239713, 'z.85': .231873, 'z.90': .222780, 'z.93': .216774},
            'actualCuffBeginsAtZ': .947, 'actualCuffMinAbsX': .33,
            'changedVertices': len(cloth_changes), 'changedLowerCostumeVertices': sum(item['region']=='lower-costume' for item in cloth_changes),
            'changedInnerSleeveShoulderVertices': sum(item['region']!='lower-costume' for item in cloth_changes),
            'armBorderHeightCenterHalfwidth': borders, 'evidenceFile': str(cloth_path), 'evidenceSha256': sha(cloth_path),
            'outerForearmBelowElbowWristSkinChanged': False},
        'handSkinRepair': {'enabled':args.smooth_hand_skin,'geometryAndMaterialsChanged':False,'changedVertices':len(hand_weight_changes),
            'maxInfluences':4,'evidenceFile':str(hand_path),'evidenceSha256':sha(hand_path),'deformation':hand_stretch,
            'proximalForearmSkinPreserved':forearm_skin_unchanged,
            'proximalVerticesPreserved':{side:len(snapshot) for side,snapshot in forearm_skin_snapshot.items()}},
        'exportedClips': names, 'exportedIdleMaxAnimatedComponentChange': animation_delta,
        'deformationDiagnostics': {'maxShirtEdgeStretchRatio': max(stretch), 'shirtEdgesAboveFiveTimesRestLength': sum(value>5 for value in stretch),
            'shirtEdgesAboveTenTimesRestLength':sum(value>10 for value in stretch), 'opposingHandTriangleOverlapPairs':hand_overlap},
        'gripReleasedDuringDelivery': False, 'diagnosticProxyExported': False,
        'sourceMaterialsAndUVsChanged': False, 'newCandidateClothWeightsRepaired': bool(cloth_changes),
        'isolatedSourceHandTrimFragmentsRemoved': fragments, 'sourceAnatomicalHandGeometryChanged': False,
        'method': 'Analytic two-bone arms; existing segmented fingers wrapped around neck cylinder; actual deformed palm patch calibration; static lower body and fixed Idle',
        'limitations': ['Producer geometry/pose checks only, not identity approval.', 'Hands retain the source authored skin; forearm/hand color continuity requires independent visual review.', 'Diagnostic cervical proxy must match runtime skeleton neck surface.'],
        'status': 'UNREVIEWED new candidate; five-view authored/clay and runtime comparison still required'}
    args.output.with_suffix('.production.json').write_text(json.dumps(report, indent=2))

    # A diagnostic-only skeleton makes front/profile overlap and real contacts
    # inspectable without adding a non-character mesh to the shipped actor.
    bone_material = bpy.data.materials.new('Diagnostic skeleton ivory')
    bone_material.diffuse_color = (.68, .66, .49, 1)
    def orb(name, position, scale):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, location=position)
        obj = bpy.context.object
        obj.name = 'DIAGNOSTIC_ONLY_' + name
        obj.scale = scale
        obj.data.materials.append(bone_material)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        return obj
    def segment(name, a, b, radius):
        a, b = Vector(a), Vector(b)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=(b-a).length, location=(a+b)/2)
        obj = bpy.context.object
        obj.name = 'DIAGNOSTIC_ONLY_' + name
        obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
        obj.data.materials.append(bone_material)
        return obj
    segment('CervicalContactRadius035', (0, -.52, 1.47), (0, -.52, 1.57), neck_radius)
    orb('Skull', (0, -.52, 1.72), (.12, .10, .145))
    orb('Jaw', (0, -.585, 1.62), (.085, .065, .045))
    for x in [-.045, .045]:
        orb('EyeSocket', (x, -.615, 1.74), (.027, .009, .030)).data.materials.clear()
    segment('Spine', (0, -.483, .89), (0, -.483, 1.49), .025)
    for rib in range(7):
        height = 1.40-rib*.048
        for sign in [-1, 1]:
            curve = bpy.data.curves.new('Diagnostic rib curve', 'CURVE')
            curve.dimensions = '3D'
            curve.bevel_depth = .012
            curve.bevel_resolution = 2
            spline = curve.splines.new('POLY')
            points = [(0, -.485, height), (sign*.19, -.51, height+.015), (sign*.20, -.60, height-.015), (sign*.08, -.66, height-.045), (0, -.605, height-.025)]
            spline.points.add(len(points)-1)
            for cp, xyz in zip(spline.points, points):
                cp.co = (*xyz, 1)
            obj = bpy.data.objects.new('DIAGNOSTIC_ONLY_Rib', curve)
            scene.collection.objects.link(obj)
            obj.data.materials.append(bone_material)
    bpy.ops.wm.save_as_mainfile(filepath=str(outputs[-1]))
    print('NECK_GRIP_CANDIDATE '+json.dumps(report))


if __name__ == '__main__':
    main()
