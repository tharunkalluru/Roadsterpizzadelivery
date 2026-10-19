"""Preserve available raw road attributes without inventing lanes or metric elevations."""
import math
import pyarrow.parquet as pq
import shapely
from shapely.geometry import LineString
from shapely.ops import transform

LAT0,LON0=17.4146,78.5484
PHI=math.radians(LAT0);E2=.00669437999014;A=6378137.
N=A/math.sqrt(1-E2*math.sin(PHI)**2);M=A*(1-E2)/(1-E2*math.sin(PHI)**2)**1.5
KX,KZ=math.cos(PHI)*N*math.pi/180,M*math.pi/180

def applies(rule,fraction):
    span=rule.get('between')
    return span is None or span[0]-1e-6<=fraction<=span[1]+1e-6

def road_properties(core,folder):
    wanted={r['provenance']['sourceIds'][0].split('/')[-1] for r in core['roads']}
    rows={}
    columns=['id','road_surface','level_rules','speed_limits','width_rules','geometry']
    for path in sorted(folder.glob('transportation-segment-*.parquet')):
        for row in pq.read_table(path,columns=columns).to_pylist():
            key=row['id'].replace('-','')[:12]
            if key in wanted:rows.setdefault(key,row)
    records={};counts={'total':len(core['roads']),'sourceWidth':0,'inferredWidth':0,'sourceSurface':0,'sourceSpeed':0,'sourceLayer':0,'sourceLanes':0,'sourceMetricGrade':0,'metadataMatched':0}
    for road in core['roads']:
        key=road['provenance']['sourceIds'][0].split('/')[-1];raw=rows.get(key)
        note=road['provenance'].get('note','')
        fact={'classificationBasis':'overture_class','widthBasis':'source_rule' if 'width_rules' in note else 'footprint_clearance' if 'clamped' in note else 'class_default','laneCountBasis':'unavailable','elevationBasis':'authored_relative_level' if any(road['pointElevM']) else 'flat_placeholder','sourceIds':road['provenance']['sourceIds']}
        if raw:
            counts['metadataMatched']+=1
            line=transform(lambda x,y,z=None:((x-LON0)*KX,-(y-LAT0)*KZ),shapely.from_wkb(raw['geometry']))
            point=LineString(road['points']).interpolate(.5,normalized=True);fraction=line.project(point,normalized=True) if line.length else 0
            fact['sourceRules']={k:raw[k] for k in ['width_rules','road_surface','level_rules','speed_limits'] if raw[k]}
            width=[r['value'] for r in raw['width_rules'] or [] if applies(r,fraction) and r['value'] and r['value']>0]
            if width:fact['sourceWidthM']=width[0];fact['widthBasis']='source_rule'
            surface=[r['value'] for r in raw['road_surface'] or [] if applies(r,fraction)]
            if surface:fact['surface']=surface[0];counts['sourceSurface']+=1
            layer=[r['value'] for r in raw['level_rules'] or [] if applies(r,fraction)]
            if layer:fact['relativeLayer']=layer[0];counts['sourceLayer']+=1
            speeds=[r['max_speed'] for r in raw['speed_limits'] or [] if applies(r,fraction) and not r.get('when') and r.get('max_speed')]
            if speeds:
                speed=speeds[0]
                if speed['unit'] in ['km/h','mph']:
                    fact['maxSpeedKph']=round(speed['value']*(1.609344 if speed['unit']=='mph' else 1),3);counts['sourceSpeed']+=1
        if 'width_rules' in note and 'sourceWidthM' not in fact:fact['sourceWidthM']=road['widthM']
        counts['sourceWidth' if 'sourceWidthM' in fact else 'inferredWidth']+=1
        records[road['id']]=fact
    return records,counts
