"""Render exact exported GLB bytes, not its higher-detail authoring source.
Blender --background --factory-startup --python this.py -- --input GLB --output NEW_DIR
Outputs are isolated actual-model views; separate in-game approval is required.
"""
import argparse,sys,runpy,json,hashlib
from pathlib import Path
import bpy
p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--angle-offset',type=float,default=0);p.add_argument('--material',choices=['authored','clay','unlit'],default='authored');p.add_argument('--views',default='front,three-quarter,profile,back,full-body');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
if a.output.exists():raise RuntimeError('Preserve prior exact review evidence')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(a.input.resolve()))
sys.argv=['render_character.py','--','--output',str(a.output),'--clip','Idle','--frame','12','--views',a.views,'--material',a.material,'--fit-visible-vertices','--angle-offset',str(a.angle_offset)]
runpy.run_path(str(Path(__file__).with_name('render_character.py')),run_name='__main__')
files=[{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(a.output.glob('*.png'))]
(a.output/'exact-input.json').write_text(json.dumps({'input':str(a.input),'glbSha256':hashlib.sha256(a.input.read_bytes()).hexdigest(),'orbitAngleOffsetRadians':a.angle_offset,'material':a.material,'status':'Isolated exact compact GLB views; not in-game or appearance approval','views':files},indent=2)+'\n')
