#!/usr/bin/env python3
"""Playable boundary polygon: union of the selected roads buffered by `buffer` metres, morphologically closed by
`closing` metres (fills slivers between nearby corridors), exterior of the largest piece, simplified.
usage: boundary.py in.json out.json   (in: {lines:[[[x,z],...]], buffer, closing, simplify}; out: {ring:[[x,z],...]})"""
import json, sys
from shapely.geometry import LineString, MultiLineString, Polygon
from shapely.ops import unary_union

inp = json.load(open(sys.argv[1]))
lines = [LineString(l) for l in inp['lines'] if len(l) >= 2]
u = MultiLineString(lines).buffer(inp['buffer'], quad_segs=4)
c = inp.get('closing', 0)
if c:
    u = u.buffer(c, quad_segs=4).buffer(-c, quad_segs=4)
    u = unary_union([u, MultiLineString(lines).buffer(inp['buffer'], quad_segs=4)])  # closing must never shrink the roads' own buffer
polys = list(u.geoms) if u.geom_type == 'MultiPolygon' else [u]
polys.sort(key=lambda p: -p.area)
ext = Polygon(polys[0].exterior)
if len(polys) > 1:
    # disconnected pieces (should not happen for a connected network): join with the convex hull of all pieces
    ext = Polygon(unary_union(polys).convex_hull.exterior)
ext = ext.simplify(inp.get('simplify', 5), preserve_topology=True)
ring = [[round(x, 2), round(y, 2)] for x, y in list(ext.exterior.coords)[:-1]]
json.dump({'ring': ring, 'pieces': len(polys), 'area_km2': round(ext.area / 1e6, 2)}, open(sys.argv[2], 'w'))
