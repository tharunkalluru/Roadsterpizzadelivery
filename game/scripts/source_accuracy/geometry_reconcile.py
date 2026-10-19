"""Conservative provisional mass recovery, without moving a source footprint.

The frozen road ribbons are themselves estimates. A difference operation is a disclosed
render/physics reconciliation, not a newly measured building outline. Every usable piece
is retained; invalid or consumed source outlines remain explicit unresolved records.
"""
from collections import Counter
import math
import shapely
from shapely.geometry import Polygon, LineString
from shapely.geometry.polygon import orient
from shapely.ops import unary_union
from shapely.strtree import STRtree

CLEARANCE_M = .45
MIN_PART_AREA_M2 = 3.01

def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    if hasattr(geometry, 'geoms'):
        return [p for g in geometry.geoms for p in polygons(g)]
    return []

def coords(ring):
    return [[round(x, 4), round(z, 4)] for x, z in list(ring.coords)[:-1]]

def part_record(poly):
    poly = orient(poly, sign=-1)
    return {'footprint': coords(poly.exterior),
            'holes': [coords(ring) for ring in poly.interiors],
            'centroid': [round(poly.centroid.x, 4), round(poly.centroid.y, 4)],
            'areaM2': round(poly.area, 4)}

def repair_polygon(source, mask):
    valid = source if source.is_valid else shapely.make_valid(source)
    result = valid.difference(mask)
    parts = [p for p in polygons(result) if p.area >= MIN_PART_AREA_M2 and p.minimum_clearance > 1e-6]
    parts.sort(key=lambda p: (-p.area, p.centroid.x, p.centroid.y))
    return parts

def geometry_reconciliations(core, buildings, heights):
    masks, roads, ys = [], [], []
    for road in core['roads']:
        if road.get('tunnel'):
            continue
        for i, (a, b) in enumerate(zip(road['points'], road['points'][1:])):
            if math.dist(a, b) < .001:
                continue
            ey = road.get('pointElevM') or [road.get('elevationM', 0)] * len(road['points'])
            masks.append(LineString([a, b]).buffer(road['widthM'] / 2 + CLEARANCE_M, quad_segs=8))
            roads.append(road['id']); ys.append((min(ey[i], ey[i+1]), max(ey[i], ey[i+1])))
    tree = STRtree(masks)
    records, counts = {}, Counter()
    for b in buildings:
        if not b.get('intrudesCarriageway'):
            continue
        counts['flaggedSourceBuildings'] += 1
        original = Polygon(b['footprint'], b.get('holes'))
        source_area = original.area
        # Only a deck at an overlapping vertical level can cut a body. A tall overhead
        # viaduct above a low roof, and tunnels beneath it, do not erase that footprint.
        height = heights.get(b['id'], b['heightM'])
        candidates = [int(i) for i in tree.query(original) if ys[int(i)][0] <= height + 1 and ys[int(i)][1] >= -.25]
        mask = unary_union([masks[i] for i in candidates])
        try:
            parts = repair_polygon(original, mask)
        except shapely.errors.GEOSException:
            parts = []
        area = sum(p.area for p in parts)
        changed = abs(area - source_area) > .01
        status = 'unresolved' if not parts else 'clipped' if changed else 'clearance_checked'
        counts[status] += 1; counts['safeComponents'] += len(parts)
        counts['splitBuildings'] += len(parts) > 1
        counts['sourceAreaM2'] += source_area; counts['retainedAreaM2'] += area
        records[b['id']] = {
            'status': status, 'geometryStatus': 'provisional', 'method': 'source_footprint_minus_carriageway',
            'clearanceM': CLEARANCE_M, 'sourceAreaM2': round(source_area, 4),
            'retainedAreaM2': round(area, 4), 'retainedFraction': round(area / source_area, 6) if source_area else 0,
            'roadIds': sorted({roads[i] for i in candidates}), 'parts': [part_record(p) for p in parts],
            'sourceIds': [b['osmId']],
            'notes': 'Provisional geometric reconciliation against source/inferred road ribbons; no footprint is translated or declared measured. All usable safe components retained; original source outline stays in the frozen chunk. Street-reviewed retainPresence overrides take precedence.' if parts else
                     'Unresolved: road clearance consumes the source outline or leaves no usable >=3.01m2 component. Do not restore a body blocking a carriageway; original remains available for imagery/field review.'
        }
    return records, {k: round(v, 2) if isinstance(v, float) else v for k, v in counts.items()}
