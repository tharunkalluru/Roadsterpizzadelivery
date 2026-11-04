"""Bind every finite headroom witness to full official connector identities."""
import argparse,hashlib,json,math,gzip
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--finite',type=Path,required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();assert not a.output.exists()
held={}
def load(path):
 path=Path(path);b=path.read_bytes();held[str(path)]=hashlib.sha256(b).hexdigest();return json.loads(b)
finite=load(a.finite);extra=load(a.source)
source=load('src/world/road-source-geodesic-data.json');retained=load('docs/qa/evidence/reported-roads/tile-boundary-source-audit-20261103/retained-source-2026-10-21.json')
model=load('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/model-be04dc1797d38d0112ad8bec9b7a405e5e766aed69f4420ec8200dd4850a72a7.json')
joint=load('/tmp/roadster-road-freezes/source-9413-af5-pjr-capacity-v1/jointInputBaseline21-e866b9f8bf2217bd25c7a3d45f28cef541e5fc60dbd7deb353cacaea55ed4b5f.json')
rawpack=Path('public/city/packs/p1_-2.pack.wasm');packbytes=rawpack.read_bytes();held[str(rawpack)]=hashlib.sha256(packbytes).hexdigest();rawroads=json.loads(gzip.decompress(packbytes))['tiles']['4_-6']['roads']
patches={r['id']:r for r in source['roads']};roads={r['id']:r for r in rawroads+model['roads']+joint['tileRoads']+joint['contextRoads']};official={r['id']:r for r in retained['rows']+extra['rows']}
for r in source['sources']:official[r['id']]={'id':r['id'],'connectors':r['connectors'],'level_rules':r['levelRules'],'road_flags':r['roadFlags']}
def record(road):
 prefix=road.split('_')[0];rows=[r for k,r in official.items()if k.startswith(prefix)];assert len(rows)==1,'Missing/ambiguous full source identity '+road;return rows[0]
def project(p,road):
 pts=road['pts'];arc=0.;c=[]
 for i,(a,b)in enumerate(zip(pts,pts[1:])):
  dx,dz=b[0]-a[0],b[1]-a[1];run=math.hypot(dx,dz);t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(run*run)));d=math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);c.append((d,arc+t*run,i,t));arc+=run
 best=min(c);assert not any(abs(x[0]-best[0])<1e-6 and abs(x[1]-best[1])>5 for x in c),'Ambiguous distant source branch'
 return{'crossTrackM':best[0],'modelArcM':best[1],'modelLengthM':arc,'segment':best[2],'u':best[3]}
groups={}
for f in finite['headroom']['failures']:groups.setdefault(tuple(f['roads']),[]).append(f)
rows=[]
for pair,witnesses in groups.items():
 left,right=map(record,pair);own=patches[pair[0]];lo,hi=min(own['sourceFractions']),max(own['sourceFractions'])
 active={c['connector_id']:c for c in left['connectors']if lo-1e-10<=c['at']<=hi+1e-10};others={c['connector_id']:c for c in right['connectors']};shared=sorted(set(active)&set(others))
 proof=[]
 for node in shared:
  oc,fc=active[node],others[node];assert node.startswith(roads[pair[0]]['from'])or node.startswith(roads[pair[0]]['to']);assert node.startswith(roads[pair[1]]['from'])or node.startswith(roads[pair[1]]['to']);proof.append({'fullConnectorID':node,'ownOfficialFraction':oc['at'],'otherOfficialFraction':fc['at']})
 classified=[]
 for f in witnesses:
  op=project(f['point'],roads[pair[0]]);fp=project(f['point'],roads[pair[1]])
  # This is SOURCE classification only. No geometric proximity creates a
  # connector, and no shared node authorizes a pair-wide headroom waiver.
  endpoint_dist=None
  if proof:
   assert len(proof)==1;node=proof[0]['fullConnectorID'];at_from=node.startswith(roads[pair[0]]['from']);other_from=node.startswith(roads[pair[1]]['from']);endpoint_dist=[op['modelArcM']if at_from else op['modelLengthM']-op['modelArcM'],fp['modelArcM']if other_from else fp['modelLengthM']-fp['modelArcM']]
  classified.append({**f,'ownProjection':op,'otherProjection':fp,'alongSourceDistanceFromSharedConnector':endpoint_dist})
 rows.append({'roads':list(pair),'fullSourceIDs':[left['id'],right['id']],'sampleCount':len(witnesses),'sourceClassification':'source-connected endpoint approach; finite apron proof/solution required'if proof else'independent or unproved connection: retain strict historical clearance','sharedConnectorProof':proof,'ownLevelRules':left.get('level_rules'),'otherLevelRules':right.get('level_rules'),'ownFlags':left.get('road_flags'),'otherFlags':right.get('road_flags'),'maximumRegressionM':max(f['required']-f['newGap']for f in witnesses),'witnesses':classified,'heightExemptionApproved':False})
assert sum(r['sampleCount']for r in rows)==len(finite['headroom']['failures'])
for path,h in held.items():assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==h
report={'version':1,'releaseApproved':False,'scope':'Full official IDs and exact active connector equality classify all240 literal witnesses. SOURCE classification does not approve the height arrays or finite apron; unknown is kept independent.','sourceRelease':extra['release'],'groups':rows,'summary':{'rawSamples':sum(r['sampleCount']for r in rows),'sourceConnectedSamples':sum(r['sampleCount']for r in rows if r['sharedConnectorProof']),'strictIndependentOrUnprovedSamples':sum(r['sampleCount']for r in rows if not r['sharedConnectorProof'])},'beforeAfterUnchangedInputs':held}
with a.output.open('x')as f:json.dump(report,f,indent=2);f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'summary':report['summary'],'groups':[{k:r[k]for k in['roads','fullSourceIDs','sampleCount','sharedConnectorProof','maximumRegressionM']}for r in rows]}))
