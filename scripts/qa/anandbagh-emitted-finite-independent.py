"""Independent literal Float32 Anandbagh geometry comparison; no runtime edits."""
import argparse,hashlib,json,math
from pathlib import Path
from shapely.geometry import Polygon,LineString
from shapely.strtree import STRtree
import numpy as np
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--physical',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
assert not a.output.exists();raw=a.physical.read_bytes();data=json.loads(raw)
model_path=Path(data['inputs']['old']['path']);model_raw=model_path.read_bytes();model=json.loads(model_raw)
assert hashlib.sha256(model_raw).hexdigest()==data['inputs']['old']['sha256']
ids={'28b00d08-4ff_1','01ceee91-29b_0'};byid={r['id']:r for r in model['roads']}
def area_tri(t):return Polygon([(p[0],p[2])for p in t['points']])
def key(t):return(t['road'],t['segment'],t['cap'],tuple(sorted(tuple(p)for p in t['points'])))
def unpack(records):
 out={}
 for t in records:
  k=key(t)
  if k in out:assert out[k]['lift']==t['lift'] and out[k]['quad']==t['quad'],'Ambiguous literal surface metadata'
  out[k]=t
 return list(out.values())
def plane(t):
 v=t['points'];x,z=v[0][0],v[0][2];dx,dz=v[1][0]-x,v[1][2]-z;ex,ez=v[2][0]-x,v[2][2]-z;det=dx*ez-dz*ex
 gy=((v[1][1]-v[0][1])*ez-(v[2][1]-v[0][1])*dz)/det;gz=(dx*(v[2][1]-v[0][1])-ex*(v[1][1]-v[0][1]))/det
 return lambda p:v[0][1]-t['lift']+gy*(p[0]-x)+gz*(p[1]-z),math.hypot(gy,gz)
def verts(poly):
 if poly.is_empty:return[]
 if poly.geom_type=='Polygon':return list(poly.exterior.coords)[:-1]
 if hasattr(poly,'geoms'):return[q for g in poly.geoms for q in verts(g)]
 return[]
def arc(t,p):
 e=byid[t['road']];i=min(t['segment'],len(e['pts'])-2);prefix=sum(math.dist(e['pts'][n],e['pts'][n+1])for n in range(i));a,b=e['pts'][i:i+2];d=[b[0]-a[0],b[1]-a[1]];run=math.hypot(*d);u=max(0,min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(run*run)))
 return prefix+u*run
versions=[]
for v in data['versions']:
 records=unpack(v['contextEmitted']);polys=[area_tri(t)for t in records];tree=STRtree(polys)
 own_fail=[];remote=[];head_pairs=[];max_own=0;true_grade=[];seen=set()
 for i,t in enumerate(records):
  if t['road']not in ids:continue
  pa,grade=plane(t)
  if grade>.1:true_grade.append({'road':t['road'],'segment':t['segment'],'cap':t['cap'],'gradient':grade,'points':t['points']})
  for j in tree.query(polys[i]):
   j=int(j)
   if j==i:continue
   token=tuple(sorted((i,j)))
   if token in seen:continue
   seen.add(token)
   b=records[j];poly=polys[i].intersection(polys[j]);points=verts(poly)
   if poly.area<1e-6 or not points:continue
   pb,_=plane(b);gaps=[pa(q)-pb(q)for q in points]
   if b['road']==t['road']:
    separation=max(abs(arc(t,q)-arc(b,q))for q in points)
    if separation>byid[t['road']]['w']+2:remote.append({'road':t['road'],'segments':[t['segment'],b['segment']],'maximumArcSeparation':separation,'heightGaps':gaps});continue
    error=max(map(abs,gaps));max_own=max(max_own,error)
    if error>.01:own_fail.append({'road':t['road'],'segments':[t['segment'],b['segment']],'cap':[t['cap'],b['cap']],'area':poly.area,'maximumHeightGap':error,'points':points,'heightGaps':gaps})
   else:head_pairs.append({'roads':[t['road'],b['road']],'segments':[t['segment'],b['segment']],'cap':[t['cap'],b['cap']],'area':poly.area,'polygon':points,'heightGaps':gaps})
 versions.append({'label':v['label'],'literalRecords':len(records),'sameRoadLocalMaximumGap':max_own,'sameRoadLocalFailures':own_fail,'remoteSameRoadIndependentCrossings':remote,'actualTriangleGradeFailures':true_grade,'independentCrossRoadFragments':head_pairs})
oldv,newv=versions;oldrecords=unpack(data['versions'][0]['contextEmitted']);oldpolys=[area_tri(t)for t in oldrecords];oldtree=STRtree(oldpolys)
head_fail=[];head_samples=0;unresolved=[]
for fragment in newv['independentCrossRoadFragments']:
 for q in fragment['polygon']:
  values=[]
  for road in fragment['roads']:
   ys=[]
   from shapely.geometry import Point
   for j in oldtree.query(Point(q)):
    j=int(j)
    if oldrecords[j]['road']==road and oldpolys[j].buffer(1e-7).covers(Point(q)):ys.append(plane(oldrecords[j])[0](q))
   values.append(ys)
  if not all(values):unresolved.append({'roads':fragment['roads'],'point':q,'oldValues':values});continue
  old_gaps=[abs(x-y)for x in values[0]for y in values[1]]
  # Multiple literal old strata remain an interval, never average/first-wins.
  old_gap=min(old_gaps);new_gap=abs(fragment['heightGaps'][fragment['polygon'].index(q)]);head_samples+=1
  if old_gap>.01 and new_gap<min(old_gap,5.85)-.001:head_fail.append({'roads':fragment['roads'],'point':q,'oldValues':values,'oldMinimumGap':old_gap,'newGap':new_gap,'required':min(old_gap,5.85),'cap':fragment['cap']})
rail_rows=[]
for e in model['roads']:
 if e['id']not in ids:continue
 for r in model['profiles']:
  line=LineString(r['pts']);road=LineString(e['pts']);cross=road.intersection(line)
  if cross.is_empty:continue
  rail_rows.append({'road':e['id'],'rail':r['id'],'crossingWKT':cross.wkt,'canonicalProfileUnchanged':True})
assert a.physical.read_bytes()==raw and model_path.read_bytes()==model_raw
report={'version':1,'releaseApproved':False,'physicalReceipt':{'path':str(a.physical),'sha256':hashlib.sha256(raw).hexdigest()},'scope':'Independent Shapely literal emitted Float32 support normalization/own finite overlap/true triangle grade/cross-road headroom. Canonical rail curves unchanged is provenance, not a rendered bridge soffit acceptance.','versions':versions,'headroom':{'historicalMinimum':.01,'regressionAllowance':.001,'minimumIndependentGap':5.85,'samples':head_samples,'failures':head_fail,'unresolvedOldCoverage':unresolved},'canonicalRailCrossings':rail_rows,'openGates':['Actual canonical rail finite running deck/soffit headroom','Full joint feasible model, active World/reuse/cache/native/mobile driving']}
with a.output.open('x')as f:json.dump(report,f,indent=2);f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'versions':[{'label':v['label'],'sameRoadLocalMaximumGap':v['sameRoadLocalMaximumGap'],'ownFailures':len(v['sameRoadLocalFailures']),'gradeFailures':len(v['actualTriangleGradeFailures']),'crossFragments':len(v['independentCrossRoadFragments'])}for v in versions],'headroomFailures':len(head_fail),'headroomUnresolved':len(unresolved),'railCrossings':len(rail_rows)}))
