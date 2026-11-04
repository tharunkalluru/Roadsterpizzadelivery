#!/usr/bin/env python3
"""Offline source-bound corridor refinements; no source pack/runtime mutation."""
import argparse,bisect,copy,hashlib,json,math
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
for key in ['manifest','design','output','proof']:p.add_argument('--'+key,type=Path,required=True)
a=p.parse_args();assert not a.output.exists() and not a.proof.exists(),'Choose fresh outputs'
sha=lambda f:hashlib.sha256(Path(f).read_bytes()).hexdigest()
m=json.loads(a.manifest.read_text());design=json.loads(a.design.read_text());assert design['sourceManifestSHA256']==sha(a.manifest)
for key in ['preconditioning','model','sourceView','sourceData']:assert sha(m[key]['path'])==m[key]['sha256']
x=json.load(open(m['preconditioning']['path']));world=json.load(open(m['model']['path']));sv=json.load(open(m['sourceView']['path']));rows={r['id']:r for r in x['roads']};old=copy.deepcopy(rows);prepared={r['id']:r for r in world['roads']};source={r['id']:r for r in sv['roads']}
assert x['sourceRoadGeometryGeneration']==sv['sourceRoadGeometryGeneration']==design['sourceRoadGeometryGeneration']
for binding in [design.get('sourceProof')]+[g.get('sourceProof') for g in design.get('nodeSeparations',[])]:
 if binding:assert sha(binding['file'])==binding['sha256'],'Stale source authority proof'
def arc(pp):
 out=[0.]
 for b,c in zip(pp,pp[1:]):out.append(out[-1]+math.dist(b,c))
 return out
def at(xx,yy,s):
 i=max(1,min(len(xx)-1,bisect.bisect_left(xx,s)));u=max(0,min(1,(s-xx[i-1])/(xx[i]-xx[i-1] or 1)))
 return [b+(c-b)*u for b,c in zip(yy[i-1],yy[i])] if isinstance(yy[0],list) else yy[i-1]+(yy[i]-yy[i-1])*u
def smooth(u):u=max(0,min(1,u));return u*u*(3-2*u)
def nearest(pp,aa,q):
 best=(math.inf,0,None)
 for i,(b,c) in enumerate(zip(pp,pp[1:])):
  dx,dz=c[0]-b[0],c[1]-b[1];t=max(0,min(1,((q[0]-b[0])*dx+(q[1]-b[1])*dz)/(dx*dx+dz*dz or 1)));v=[b[0]+t*dx,b[1]+t*dz];d=math.dist(q,v)
  if d<best[0]:best=(d,aa[i]+t*(aa[i+1]-aa[i]),v)
 return best
segments={}
for lines,pad in [(world['profiles'],30),(sv['metro']['lines'],12)]:
 for line in lines:
  for b,c in zip(line['pts'],line['pts'][1:]):
   for i in range(math.floor((min(b[0],c[0])-pad)/40),math.floor((max(b[0],c[0])+pad)/40)+1):
    for j in range(math.floor((min(b[1],c[1])-pad)/40),math.floor((max(b[1],c[1])+pad)/40)+1):segments.setdefault((i,j),[]).append((b,c,pad))
def mask(q):
 value=1.
 for b,c,pad in segments.get((math.floor(q[0]/40),math.floor(q[1]/40)),[]):value=min(value,smooth((nearest([b,c],arc([b,c]),q)[0]-pad/2)/(pad/2)))
 return value
def away(id,other,s):
 pp=source[id]['pts'];aa=arc(pp);q=at(aa,pp,s);op=source[other]['pts'];near=nearest(op,arc(op),q)[2];v=[q[k]-near[k] for k in [0,1]];n=math.hypot(*v);assert n>1;return [z/n for z in v]
scenerySpec=design.get('sceneryInput');sceneryOverrides={}
if scenerySpec:
 sceneryPath=Path(scenerySpec['file']);assert sha(sceneryPath)==scenerySpec['sha256'];sceneryOverrides={r['id']:r['scenerySource'] for r in json.loads(sceneryPath.read_text())['roads']}
field=x['endpointDisplacements'];changed=set();nodeChanges={};preparedArrays={};radialAdjustments={}
def add_node(node,delta):
 before=sv['nodes'][node];assert mask(before)>1-1e-9 and math.hypot(*delta)<4.99
 n={'before':before,'after':[before[k]+delta[k] for k in [0,1]],'delta':delta}
 if node in field:assert math.dist(field[node]['after'],n['after'])<1e-7,'Existing approved node changed'
 else:field[node]=n;nodeChanges[node]=delta
pair=design['mahavir'];ef,b3=pair['roads'];far=pair['farAmplitude']
for id,other,end in [(ef,b3,'to'),(b3,ef,'from')]:
 e=source[id];s=arc(e['pts'])[-1] if end=='to' else 0;add_node(e[end],[z*far for z in away(id,other,s)])
for group in design.get('nodeSeparations',[]):
 for ident,other,end in [(group['roads'][0],group['roads'][1],group['ends'][0]),(group['roads'][1],group['roads'][0],group['ends'][1])]:
  edge=source[ident];position=arc(edge['pts'])[-1] if end=='to' else 0;add_node(edge[end],[v*group['amplitude'] for v in away(ident,other,position)])
# The 1.6m same-source piece inherits its adjacent already-reviewed node vector;
# the complete short source continuation translates without a tight S-bend.
add_node(rows[b3]['to'],field[pair['nearReferenceNode']]['delta'])
for e in rows.values():
 if e['from'] in nodeChanges or e['to'] in nodeChanges:changed.add(e['id'])
changed.update([ef,b3]);changed.update(r['id'] for r in design['widthProfiles']);changed.update(r['id'] for r in design['outwardFields'])
for id in sorted(changed):
 e=rows[id];prior=old[id];aa=arc(prior['pts']);ss=[0.]
 for b,c in zip(aa,aa[1:]):
  n=max(1,math.ceil((c-b)/1.5));ss.extend(b+(c-b)*j/n for j in range(1,n+1))
 base=[at(aa,prior['pts'],s) for s in ss];sourceXY=[at(aa,prior.get('sourceXY',prior['pts']),s) for s in ss];sourceArc=[at(aa,prior.get('sourceArc',aa),s) for s in ss];heights=[at(aa,prior['elev'] or [0.]*len(prior['pts']),s) for s in ss];L=ss[-1]
 if id in [ef,b3]:
  start=field[e['from']]['delta'];end=field[e['to']]['delta'];pts=[]
  for q,s in zip(sourceXY,sourceArc):
   u=smooth(s/sourceArc[-1]);d=[start[k]*(1-u)+end[k]*u for k in [0,1]];value=mask(q);pts.append([q[k]+d[k]*value for k in [0,1]])
 else:
  start=nodeChanges.get(e['from'],[0.,0.]);end=nodeChanges.get(e['to'],[0.,0.]);fade=min(50,L/2 or 1);pts=[]
  for q,s in zip(base,ss):
   d=[start[k]*(1-smooth(s/fade))+end[k]*(1-smooth((L-s)/fade)) for k in [0,1]];pts.append([q[k]+d[k]*mask(sourceXY[len(pts)]) for k in [0,1]])
 for node,k in [(e['from'],0),(e['to'],-1)]:
  if node in field:pts[k]=field[node]['after']
 e['pts']=pts;e['elev']=heights if prior.get('elev') is not None else None;e['sourceXY']=sourceXY;e['sourceArc']=sourceArc
 for k in ['sourceFractions']:
  if k in prior and len(prior[k])==len(aa):e[k]=[at(aa,prior[k],s) for s in ss]
 preparedArrays[id]=(ss,sourceArc)
 for spec in design['outwardFields']:
  if id!=spec['id']:continue
  lo,hi=spec['sourceInterval'];fade=spec['fade'];amp=spec['amplitude'];other=spec['other'];pts=[]
  for q,s,position in zip(sourceXY,sourceArc,e['pts']):
   weight=smooth((s-lo)/fade)*smooth((hi-s)/fade);d=away(id,other,s)
   if spec.get('roadOnlyMetroException'):
    present=sum((position[k]-q[k])*d[k] for k in [0,1]);difference=max(0,amp*weight-present);extra=difference*smooth(difference/.05)
   else:extra=amp*weight*mask(q)
   pts.append([position[k]+d[k]*extra for k in [0,1]])
  e['pts']=pts
 # The sum of two reviewed C1 fields can exceed the global metric bound.
 # A C1 radial shoulder (identity through4.97m, derivative1→0 over3cm)
 # retains exact endpoints and caps only the affected interior field at4.985m.
 # Final drawn-edge grade/body/obstacle constraints still validate this geometry.
 radialAdjustments[id]=0.
 for n,(q,point) in enumerate(zip(sourceXY,e['pts'])):
  d=[point[k]-q[k] for k in [0,1]];radius=math.hypot(*d)
  if radius>4.97:
   t=min(.03,radius-4.97);bounded=4.97+t-t*t/.06
   if radius>=5:bounded=4.985
   factor=bounded/radius;nextPoint=[q[k]+d[k]*factor for k in [0,1]];radialAdjustments[id]=max(radialAdjustments[id],math.dist(point,nextPoint));e['pts'][n]=nextPoint
 newArc=arc(e['pts'])
 if e.get('joinedPavement'):e['joinedPavement']['intervals']=[[at(ss,newArc,b),at(ss,newArc,c)] for b,c in e['joinedPavement']['intervals']]
 for interval in e.get('sourceLaneIntervals',[]):interval['from']=at(ss,newArc,interval['from']);interval['to']=at(ss,newArc,interval['to'])
 spec=next((p for p in design['widthProfiles'] if p['id']==id),None)
 if spec:
  assert not e.get('expressway') and not e.get('laneEvidence')
  width=spec['width'];originalWidth=spec.get('outerWidth',max(prior['w'],prior.get('joinedPavement',{}).get('originalWidth',0)))
  e['w']=width;e['lanes']=spec['modeledLanes'];e['joinedPavement']={'sourceWidth':max(prior.get('joinedPavement',{}).get('sourceWidth',0),prior['w']),'originalWidth':originalWidth,'intervals':[[at(sourceArc,newArc,b),newArc[-1] if c is None else at(sourceArc,newArc,c)]for b,c in spec['sourceIntervals']],'taper':30,'release':'2026-10-21.0','usableLanes':spec['modeledLanes']};e['sceneryWidth']=max(e.get('sceneryWidth',0),prior['w'],originalWidth)
  if spec.get('sourceURL'):e['sourceLaneIntervals']=[{'from':0,'to':newArc[-1],'lanes':spec['modeledLanes'],'oneway':True,'sourceURL':spec['sourceURL']}]
 if not e.get('scenerySource'):
  ref=prepared[id];e['scenerySource']=copy.deepcopy(sceneryOverrides[id]) if id in sceneryOverrides else {'pts':ref['pts'],'elev':ref['elev'],'width':max(prior['w'],e.get('sceneryWidth',0),prior.get('joinedPavement',{}).get('sourceWidth',0),8.4 if max(ref['elev'] or [0])>1.2 else 0)}
 if id not in x['geometryEdits']:x['geometryEdits'].append(id)
 if e['pts']!=prior['pts'] and id not in x['movedRoads']:x['movedRoads'].append(id)
proof=[];errors=[]
for e in x['roads']:
 for node,k in [(e['from'],0),(e['to'],-1)]:
  if node in field and math.dist(e['pts'][k],field[node]['after'])>1e-7:errors.append([e['id'],node])
 if e['id'] in changed:
  d=max(math.dist(p,q) for p,q in zip(e['pts'],e['sourceXY']));assert d<4.99,'Raw source displacement '+e['id'];assert e['elev'][0]==old[e['id']]['elev'][0] if e.get('elev') and old[e['id']].get('elev') else True
  proof.append({'id':e['id'],'controls':len(e['pts']),'maxSourceDisplacement':d,'maximumC1RadialAdjustment':radialAdjustments[e['id']],'sourceCapacity':e.get('sourceLaneIntervals'),'width':e['w'],'profile':e.get('joinedPavement')})
assert not errors
x['corridorRefinement']={'sourceManifestSHA256':sha(a.manifest),'designSHA256':sha(a.design),'scope':design['scope'],'changedRoads':sorted(changed),'newNodeIDs':sorted(nodeChanges),'physicalAcceptance':False};globalMaximum=max(math.dist(p,q) for e in x['roads'] if len(e.get('sourceXY',[]))==len(e['pts']) for p,q in zip(e['pts'],e['sourceXY']))
x['geometryInvariants']={**x.get('geometryInvariants',{}),'maximumSourceDisplacement':globalMaximum,'endpointErrors':errors}
a.output.write_text(json.dumps(x,separators=(',',':')));result={'sourceRoadGeometryGeneration':x['sourceRoadGeometryGeneration'],'inputManifestSHA256':sha(a.manifest),'designSHA256':sha(a.design),'outputSHA256':sha(a.output),'scope':design['scope'],'newNodeFields':{k:field[k] for k in nodeChanges},'endpointErrors':errors,'roads':proof};a.proof.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'output':str(a.output),'sha256':sha(a.output),'roads':len(proof),'newNodes':len(nodeChanges),'maxRawDelta':max(r['maxSourceDisplacement'] for r in proof)}))
