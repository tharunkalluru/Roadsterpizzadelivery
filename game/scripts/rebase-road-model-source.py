"""Rebase reviewed inferred fields onto a separately verified corrected source.

This produces an offline candidate only. It installs no runtime data and never
copies historical prepared road records over the corrected generic world.
"""
import argparse,bisect,copy,hashlib,json,math
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
for key in ['generic','source-view','source-data','previous-generic','previous-model','output','proof']:
 p.add_argument('--'+key,type=Path,required=True)
a=p.parse_args();paths={k:getattr(a,k.replace('-','_'))for k in ['generic','source-view','source-data','previous-generic','previous-model']}
assert not a.output.exists()and not a.proof.exists(),'Preserve held evidence; choose fresh outputs'
sha=lambda b:hashlib.sha256(b).hexdigest();inputs={k:{'path':str(v.resolve()),'sha256':sha(v.read_bytes())}for k,v in paths.items()}
g=json.loads(a.generic.read_text());sv=json.loads(a.source_view.read_text());data=json.loads(a.source_data.read_text());oldg=json.loads(a.previous_generic.read_text());old=json.loads(a.previous_model.read_text())
assert g['sourceRoadGeometryGeneration']==sv['sourceRoadGeometryGeneration']==data['generationID']
assert g['sourceGeometryReference']['sha256']==sv['sourceDataSHA256']==inputs['source-data']['sha256']
assert g['sourceGeometryReference']['sourceView']['sha256']==inputs['source-view']['sha256']
base={r['id']:r for r in g['roads']};prior={r['id']:r for r in old['roads']};oldbase={r['id']:r for r in oldg['roads']};raw={r['id']:r for r in sv['roads']};cuts={r['id']:r for r in data['roads']}
def arc(points):
 out=[0.]
 for x,y in zip(points,points[1:]):out.append(out[-1]+math.dist(x,y))
 return out
def interpolate(xs,ys,s):
 i=max(1,min(len(xs)-1,bisect.bisect_left(xs,s)));u=max(0,min(1,(s-xs[i-1])/(xs[i]-xs[i-1]or 1)))
 if isinstance(ys[0],list):return[x+(y-x)*u for x,y in zip(ys[i-1],ys[i])]
 return ys[i-1]+(ys[i]-ys[i-1])*u
def smooth(u):u=max(0,min(1,u));return u*u*(3-2*u)
def project(points,aa,q):
 best=(float('inf'),0.)
 for i,(x,y)in enumerate(zip(points,points[1:])):
  dx,dz=y[0]-x[0],y[1]-x[1];u=max(0,min(1,((q[0]-x[0])*dx+(q[1]-x[1])*dz)/(dx*dx+dz*dz or 1)));d=math.hypot(q[0]-x[0]-dx*u,q[1]-x[1]-dz*u)
  if d<best[0]:best=(d,aa[i]+(aa[i+1]-aa[i])*u)
 return best
segments=[]
# Canonical rail/metro coordinates do not move with the inferred field.
for lines,pad in [(old.get('profiles',[]),30),(sv.get('metro',{}).get('lines',[]),12)]:
 for line in lines:
  for x,y in zip(line['pts'],line['pts'][1:]):segments.append((x,y,pad))
segmentGrid={}
for x,y,pad in segments:
 for i in range(math.floor((min(x[0],y[0])-pad)/40),math.floor((max(x[0],y[0])+pad)/40)+1):
  for j in range(math.floor((min(x[1],y[1])-pad)/40),math.floor((max(x[1],y[1])+pad)/40)+1):segmentGrid.setdefault((i,j),[]).append((x,y,pad))
def mask(q):
 value=1.
 for x,y,pad in segmentGrid.get((math.floor(q[0]/40),math.floor(q[1]/40)),[]):
  if q[0]<min(x[0],y[0])-pad or q[0]>max(x[0],y[0])+pad or q[1]<min(x[1],y[1])-pad or q[1]>max(x[1],y[1])+pad:continue
  dx,dz=y[0]-x[0],y[1]-x[1];u=max(0,min(1,((q[0]-x[0])*dx+(q[1]-x[1])*dz)/(dx*dx+dz*dz or 1)));d=math.hypot(q[0]-x[0]-dx*u,q[1]-x[1]-dz*u);value=min(value,smooth((d-pad/2)/(pad/2)))
 return value
def capped(d):
 if math.hypot(*d)>4.99+1e-8:raise ValueError('Transported field exceeds4.99m; requires explicit bounded geometry review '+str({'road':globals().get('ident'),'s':globals().get('s'),'norm':math.hypot(*d),'d':d,'endpointCorrections':globals().get('endpoints')}))
 return d
# A single endpoint field is shared by every incident core and detailed road.
field={};nodeproof=[]
for node,n in old['endpointDisplacements'].items():
 before=sv['nodes'].get(node)
 if before is None:raise ValueError('Missing corrected source junction '+node)
 keep=math.dist(before,n['after'])<4.99 and mask(before)>=1-1e-9
 d=[n['after'][k]-before[k]for k in range(2)]if keep else[v*mask(before)for v in n['delta']]
 d=capped(d);after=[before[k]+d[k]for k in range(2)];field[node]={'before':before,'after':after,'delta':d};nodeproof.append({'node':node,'preservedReviewedAfter':keep,'sourceShift':math.dist(before,n['before']),'displacement':math.hypot(*d)})
lower={r['road']for r in old.get('loweringOnlyRestoration',{}).get('unknownStreetAndIncidentRoads',[])}
ids=set(old.get('geometryEdits',[]))
for r in g['roads']:
 if r['from']in field or r['to']in field:ids.add(r['id'])
result=[];proof=[]
for source in g['roads']:
 ident=source['id']
 if ident not in ids:result.append(source);continue
 previous=prior.get(ident,oldbase[ident]);reference=oldbase[ident];oldxy=previous.get('sourceXY',previous['pts']);oldsa=previous.get('sourceArc',arc(oldxy));oldcurve=arc(previous['pts']);newsa=arc(source['pts']);cut=cuts.get(ident)
 def legacy(s):
  if not cut:return s
  if abs(newsa[-1]-cut['correctedArc'][-1])<.001:return interpolate(cut['correctedArc'],cut['sourceArc'],s)
  point=interpolate(newsa,source['pts'],s);distance,at=project(cut['pts'],cut['correctedArc'],point)
  if distance>.001:raise ValueError('Generic curve left corrected source '+ident)
  return interpolate(cut['correctedArc'],cut['sourceArc'],at)
 oldD=[[x[0]-y[0],x[1]-y[1]]for x,y in zip(previous['pts'],oldxy)]
 # Preserve all source controls and use at most1.5m intervals for the transported field.
 positions=[0.]
 for start,end in zip(newsa,newsa[1:]):
  count=max(1,math.ceil((end-start)/1.5));positions.extend(start+(end-start)*j/count for j in range(1,count+1))
 sourceXY=[interpolate(newsa,source['pts'],s)for s in positions];oldpositions=[legacy(s)for s in positions];D=[]
 for point,s in zip(sourceXY,oldpositions):
  d=interpolate(oldsa,oldD,s);oldpoint=interpolate(oldsa,oldxy,s);ratio=min(1,mask(point)/max(mask(oldpoint),1e-12));D.append([v*ratio for v in d])
 endpoints=[]
 for node,index in[(source['from'],0),(source['to'],-1)]:
  target=field[node]['delta']if node in field else[0.,0.];endpoints.append([target[k]-D[index][k]for k in range(2)])
 L=positions[-1];fade=min(50,L/2 or 1);pts=[]
 for point,s,d in zip(sourceXY,positions,D):
  correction=[endpoints[0][k]*(1-smooth(s/fade))+endpoints[1][k]*(1-smooth((L-s)/fade))for k in range(2)];v=capped([d[k]+correction[k]for k in range(2)]);pts.append([point[k]+v[k]for k in range(2)])
 for node,index in[(source['from'],0),(source['to'],-1)]:pts[index]=field[node]['after']if node in field else source['pts'][index]
 elev=[interpolate(newsa,source['elev']or[0.]*len(source['pts']),s)for s in positions]
 if ident in lower:
  target=[interpolate(oldsa,previous['elev']or[0.]*len(previous['pts']),s)for s in oldpositions];elev=[max(0,min(y,t))for y,t in zip(elev,target)]
 e=copy.deepcopy(source);e.update(pts=pts,elev=elev if source['elev']is not None or any(elev)else None,sourceXY=sourceXY,sourceArc=positions)
 newarc=arc(pts)
 def remap(s):
  legacy_s=interpolate(oldcurve,oldsa,s)
  # Current source distance is monotone; inverted through the point-aligned legacy map.
  corrected_s=interpolate(oldpositions,positions,legacy_s);return interpolate(positions,newarc,corrected_s)
 for key in['w','lanes','joinedPavement','laneEvidence','sourceLaneIntervals','sceneryWidth','scenerySource']:
  if key in previous:e[key]=copy.deepcopy(previous[key])
 if e.get('joinedPavement'):e['joinedPavement']['intervals']=[[remap(x),remap(y)]for x,y in previous['joinedPavement']['intervals']]
 if cut and source.get('sourceLaneIntervals'):
  e['sourceLaneIntervals']=[{**v,'from':interpolate(positions,newarc,v['from']),'to':interpolate(positions,newarc,v['to'])}for v in source['sourceLaneIntervals']]
 elif previous.get('sourceLaneIntervals'):
  e['sourceLaneIntervals']=[{**s,'from':remap(s['from']),'to':remap(s['to'])}for s in previous['sourceLaneIntervals']]
 elif source.get('sourceLaneIntervals'):e['sourceLaneIntervals']=copy.deepcopy(source['sourceLaneIntervals'])
 if cut:
  projected=[project(cut['pts'],cut['correctedArc'],point)[1]for point in sourceXY];e['sourceFractions']=[interpolate(cut['correctedArc'],cut['sourceFractions'],s)for s in projected];e['sourceSegmentID']=cut['sourceSegmentID']
 maximum=max(math.dist(x,y)for x,y in zip(pts,sourceXY));assert maximum<4.99+1e-8,(ident,maximum)
 result.append(e);proof.append({'id':ident,'controls':len(pts),'maximumDisplacement':maximum,'sourceRepaired':cut is not None,'historicalLowering':ident in lower})
# Only the three authorized unprotected arterial node families get historical no-worsening lowering.
nodeTargets={'1d8c454a-85e':1.752087927671,'1528e2ce-ad7':.250036756931,'a96cfce5-abe':1.889127752973}
nodeChanges=[]
for node,ceiling in nodeTargets.items():
 incidents=[e for e in result if node in[e['from'],e['to']]];levels=[(e['elev']or[0.]*len(e['pts']))[0 if e['from']==node else-1]for e in incidents];target=min([ceiling]+levels)
 for e in incidents:
  aa=arc(e['pts']);L=aa[-1];end=0 if e['from']==node else-1;before=(e['elev']or[0.]*len(e['pts']))[end];delta=min(0,target-before)
  if delta>=-1e-9:continue
  if e.get('expressway')or e.get('laneEvidence')or min(e['elev']or[0])<-.001:raise ValueError('Protected no-worsening incident '+e['id'])
  distance=aa if end==0 else[L-s for s in aa];fade=min(80,L or 1);e['elev']=[max(0,y+delta*(1-smooth(s/fade)))for y,s in zip(e['elev']or[0.]*len(e['pts']),distance)];ids.add(e['id']);nodeChanges.append({'node':node,'road':e['id'],'before':before,'after':e['elev'][end],'historicalCeiling':ceiling})
# Grade diagnostics are not waivers: final solved controls must pass strict gates.
gradeDiagnostics=[]
for e in result:
 if e['id']not in ids:continue
 before=base[e['id']];oldMax=max([abs(b-a)/max(math.dist(p,q),1e-12)for a,b,p,q in zip(before['elev']or[0.]*len(before['pts']),(before['elev']or[0.]*len(before['pts']))[1:],before['pts'],before['pts'][1:])]+[0])
 newMax=max([abs(b-a)/max(math.dist(p,q),1e-12)for a,b,p,q in zip(e['elev']or[0.]*len(e['pts']),(e['elev']or[0.]*len(e['pts']))[1:],e['pts'],e['pts'][1:])]+[0])
 if newMax>.1+1e-8:gradeDiagnostics.append({'id':e['id'],'genericMaximumGrade':oldMax,'candidateMaximumGrade':newMax,'requiresFinalSolverResolution':True})
# Recompute every report rather than inheriting stale geometry acceptance numbers.
by={e['id']:e for e in result};errors=[]
for node,n in field.items():
 for e in result:
  for endpoint,index in[(e['from'],0),(e['to'],-1)]:
   if endpoint==node and math.dist(e['pts'][index],n['after'])>1e-7:errors.append([node,e['id']])
assert not errors,errors
out={**g,'roads':result,'geometryEdits':sorted(ids),'movedRoads':[r['id']for r in proof if r['maximumDisplacement']>1e-7],'endpointDisplacements':field,'corridors':copy.deepcopy(old.get('corridors',[])),
 'profiles':old.get('profiles',[]),'underpassChanges':old.get('underpassChanges',[]),'railwayReport':old.get('railwayReport',{}),'loweringOnlyRestoration':old.get('loweringOnlyRestoration',{}),
 'sourceRebase':{'inputs':inputs,'producerSHA256':sha(Path(__file__).read_bytes()),'sourceGeneration':data['generationID'],'nodePolicy':'Preserve reviewed modeled endpoints only where legal relative to corrected source; one coherent incident field.','nodeDecisions':nodeproof,'historicalNoWorsening':nodeChanges,'solverOnlyExceptionsApplied':False,'inputGradeDiagnostics':gradeDiagnostics},
 'geometryInvariants':{'endpointErrors':errors,'maximumDisplacement':max(r['maximumDisplacement']for r in proof),'sourceCorrected':True,'acceptancePending':True}}
for c in out['corridors']:
 distance=0
 for m in c.get('members',[]):m['start']=distance;distance+=arc(by[m['id']]['pts'])[-1]
a.output.write_text(json.dumps(out,separators=(',',':')))
a.proof.write_text(json.dumps({'inputs':inputs,'outputSHA256':sha(a.output.read_bytes()),'roads':proof,'nodes':nodeproof,'noWorsening':nodeChanges,'inputGradeDiagnostics':gradeDiagnostics,'geometryInvariants':out['geometryInvariants'],'requiresOrdinaryConditioningAndIndependentPhysicalAcceptance':True},indent=2)+'\n')
print(json.dumps({'output':str(a.output),'sha256':sha(a.output.read_bytes()),'roads':len(result),'edited':len(ids),'nodes':len(field),'maximumDisplacement':out['geometryInvariants']['maximumDisplacement']}))
