#!/usr/bin/env python3
"""Find actual ground-road intersections with source railway beam bridges.

Read-only research inventory, never a list of automatically permitted cuts.
The source railway geometry must match the retained game snapshot in the same
local projection. Missing road metadata and mapped road bridges fail closed.
"""
import argparse
import collections
import hashlib
import json
import math
import struct
from pathlib import Path
from geographiclib.geodesic import Geodesic

p=argparse.ArgumentParser(description=__doc__)
for name in ['model','source-data','source-reference','current-rail-source','output']:
    p.add_argument('--'+name,type=Path,required=True)
a=p.parse_args();assert not a.output.exists()
paths={k:getattr(a,k.replace('-','_'))for k in ['model','source-data','source-reference','current-rail-source']}
held={k:p.read_bytes()for k,p in paths.items()};sha=lambda b:hashlib.sha256(b).hexdigest()
model,geo,reference,current=[json.loads(held[k])for k in ['model','source-data','source-reference','current-rail-source']]
assert model['sourceRoadGeometryGeneration']==geo['generationID']
assert reference['complete'] and not reference['missingPrefixes']
assert len(reference['requestedPrefixes'])==len(set(reference['requestedPrefixes']))
assert sorted(r['id'][:12]for r in reference['rows'])==sorted(reference['requestedPrefixes'])
assert all(len(r['id'])==36 and all(k in r for k in ['geometryWKB','level_rules','road_flags']) for r in reference['rows'])
records={r['id'][:12]:r for r in reference['rows']}
ways={r['id']:r for r in current['ways']};nodes={r['id']:r for r in current['nodes']}
expected={int(r['id'][1:])for r in model['profiles']if r['bridge']}
assert expected==set(ways)==set(current['wayIDs'])
origin=geo['origin'];kx=origin['NR']*math.cos(math.radians(origin['lat']))*math.pi/180;kz=origin['MR']*math.pi/180
def project(n):return[(n['lon']-origin['lon'])*kx,-(n['lat']-origin['lat'])*kz]
def segment_distance(p,a,b):
    d=[b[i]-a[i]for i in [0,1]];den=sum(v*v for v in d)
    u=max(0.,min(1.,sum((p[i]-a[i])*d[i]for i in [0,1])/(den or 1.)))
    return math.dist(p,[a[i]+u*d[i]for i in [0,1]])
def intersection(a,b,c,d):
    dx,dz=b[0]-a[0],b[1]-a[1];ex,ez=d[0]-c[0],d[1]-c[1];den=dx*ez-dz*ex
    if abs(den)<1e-9:return None
    u=((c[0]-a[0])*ez-(c[1]-a[1])*ex)/den;v=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/den
    if 0<=u<=1 and 0<=v<=1:return u,v,[a[0]+u*dx,a[1]+u*dz]
def cells(a,b):
    for x in range(math.floor(min(a[0],b[0])/100),math.floor(max(a[0],b[0])/100)+1):
        for z in range(math.floor(min(a[1],b[1])/100),math.floor(max(a[1],b[1])/100)+1):yield x,z
rail_audits=[];grid=collections.defaultdict(list)
source_crossings={}
source_geometries={}
def source_hits(road,rail):
    key=(road,rail['id'])
    if key in source_crossings:return source_crossings[key]
    source=records.get(road[:12]);result=[]
    if source and source.get('geometryWKB'):
        raw=bytes.fromhex(source['geometryWKB']);end='<'if raw[0]==1 else'>'
        assert struct.unpack_from(end+'I',raw,1)[0]==2
        if road[:12]not in source_geometries:
            ll=[struct.unpack_from(end+'dd',raw,9+16*k)for k in range(struct.unpack_from(end+'I',raw,5)[0])]
            pp=[project(dict(zip(['lon','lat'],v)))for v in ll];ss=[0.]
            for b,c in zip(ll,ll[1:]):ss.append(ss[-1]+Geodesic.WGS84.Inverse(b[1],b[0],c[1],c[0])['s12'])
            source_geometries[road[:12]]=(pp,ss)
        pp,ss=source_geometries[road[:12]]
        way=ways[int(rail['id'][1:])];qq=[project(nodes[n])for n in way['nodes']]
        result=[{'point':hit[2],'officialFraction':(ss[j]+hit[0]*(ss[j+1]-ss[j]))/ss[-1]}for j,(b,c)in enumerate(zip(pp,pp[1:]))for d,e in zip(qq,qq[1:])if(hit:=intersection(b,c,d,e))]
    source_crossings[key]=result
    return result
for rail in model['profiles']:
    if not rail['bridge']:continue
    way=ways[int(rail['id'][1:])];pp=[project(nodes[n])for n in way['nodes']];tags=way.get('tags',{})
    forward=max(min(segment_distance(p,a,b)for a,b in zip(pp,pp[1:]))for p in rail['pts'])
    reverse=max(min(segment_distance(p,a,b)for a,b in zip(rail['pts'],rail['pts'][1:]))for p in pp)
    endpoints=min(max(math.dist(rail['pts'][0],pp[0]),math.dist(rail['pts'][-1],pp[-1])),max(math.dist(rail['pts'][0],pp[-1]),math.dist(rail['pts'][-1],pp[0])))
    try:layer=int(tags.get('layer','0'))
    except (TypeError,ValueError):layer=0
    confirmed=tags.get('railway')=='rail'and tags.get('bridge')=='yes'and layer>0 and max(forward,reverse,endpoints)<=.15
    rail_audits.append({'rail':rail['id'],'sourceVersion':way.get('version'),'sourceTimestamp':way.get('timestamp'),'tags':tags,'maximumGeometryDifferenceM':max(forward,reverse,endpoints),'sourceGeometryMatches':max(forward,reverse,endpoints)<=.15,'currentSourceMatchesRetainedBridge':confirmed})
    for j,(b,c)in enumerate(zip(rail['pts'],rail['pts'][1:])):
        for cell in cells(b,c):grid[cell].append((rail,j,b,c,confirmed))
crossings=[];missing=set()
for road in model['roads']:
    if road['cls']in['footway','path','steps','pedestrian','cycleway','bridleway']:continue
    source=records.get(road['id'][:12]);yy=road['elev']or[0.]*len(road['pts'])
    seen=set()
    for j,(b,c)in enumerate(zip(road['pts'],road['pts'][1:])):
        for cell in cells(b,c):
            for rail,k,d,e,confirmed in grid.get(cell,[]):
                key=(rail['id'],j,k)
                if key in seen:continue
                seen.add(key);hit=intersection(b,c,d,e)
                if not hit:continue
                u,v,point=hit;road_y=yy[j]*(1-u)+yy[j+1]*u
                original=source_hits(road['id'],rail)
                closest=min(original,key=lambda r:math.dist(point,r['point']))if original else None
                source_difference=math.dist(point,closest['point'])if closest else None
                frac=closest['officialFraction']if closest else None
                active=lambda r:not r.get('between')or r['between'][0]-1e-6<=frac<=r['between'][1]+1e-6
                local_level=max([r['value']for r in (source.get('level_rules')or[])if active(r)],default=0)if source and frac is not None else None
                local_flags=sorted({v for r in (source.get('road_flags')or[])if active(r)for v in r['values']})if source and frac is not None else None
                ambiguous=bool(closest and any(abs(r['officialFraction']-frac)>1e-6 and math.dist(point,r['point'])<=source_difference+.15 for r in original))
                if road_y<-.001:status='retained-existing-below-rail-facility'
                elif road_y>2:status='retained-existing-raised-road'
                elif not confirmed:status='unresolved-current-rail-source-differs'
                elif source is None:status='unresolved-road-source-metadata';missing.add(road['id'][:12])
                elif source_difference is None or source_difference>1:status='unresolved-modeled-source-intersection-difference'
                elif ambiguous:status='unresolved-source-crossing-branch'
                elif local_level>0 or 'is_bridge'in local_flags:status='unresolved-annotated-road-relative-order'
                else:status='research-confirmed-road-below-source-rail-bridge-needs-model-review'
                crossings.append({'road':road['id'],'name':road.get('name'),'rail':rail['id'],'roadSegment':j,'railSegment':k,'point':point,'inputRoadHeight':road_y,'classification':status,'sourceRoadID':source.get('id')if source else None,'originalSourceCrossings':original,'nearestOriginalCrossingDifferenceM':source_difference,'officialSourceFraction':frac,'localSourceLevel':local_level,'localSourceFlags':local_flags})
out={'schema':'source-railway-bridge-crossings-v1','scope':__doc__,'releaseApproved':False,'inputs':{k:{'path':str(paths[k]),'sha256':sha(v)}for k,v in held.items()},'generatorSHA256':sha(Path(__file__).read_bytes()),'railways':rail_audits,'crossings':crossings,'missingRoadSourcePrefixes':sorted(missing),'summary':dict(collections.Counter(r['classification']for r in crossings))}
assert all(paths[k].read_bytes()==data for k,data in held.items())
with a.output.open('x')as f:json.dump(out,f,separators=(',',':'));f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':sha(a.output.read_bytes()),'bridgeRails':len(rail_audits),'sourceGeometryMatching':sum(r['currentSourceMatchesRetainedBridge']for r in rail_audits),'crossings':len(crossings),'summary':out['summary'],'missingSourcePrefixes':len(missing),'releaseApproved':False}))
