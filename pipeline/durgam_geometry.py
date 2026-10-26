"""Source-supported Durgam carriageway lane fields; never change source XY.

The builder and current OSM source ways agree on three lanes each way. Lane
width3.2m is an explicit rendering assumption, giving9.6m carriageways inside
the25.8m overall deck. Run report before apply; shared shopfront lock serializes
all pack writes with other importers. Every canonical/context copy is updated.
"""
import argparse
import gzip
import json
import math
from pathlib import Path
from shapely.geometry import LineString
from ocr_state import BUILD, worker_lock
from orr_geometry import atomic_pack

ROOT=Path(__file__).resolve().parents[1]
CITY=ROOT/'game/public/city'
BUILDER='https://www.larsentoubro.com/media/42542/2020-09-25-lt-built-iconic-durgam-cheruvu-cable-stay-bridge-dedicated-to-the-people-of-hyderbad.pdf'

def prepare(core,evidence):
    origin=core['origin'];kx=math.cos(math.radians(origin['lat']))*6380050.094*math.pi/180;kz=6341141.9*math.pi/180
    sources=[r for r in evidence['elements'] if r['tags'].get('name')=='Durgam Cheruvu Bridge' and r['tags'].get('lanes')=='3' and r['tags'].get('oneway')=='yes']
    if len(sources)<4:raise ValueError('Incomplete source bridge lane evidence')
    lines=[LineString([((p['lon']-origin['lon'])*kx,-(p['lat']-origin['lat'])*kz)for p in r['geometry']])for r in sources]
    roads=[e for e in core['roads'] if e.get('name')=='Durgam Cheruvu Bridge']
    if len(roads)!=5:raise ValueError('Durgam canonical edge inventory changed; review before applying')
    patches={};matches=[]
    for e in roads:
        if e.get('oneway')not in('forward','backward'):raise ValueError('Unexpected two-way bridge edge')
        line=LineString(e['pts']);n=max(1,math.ceil(line.length/20));samples=[line.interpolate(line.length*i/n)for i in range(n+1)];ds=[min(p.distance(s)for s in lines)for p in samples];coverage=sum(d<5 for d in ds)/len(ds);p95=sorted(ds)[int(len(ds)*.95)]
        if coverage<.95 or p95>1:raise ValueError(f'Unverified source alignment for {e["id"]}')
        patch={'lanes':3,'w':9.6,'laneEvidence':{'sources':[evidence['sourceUrl'],BUILDER],'sourceWays':[r['id']for r in sources],'reviewedOn':'2026-10-26','confidence':'high-for-three-lanes; model-width-assumption','uncertainty':'3.2m per lane is a rendering assumption. Preserve mapped XY; inherited edge endpoints include up to34m beyond exact source-way overlap.'}}
        patches[e['id']]=patch;matches.append({'id':e['id'],'length':round(line.length,1),'sampleCoverageWithin5m':round(coverage,4),'p95Distance':round(p95,3),'maximumDistance':round(max(ds),3),'oldLanes':e['lanes'],'oldWidth':e['w']})
    return patches,{'roads':len(roads),'sourceWays':len(sources),'matches':matches,'alignmentChanged':False,'laneWidthAssumption':3.2,'carriagewayWidth':9.6,'overallBridgeWidth':25.8}

def load(p):return json.loads(gzip.decompress(p.read_bytes()))
def apply(city,core,patches):
    changed=0;copies=0;plans=[]
    canonical={e['id']:e for e in core['roads'] if e['id']in patches}
    # Read/validate all copies before mutating any file.
    for info in core['packs']:
        p=city/info['file'];pack=load(p);dirty=False
        for tile in pack['tiles'].values():
            for e in tile['roads']:
                patch=patches.get(e['id'])
                if not patch:continue
                copies+=1
                # Context copies intentionally omit names; their exact source XY
                # must match before a name-less copy may receive lane fields.
                if e['pts']!=canonical[e['id']]['pts'] or (e.get('name')!='Durgam Cheruvu Bridge' and not(e.get('ctx') and e.get('name')is None)):raise ValueError('Source ID/name/geometry mismatch')
                if any(e.get(k)!=v for k,v in patch.items()):e.update(patch);dirty=True;changed+=1
        if dirty:plans.append((p,pack))
    for p,pack in plans:atomic_pack(p,pack)
    for info in core['packs']:info['bytes']=(city/info['file']).stat().st_size
    dirty=bool(plans)
    for e in core['roads']:
        patch=patches.get(e['id'])
        if patch and any(e.get(k)!=v for k,v in patch.items()):e.update(patch);dirty=True
    if dirty:atomic_pack(city/'core.pack.wasm',core)
    return {'roadCopiesFound':copies,'roadCopiesUpdated':changed,'packsChanged':len(plans)}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--city',type=Path,default=CITY);p.add_argument('--evidence',type=Path,default=ROOT/'pipeline/evidence/durgam-roads-2026-10-26.json');p.add_argument('--report',type=Path,default=ROOT/'pipeline/evidence/durgam-lanes-audit-2026-10-26.json');p.add_argument('--apply',action='store_true');a=p.parse_args()
    with worker_lock(BUILD/'shopfront-apply'),worker_lock(BUILD/'durgam-geometry'):
        core=load(a.city/'core.pack.wasm');evidence=json.loads(a.evidence.read_text());patches,report=prepare(core,evidence)
        if a.apply:report.update(apply(a.city,core,patches))
        report.update(applied=a.apply,sources=[evidence['sourceUrl'],BUILDER]);a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
