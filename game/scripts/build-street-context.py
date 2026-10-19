#!/usr/bin/env python3
"""Deterministic source-to-local transform, with unmodified OSM identity/tags and provisional dimensions."""
import math,json,hashlib
from pathlib import Path
from collections import Counter
root=Path(__file__).resolve().parents[1]
rawdir=root/"data/raw/osm-street-context"
snapshot=json.loads((rawdir/"snapshot.json").read_text());manifest=json.loads((rawdir/"manifest.json").read_text())
phi=math.radians(17.4146);a=6378137;e2=6.69437999014e-3;s=math.sin(phi)**2
M=a*(1-e2)/(1-e2*s)**1.5;N=a/math.sqrt(1-e2*s)
def pos(lat,lon):return [round(math.radians(lon-78.5484)*math.cos(phi)*N,3),round(-math.radians(lat-17.4146)*M,3)]
source={"id":"osm-street-context-20261018","url":"https://www.openstreetmap.org/copyright","license":"ODbL-1.0","fetchedAt":manifest["fetchedAt"]}
transport=[];realm=[];unused=Counter()
for e in snapshot["elements"]:
 t=e.get("tags",{}); c=e if "lat" in e else e.get("center",{})
 if not c:continue
 lat,lon=c["lat"],c["lon"];x,z=pos(lat,lon);sid=f'{e["type"]}/{e["id"]}'
 base={"id":"osm-"+sid.replace("/","-"),"x":x,"z":z,"lat":lat,"lon":lon,"name":t.get("name"),"sourceId":source["id"],"sourceElementId":sid,"tags":t,"status":"source_mapped"}
 h=t.get("highway");pt=t.get("public_transport");am=t.get("amenity")
 tk=None
 if h=="traffic_signals":tk="signal"
 elif h=="crossing":tk="crossing"
 elif h=="bus_stop" or (pt in ("platform","stop_position") and t.get("bus")=="yes"):tk="bus_stop"
 elif am=="taxi" and any(s in " ".join([t.get("name",""),t.get("taxi",""),t.get("vehicle",""),t.get("motor_vehicle","")]).lower() for s in ["auto-rickshaw","auto_rickshaw","auto rickshaw","auto stand","auto taxi","tuk-tuk"]):tk="auto_stand"
 if tk:transport.append(dict(base,kind=tk))
 rk=None
 if h=="street_lamp":rk="streetlight"
 elif t.get("power") in ("pole","transformer","substation"):rk="utility_pole"
 elif t.get("natural")=="tree":rk="tree"
 elif am in ("parking","bicycle_parking"):rk="parking"
 elif t.get("traffic_calming") in ("bump","hump","table","cushion","rumble_strip"):rk="speed_breaker"
 elif tk in ("bus_stop","auto_stand"):rk=tk
 if rk:
  f=dict(base,kind=rk,geometryStatus="provisional",placement="roadside_fit" if rk in ("bus_stop","auto_stand") else "source_position")
  if rk=="speed_breaker":f["variant"]=t["traffic_calming"]
  if rk=="utility_pole":f["variant"]=t.get("power")
  if rk=="parking":f["variant"]="bicycle" if am=="bicycle_parking" else t.get("parking","surface")
  realm.append(f)
 if not tk and not rk:unused[h or am or t.get("railway",pt or "other")]+=1
out=root/"public/research";out.mkdir(exist_ok=True)
note="© OpenStreetMap contributors, ODbL-1.0. Mapped source coordinates, not Street View or metric verification. Geometry/style defaults are provisional. Snapshot/query/version/hash retained in data/raw/osm-street-context. Nodes not safely matched to playable ground roads remain unapplied."
transportdata={"version":1,"worldId":"hyd-metro","worldVersion":"2.0.0","sources":[source],"note":note,"features":transport}
realmdata={"version":1,"sources":[source],"note":note,"features":realm}
(out/"transport.json").write_text(json.dumps(transportdata,separators=(",",":"))+"\n")
(out/"public-realm.json").write_text(json.dumps(realmdata,separators=(",",":"))+"\n")
summary={"snapshotHash":manifest["sha256"],"osmTimestamp":manifest["osmTimestamp"],"transport":dict(Counter(f["kind"] for f in transport)),"publicRealm":dict(Counter(f["kind"] for f in realm)),"unusedByKind":dict(unused),"rawFeatures":len(snapshot["elements"]),"note":note}
(out/"street-context-summary.json").write_text(json.dumps(summary,indent=2)+"\n")
print(json.dumps(summary,indent=2))
