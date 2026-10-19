#!/usr/bin/env python3
"""Build conservative metro-envelope associations from frozen OSM ways; retain rejected evidence."""
import json,math,hashlib
from pathlib import Path
from shapely.geometry import Polygon,Point
root=Path(__file__).resolve().parents[1];raw=root/"data/raw/osm-metro-context"
src=json.loads((raw/"snapshot.json").read_text());meta=json.loads((raw/"manifest.json").read_text());core=json.loads((root/"public/world/hyd-metro/v2/core.json").read_text())
phi=math.radians(17.4146);a=6378137;e2=6.69437999014e-3;s=math.sin(phi)**2;M=a*(1-e2)/(1-e2*s)**1.5;N=a/math.sqrt(1-e2*s)
def project(lat,lon):return (math.radians(lon-78.5484)*math.cos(phi)*N,-math.radians(lat-17.4146)*M)
def norm(t):return ''.join(c for c in t.lower()if c.isalnum()).replace("metrostation","").replace("metro","")
features=[];unmatched=[]
for e in src["elements"]:
 if e["type"]!="way" or not e.get("geometry"):continue
 t=e.get("tags",{});sid=f'way/{e["id"]}'
 if t.get("building")!="train_station" and t.get("railway")!="station":continue
 pts=[project(p["lat"],p["lon"])for p in e["geometry"]]
 if len(pts)<4 or math.dist(pts[0],pts[-1])>.2:unmatched.append({"sourceElementId":sid,"reason":"not_closed_station_envelope","tags":t});continue
 poly=Polygon(pts)
 if not poly.is_valid or poly.area<100:unmatched.append({"sourceElementId":sid,"reason":"invalid_or_small_polygon","tags":t});continue
 cx,cz=poly.centroid.coords[0]
 choices=sorted(((math.hypot(st["x"]-cx,st["z"]-cz),st)for st in core["stations"]),key=lambda v:v[0]);d,st=choices[0]
 explicit="metro" in " ".join([t.get("network",""),t.get("name",""),t.get("operator","")]).lower()or t.get("station")=="subway"
 layer=int(t.get("layer","0"))if t.get("layer","0").lstrip('-').isdigit()else 0
 nameMatch=bool(t.get("name"))and(norm(st["name"])in norm(t["name"])or norm(t["name"])in norm(st["name"]))
 near=(d<50 and(explicit or layer>0))or(nameMatch and explicit and d<150 and poly.distance(Point(st["x"],st["z"]))<30)
 if not near:unmatched.append({"sourceElementId":sid,"name":t.get("name"),"nearestStationId":st["id"],"distanceM":round(d,2),"reason":"not_confidently_metro_or_near_station","tags":t});continue
 corners=list(poly.minimum_rotated_rectangle.exterior.coords)[:4];edges=[(math.dist(corners[i],corners[(i+1)%4]),corners[i],corners[(i+1)%4])for i in range(4)];length,a0,b0=max(edges,key=lambda v:v[0]);width=min(v[0]for v in edges)
 dx,dz=(b0[0]-a0[0])/length,(b0[1]-a0[1])/length
 ratio=poly.area/(length*width)
 reason=None
 if len(st["lines"])>1:reason="interchange_requires_custom_layout"
 elif not(70<=length<=210 and 14<=width<=36 and ratio>=.85):reason="irregular_envelope_requires_custom_layout"
 features.append({"id":"osm-metro-envelope-"+str(e["id"]),"stationId":st["id"],"sourceElementId":sid,"sourceUrl":"https://www.openstreetmap.org/"+sid,"sourceUpdatedAt":e.get("timestamp"),"tags":t,"footprint":[[round(x,3),round(z,3)]for x,z in pts[:-1]],"centre":[round(cx,3),round(cz,3)],"lengthM":round(length,3),"widthM":round(width,3),"axis":[round(dx,8),round(dz,8)],"rectangularity":round(ratio,4),"associationDistanceM":round(d,3),"status":"source_mapped","dimensionStatus":"provisional","layoutStatus":"supported_envelope"if reason is None else"requires_custom_layout","note":reason or"Source exterior envelope informs approximate horizontal dimensions; roof/interior/stairs and all vertical heights remain authored, not a measured architectural reconstruction."})
data={"version":1,"worldId":"hyd-metro","worldVersion":"2.0.0","sourceSnapshot":"data/raw/osm-metro-context/snapshot.json","snapshotSha256":meta["sha256"],"license":"ODbL-1.0","attribution":"© OpenStreetMap contributors","sourceUrl":"https://www.openstreetmap.org/copyright","features":features,"unmatched":unmatched,"limitations":["Footprints are OSM source claims and may be stale; source tags are preserved.","Nonmetro mainline rail and uncertain nearby structures are not adopted.","Interchanges and irregular footprints require bespoke architecture rather than scaling one generic two-track station.","Only horizontal envelope dimensions are source-informed; metric elevations and details remain provisional."]}
out=root/"public/research/station-geometry.json";out.write_text(json.dumps(data,separators=(",",":"))+"\n")
print(json.dumps({"features":len(features),"supported":sum(f["layoutStatus"]=="supported_envelope"for f in features),"unmatched":len(unmatched),"stations":[[f["stationId"],f["lengthM"],f["widthM"],f["rectangularity"],f["layoutStatus"]]for f in features]},indent=2))
