"""Bounded local draft production using the installed upstream MLX pipeline.

Only produces new unapproved source art. Run one GPU process at a time, outside
interactive gameplay measurements. No input image, existing mesh or model
weights are edited. Code/model licences and weights are recorded separately.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import subprocess
import threading
import time

parser=argparse.ArgumentParser()
parser.add_argument('image',type=Path)
parser.add_argument('--weights',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
if not args.image.exists() or not args.weights.is_dir():raise RuntimeError('Verified local input and weights are required.')
if args.output.exists() or args.output.with_suffix('.production.json').exists():raise RuntimeError('Existing candidates are immutable; choose new outputs.')
samples=[];stopped=threading.Event();started=time.monotonic()
def sample(stage):
    pressure=subprocess.run(['/usr/bin/memory_pressure'],capture_output=True,text=True,check=True).stdout
    match=re.search(r'System-wide memory free percentage: (\d+)%',pressure)
    free=int(match.group(1)) if match else None
    rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    record={'stage':stage,'seconds':round(time.monotonic()-started,3),'systemFreePercent':free,'maxRssBytes':rss}
    samples.append(record)
    if (free is not None and free<20) or rss>5*1024**3:
        args.output.with_suffix('.production.json').write_text(json.dumps({'status':'STOPPED memory guard; no accepted art','samples':samples},indent=2))
        print('Stopped draft producer to preserve interactive system memory.',flush=True)
        os._exit(75)
def watch():
    while not stopped.wait(1):sample('inference-watch')
sample('before-load')
thread=threading.Thread(target=watch,daemon=True);thread.start()
try:
    import mlx.core as mx
    from hy3dmlx.pipeline import Hunyuan3DShapePipeline
    # A hard lower cap; never disable Metal's safety budget for production.
    mx.set_memory_limit(5*1024**3)
    mx.set_cache_limit(256*1024**2)
    pipe=Hunyuan3DShapePipeline.from_pretrained(str(args.weights),dtype=mx.float16,quantize=8)
    sample('weights-ready')
    mesh=pipe.generate(str(args.image),num_inference_steps=30,guidance_scale=5.0,octree_resolution=256,seed=42,octree_decode=True)
    sample('mesh-ready')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    mesh.export(str(args.output))
finally:
    stopped.set();thread.join(timeout=2)
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
report={'status':'UNAPPROVED real volumetric source mesh; independent appearance, topology, rig and scene review required',
        'image':str(args.image),'inputSha256':sha(args.image),'file':str(args.output),'sha256':sha(args.output),
        'bytes':args.output.stat().st_size,'vertices':len(mesh.vertices),'triangles':len(mesh.faces),
        'seconds':time.monotonic()-started,'settings':{'steps':30,'guidance':5,'resolution':256,'seed':42,'dtype':'float16','quantizeBits':8,'octreeDecode':True,'mlxMemoryLimitBytes':5*1024**3},
        'memorySamples':samples,'backend':'Upstream Hunyuan3D-Swift Python MLX parity implementation; local verified model'}
args.output.with_suffix('.production.json').write_text(json.dumps(report,indent=2)+'\n')
print('NEW_UNAPPROVED_SHAPE '+str(args.output),flush=True)
