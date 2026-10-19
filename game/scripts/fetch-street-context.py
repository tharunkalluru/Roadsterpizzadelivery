#!/usr/bin/env python3
"""Fetch a frozen, attributed OSM street-context snapshot. Does not claim survey verification."""
import json, urllib.request, urllib.parse, hashlib, datetime
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bbox="17.339,78.362,17.505,78.568"
query='''[out:json][timeout:40];
(
node["highway"~"^(traffic_signals|crossing|bus_stop|street_lamp)$"](%s);
node["public_transport"~"^(platform|stop_position)$"](%s);
node["traffic_calming"](%s);
node["railway"="subway_entrance"](%s);
node["power"~"^(pole|transformer|substation)$"](%s);
node["amenity"~"^(taxi|parking|bicycle_parking|bench|waste_basket|drinking_water|marketplace)$"](%s);
node["natural"="tree"](%s);
way["public_transport"="platform"](%s);
way["amenity"~"^(parking|taxi)$"](%s);
);
out center meta;''' % tuple([bbox]*9)
rawdir=root/"data/raw/osm-street-context";rawdir.mkdir(parents=True,exist_ok=True)
req=urllib.request.Request("https://overpass-api.de/api/interpreter",data=urllib.parse.urlencode({"data":query}).encode(),headers={"User-Agent":"HyderabadMetroDelivery-local-research/0.3 (OSM context; attributed)","Content-Type":"application/x-www-form-urlencoded"})
with urllib.request.urlopen(req,timeout=52) as response: raw=response.read()
data=json.loads(raw)
if "elements" not in data or data.get("remark"): raise RuntimeError(str(data.get("remark",data))[:400])
(rawdir/"snapshot.json").write_bytes(raw)
manifest={"source":"OpenStreetMap contributors","endpoint":"https://overpass-api.de/api/interpreter","query":query,"fetchedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"osmTimestamp":data.get("osm3s",{}).get("timestamp_osm_base"),"license":"ODbL-1.0","attribution":"© OpenStreetMap contributors","licenseUrl":"https://www.openstreetmap.org/copyright","sha256":hashlib.sha256(raw).hexdigest(),"count":len(data["elements"]),"note":"Mapped source features; not Street View-confirmed, measured or guaranteed current. Raw tags and OSM versions retained."}
(rawdir/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
from collections import Counter
print(json.dumps({"count":manifest["count"],"bytes":len(raw),"osmTimestamp":manifest["osmTimestamp"],"kinds":dict(Counter(e.get("tags",{}).get("highway",e.get("tags",{}).get("amenity",e.get("tags",{}).get("power",e.get("tags",{}).get("traffic_calming",e.get("tags",{}).get("railway",e.get("tags",{}).get("public_transport",e.get("tags",{}).get("natural","other"))))))) for e in data["elements"]))},indent=2))
