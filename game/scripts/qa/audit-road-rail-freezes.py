#!/usr/bin/env python3
"""Audit estimated ROAD freezes beside immutable railway geometry.

The context must be an own locally generated pickle. This read-only diagnostic
does not change a road, a rail, a solver bound or the runtime activation flags.
In particular, a review classification is not authority to install a profile.
"""
import argparse
import ast
import collections
import hashlib
import itertools
import json
import math
from pathlib import Path
import pickle
import time
import numpy as np

p=argparse.ArgumentParser(description=__doc__)
for key in ['context','model','source-reference','output']:
    p.add_argument('--'+key,type=Path,required=True)
a=p.parse_args()
assert not a.output.exists()
held={key:getattr(a,key.replace('-','_')).read_bytes() for key in ['context','model','source-reference']}
sha=lambda data:hashlib.sha256(data).hexdigest()
context=pickle.loads(held['context'])
assert context['releaseApproved'] is False and context['version']==1
assert sha(context['solverSource'])==context['solverSHA256']
assert sha(held['model'])==context['inputs']['model']
assert sha(held['source-reference'])==context['inputs']['additional_source_reference']
model=json.loads(held['model']);reference=json.loads(held['source-reference'])
assert reference['complete'] and not reference['missingPrefixes']
records={r['id'][:12]:r for r in reference['rows']}
env=dict(np=np,math=math,itertools=itertools,collections=collections,json=json,time=time)
for fn in ast.parse(context['solverSource']).body:
    if isinstance(fn,ast.FunctionDef):
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'<bound numeric context>', 'exec'),env)
env.update(context['state'])
roads=env['roads'];rails=model['profiles'];frozen=env['canonicalRailControls']
rows=[];found=set();changed=[]
for ident in env['varIds']:
    road=roads[ident];offset=env['O'][ident]
    indices=[k for k in range(len(road['pts'])) if offset+k in frozen]
    if not indices:continue
    fp=env['footprints'][ident]
    near=[r for r in rails if env['near'](road,r)]
    contacts=collections.defaultdict(list)
    for j in range(len(road['pts'])-1):
        if j not in indices and j+1 not in indices:continue
        q=[fp['L'][j],fp['R'][j],fp['R'][j+1],fp['L'][j+1]]
        box=[min(p[0] for p in q)-4.2,max(p[0] for p in q)+4.2,min(p[1] for p in q)-4.2,max(p[1] for p in q)+4.2]
        for rail in near:
            yy=rail['elev'] or [0.]*len(rail['pts'])
            for k,(b,c) in enumerate(zip(rail['pts'],rail['pts'][1:])):
                if min(b[0],c[0])>box[1] or max(b[0],c[0])<box[0] or min(b[1],c[1])>box[3] or max(b[1],c[1])<box[2]:continue
                distance=env['railway_quad_distance'](b,c,q)
                if distance>4.2:continue
                item={'rail':rail['id'],'railSegment':k,'roadSegment':j,'distanceToLiteralRoadQuad':distance,'railHeights':[yy[k],yy[k+1]],'railBridge':bool(rail['bridge'])}
                for control in [j,j+1]:
                    if control in indices:contacts[control].append(item)
    source=records.get(ident[:12])
    unstructured=bool(source and source['id'][:12]==ident[:12] and 'level_rules'in source and 'road_flags'in source and not source['level_rules'] and not source['road_flags'])
    heights=road['elev'] or [0.]*len(road['pts'])
    controls=[]
    for k in indices:
        assert contacts[k], 'Bound rail control no longer has its literal geometric influence: '+ident+':'+str(k)
        fixed=env['bounds'][offset+k]
        assert fixed[0]==fixed[1]
        found.add(offset+k)
        train_contacts=[r for r in contacts[k] if r['distanceToLiteralRoadQuad']<=2.6]
        flat_zero_rails=all(not r['railBridge'] and r['railHeights']==[0.,0.] for r in contacts[k])
        low_estimate=0<=min(heights) and max(heights)<2 and not road.get('expressway') and road.get('elevationSource')not in['surveyed','explicit']
        reason='retained-unknown-or-structured-road-height'
        if ident in env['underpassIds'] or min(heights)<-.001:
            reason='retained-existing-negative-facility'
        elif fixed[0]!=heights[k]:
            reason='retained-explicit-inherited-facility-or-node-datum'
        elif unstructured and low_estimate and flat_zero_rails and train_contacts:
            reason='review-generated-ground-road-at-literal-zero-rail-contact'
        elif unstructured and low_estimate and flat_zero_rails:
            reason='retained-nearby-only-no-train-envelope-contact'
        controls.append({'index':k,'roadInputHeight':heights[k],'frozenRoadHeight':fixed[0],'classification':reason,'contacts':contacts[k]})
        if reason.startswith('review-') and fixed[0]!=0:
            changed.append({'road':ident,'control':k,'inputHeight':fixed[0],'actualRailHeights':[0.,0.],'sourceID':source['id']})
    rows.append({'road':ident,'name':road.get('name'),'roadHeightEnvelope':[min(heights),max(heights)],'sourceMetadataComplete':source is not None,'controls':controls})
assert found==frozen, 'Canonical road control inventory changed'
out={'schema':'road-rail-freeze-audit-v1','releaseApproved':False,'scope':__doc__,'inputs':{k:{'path':str(getattr(a,k.replace('-','_'))),'sha256':sha(v)}for k,v in held.items()},'generatorSHA256':sha(Path(__file__).read_bytes()),'canonicalControlInventoryExact':True,'canonicalRoadControls':len(found),'roads':rows,'nonzeroGroundRoadReviewControls':changed,'summary':dict(collections.Counter(c['classification'] for row in rows for c in row['controls']))}
for key,data in held.items():assert getattr(a,key.replace('-','_')).read_bytes()==data
with a.output.open('x') as f:json.dump(out,f,separators=(',',':'));f.write('\n')
print(json.dumps({'output':str(a.output),'sha256':sha(a.output.read_bytes()),'roads':len(rows),'controls':len(found),'nonzeroGroundRoadReviewControls':len(changed),'summary':out['summary'],'releaseApproved':False}))
