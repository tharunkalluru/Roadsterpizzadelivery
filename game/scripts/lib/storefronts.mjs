// Storefront attachment: Overture place -> building edge that faces the road (or a kerb kiosk frontage).
import * as G from './geo.mjs';
import { groupOf, UPPER_FLOOR_GROUPS } from './stores.mjs';
import { pointAt } from './metro.mjs';

export const SF_MAX_ROAD_M = 40; // place must be within this distance of a selected road
export const SF_MIN_CONF = 0.35; // rendering threshold
export const FACING_COS = Math.cos((60 * Math.PI) / 180);
export const EDGE_ROAD_M = 25; // facing edge must be within this distance of the road
export const MIN_EDGE_M = 3;
export const GROUND_CELL_M = 3.2; // minimum frontage per shop unit used for capacity

/** outward unit normal of edge a->b of a ring that is CCW from above (interior on the left, left = (dz,-dx)) */
export const outwardNormal = (a, b) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L = Math.hypot(dx, dz) || 1;
  return [-dz / L, dx / L];
};

/**
 * ctx: {
 *   roads, roadGrid (SegGrid payload {ri, seg}), buildings (array with footprint, id), edgeGrid (SegGrid payload {bi, ei}), buildingAt(p)
 *   chunkOf(x,z) -> id
 * }
 * places: [{id, name, nameTe, cat, tax, conf, st, src, lic, p:[x,z], lon, lat}]
 */
export function attachStorefronts(places, ctx, log = () => {}) {
  const { roads, roadGrid, buildings, edgeGrid, buildingAt } = ctx;
  const elevAt = (r, seg, t) => r.pointElevM[seg] + (r.pointElevM[seg + 1] - r.pointElevM[seg]) * t;
  /** nearest road within radius whose surface at the foot point is at grade (<= 2.5 m); also reports the nearest elevated one */
  function nearestGrade(p, radius) {
    const hits = roadGrid.within(p, radius).sort((a, b) => a.d - b.d || a.id - b.id);
    for (const h of hits) {
      const r = roads[h.payload.ri];
      const a = r.points[h.payload.seg];
      const b = r.points[h.payload.seg + 1];
      const n = G.nearestOnSegment(p, a, b);
      if (elevAt(r, h.payload.seg, n.t) > 2.5) continue;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dx = (b[0] - a[0]) / L;
      const dz = (b[1] - a[1]) / L;
      return { road: r, ri: h.payload.ri, d: n.d, x: n.x, z: n.z, dx, dz, s: r._cum[h.payload.seg] + n.t * L, side: G.sideOf(dx, dz, p[0] - n.x, p[1] - n.z) };
    }
    return { any: hits.length > 0 };
  }

  /** road that a facade (mid point, outward normal) faces: nearest at-grade road within 27 m whose foot direction is within 60 degrees of the normal */
  function facingRoad(mid, nrm) {
    const seen = new Set();
    const hits = roadGrid.within(mid, EDGE_ROAD_M + 2).sort((a, b) => a.d - b.d || a.id - b.id);
    for (const h of hits) {
      if (seen.has(h.payload.ri)) continue;
      seen.add(h.payload.ri);
      const r = roads[h.payload.ri];
      const n = G.nearestOnPolyline(mid, r.points);
      if (n.d > EDGE_ROAD_M + 2) continue;
      if (elevAt(r, n.seg, n.t) > 2.5) continue;
      const ux = n.x - mid[0];
      const uz = n.z - mid[1];
      const ul = Math.hypot(ux, uz);
      if (ul < 0.3) continue;
      if ((nrm[0] * ux + nrm[1] * uz) / ul < FACING_COS + 0.005) continue;
      return { road: r, dx: n.dx, dz: n.dz, x: n.x, z: n.z };
    }
    return null;
  }
  const inventory = [];
  const sfs = []; // working storefront records
  const groups = new Map(); // `${bi}:${ei}` -> items
  const kiosks = [];
  for (const pl of places) {
    const group = groupOf(pl.cat, pl.tax);
    const rec = { id: pl.id, name: pl.name || null, nameTe: pl.nameTe || null, category: pl.cat || (pl.tax && pl.tax[pl.tax.length - 1]) || 'unknown', group, confidence: pl.conf ?? 0, sources: pl.sources, license: pl.license, x: pl.p[0], z: pl.p[1], lon: pl.lon, lat: pl.lat, dRoad: null, roadId: null, side: null, chunk: null, status: 'excluded', reasons: [] };
    const nr = nearestGrade(pl.p, SF_MAX_ROAD_M);
    // distance to ANY selected road (inventory scope)
    const any = roadGrid.nearest(pl.p, SF_MAX_ROAD_M);
    if (!any) continue; // outside the 40 m scope: not part of the inventory
    rec.dRoad = G.r2(any.d);
    if (pl.st === 'permanently_closed') rec.reasons.push('permanently_closed');
    if (!pl.name || !/\S/.test(pl.name)) rec.reasons.push('no_name');
    if ((pl.conf ?? 0) < SF_MIN_CONF) rec.reasons.push('low_confidence');
    if (!nr.road) rec.reasons.push('no_at_grade_road_within_40m');
    if (rec.reasons.length) {
      inventory.push(rec);
      continue;
    }
    // candidate building edges
    let best = null;
    const containing = buildingAt(pl.p);
    for (const h of edgeGrid.within(pl.p, SF_MAX_ROAD_M)) {
      const { bi, ei } = h.payload;
      const b = buildings[bi];
      const fp = b.footprint;
      const A = fp[ei];
      const B = fp[(ei + 1) % fp.length];
      const Lc = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (Lc < MIN_EDGE_M) continue;
      const n = G.nearestOnSegment(pl.p, A, B);
      const q = [n.x, n.z];
      const road = nearestGrade(q, EDGE_ROAD_M);
      if (!road.road) continue;
      const nrm = outwardNormal(A, B);
      // direction from the edge point to the road
      const ux = road.x - q[0];
      const uz = road.z - q[1];
      const ul = Math.hypot(ux, uz);
      if (ul < 0.3) continue; // edge on the carriageway
      if ((nrm[0] * ux + nrm[1] * uz) / ul < FACING_COS) continue;
      const score = n.d - (containing && containing === b ? 8 : 0);
      if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) <= 1e-9 && (bi < best.bi || (bi === best.bi && ei < best.ei)))) best = { score, bi, ei, t: n.t, n, road, nrm, Lc, A, B };
    }
    if (best) {
      const key = `${best.bi}:${best.ei}`;
      let a = groups.get(key);
      if (!a) groups.set(key, (a = { bi: best.bi, ei: best.ei, A: best.A, B: best.B, Lc: best.Lc, nrm: best.nrm, items: [] }));
      a.items.push({ rec, t: best.t, roadS: best.road.s, rdx: best.road.dx, rdz: best.road.dz });
    } else {
      kiosks.push({ rec, nr });
    }
  }

  // ---- building frontages
  const out = [];
  const keys = [...groups.keys()].sort((a, b) => {
    const [a1, a2] = a.split(':').map(Number);
    const [b1, b2] = b.split(':').map(Number);
    return a1 - b1 || a2 - b2;
  });
  for (const key of keys) {
    const g = groups.get(key);
    const edgeDx = (g.B[0] - g.A[0]) / g.Lc;
    const edgeDz = (g.B[1] - g.A[1]) / g.Lc;
    const cap = Math.max(1, Math.floor(g.Lc / GROUND_CELL_M));
    const prio = (it) => [-it.rec.confidence, it.rec.id];
    const byPrio = g.items.slice().sort((a, b) => b.rec.confidence - a.rec.confidence || (a.rec.id < b.rec.id ? -1 : 1));
    const groundType = g.items.filter((it) => !UPPER_FLOOR_GROUPS.has(it.rec.group)).length;
    const floors = [[], []];
    for (const it of byPrio) {
      const prefer = UPPER_FLOOR_GROUPS.has(it.rec.group) && groundType >= 2 ? 1 : 0;
      if (floors[prefer].length < cap) floors[prefer].push(it);
      else if (floors[1 - prefer].length < cap) floors[1 - prefer].push(it);
      else it.rec.reasons.push('frontage_capacity');
    }
    for (const it of g.items) if (it.rec.reasons.includes('frontage_capacity')) inventory.push(it.rec);
    for (let fl = 0; fl < 2; fl++) {
      const list = floors[fl];
      if (!list.length) continue;
      // order along the road, then lay the shop units along the edge in that order
      list.sort((a, b) => a.roadS - b.roadS || (a.rec.id < b.rec.id ? -1 : 1));
      const par = list[0].rdx * edgeDx + list[0].rdz * edgeDz;
      if (par < 0) list.reverse(); // edge runs against the road direction
      const k = list.length;
      list.forEach((it, i) => {
        let s0;
        let s1;
        if (k === 1) {
          const w = Math.min(g.Lc, 6);
          const c = Math.max(w / 2, Math.min(g.Lc - w / 2, it.t * g.Lc));
          s0 = c - w / 2;
          s1 = c + w / 2;
        } else {
          const cell = g.Lc / k;
          const w = Math.min(cell, 8);
          const c = (i + 0.5) * cell;
          s0 = c - w / 2;
          s1 = c + w / 2;
        }
        const f0 = [G.r2(g.A[0] + edgeDx * s0), G.r2(g.A[1] + edgeDz * s0)];
        const f1 = [G.r2(g.A[0] + edgeDx * s1), G.r2(g.A[1] + edgeDz * s1)];
        const mid = [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2];
        const road = facingRoad(mid, g.nrm);
        if (!road) {
          it.rec.reasons.push('facade_not_facing_a_road');
          inventory.push(it.rec);
          return;
        }
        out.push({
          rec: it.rec,
          buildingIndex: g.bi,
          facade: [f0, f1],
          facingHeading: G.r4(G.headingOf(g.nrm[0], g.nrm[1])),
          floor: fl,
          roadId: road.road.id,
          side: G.sideOf(road.dx, road.dz, mid[0] - road.x, mid[1] - road.z),
        });
      });
    }
  }

  // ---- kiosks (no facing building): 6 m frontage parallel to the road at kerb + 3 m
  const kb = new Map();
  for (const k of kiosks) {
    const key = `${k.nr.ri}:${k.nr.side}`;
    let a = kb.get(key);
    if (!a) kb.set(key, (a = []));
    a.push(k);
  }
  for (const key of [...kb.keys()].sort()) {
    const list = kb.get(key).sort((a, b) => a.nr.s - b.nr.s || (a.rec.id < b.rec.id ? -1 : 1));
    let prevEnd = -Infinity;
    for (const k of list) {
      const road = k.nr.road;
      let s = k.nr.s;
      if (s - 3 < prevEnd) s = prevEnd + 3;
      if (s - k.nr.s > 20 || s + 3 > road.lengthM || s - 3 < 0) {
        // clamp inside the road first
        const s2 = Math.max(3, Math.min(road.lengthM - 3, s));
        if (Math.abs(s2 - k.nr.s) > 20 || road.lengthM < 6) {
          k.rec.reasons.push('frontage_capacity');
          inventory.push(k.rec);
          continue;
        }
        s = s2;
      }
      prevEnd = s + 3;
      // straight 6 m frontage parallel to the road tangent at s, at kerb + 3 m on the listing's side
      const sgn = k.nr.side === 'left' ? 1 : -1;
      const q = pointAt(road.points, road._cum, s);
      const lx = q.dz * sgn;
      const lz = -q.dx * sgn; // lateral unit vector toward the listing side (left of travel is (dz,-dx))
      const off = road.widthM / 2 + 3;
      const cx = q.x + lx * off;
      const cz = q.z + lz * off;
      const f0 = [G.r2(cx - q.dx * 3), G.r2(cz - q.dz * 3)];
      const f1 = [G.r2(cx + q.dx * 3), G.r2(cz + q.dz * 3)];
      const mid = [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2];
      if (buildingAt(mid)) {
        k.rec.reasons.push('kiosk_inside_building');
        inventory.push(k.rec);
        continue;
      }
      // facade normal points from the kerb frontage toward the road centreline
      // normal of the frontage points from the kerb frontage back toward the road centreline
      const lat = [-lx, -lz];
      out.push({ rec: k.rec, buildingIndex: null, facade: [f0, f1], facingHeading: G.r4(G.headingOf(lat[0], lat[1])), floor: 0, roadId: road.id, side: k.nr.side });
    }
  }
  return { storefronts: out, inventory };
}
