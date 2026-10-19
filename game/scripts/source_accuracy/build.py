#!/usr/bin/env python3
"""Reproducible whole-map audit overlay from frozen package and raw source facts.

No business point is moved. Existing inferred assignments are classified, not upgraded to
verification. `--write` attaches the separately hashed layer after satellite sampling exists.
"""
import argparse, hashlib, json, math
from collections import Counter
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
import shapely
from shapely.geometry import Polygon, Point, LineString
from shapely.strtree import STRtree
from geometry_reconcile import geometry_reconciliations
from road_properties import road_properties

GAME=Path(__file__).resolve().parents[2]
BASE=GAME/'public/world/hyd-metro/v2'
INTERIM=GAME/'data/interim/source-accuracy'
OVERTURE=GAME/'data/raw/overture/2026-09-23.1'

def load(path):
    return json.loads(path.read_text())

def encoded(value,pretty=False):
    return (json.dumps(value,ensure_ascii=False,sort_keys=not pretty,indent=2 if pretty else None,separators=None if pretty else (',',':'))+'\n').encode()

def write(path,value,pretty=False):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_name(path.name+'.tmp');temporary.write_bytes(encoded(value,pretty));temporary.replace(path)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def bind_ledger(check=False):
    """Keep the existing package ledger valid when attaching supplemental runtime files."""
    path=GAME/'public/world/world-manifest.json'
    if not path.exists():return
    ledger=load(path)
    if ledger.get('world_id')!='hyd-metro':return
    artifacts={a['path']:a for a in ledger['artifacts']}
    for filename in ['manifest.json','source-accuracy.json','listings.json']:
        runtime=BASE/filename;relative=runtime.relative_to(GAME).as_posix();entry={'path':relative,'sha256':sha(runtime.read_bytes())}
        if check:
            if artifacts.get(relative)!=entry:raise RuntimeError(f'World ledger binding differs: {relative}')
        else:artifacts[relative]=entry
    if not check:
        ledger['artifacts']=sorted(artifacts.values(),key=lambda a:a['path']);write(path,ledger,True)

def chunk_digest(manifest):
    return sha('\n'.join(f"{c['id']}:{c['sha256']}" for c in sorted(manifest['chunks'],key=lambda c:c['id'])).encode())

def source_buildings(bs):
    keys={b['id'].split('_')[1] for b in bs};length=len(next(iter(keys)))
    rows={}
    columns=['id','height','num_floors','min_height','class','subtype','facade_color','facade_material','roof_color','roof_material','roof_shape']
    for path in sorted(OVERTURE.glob('buildings-building-*.parquet')):
        for row in pq.read_table(path,columns=columns).to_pylist():
            if row['id'].replace('-','')[:length] in keys:rows.setdefault(row['id'].replace('-','')[:length],row)
    properties={}
    mapping={'height':'heightM','num_floors':'numFloors','min_height':'minHeightM','class':'class','subtype':'subtype','facade_color':'facadeColor','facade_material':'facadeMaterial','roof_color':'roofColor','roof_material':'roofMaterial','roof_shape':'roofShape'}
    for b in bs:
        raw=rows.get(b['id'].split('_')[1])
        if raw is None:raise ValueError(f"Missing raw building {b['id']}")
        facts={target:raw[key] for key,target in mapping.items() if raw.get(key) is not None}
        if facts:properties[b['id']]=facts
    return properties

def nearest(line,point):
    at=line.project(point);q=line.interpolate(at)
    a,b=line.interpolate(max(0,at-.05)),line.interpolate(min(line.length,at+.05))
    dx,dz=b.x-a.x,b.y-a.y;n=math.hypot(dx,dz) or 1
    return q,dx/n,dz/n

def side(dx,dz,rx,rz):
    return 'left' if dx*rz-dz*rx<0 else 'right'

def classify(sf,building,containing_ids,road):
    reasons=[];point=Point(sf['x'],sf['z']);facade=sf.get('facade');distance=0.;road_side='unknown'
    assigned=building is not None and building['id'] in containing_ids
    association='source_contained' if assigned else 'nearby_ambiguous' if building else 'unmatched'
    if not building:reasons.append('no_building_association')
    elif not assigned:reasons.append('source_point_outside_assigned_footprint')
    if containing_ids and not assigned:reasons.append('source_point_in_different_footprint')
    if len(containing_ids)>1:reasons.append('multiple_containing_footprints')
    if building and building.get('intrudesCarriageway'):reasons.append('footprint_road_conflict')
    if not facade:reasons.append('missing_facade')
    else:
        midpoint=Point((facade[0][0]+facade[1][0])/2,(facade[0][1]+facade[1][1])/2)
        distance=point.distance(midpoint)
        if distance>20:reasons.append('facade_far_from_source_point')
        if building:
            poly=Polygon(building['footprint'],building.get('holes'))
            if poly.exterior.distance(midpoint)>.3:reasons.append('facade_off_building_boundary')
            if assigned and not poly.buffer(.05).covers(LineString([point,midpoint])):reasons.append('facade_not_directly_connected')
        if road:
            line=LineString(road['points']);q,dx,dz=nearest(line,midpoint);pq,pdx,pdz=nearest(line,point)
            supported=side(dx,dz,midpoint.x-q.x,midpoint.y-q.y)==sf['side'] and side(pdx,pdz,point.x-pq.x,point.y-pq.y)==sf['side']
            road_side='supported' if supported else 'conflict'
            if not supported:reasons.append('road_side_conflict')
            ux,uz=q.x-midpoint.x,q.y-midpoint.y;n=math.hypot(ux,uz)
            if n<.3 or (-math.sin(sf['facingHeading'])*ux-math.cos(sf['facingHeading'])*uz)/max(.001,n)<.5:reasons.append('facade_faces_away_from_road')
            if line.distance(midpoint)>27:reasons.append('facade_road_too_far')
        else:reasons.append('road_missing')
    if sf.get('floor',0)>0:reasons.append('legacy_inferred_floor')
    blocking=[r for r in reasons if r!='legacy_inferred_floor']
    return {'association':association,'display':'facade' if assigned and not blocking else 'listing_only','floorBasis':'unknown','displacementM':round(distance,2),'roadSide':road_side,'reasons':sorted(reasons)}

def fallback_height(kind):
    if kind in {'shed','roof','garage','garages','retail','kiosk','outbuilding'}:return 3.8
    if kind in {'warehouse','industrial','factory','hangar'}:return 6.5
    if kind=='apartments':return 13.4
    if kind in {'office','commercial','hospital','hotel'}:return 10.2
    return 7.

def ndjson_rows(text):
    # U+2028/U+2029 are legal inside JSON strings; only LF separates these source records.
    return [json.loads(line) for line in text.split('\n') if line.strip()]

def listing_index(core,frontages,world_id,world_version):
    # All source named points inside the full playable boundary, including excluded frontages.
    import sys
    sys.path.insert(0,str(GAME/'scripts/source_accuracy'))
    from heights import KX,KZ,LAT0,LON0
    # Only LF delimits NDJSON; Unicode line separators can legally occur inside place names.
    rows=ndjson_rows((GAME/'data/interim/overture/2026-09-23.1/places.ndjson').read_text())
    rows=[r for r in rows if r.get('name') and r['name'].strip()]
    xs=np.array([(r['p'][0]-LON0)*KX for r in rows]);zs=np.array([-(r['p'][1]-LAT0)*KZ for r in rows])
    inside=shapely.contains_xy(Polygon(core['boundary']['polygon']),xs,zs)
    points=shapely.points(xs[inside],zs[inside]);chosen=[r for r,ok in zip(rows,inside) if ok]
    roads=core['roads'];lines=STRtree([LineString(r['points']) for r in roads])
    matches,distances=lines.query_nearest(points,all_matches=False,return_distance=True)
    near={int(i):(roads[int(j)]['id'],float(d)) for i,j,d in zip(matches[0],matches[1],distances)}
    attached={s['placeId']:s for s in frontages}
    records=[]
    for i,(r,p) in enumerate(zip(chosen,points)):
        road,distance=near[i];sf=attached.get(r['id'])
        records.append({'id':r['id'],'name':r['name'],'x':round(p.x,2),'z':round(p.y,2),'category':r.get('cat') or (r.get('tax') or ['unknown'])[-1],'confidence':r.get('conf'),'operatingStatus':r.get('st') or 'unknown','roadId':road,'distanceToRoadM':round(distance,1),'positionStatus':'source_listing','sources':r.get('src',[]),'licenses':r.get('lic',[]),'frontageId':sf['id'] if sf else None})
    return {'version':1,'worldId':world_id,'worldVersion':world_version,'sourceSnapshot':'Overture2026-09-23.1','positionStatus':'Source listing point, not a verified entrance or tenancy','roadAssociation':'Nearest selected road for orientation only, not a source-supported business frontage','count':len(records),'places':records}

def main(write_runtime=False,check_runtime=False):
    manifest=load(BASE/'manifest.json');core=load(BASE/manifest['core']['file'])
    for ref in [manifest['core'],*manifest['chunks']]:
        if sha((BASE/ref['file']).read_bytes())!=ref['sha256']:raise RuntimeError(f"Frozen input checksum mismatch: {ref['file']}")
    chunks=[load(BASE/c['file']) for c in manifest['chunks']]
    bs=[b for c in chunks for b in c['buildings']];frontages=[s for c in chunks for s in c.get('storefronts',[])]
    by_building={b['id']:b for b in bs};by_road={r['id']:r for r in core['roads']}
    polygons=[Polygon(b['footprint'],b.get('holes')) for b in bs];tree=STRtree(polygons)
    placements={};reasons=Counter();fc=Counter()
    for sf in frontages:
        point=Point(sf['x'],sf['z']);ids=[bs[int(i)]['id'] for i in tree.query(point,predicate='intersects')]
        placement=classify(sf,by_building.get(sf.get('buildingId')),ids,by_road.get(sf['roadId']))
        placements[sf['id']]=placement;fc[placement['association']]+=1;fc[placement['display']]+=1;reasons.update(placement['reasons'])
    facts=source_buildings(bs)
    satellite_path=INTERIM/'satellite-heights.json';satellite=load(satellite_path) if satellite_path.exists() else None
    bc=Counter();building_records={};changes=0;final_heights={}
    for b in bs:
        source=facts.get(b['id'],{});estimate=satellite['buildings'].get(b['id']) if satellite else None
        if source.get('heightM',0)>0:bc['sourceHeight']+=1;h=source['heightM']
        elif source.get('numFloors',0)>0:bc['sourceFloors']+=1;h=source['numFloors']*3.2+.6
        elif estimate:bc['satelliteEstimate']+=1;h=estimate['heightM']
        else:bc['classFallback']+=1;h=fallback_height(source.get('class') or source.get('subtype') or b['kind'])
        final_heights[b['id']]=h
        changes+=abs(h-b['heightM'])>.05
        bc['sourceClass']+=bool(source.get('class'));bc['sourceFacadeColour']+=bool(source.get('facadeColor'));bc['sourceFacadeMaterial']+=bool(source.get('facadeMaterial'))
        record={}
        if source:record['source']=source
        if estimate:record['satellite']={**estimate,'year':2023,'effectiveResolutionM':4}
        if record:building_records[b['id']]=record
    geometry, geometry_summary=geometry_reconciliations(core,bs,final_heights)
    for building_id,repair in geometry.items():building_records.setdefault(building_id,{})['geometry']=repair
    road_records, road_summary=road_properties(core,OVERTURE)
    summary={'roads':road_summary,'buildings':{'total':len(bs),**{k:bc[k] for k in ['sourceHeight','sourceFloors','satelliteEstimate','classFallback','sourceClass','sourceFacadeColour','sourceFacadeMaterial']}},'frontages':{'total':len(frontages),'sourceContained':fc['source_contained'],'nearbyAmbiguous':fc['nearby_ambiguous'],'unmatched':fc['unmatched'],'facadeEligible':fc['facade'],'listingOnly':fc['listing_only'],'reasonCounts':dict(sorted(reasons.items()))},'geometry':geometry_summary}
    data={'version':1,'worldId':manifest['worldId'],'worldVersion':manifest['version'],'coreSha256':manifest['core']['sha256'],'chunkDigest':chunk_digest(manifest),'summary':summary,'roads':road_records,'buildings':building_records,'frontages':placements,'sources':[{'title':'Overture Maps frozen snapshot','url':'https://docs.overturemaps.org/','year':2026},{'title':'Google Open Buildings2.5D Temporal','url':'https://sites.research.google/gr/open-buildings/temporal/','year':2023,'license':'CC-BY-4.0'}],'limitations':['A contained listing point is spatial evidence, not verified business tenancy or entrance','Existence confidence does not measure positional accuracy','No unsurveyed floor or kiosk claim is retained; ambiguous names remain in the listing layer','Satellite heights are2023 presence-masked estimates with effective4m resolution and roof-position drift','Satellite height accuracy was not established for India; use no1.5m MAE claim','Class fallbacks are visual placeholders only; source and manual heights take precedence','Road source surface, speed and relative-layer rules are preserved with original ranges; the frozen source has no lane-count field or metric height coordinates, so lane counts and terrain grades remain unknown','Reconciled building components are provisional differences from source/inferred carriageways, not measured outlines; fully consumed outlines stay unresolved']}
    write(INTERIM/'source-accuracy-audit.json',data)
    report={'summary':summary,'heightChangesVsBase':changes,'satelliteSampleReport':satellite['counts'] if satellite else None,'limitations':data['limitations'],'method':'classify all original records without moving business points; source heights/floors > masked satellite median > explicit class fallback'}
    write(GAME/'qa/artifacts/citywide-source-audit.json',report,True)
    print(json.dumps(report,indent=2),flush=True)
    if not (write_runtime or check_runtime):return
    if satellite is None:raise RuntimeError('Run heights.py first; refusing to replace all heights without satellite sampling')
    listings=listing_index(core,frontages,manifest['worldId'],manifest['version'])
    if check_runtime:
        for key,name,value in [('sourceAccuracy','source-accuracy.json',data),('listingIndex','listings.json',listings)]:
            content=encoded(value);ref=manifest.get(key,{})
            if (BASE/name).read_bytes()!=content or ref.get('sha256')!=sha(content) or ref.get('bytes')!=len(content):raise RuntimeError(f'Runtime {name} differs from regenerated source audit')
        if manifest['listingIndex']['count']!=listings['count']:raise RuntimeError('Listing manifest count differs')
        bind_ledger(check=True)
        print('SOURCE_CHECK_OK: byte-identical layer and listings, frozen core/chunk hashes verified',flush=True)
        return
    path=BASE/'source-accuracy.json';write(path,data)
    manifest['sourceAccuracy']={'file':path.name,'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size}
    path=BASE/'listings.json';write(path,listings)
    manifest['listingIndex']={'file':path.name,'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size,'count':listings['count']}
    write(BASE/'manifest.json',manifest,True)
    bind_ledger()
    print('RUNTIME_LAYER',manifest['sourceAccuracy'],'LISTINGS',manifest['listingIndex'],flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();mode=parser.add_mutually_exclusive_group();mode.add_argument('--write',action='store_true');mode.add_argument('--check',action='store_true');args=parser.parse_args();main(args.write,args.check)
