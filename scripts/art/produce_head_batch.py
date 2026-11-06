"""Run the bounded density-streamed TripoSR head pipeline sequentially.

Only raw, unapproved head source meshes are created. This is offline asset
production, never a device-performance benchmark or an appearance approval.
"""
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
identities=['ram-vvr','devara','arundhati','jessie','hasini','bhanumathi','sukumar','vakeel-saab',
            'vakeel-woman-1','vakeel-woman-2','vakeel-woman-3','maruthi','arjun-reddy','nani-jersey']
for identity in identities:
    guide=production/(identity+'-head-guide-transparent-v1.png')
    if not guide.exists():raise RuntimeError('Missing reviewed draft input guide: '+str(guide))
for identity in identities:
    output=candidates/(identity+'-triposr-head-v1.glb')
    if output.exists():
        print('PRESERVED '+identity,flush=True);continue
    if Path('/tmp/roadster-art-production.pause').exists():
        print('Paused between GPU jobs.',flush=True);sys.exit(0)
    guide=production/(identity+'-head-guide-transparent-v1.png')
    command=[str(runtime/'triposr-venv/bin/python'),str(production/'local_character_generate_streamed_v2.py'),str(guide),
             '--weights',str(runtime/'weights/triposr'),'--output',str(output),'--resolution','256','--texture','2048']
    environment=dict(os.environ,PYTHONPATH=str(runtime/'TripoSR'),PYTHONUNBUFFERED='1',OMP_NUM_THREADS='2')
    log=Path('/tmp')/('roadster-'+identity+'-bounded-head.log')
    print('START '+identity,flush=True)
    with log.open('x') as handle:
        result=subprocess.run(command,cwd=runtime/'TripoSR',env=environment,stdout=handle,stderr=subprocess.STDOUT)
    if result.returncode:
        print('STOP '+identity+' exit='+str(result.returncode)+' '+str(log),flush=True);sys.exit(result.returncode)
    report=json.loads(output.with_suffix('.production.json').read_text())
    print('DRAFT '+identity+' '+str(round(report['seconds'],1))+'sec '+report['sha256'],flush=True)
    time.sleep(2)
print('Queued head source meshes complete. No character is approved.',flush=True)
