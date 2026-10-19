#!/usr/bin/env python3
"""Expose already cached source polygons and mapped station entrances. No imagery or dimensions invented."""
import hashlib,json,math,sys
from collections import Counter
from pathlib import Path
import pyarrow.parquet as pq
import shapely
from shapely.geometry import Polygon,box
from shapely.ops import transform
from geometry_reconcile import polygons,part_record
from road_properties import KX,KZ,LAT0,LON0

GAME=Path(__file__).resolve().parents[2];BASE=GAME/'public/world/hyd-metro/v2';RAW=GAME/'data/raw/overture/2026-09-23.1';OUT=GAME/'public/research'
def load(path):return json.loads(path.read_text())
def write(name,value):
    data=(json.dumps(value,ensure_ascii=False,separators=(',',':'),sort_keys=True)+'\n').encode();path=OUT/name
    if '--check' in sys.argv:
        if not path.exists() or path.read_bytes()!=data:raise RuntimeError(f'Source context output differs: {name}')
    else:path.write_bytes(data)
    print(name,len(data),hashlib.sha256(data).hexdigest())
def main():
    core=load(BASE/'core.json');boundary=Polygon(core['boundary']['polygon']);bounds=box(LON0+boundary.bounds[0]/KX,LAT0-boundary.bounds[3]/KZ,LON0+boundary.bounds[2]/KX,LAT0-boundary.bounds[1]/KZ)
    counts=Counter();features=[];unresolved=[];seen=set()
    for theme in ['land_use','water']:
        for path in sorted(RAW.glob(f'base-{theme}-*.parquet')):
            cols=['id','names','class','subtype','sources','geometry']
            for row in pq.read_table(path,columns=cols).to_pylist():
                if row['id'] in seen:continue
                seen.add(row['id']);source=shapely.from_wkb(row['geometry'])
                if not source.intersects(bounds):continue
                geom=transform(lambda x,y,z=None:((x-LON0)*KX,-(y-LAT0)*KZ),source)
                if not geom.is_valid:geom=shapely.make_valid(geom)
                clipped=geom.intersection(boundary)
                if clipped.is_empty:continue
                parts=[p.simplify(.25,preserve_topology=True) for p in polygons(clipped) if p.area>=.5]
                if not parts:
                    counts[f'{theme}NonPolygonRetainedAsUnresolved']+=1;unresolved.append({'id':f"ovt:{theme}/{row['id']}",'kind':theme,'geometryType':clipped.geom_type,'name':(row.get('names') or {}).get('primary'),'sourceIds':[f"ovt:{theme}/{row['id']}"],'reason':'No usable polygon; width/depth unknown. Original geometry retained in frozen Parquet.'});continue
                props=[{'dataset':s.get('dataset'),'recordId':s.get('record_id'),'license':s.get('license'),'updateTime':s.get('update_time')} for s in row['sources'] or []]
                features.append({'id':f"ovt:{theme}/{row['id']}",'kind':theme,'name':(row.get('names') or {}).get('primary'),'class':row.get('class'),'subtype':row.get('subtype'),'sourceIds':[f"ovt:{theme}/{row['id']}"],'sources':props,'parts':[part_record(p) for p in parts],'geometryStatus':'source_derived','elevationStatus':'unknown','notes':'Source polygon clipped to playable boundary and simplified <=0.25m; flat visual surface is a rendering assumption, not measured water level or terrain.'})
                counts[theme]+=1;counts['polygonParts']+=len(parts)
    features.sort(key=lambda f:f['id'])
    write('landscape.json',{'version':1,'worldId':'hyd-metro','worldVersion':core['manifestVersion'],'sourceSnapshot':'Overture 2026-09-23.1 / OSM 2026-09-06','summary':dict(counts),'features':features,'unresolved':sorted(unresolved,key=lambda r:r['id']),'limitations':['Source polygons are not current Street View verification','Linear waterways have unknown width and are counted unresolved; no channel width or depth invented','Terrain elevations, shoreline levels and land-use currentness remain unverified']})
    raw=load(GAME/'data/raw/osm-street-context/snapshot.json');entrances=[]
    for node in raw['elements']:
        if node.get('tags',{}).get('railway')!='subway_entrance':continue
        x=(node['lon']-LON0)*KX;z=-(node['lat']-LAT0)*KZ
        near=sorted([(math.hypot(x-s['x'],z-s['z']),s['id']) for s in core['stations']])
        supported=near and near[0][0]<=150 and (len(near)==1 or near[1][0]-near[0][0]>150)
        entrances.append({'id':f"osm:node/{node['id']}",'lat':node['lat'],'lon':node['lon'],'x':round(x,4),'z':round(z,4),'stationId':near[0][1] if supported else None,'associationStatus':'provisional' if supported else 'unmatched','distanceM':round(near[0][0],2) if near else None,'sourceUrl':f"https://www.openstreetmap.org/node/{node['id']}",'sourceElementId':f"node/{node['id']}@{node.get('version','unknown')}",'sourceUpdatedAt':node.get('timestamp'),'tags':node.get('tags',{}),'notes':'Original mapped entrance coordinate retained; nearby same-site association only. Point does not establish stair direction, rise, platform dimensions or current accessibility.'})
    entrances.sort(key=lambda e:e['id']);write('station-entrances.json',{'version':1,'worldId':'hyd-metro','worldVersion':core['manifestVersion'],'sourceSnapshot':raw.get('osm3s',{}).get('timestamp_osm_base'),'license':'ODbL-1.0','sourceUrl':'https://www.openstreetmap.org/copyright','entrances':entrances})
    write('source-context-summary.json',{'landscape':dict(counts),'stationEntrances':{'sourcePoints':len(entrances),'associated':sum(e['stationId'] is not None for e in entrances),'unmatched':sum(e['stationId'] is None for e in entrances)}})
if __name__=='__main__':main()
