"""Sequential, restartable unapproved-art queue; never overlaps GPU jobs."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root=Path(__file__).resolve().parents[2]
production=root/'docs/delivery/character-review/production'
candidates=root/'docs/delivery/character-review/candidates'
runtime=Path('/Users/tharun/Documents/Codex/2026-10-29/character-production-tools')
items=[
 ('devara','devara-a-pose-guide-transparent-v1.png'),
 ('arundhati','arundhati-a-pose-guide-transparent-v1.png'),
 ('jessie','jessie-a-pose-guide-transparent-v1.png'),
 ('hasini','hasini-a-pose-guide-transparent-v1.png'),
 ('bhanumathi','bhanumathi-a-pose-guide-transparent-v1.png'),
 ('sukumar','sukumar-a-pose-guide-transparent-v1.png'),
 ('vakeel-saab','vakeel-saab-a-pose-guide-transparent-v1.png'),
 ('vakeel-woman-1','vakeel-woman-1-a-pose-guide-transparent-v1.png'),
 ('vakeel-woman-2','vakeel-woman-2-a-pose-guide-transparent-v1.png'),
 ('vakeel-woman-3','vakeel-woman-3-a-pose-guide-transparent-v1.png'),
 ('maruthi','maruthi-a-pose-guide-transparent-v1.png'),
 ('arjun-reddy','arjun-reddy-a-pose-guide-transparent-v1.png'),
 ('nani-jersey','nani-jersey-a-pose-guide-transparent-v1.png'),
]
for identity,filename in items:
    output=candidates/(identity+'-hy3d-mlx-shape-v1.glb')
    if output.exists():
        print('PRESERVED '+identity,flush=True);continue
    if Path('/tmp/roadster-art-production.pause').exists():
        print('Paused between GPU jobs.',flush=True);sys.exit(0)
    command=[str(runtime/'hy3d-venv/bin/python'),str(root/'scripts/art/generate_shape.py'),str(production/filename),'--weights',str(runtime/'weights/shape-small'),'--output',str(output)]
    environment=dict(os.environ,PYTHONPATH=str(runtime/'Hunyuan3D-Swift/python/shape'),PYTHONUNBUFFERED='1')
    log=Path('/tmp')/('roadster-'+identity+'-bounded-shape.log')
    print('START '+identity,flush=True)
    with log.open('x') as handle:
        result=subprocess.run(command,cwd=root,env=environment,stdout=handle,stderr=subprocess.STDOUT)
    if result.returncode:
        print('STOP '+identity+' exit='+str(result.returncode)+' '+str(log),flush=True);sys.exit(result.returncode)
    report=json.loads(output.with_suffix('.production.json').read_text())
    print('DRAFT '+identity+' '+str(round(report['seconds'],1))+'sec '+report['sha256'],flush=True)
    time.sleep(2)
print('All queued source shapes produced. None is approved for the game.',flush=True)
