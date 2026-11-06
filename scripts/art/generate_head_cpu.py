"""Local unapproved CPU head producer. Upstream MIT TripoSR inference.
Explicit CPU execution avoids duplicate unified-memory MPS allocations. Same
weights and operations, same5GiB/20percent guards, bounded192density grid.
Apple MPS; explicit CPU scikit-image marching cubes adaptation; native OpenGL
UV baking; in-memory official alpha preprocessing. Does not change input files.
"""
import argparse, pathlib, json, time, hashlib, subprocess, re, os
import psutil
from skimage.measure import marching_cubes as sk_marching_cubes
import numpy as np
import torch
import trimesh
from PIL import Image
from tsr.system import TSR
from tsr.utils import resize_foreground
from tsr import bake_texture as baker

ap=argparse.ArgumentParser();ap.add_argument('image');ap.add_argument('--weights',required=True);ap.add_argument('--output',required=True);ap.add_argument('--resolution',type=int,default=256);ap.add_argument('--texture',type=int,default=2048);args=ap.parse_args()
out=pathlib.Path(args.output);assert not out.exists(),f'Refusing overwrite: {out}'
memory_samples=[]
def guard_memory(stage):
 pressure=subprocess.run(['/usr/bin/memory_pressure'],capture_output=True,text=True,check=True).stdout
 match=re.search(r'System-wide memory free percentage: (\d+)%',pressure)
 free=int(match.group(1)) if match else None
 rss=psutil.Process(os.getpid()).memory_info().rss
 driver=torch.mps.driver_allocated_memory() if torch.backends.mps.is_available() else 0
 memory_samples.append({'stage':stage,'systemFreePercent':free,'rssBytes':rss,'mpsDriverBytes':driver})
 if free is not None and free<20:raise RuntimeError(f'Producer stopped: system free memory {free}% below20% limit at{stage}')
 if max(rss,driver)>5*1024**3:raise RuntimeError(f'Producer stopped: RSS/MPS driver allocation exceeds5GiB at{stage}')
guard_memory('before-load')
t0=time.monotonic();device='cpu';print('Device:',device,flush=True)
raw=Image.open(args.image).convert('RGBA');img=resize_foreground(raw,.85);arr=np.array(img).astype(np.float32)/255;rgb=arr[:,:,:3]*arr[:,:,3:4]+(1-arr[:,:,3:4])*.5;image=Image.fromarray((rgb*255).astype(np.uint8))
print('Original alpha preprocessing complete; no source image edited',flush=True)
model=TSR.from_pretrained(args.weights,config_name='config.yaml',weight_name='model.ckpt');model.renderer.set_chunk_size(4096);model.to(device);guard_memory('weights-ready');print('Weights ready',time.monotonic()-t0,flush=True)
with torch.inference_mode():
 scene_codes=model([image],device=device)
 if device=='mps':torch.mps.synchronize()
 print('Neural inference complete',time.monotonic()-t0,flush=True)
 # Stream no more than eight x-slices. Keep only density on CPU, never all
 # dense 3D positions or color/features for the whole grid on MPS.
 resolution=args.resolution;radius=model.renderer.cfg.radius
 axis=np.linspace(-radius,radius,resolution,dtype=np.float32)
 density=np.empty((resolution,resolution,resolution),dtype=np.float32)
 for start in range(0,resolution,8):
  stop=min(start+8,resolution)
  xyz=np.stack(np.meshgrid(axis[start:stop],axis,axis,indexing='ij'),axis=-1).reshape(-1,3)
  points=torch.from_numpy(xyz).to(device)
  values=model.renderer.query_triplane(model.decoder,points,scene_codes[0])
  density[start:stop]=values['density_act'].detach().cpu().numpy().reshape(stop-start,resolution,resolution)
  del values,points,xyz
  if device=='mps':torch.mps.synchronize();torch.mps.empty_cache()
  guard_memory(f'density-slices-{start}:{stop}')
  print('Density slices',stop,'/',resolution,flush=True)
 verts,faces,_,_=sk_marching_cubes(density,level=25.0)
 verts=verts/(resolution-1)*(2*radius)-radius
 mesh=trimesh.Trimesh(vertices=verts,faces=faces,process=False)
 if mesh.volume<0:mesh.invert()
 with torch.inference_mode():
  points=torch.tensor(np.asarray(mesh.vertices).copy(),dtype=torch.float32,device=device)
  colors=model.renderer.query_triplane(model.decoder,points,scene_codes[0])['color'].detach().cpu().numpy()
 mesh.visual.vertex_colors=(np.clip(colors,0,1)*255).astype(np.uint8)
 del density,points,colors
 if device=='mps':torch.mps.synchronize();torch.mps.empty_cache()
 guard_memory('mesh-complete')
 print('Mesh extracted',len(mesh.vertices),len(mesh.faces),time.monotonic()-t0,flush=True)
 # Native draft with explicit vertex colors can be inspected even if UV baking fails.
 vertex=out.with_name(out.stem+'-vertex-colors.glb');assert not vertex.exists();mesh.export(vertex)
 def mps_positions_to_colors(model,scene_code,positions_texture,texture_resolution):
  output=np.empty((texture_resolution,texture_resolution,4),dtype=np.float32)
  for start in range(0,texture_resolution,8):
   stop=min(start+8,texture_resolution);slab=positions_texture[start:stop]
   positions=torch.tensor(slab[:,:,:3].reshape(-1,3).copy(),device=scene_code.device)
   with torch.inference_mode():queried=model.renderer.query_triplane(model.decoder,positions,scene_code)
   rgb=queried['color'].detach().cpu().numpy().reshape(stop-start,texture_resolution,3)
   output[start:stop,:,:3]=rgb;output[start:stop,:,3]=slab[:,:,3]
   del queried,positions,rgb
   if device=='mps':torch.mps.synchronize();torch.mps.empty_cache()
   if start%128==0:guard_memory(f'texture-rows-{start}:{stop}')
  output[output[:,:,-1]==0]=[0,0,0,0]
  return output
 baker.positions_to_colors=mps_positions_to_colors
 baked=baker.bake_texture(mesh,model,scene_codes[0],args.texture)
 print('Texture baking complete',time.monotonic()-t0,flush=True)
 texture=Image.fromarray((np.clip(baked['colors'],0,1)*255).astype(np.uint8)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
 material=trimesh.visual.material.PBRMaterial(baseColorTexture=texture,metallicFactor=0.0,roughnessFactor=1.0,doubleSided=False)
 bakedmesh=trimesh.Trimesh(vertices=mesh.vertices[baked['vmapping']],faces=baked['indices'],vertex_normals=mesh.vertex_normals[baked['vmapping']],visual=trimesh.visual.TextureVisuals(uv=baked['uvs'],material=material),process=False)
 normals=bakedmesh.vertex_normals
 bakedmesh.export(out,include_normals=True)
report={'file':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'vertices':len(bakedmesh.vertices),'triangles':len(bakedmesh.faces),'seconds':time.monotonic()-t0,'device':device,'sourceSha256':hashlib.sha256(pathlib.Path(args.image).read_bytes()).hexdigest(),'resolution':args.resolution,'memorySamples':memory_samples,'maxRssBytes':max(x['rssBytes'] for x in memory_samples),'maxMpsDriverBytes':max(x['mpsDriverBytes'] for x in memory_samples),'textureSize':args.texture,'backend':'official MIT TripoSR weights, explicit CPU neural inference/query, local CPU scikit-image marching cubes and original native OpenGL texture baker','release':'unapproved, independent actual comparison required'}
out.with_suffix('.production.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2),flush=True)
