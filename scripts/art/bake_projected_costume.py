"""Native3D triangle→UV costume bake, always a NEW unapproved candidate.

Adapted from the independently tested standing lane CPU-coverage authoring
tool. Retains every existing animation, detailed head and source guide bytes;
supports the complete four-view/recipient/accessory projection contract.
Prefer PRE-hand/PRE-foot body inputs so their UVs share this final single atlas.
"""
import bpy,bmesh,numpy as np,argparse,hashlib,json,math,runpy,struct,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--body-source',type=Path,required=True);p.add_argument('--front',type=Path,required=True);p.add_argument('--back',type=Path,required=True);p.add_argument('--size',type=int);p.add_argument('--left',type=Path);p.add_argument('--right',type=Path);p.add_argument('--cloth-color',type=float,nargs=3,default=[.24,.09,.035]);p.add_argument('--skin-color',type=float,nargs=3,default=[.42,.23,.14]);p.add_argument('--pants-color',type=float,nargs=3);p.add_argument('--semantic-mask',type=Path);p.add_argument('--pants-below',type=float,default=.94);p.add_argument('--neck-skin',action='store_true');p.add_argument('--rebake-all-body',action='store_true');p.add_argument('--reunwrap',action='store_true');p.add_argument('--normal-repair',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(bpy.data.filepath);contract=json.loads(source.with_suffix('.rig.json').read_text())
paths=[a.output,a.output.with_suffix('.blend'),a.output.with_suffix('.rig.json'),a.output.with_suffix('.production.json'),a.output.with_suffix('.body-uv.png'),a.output.with_suffix('.uv-script.py')]
if any(p.exists() for p in paths):raise RuntimeError('New candidate/evidence paths only')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=True
for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0);bone.scale=(1,1,1)
bpy.context.view_layer.update();body=max((o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)),key=lambda o:len(o.data.vertices));material=body.data.materials[0].copy() if body.data.materials else bpy.data.materials.new('Native authored costume');material.use_nodes=True
if body.data.materials:body.data.materials[0]=material
else:body.data.materials.append(material)
atlas_node=next((n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image),None);atlas=atlas_node.image if atlas_node else None
width,height=(a.size,a.size) if a.size else atlas.size if atlas else (2048,2048)
if width<256 or width>4096:raise RuntimeError('Use a bounded256–4096 native atlas')
if atlas is None:
 if not a.rebake_all_body:raise RuntimeError('A new source shape needs --rebake-all-body')
 atlas_node=material.node_tree.nodes.new('ShaderNodeTexImage');principled=material.node_tree.nodes.get('Principled BSDF')
 if not principled:raise RuntimeError('Native source body needs an explicit principled material')
 principled.inputs['Metallic'].default_value=0;principled.inputs['Roughness'].default_value=.82;material.node_tree.links.new(atlas_node.outputs['Color'],principled.inputs['Base Color'])
normal_repairs=[]
if a.normal_repair:
 repair=json.loads(a.normal_repair.read_text());bm=bmesh.new();bm.from_mesh(body.data);normal_matrix=body.matrix_world.to_3x3().inverted().transposed()
 for region in repair['regions']:
  desired=Vector(region['outward']).normalized();count=0
  for face in bm.faces:
   center=body.matrix_world@face.calc_center_median();normal=normal_matrix@face.normal
   if all(region['min'][i]<=center[i]<=region['max'][i] for i in range(3)) and normal.dot(desired)<0:face.normal_flip();count+=1
  normal_repairs.append({'region':region,'reversedFaces':count})
 bm.normal_update();bm.to_mesh(body.data);bm.free();body.data.update()
def pixels(image):
 values=np.empty(image.size[0]*image.size[1]*4,dtype=np.float32);image.pixels.foreach_get(values);return values.reshape(image.size[1],image.size[0],4)
if a.reunwrap:
 if not a.rebake_all_body:raise RuntimeError('Reunwrap requires a complete new native body bake')
 bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.45,island_margin=.001,area_weight=.8,correct_aspect=True,scale_to_bounds=True);bpy.ops.object.mode_set(mode='OBJECT')
old=pixels(atlas) if atlas and tuple(atlas.size)==(width,height) else np.zeros((height,width,4),dtype=np.float32);result=np.zeros_like(old) if a.rebake_all_body else old.copy();result[:,:,3]=1;coverage=np.zeros((height,width),dtype=bool);changed=np.zeros_like(coverage);nearest=np.full((height,width),np.inf,dtype=np.float32)
if a.body_source.resolve()==source.resolve():
 # The fresh, neutral body is already loaded. Blender refuses linking its own
 # file; copy that untouched native geometry without changing source bytes.
 original=body.copy();original.data=body.data.copy()
else:
 with bpy.data.libraries.load(str(a.body_source.resolve()),link=False) as (library,data):data.objects=[name for name in library.objects if 'review-mesh' in name]
 original=max((o for o in data.objects if o and o.type=='MESH'),key=lambda o:len(o.data.vertices))
positions=np.array([tuple(original.matrix_world@v.co) for v in original.data.vertices],dtype=np.float32);lo=positions.min(axis=0);hi=positions.max(axis=0)
# Bounds source is not a second runtime actor. Even an unlinked object can be
# reached through its armature parent by the glTF exporter; discard this copy.
bpy.data.objects.remove(original,do_unlink=True)
guides={}
if bool(a.left)!=bool(a.right):raise RuntimeError('Both side guides are required; never silently mirror one')
for role,path in [('front',a.front),('back',a.back),*([('left',a.left),('right',a.right)] if a.left else [])]:
 image=bpy.data.images.load(str(path.resolve()),check_existing=True);values=pixels(image);rows,cols=np.nonzero(values[:,:,3]>.5)
 if not len(rows) or len(rows)==image.size[0]*image.size[1]:raise RuntimeError('Guide requires actual alpha')
 guides[role]=(values,np.array([cols.min()/image.size[0],cols.max()/image.size[0],rows.min()/image.size[1],rows.max()/image.size[1]],dtype=np.float32))
semantic=json.loads(a.semantic_mask.read_text()) if a.semantic_mask else None
if semantic:
 if semantic.get('units')!='metres' or semantic.get('space')!='blender-world':raise RuntimeError('Semantic geometry must use native Blender-world metres')
 attribute_names=['CostumeSkinAllowed','CostumeWarmAllowed','CostumeArmSkinOnly']
 for name in attribute_names:
  if body.data.attributes.get(name) is None:body.data.attributes.new(name,'FLOAT','POINT')
 # CustomData allocation can invalidate older RNA attribute references. Fetch
 # all handles only after the last new layer exists, before writing values.
 attributes={name:body.data.attributes[name] for name in attribute_names}
 if any(len(attr.data)!=len(body.data.vertices) for attr in attributes.values()):raise RuntimeError('Recipient attribute storage does not match the actual mesh')
 arms=[]
 for side in ['Left','Right']:
  for name in [side+'ForeArm',side+'Hand',*([side+'Arm'] if 'bareUpperArmFromFraction' in semantic else [])]:
   bone=rig.data.bones.get(name)
   if bone:arms.append((name,rig.matrix_world@bone.head_local,rig.matrix_world@bone.tail_local))
 for vertex in body.data.vertices:
  point=body.matrix_world@vertex.co;skin=point.z>=semantic.get('headSkinAbove',1.50);arm_skin=False
  for name,first,last in arms:
   delta=last-first;t=max(0,min(1,(point-first).dot(delta)/max(delta.length_squared,1e-9)));distance=(point-first-delta*t).length
   minimum=semantic.get('bareUpperArmFromFraction',1) if name.endswith('Arm') and not name.endswith('ForeArm') else semantic.get('bareForearmFromFraction',.16)
   if distance<semantic.get('bareArmRadius',.10) and ('Hand' in name or t>=minimum):skin=True;arm_skin=True
  for volume in semantic.get('exposedVolumes',[]):
   if all(volume['min'][axis]<=point[axis]<=volume['max'][axis] for axis in range(3)):skin=True
  warm=skin or any(all(volume['min'][axis]<=point[axis]<=volume['max'][axis] for axis in range(3)) for volume in semantic.get('preserveWarmVolumes',[]))
  attributes['CostumeSkinAllowed'].data[vertex.index].value=float(skin);attributes['CostumeWarmAllowed'].data[vertex.index].value=float(warm);attributes['CostumeArmSkinOnly'].data[vertex.index].value=float(arm_skin and semantic.get('forceSkinOnArmSurfaces',False))
skin_attr=body.data.attributes.get('CostumeSkinAllowed');warm_attr=body.data.attributes.get('CostumeWarmAllowed');arm_attr=body.data.attributes.get('CostumeArmSkinOnly')
def sample(image,uv):
 x=np.clip(uv[:,0]*image.shape[1]-.5,0,image.shape[1]-1);y=np.clip(uv[:,1]*image.shape[0]-.5,0,image.shape[0]-1);x0=x.astype(np.int32);y0=y.astype(np.int32);x1=np.minimum(x0+1,image.shape[1]-1);y1=np.minimum(y0+1,image.shape[0]-1);tx=(x-x0)[:,None];ty=(y-y0)[:,None];return (image[y0,x0]*(1-tx)+image[y0,x1]*tx)*(1-ty)+(image[y1,x0]*(1-tx)+image[y1,x1]*tx)*ty
def linear(rgb):return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
def srgb(rgb):return np.where(rgb<=.0031308,rgb*12.92,1.055*np.maximum(rgb,0)**(1/2.4)-.055)
def donor(role,points,repair=False):
 image,box=guides[role];axis=1 if role in ['left','right'] else 0
 u=(points[:,axis]-lo[axis])/(hi[axis]-lo[axis]);u=1-u if role in ['back','right'] else u
 v=(points[:,2]-lo[2])/(hi[2]-lo[2]);uv=np.column_stack((box[0]+u*(box[1]-box[0]),box[2]+v*(box[3]-box[2])))
 if repair:
  columns=semantic['repairColumns'][role];upper=np.where(points[:,0]>0,columns['torso'][1],columns['torso'][0]);lower=columns.get('pants',columns['torso']);uv[:,0]=np.where(points[:,2]<a.pants_below,np.where(points[:,0]>0,lower[1],lower[0]),upper)
 return sample(image,uv),uv

def project(points,normals,allow_skin,allow_warm,arm_only):
 samples={role:donor(role,points) for role in guides};blend=np.clip((normals[:,1]+.35)/.7,0,1);blend=blend*blend*(3-2*blend);weights={}
 for role,(data,uv) in samples.items():
  valid=(data[:,3]>.45).astype(np.float64)
  if semantic:
   color=linear(data[:,:3]);rule=semantic.get('sourceSkinRule',{})
   warm=(color[:,0]>color[:,1]*rule.get('redGreenRatio',1.35))&(color[:,0]>color[:,2]*rule.get('redBlueRatio',1.65))&(color[:,0]>rule.get('minimumLinearRed',.075))
   if 'maximumRedGreenRatio' in rule:warm&=color[:,0]<color[:,1]*rule['maximumRedGreenRatio']
   if 'maximumRedBlueRatio' in rule:warm&=color[:,0]<color[:,2]*rule['maximumRedBlueRatio']
   if 'minimumBlueGreenRatio' in rule:warm&=color[:,2]>color[:,1]*rule['minimumBlueGreenRatio']
   zones=semantic.get('sourceSkinZones',{}).get(role)
   if zones is not None:
    inside=np.zeros(len(points),dtype=bool)
    for zone in zones:inside|=((uv>=np.array(zone['min']))&(uv<=np.array(zone['max']))).all(axis=1)
    warm&=inside
   valid*=1-warm*(1-allow_warm);valid*=1-arm_only*(1-warm)
  if a.left:
   direction={'front':-normals[:,1],'back':normals[:,1],'left':normals[:,0],'right':-normals[:,0]}[role]
   weights[role]=np.maximum(direction,0)**4*valid
  else:weights[role]=((1-blend if role=='front' else blend)+.001)*valid
 total=sum(weights.values());rgb=sum(linear(samples[role][0][:,:3])*weight[:,None] for role,weight in weights.items())/np.maximum(total[:,None],.00001)
 if semantic:
  repair_front=linear(donor('front',points,True)[0][:,:3]);repair_back=linear(donor('back',points,True)[0][:,:3]);fabric=repair_front*(1-blend[:,None])+repair_back*blend[:,None]
 else:
  fabric=np.tile(np.array(a.cloth_color),(len(points),1))
  if a.pants_color:fabric[points[:,2]<a.pants_below]=a.pants_color
 fallback=fabric*(1-allow_skin[:,None])+np.array(a.skin_color)*allow_skin[:,None]
 rgb=np.where((total>.0001)[:,None],rgb,fallback)
 if semantic:
  for accessory in semantic.get('accessoryProjections',[]):
   lower=np.array(accessory['min']);upper=np.array(accessory['max']);feather=accessory.get('feather',.006)
   distance=np.minimum(points-lower,upper-points).min(axis=1);mask=np.clip((distance+feather)/max(feather,1e-5),0,1)
   axis=accessory.get('horizontalAxis',0);u=np.clip((points[:,axis]-lower[axis])/(upper[axis]-lower[axis]),0,1);v=np.clip((points[:,2]-lower[2])/(upper[2]-lower[2]),0,1)
   uv=np.column_stack((accessory['u'][0]+u*(accessory['u'][1]-accessory['u'][0]),accessory['v'][0]+v*(accessory['v'][1]-accessory['v'][0])))
   photo=linear(sample(guides[accessory.get('guide','front')][0],uv)[:,:3]);rgb=rgb*(1-mask[:,None])+photo*mask[:,None]
 return srgb(rgb),total>.0001

body.data.calc_loop_triangles();uv=body.data.uv_layers.active.data;matrix=body.matrix_world;normal_matrix=matrix.to_3x3().inverted().transposed();holes=0;filled=0;valid_fills=0;zero_area=0
for tri in body.data.loop_triangles:
 coords=np.array([tuple(uv[index].uv) for index in tri.loops],dtype=np.float64);minx=max(0,int(math.floor(coords[:,0].min()*width))-1);maxx=min(width-1,int(math.ceil(coords[:,0].max()*width))+1);miny=max(0,int(math.floor(coords[:,1].min()*height))-1);maxy=min(height-1,int(math.ceil(coords[:,1].max()*height))+1)
 if maxx<minx or maxy<miny:continue
 gridx,gridy=np.meshgrid(np.arange(minx,maxx+1),np.arange(miny,maxy+1));u=(gridx+.5)/width;v=(gridy+.5)/height;x0,y0=coords[0];x1,y1=coords[1];x2,y2=coords[2];den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
 if abs(den)<1e-13:zero_area+=1;continue
 w0=((y1-y2)*(u-x2)+(x2-x1)*(v-y2))/den;w1=((y2-y0)*(u-x2)+(x0-x2)*(v-y2))/den;w2=1-w0-w1;inside=(w0>=-1e-6)&(w1>=-1e-6)&(w2>=-1e-6);coverage[gridy[inside],gridx[inside]]=True
 # Tiny UV islands may contain no pixel centre at all. A centre-only bake can
 # therefore leave a visibly large model triangle sampling an empty gutter.
 # Conservatively author the nearest texel footprint, choosing the closest
 # triangle so a neighboring island's real black cannot be painted over.
 clipped=np.maximum(np.stack((w0,w1,w2),axis=2),0);clipped/=np.maximum(clipped.sum(axis=2)[:,:,None],1e-12);projected=clipped@coords;distance=(projected[:,:,0]*width-(gridx+.5))**2+(projected[:,:,1]*height-(gridy+.5))**2
 missing=(np.ones_like(distance,dtype=bool) if a.rebake_all_body else old[gridy,gridx,:3].max(axis=2)<.005)&(distance<=2.25)&(distance<nearest[gridy,gridx]-1e-7)
 if not missing.any():continue
 xs=gridx[missing];ys=gridy[missing];weights=clipped[missing];verts=np.array([tuple(matrix@body.data.vertices[index].co) for index in tri.vertices]);normals=np.array([tuple(normal_matrix@body.data.corner_normals[index].vector) for index in tri.loops]);points=weights@verts;normal=weights@normals;normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-8);allow=np.ones(len(points)) if warm_attr is None else weights@np.array([warm_attr.data[index].value for index in tri.vertices]);skin=np.zeros(len(points)) if skin_attr is None else weights@np.array([skin_attr.data[index].value for index in tri.vertices]);arm=np.zeros(len(points)) if arm_attr is None else weights@np.array([arm_attr.data[index].value for index in tri.vertices]);rgb,valid=project(points,normal,skin,allow,arm);positive=np.isfinite(rgb).all(axis=1)&(rgb.max(axis=1)>.005)
 nearest[ys,xs]=distance[missing];result[ys,xs]=[0,0,0,1] if a.rebake_all_body else old[ys,xs];changed[ys,xs]=False;result[ys[positive],xs[positive],:3]=rgb[positive];result[ys[positive],xs[positive],3]=1;changed[ys[positive],xs[positive]]=True;holes+=len(points);valid_fills+=int((valid&positive).sum())
# Two texel borders are authored from the nearest newly filled island texel.
# Only outside geometric UV coverage; no other face's real black is recoloured.
padded=changed.copy();padding=0
for step in range(0):
 prior=padded.copy()
 for dy,dx in [(0,1),(0,-1),(1,0),(-1,0),(1,1),(-1,-1),(1,-1),(-1,1)]:
  neighbor=np.roll(prior,(dy,dx),(0,1));neighbor[:dy if dy>0 else 0,:]=False
  if dy<0:neighbor[dy:,:]=False
  if dx>0:neighbor[:,:dx]=False
  if dx<0:neighbor[:,dx:]=False
  mask=neighbor&~padded&~coverage&(old[:,:,:3].max(axis=2)<.005)
  if mask.any():shifted=np.roll(result,(dy,dx),(0,1));result[mask]=shifted[mask];padded[mask]=True;padding+=int(mask.sum())
filled=int(changed.sum())
if not a.rebake_all_body and not np.array_equal(old[:,:,:3][old[:,:,:3].max(axis=2)>=.005],result[:,:,:3][old[:,:,:3].max(axis=2)>=.005]):raise RuntimeError('Existing valid authored pixels changed')
image=bpy.data.images.new('Authored complete costume UV coverage',width,height,alpha=False);image.colorspace_settings.name='sRGB';image.pixels.foreach_set(result.ravel());image.filepath_raw=str(a.output.with_suffix('.body-uv.png'));image.file_format='PNG';image.save();image.pack();atlas_node.image=image
neck_color=None
if a.neck_skin and bpy.data.objects.get('AuthoredSkinNeckBacking'):
 skin=bpy.data.materials.get('Left authored warm skin') or bpy.data.materials.get('Right authored warm skin');color=list(skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value) if skin else [.40,.22,.13,1];neck=bpy.data.objects['AuthoredSkinNeckBacking'];neckmat=neck.data.materials[0];nodes=neckmat.node_tree.nodes;links=neckmat.node_tree.links;nodes.clear();principled=nodes.new('ShaderNodeBsdfPrincipled');principled.inputs['Base Color'].default_value=color;principled.inputs['Roughness'].default_value=.68;principled.inputs['Metallic'].default_value=0;output=nodes.new('ShaderNodeOutputMaterial');links.new(principled.outputs[0],output.inputs['Surface']);neck_color=color
bpy.ops.wm.save_as_mainfile(filepath=str(a.output.with_suffix('.blend')));bpy.ops.export_scene.gltf(filepath=str(a.output),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=False,export_skins=True,export_morph=False,export_yup=True,export_apply=False);helper=runpy.run_path(str(Path(__file__).with_name('rig_character.py')),run_name='rig_helper');helper['restrict_handoff_channels'](a.output,contract['pose'].get('upperBodyNodes',[]));a.output.with_suffix('.rig.json').write_text(json.dumps(contract,separators=(',',':')))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();report={'status':'UNREVIEWED native mesh→UV authoring; real scene and independent likeness acceptance remain required','source':str(source),'sourceSha256':sha(source),'fullBodySource':str(a.body_source),'fullBodySourceSha256':sha(a.body_source),'projectionBodyBounds':[lo.tolist(),hi.tolist()],'frontGuide':str(a.front),'frontSha256':sha(a.front),'backGuide':str(a.back),'backSha256':sha(a.back),'sideGuides':{role:{'path':str(path),'sha256':sha(path)} for role,path in [('left',a.left),('right',a.right)] if path},'semanticMask':{'path':str(a.semantic_mask),'sha256':sha(a.semantic_mask),'settings':semantic} if semantic else None,'preservedAllAnimationNames':[action.name for action in bpy.data.actions if action.name in ['Idle','Read','Walk','Dance','TakePizza']],'guideEvidence':'Synthetic artist scaffold with inferred unseen rear, not film evidence','authoredTexels':filled,'projectedTexels':holes,'sourceAlphaValidSamples':valid_fills,'outsideUvPaddingTexels':padding,'zeroAreaUvTriangles':zero_area,'fullBodyNativeUvRebake':a.rebake_all_body,'nativeUvReunwrap':a.reunwrap,'normalRepairs':normal_repairs,'originalNonzeroPixelsUnchanged':not a.rebake_all_body,'frontDetailedHeadUnchanged':True,'addedNeckSkinLinearColour':neck_color,'producerSha256':sha(Path(__file__)),'producerArguments':sys.argv[sys.argv.index('--')+1:],'outputGlbSha256':sha(a.output)};a.output.with_suffix('.production.json').write_text(json.dumps(report,indent=2));a.output.with_suffix('.uv-script.py').write_bytes(Path(__file__).read_bytes());print('NEW_COMPLETE_UV_CANDIDATE '+json.dumps(report))
