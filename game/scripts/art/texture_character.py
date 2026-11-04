"""Blender 3D texture authoring: project clean artist front/back guides onto the
real volumetric mesh, unwrap its UVs and bake a NEW embedded PBR candidate.
The guide images and source mesh remain unchanged. This is not a likeness gate.

Blender --background source.blend --python scripts/art/texture_character.py --
 --front /absolute/front-alpha.png --back /absolute/back-alpha.png
 --output /absolute/new-candidate.glb [--size 2048]
"""
import argparse
import hashlib
import json
import runpy
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--front',required=True,type=Path)
parser.add_argument('--back',required=True,type=Path)
parser.add_argument('--left',type=Path)
parser.add_argument('--right',type=Path)
parser.add_argument('--output',required=True,type=Path)
parser.add_argument('--size',type=int,default=2048)
parser.add_argument('--cloth-color',type=float,nargs=3,default=[.24,.09,.035])
parser.add_argument('--skin-color',type=float,nargs=3,default=[.42,.23,.14])
parser.add_argument('--pants-color',type=float,nargs=3,help='Optional explicit lower-garment fallback; guides still supply actual visible texture')
parser.add_argument('--pants-below',type=float,default=.94,help='Native Blender metre-space waist limit for optional pants fallback')
parser.add_argument('--uv-angle',type=float,default=.9,help='Optional smart-unwrap angle; default preserves existing pipeline')
parser.add_argument('--uv-margin',type=float,default=.012)
parser.add_argument('--bake-margin',type=int,default=8)
parser.add_argument('--bake-margin-mode',choices=['ADJACENT_FACES','EXTEND'],default='ADJACENT_FACES')
parser.add_argument('--semantic-mask',type=Path,help='Opt-in native geometry/guide semantics; prevents donor skin being projected onto clothing. Never edits guide pixels.')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
outputs=[args.output,args.output.with_suffix('.blend'),args.output.with_suffix('.png'),args.output.with_suffix('.rig.json'),args.output.with_suffix('.production.json'),args.output.with_suffix('.texture-script.py')]
if any(path.exists() for path in outputs):raise RuntimeError('Use a NEW candidate output path; existing art/evidence will not be overwritten.')
original=Path(bpy.data.filepath)
contract_path=original.with_suffix('.rig.json')
if not contract_path.exists():raise RuntimeError('Source rig contract is required beside its blend file.')
contract=json.loads(contract_path.read_text())
scene=bpy.context.scene
scene.cycles.device='CPU'
body=max((obj for obj in scene.objects if obj.type=='MESH' and any(mod.type=='ARMATURE' for mod in obj.modifiers)),key=lambda obj:len(obj.data.vertices))
rig=next(obj for obj in scene.objects if obj.type=='ARMATURE')
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
bpy.context.view_layer.update()
points=[body.matrix_world@vertex.co for vertex in body.data.vertices]
lo=Vector(tuple(min(point[i] for point in points) for i in range(3)))
hi=Vector(tuple(max(point[i] for point in points) for i in range(3)))
material=bpy.data.materials.new('Artist projected costume basecolor');material.use_nodes=True
body.data.materials.clear();body.data.materials.append(material)
nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
geometry=nodes.new('ShaderNodeNewGeometry')
coordinates=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Position'],coordinates.inputs[0])
semantic=json.loads(args.semantic_mask.read_text()) if args.semantic_mask else None
if semantic and (semantic.get('units')!='metres' or semantic.get('space')!='blender-world'):
    raise RuntimeError('Semantic regions must use native Blender-world metres.')
semantic_stats={}
if semantic:
    # These are recipient-geometry semantics, independent of the pixels being
    # projected. An arm drawn in a side guide is not an arm on the shirt mesh.
    attr=body.data.attributes.new('CostumeSkinAllowed','FLOAT','POINT')
    warm_attr=body.data.attributes.new('CostumeWarmAllowed','FLOAT','POINT')
    arm_attr=body.data.attributes.new('CostumeArmSkinOnly','FLOAT','POINT')
    # Creating another CustomData layer can invalidate an earlier RNA handle.
    # Reacquire every attribute only after all allocations are complete.
    attr=body.data.attributes['CostumeSkinAllowed'];warm_attr=body.data.attributes['CostumeWarmAllowed'];arm_attr=body.data.attributes['CostumeArmSkinOnly']
    if any(len(attribute.data)!=len(points) for attribute in [attr,warm_attr,arm_attr]):raise RuntimeError('Recipient attribute storage no longer matches the mesh')
    arms=[]
    for side in ['Left','Right']:
        for name in [side+'ForeArm',side+'Hand',*([side+'Arm'] if 'bareUpperArmFromFraction' in semantic else [])]:
            bone=rig.data.bones.get(name)
            if bone:arms.append((name,rig.matrix_world@bone.head_local,rig.matrix_world@bone.tail_local))
    def segment_distance(point,a,b):
        vector=b-a;t=max(0,min(1,(point-a).dot(vector)/max(vector.length_squared,1e-9)))
        return (point-(a+vector*t)).length,t
    allowed=0
    for vertex,point in zip(body.data.vertices,points):
        skin=point.z>=semantic.get('headSkinAbove',1.50);arm_skin=False
        for name,a,b in arms:
            distance,t=segment_distance(point,a,b)
            minimum=semantic.get('bareUpperArmFromFraction',1) if name.endswith('Arm') and not name.endswith('ForeArm') else semantic.get('bareForearmFromFraction',.16)
            if distance<semantic.get('bareArmRadius',.10) and ('Hand' in name or t>=minimum):
                skin=True;arm_skin=True
        for volume in semantic.get('exposedVolumes',[]):
            if all(volume['min'][axis]<=point[axis]<=volume['max'][axis] for axis in range(3)):skin=True
        preserve_warm=skin or any(all(volume['min'][axis]<=point[axis]<=volume['max'][axis] for axis in range(3)) for volume in semantic.get('preserveWarmVolumes',[]))
        attr.data[vertex.index].value=1 if skin else 0;warm_attr.data[vertex.index].value=1 if preserve_warm else 0;allowed+=int(skin)
        arm_attr.data[vertex.index].value=1 if arm_skin and semantic.get('forceSkinOnArmSurfaces',False) else 0
    semantic_stats={'recipientSkinVertices':allowed,'recipientClothVertices':len(points)-allowed}

def image_projection(path,back=False,horizontal_axis=0,repair_columns=None):
    image=bpy.data.images.load(str(path.resolve()),check_existing=True)
    pixels=np.empty(image.size[1]*image.size[0]*4,dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels=pixels.reshape(image.size[1],image.size[0],4)
    rows,columns=np.nonzero(pixels[:,:,3]>.5)
    if not len(rows) or len(rows)==pixels.shape[0]*pixels.shape[1]:raise RuntimeError('Guide needs a real isolated alpha silhouette, not an opaque backdrop.')
    uv=[columns.min()/image.size[0],columns.max()/image.size[0],rows.min()/image.size[1],rows.max()/image.size[1]]
    combine=nodes.new('ShaderNodeCombineXYZ')
    for index,axis in [(0,horizontal_axis),(1,2)]:
        mapping=nodes.new('ShaderNodeMapRange');mapping.clamp=False
        links.new(coordinates.outputs[axis],mapping.inputs['Value'])
        mapping.inputs['From Min'].default_value=lo[axis];mapping.inputs['From Max'].default_value=hi[axis]
        minimum,maximum=uv[index*2:index*2+2]
        if back and index==0:minimum,maximum=maximum,minimum
        mapping.inputs['To Min'].default_value=minimum;mapping.inputs['To Max'].default_value=maximum
        links.new(mapping.outputs['Result'],combine.inputs[index])
    if repair_columns:
        # Reproject a coherent *garment* column at the same physical height.
        # This is native 3D texture authoring, not modification of source art.
        # Both columns are explicitly chosen on actual reviewed guide cloth.
        sign=nodes.new('ShaderNodeMath');sign.operation='GREATER_THAN'
        links.new(coordinates.outputs['X'],sign.inputs[0]);sign.inputs[1].default_value=0
        column=nodes.new('ShaderNodeMapRange');links.new(sign.outputs[0],column.inputs['Value'])
        column.inputs['To Min'].default_value=repair_columns[0];column.inputs['To Max'].default_value=repair_columns[1]
        links.new(column.outputs['Result'],combine.inputs[0])
    texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='EXTEND';texture.interpolation='Linear'
    links.new(combine.outputs['Vector'],texture.inputs['Vector'])
    texture['semanticSourceName']=next((name for name,path in [('front',args.front),('back',args.back),('left',args.left),('right',args.right)] if path and path.resolve()==Path(image.filepath).resolve()),'unknown')
    return texture,uv

front,front_uv=image_projection(args.front)
back,back_uv=image_projection(args.back,True)
normal=nodes.new('ShaderNodeSeparateXYZ');links.new(geometry.outputs['Normal'],normal.inputs[0])
blend=nodes.new('ShaderNodeMapRange');blend.interpolation_type='SMOOTHSTEP';blend.clamp=True
links.new(normal.outputs['Y'],blend.inputs['Value'])
blend.inputs['From Min'].default_value=-.35;blend.inputs['From Max'].default_value=.35
mix=nodes.new('ShaderNodeMixRGB');links.new(blend.outputs['Result'],mix.inputs[0]);links.new(front.outputs['Color'],mix.inputs[1]);links.new(back.outputs['Color'],mix.inputs[2])
def math_node(operation,a,b=None):
    node=nodes.new('ShaderNodeMath');node.operation=operation
    if isinstance(a,(int,float)):node.inputs[0].default_value=a
    else:links.new(a,node.inputs[0])
    if b is not None:
        if isinstance(b,(int,float)):node.inputs[1].default_value=b
        else:links.new(b,node.inputs[1])
    return node.outputs[0]
skin_attribute=nodes.new('ShaderNodeAttribute') if semantic else None
if skin_attribute:skin_attribute.attribute_name='CostumeSkinAllowed'
warm_attribute=nodes.new('ShaderNodeAttribute') if semantic else None
if warm_attribute:warm_attribute.attribute_name='CostumeWarmAllowed'
arm_attribute=nodes.new('ShaderNodeAttribute') if semantic else None
if arm_attribute:arm_attribute.attribute_name='CostumeArmSkinOnly'
def projection_valid(texture):
    valid=math_node('GREATER_THAN',texture.outputs['Alpha'],.45)
    if not semantic:return valid
    color=nodes.new('ShaderNodeSeparateColor');color.mode='RGB';links.new(texture.outputs['Color'],color.inputs[0])
    red,green,blue=[color.outputs[name] for name in ['Red','Green','Blue']]
    rule=semantic.get('sourceSkinRule',{})
    warm=math_node('MULTIPLY',math_node('GREATER_THAN',red,math_node('MULTIPLY',green,rule.get('redGreenRatio',1.35))),math_node('GREATER_THAN',red,math_node('MULTIPLY',blue,rule.get('redBlueRatio',1.65))))
    warm=math_node('MULTIPLY',warm,math_node('GREATER_THAN',red,rule.get('minimumLinearRed',.075)))
    if 'maximumRedGreenRatio' in rule:
        warm=math_node('MULTIPLY',warm,math_node('LESS_THAN',red,math_node('MULTIPLY',green,rule['maximumRedGreenRatio'])))
    if 'maximumRedBlueRatio' in rule:
        warm=math_node('MULTIPLY',warm,math_node('LESS_THAN',red,math_node('MULTIPLY',blue,rule['maximumRedBlueRatio'])))
    if 'minimumBlueGreenRatio' in rule:
        warm=math_node('MULTIPLY',warm,math_node('GREATER_THAN',blue,math_node('MULTIPLY',green,rule['minimumBlueGreenRatio'])))
    zones=semantic.get('sourceSkinZones',{}).get(texture.get('semanticSourceName'))
    if zones is not None:
        uv_components=nodes.new('ShaderNodeSeparateXYZ');links.new(texture.inputs['Vector'].links[0].from_socket,uv_components.inputs[0]);zone_mask=0
        for zone in zones:
            inside=1
            for axis in range(2):
                inside=math_node('MULTIPLY',inside,math_node('MULTIPLY',math_node('GREATER_THAN',uv_components.outputs[axis],zone['min'][axis]),math_node('LESS_THAN',uv_components.outputs[axis],zone['max'][axis])))
            zone_mask=math_node('MAXIMUM',zone_mask,inside)
        warm=math_node('MULTIPLY',warm,zone_mask)
    disallowed=math_node('MULTIPLY',warm,math_node('SUBTRACT',1,warm_attribute.outputs['Fac']))
    # The reverse error is equally wrong: a shirt pixel projected onto a real
    # bare forearm must not become blue/gray arm skin. Prefer the other actual
    # view; calibrated 3D skin fallback handles only an uncovered source sample.
    cloth_on_skin=math_node('MULTIPLY',arm_attribute.outputs['Fac'],math_node('SUBTRACT',1,warm))
    return math_node('MULTIPLY',valid,math_node('MULTIPLY',math_node('SUBTRACT',1,disallowed),math_node('SUBTRACT',1,cloth_on_skin)))
# Alpha is evidence of a valid projection, not a black side material. Never
# blend the RGB hidden outside a transparent guide into the model's UV sides.
front_valid=projection_valid(front)
back_valid=projection_valid(back)
front_weight=math_node('MULTIPLY',math_node('ADD',math_node('SUBTRACT',1,blend.outputs['Result']),.001),front_valid)
back_weight=math_node('MULTIPLY',math_node('ADD',blend.outputs['Result'],.001),back_valid)
total=math_node('ADD',front_weight,back_weight)
ratio=math_node('DIVIDE',back_weight,math_node('MAXIMUM',total,.00001))
links.new(ratio,mix.inputs[0])
fallback=nodes.new('ShaderNodeMixRGB');fallback.inputs[1].default_value=(*args.cloth_color,1);fallback.inputs[2].default_value=(*args.skin_color,1)
if args.pants_color:
    garment=nodes.new('ShaderNodeMixRGB');garment.inputs[1].default_value=(*args.cloth_color,1);garment.inputs[2].default_value=(*args.pants_color,1)
    links.new(math_node('LESS_THAN',coordinates.outputs['Z'],args.pants_below),garment.inputs[0]);links.new(garment.outputs['Color'],fallback.inputs[1])
exposed=math_node('MULTIPLY',math_node('GREATER_THAN',math_node('ABSOLUTE',coordinates.outputs['X']),.24),math_node('MULTIPLY',math_node('GREATER_THAN',coordinates.outputs['Z'],.75),math_node('LESS_THAN',coordinates.outputs['Z'],1.25)))
links.new(exposed,fallback.inputs[0])
if semantic:
    # Material fallback comes from the same actual guide fabric/denim at the
    # same height; a solid colour is used only if explicitly sampled cloth is
    # also invalid. This preserves folds/weave instead of painting a skin blob.
    repair_front,_=image_projection(args.front,repair_columns=semantic['repairColumns']['front']['torso'])
    repair_back,_=image_projection(args.back,True,repair_columns=semantic['repairColumns']['back']['torso'])
    for label,path,is_back in [('front',args.front,False),('back',args.back,True)]:
        columns=semantic['repairColumns'][label]
        if 'pants' in columns:
            lower,_=image_projection(path,is_back,repair_columns=columns['pants'])
            upper=repair_front if label=='front' else repair_back
            selected=nodes.new('ShaderNodeMixRGB');links.new(math_node('LESS_THAN',coordinates.outputs['Z'],args.pants_below),selected.inputs[0]);links.new(upper.outputs['Color'],selected.inputs[1]);links.new(lower.outputs['Color'],selected.inputs[2])
            if label=='front':repair_front_color=selected.outputs[0]
            else:repair_back_color=selected.outputs[0]
        elif label=='front':repair_front_color=repair_front.outputs['Color']
        else:repair_back_color=repair_back.outputs['Color']
    fabric=nodes.new('ShaderNodeMixRGB');links.new(blend.outputs['Result'],fabric.inputs[0]);links.new(repair_front_color,fabric.inputs[1]);links.new(repair_back_color,fabric.inputs[2])
    links.new(fabric.outputs[0],fallback.inputs[1])
    # Genuine exposed anatomy uses skin; the obsolete hard-coded x/z test does
    # not override geometry semantics in this opt-in path.
    links.new(skin_attribute.outputs['Fac'],fallback.inputs[0])
resolved=nodes.new('ShaderNodeMixRGB');links.new(math_node('GREATER_THAN',total,.0001),resolved.inputs[0]);links.new(fallback.outputs['Color'],resolved.inputs[1]);links.new(mix.outputs['Color'],resolved.inputs[2])
side_bounds={}
if bool(args.left)!=bool(args.right):raise RuntimeError('Both authored side views are required; one side may not be silently mirrored.')
if args.left:
    # Four physical projection directions, baked into the same single atlas.
    # Side guides add cloth seams/weave rather than a flat fill or an invented
    # runtime material. Their unseen details remain draft art for review.
    left,side_bounds['left']=image_projection(args.left,horizontal_axis=1)
    right,side_bounds['right']=image_projection(args.right,True,horizontal_axis=1)
    projections=[(front,math_node('MULTIPLY',normal.outputs['Y'],-1)),(back,normal.outputs['Y']),
                 (left,normal.outputs['X']),(right,math_node('MULTIPLY',normal.outputs['X'],-1))]
    weighted=[];sum_weight=0
    for texture,direction in projections:
        valid=projection_valid(texture)
        weight=math_node('MULTIPLY',math_node('POWER',math_node('MAXIMUM',direction,0),4),valid)
        weighted.append((texture,weight));sum_weight=math_node('ADD',sum_weight,weight)
    aggregate=None
    for texture,weight in weighted:
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        links.new(texture.outputs['Color'],multiply.inputs[1]);links.new(math_node('DIVIDE',weight,math_node('MAXIMUM',sum_weight,.00001)),multiply.inputs[2])
        if aggregate is None:aggregate=multiply.outputs[0]
        else:
            add=nodes.new('ShaderNodeMixRGB');add.blend_type='ADD';add.inputs[0].default_value=1
            links.new(aggregate,add.inputs[1]);links.new(multiply.outputs[0],add.inputs[2]);aggregate=add.outputs[0]
    final=nodes.new('ShaderNodeMixRGB');links.new(math_node('GREATER_THAN',sum_weight,.0001),final.inputs[0]);links.new(resolved.outputs['Color'],final.inputs[1]);links.new(aggregate,final.inputs[2])
    resolved=final
if semantic:
    for index,accessory in enumerate(semantic.get('accessoryProjections',[])):
        # A brown bag is not skin, nor is it the shirt behind it. Author its
        # actual recipient surface and project the real guide's bag region in
        # local3D space. The resulting single baked atlas has no runtime cost.
        name='CostumeAccessory'+str(index);attribute=body.data.attributes.new(name,'FLOAT','POINT')
        lower,upper=accessory['min'],accessory['max'];feather=accessory.get('feather',.006)
        for vertex,point in zip(body.data.vertices,points):
            distance=min(min(point[axis]-lower[axis],upper[axis]-point[axis]) for axis in range(3))
            attribute.data[vertex.index].value=max(0,min(1,(distance+feather)/max(feather,1e-5)))
        mask=nodes.new('ShaderNodeAttribute');mask.attribute_name=name
        vector=nodes.new('ShaderNodeCombineXYZ')
        for output_index,axis in [(0,accessory.get('horizontalAxis',0)),(1,2)]:
            mapping=nodes.new('ShaderNodeMapRange');mapping.clamp=True;links.new(coordinates.outputs[axis],mapping.inputs['Value'])
            mapping.inputs['From Min'].default_value=lower[axis];mapping.inputs['From Max'].default_value=upper[axis]
            target=accessory['u' if output_index==0 else 'v'];mapping.inputs['To Min'].default_value=target[0];mapping.inputs['To Max'].default_value=target[1]
            links.new(mapping.outputs['Result'],vector.inputs[output_index])
        texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(getattr(args,accessory.get('guide','front')).resolve()),check_existing=True);texture.extension='EXTEND';links.new(vector.outputs['Vector'],texture.inputs['Vector'])
        material_region=nodes.new('ShaderNodeMixRGB');links.new(mask.outputs['Fac'],material_region.inputs[0]);links.new(resolved.outputs['Color'],material_region.inputs[1]);links.new(texture.outputs['Color'],material_region.inputs[2]);resolved=material_region
emission=nodes.new('ShaderNodeEmission');links.new(resolved.outputs['Color'],emission.inputs['Color'])
output=nodes.new('ShaderNodeOutputMaterial');links.new(emission.outputs[0],output.inputs['Surface'])
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=args.uv_angle,island_margin=args.uv_margin,area_weight=.2,correct_aspect=True,scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
image=bpy.data.images.new('Authored costume atlas',width=args.size,height=args.size,alpha=False)
target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=2
scene.render.bake.use_clear=True;scene.render.bake.margin=args.bake_margin;scene.render.bake.margin_type=args.bake_margin_mode
bpy.ops.object.bake(type='EMIT')
args.output.parent.mkdir(parents=True,exist_ok=True)
image.filepath_raw=str(args.output.with_suffix('.png'));image.file_format='PNG';image.save()
nodes.clear();target=nodes.new('ShaderNodeTexImage');target.image=image
principled=nodes.new('ShaderNodeBsdfPrincipled');principled.inputs['Metallic'].default_value=0;principled.inputs['Roughness'].default_value=.82
links.new(target.outputs['Color'],principled.inputs['Base Color']);output=nodes.new('ShaderNodeOutputMaterial');links.new(principled.outputs[0],output.inputs['Surface'])
bpy.ops.wm.save_as_mainfile(filepath=str(args.output.with_suffix('.blend')))
bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False)
helper=runpy.run_path(str(Path(__file__).with_name('rig_character.py')),run_name='rig_helper')
helper['restrict_handoff_channels'](args.output,contract['pose'].get('upperBodyNodes',[]))
args.output.with_suffix('.rig.json').write_text(json.dumps(contract,separators=(',',':')))
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
args.output.with_suffix('.texture-script.py').write_bytes(Path(__file__).read_bytes())
args.output.with_suffix('.production.json').write_text(json.dumps({
    'sourceBlend':str(original),'sourceBlendSha256':sha(original),
    'frontGuide':str(args.front),'frontSha256':sha(args.front),'backGuide':str(args.back),'backSha256':sha(args.back),
    'sideGuides':{name:{'path':str(path),'sha256':sha(path)} for name,path in [('left',args.left),('right',args.right)] if path},
    'projectionBounds':{'front':front_uv,'back':back_uv,**side_bounds},
    'projectionSettings':{'clothFallback':args.cloth_color,'skinFallback':args.skin_color,'pantsFallback':args.pants_color,'pantsBelow':args.pants_below,'uvAngle':args.uv_angle,'uvMargin':args.uv_margin,'bakeMargin':args.bake_margin,'bakeMarginMode':args.bake_margin_mode},
    'semanticMask':{'path':str(args.semantic_mask),'sha256':sha(args.semantic_mask),'settings':semantic,'geometryStats':semantic_stats} if args.semantic_mask else None,
    'atlas':str(args.output.with_suffix('.png')),'size':args.size,'blender':bpy.app.version_string,
    'producerScriptSha256':sha(Path(__file__)),'outputGlbSha256':sha(args.output),'producerArguments':sys.argv[sys.argv.index('--')+1:],
    'status':'New authored costume texture; likeness, side seams, rig and in-game scene still require independent review'},indent=2))
print('NEW_TEXTURED_CANDIDATE '+str(args.output))
