"""Render a coverage map + a close-up of RTC X Roads with placed boards (for checking the pipeline output)."""
import json, sys, math, duckdb, shapely, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection, LineCollection
P = json.load(open('build/placements_hero.json')); C = json.load(open('build/coverage_hero.json'))
def render(bbox, out, labels=False, size=(14, 14)):
    s, w, n, e = bbox
    con = duckdb.connect()
    bl = con.execute(f"SELECT wkb FROM 'raw/overture_buildings.parquet' WHERE cx BETWEEN {w} AND {e} AND cy BETWEEN {s} AND {n}").fetchall()
    polys = []
    for (b,) in bl:
        g = shapely.from_wkb(b)
        for q in (g.geoms if hasattr(g, 'geoms') else [g]):
            if q.geom_type == 'Polygon': polys.append(np.asarray(q.exterior.coords)[:, :2])
    fig, ax = plt.subplots(figsize=size, dpi=110)
    ax.set_facecolor('#17132B')
    ax.add_collection(PolyCollection(polys, facecolors='#3a3160', edgecolors='#5a4f8a', linewidths=0.3))
    col = {'green': '#22B573', 'amber': '#FFB627', 'red': '#E8413A', 'open': '#6E6490'}
    for st in ['red', 'amber', 'green', 'open']:
        segs = [[(c[1], c[0]) for c in r['coords']] for r in C if r['status'] == st]
        ax.add_collection(LineCollection(segs, colors=col[st], linewidths=1.6 if labels else 0.9))
    pl = [p for p in P if p.get('status') == 'placed' and not p['flags'] and s < p['lat'] < n and w < p['lon'] < e]
    for p in pl:
        (a, b) = p['facade_ll']; t = p['facade']['t']
        y = a[0] + (b[0] - a[0]) * t; x = a[1] + (b[1] - a[1]) * t
        ax.plot([p['lon'], x], [p['lat'], y], color='#45E3D3', lw=0.3, alpha=0.6)
        ax.plot(x, y, 'o', ms=2.2 if not labels else 3.5, color='#F6EEDC' if p['floor'] != 'upper' else '#FF8FB1')
        if labels and p['place_conf'] >= 0.55: ax.text(x, y, ' ' + p['board'][:22], fontsize=5.5, color='#F6EEDC')
    ax.set_xlim(w, e); ax.set_ylim(s, n); ax.set_aspect(1 / math.cos(math.radians((s + n) / 2)))
    ax.set_xticks([]); ax.set_yticks([])
    plt.tight_layout(); plt.savefig(out, facecolor='#17132B'); print('saved', out, len(pl))
render((17.388, 78.478, 17.416, 78.508), 'build/hero_coverage.png')
render((17.4045, 78.4935, 17.4085, 78.4995), 'build/rtc_closeup.png', labels=True, size=(16, 11))
