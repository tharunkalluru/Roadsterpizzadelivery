// Geometry + projection helpers shared by import-map.mjs and validate-world.mjs.
// Conventions (documented in DATA_SOURCES.md):
//   local frame: X east (m), Y up (m), Z SOUTH (m); z = -northing.
//   heading h: forward vector = (-sin h, 0, -cos h)  => h = atan2(-dx, -dz)
//   side: viewed from above with north up, "left" = driver's left when travelling along the points order.
//         with (dx,dz) = travel direction and (rx,rz) = vector to the point: left  <=>  dx*rz - dz*rx < 0

export const WORLD_ORIGIN = { lat: 17.4146, lon: 78.5484 };
const A = 6378137.0;
const E2 = 0.00669437999014;
const phi0 = (WORLD_ORIGIN.lat * Math.PI) / 180;
const s2 = Math.sin(phi0) ** 2;
export const N_RADIUS = A / Math.sqrt(1 - E2 * s2); // prime-vertical radius at origin latitude
export const M_RADIUS = (A * (1 - E2)) / Math.pow(1 - E2 * s2, 1.5); // meridional radius at origin latitude
const KX = (Math.cos(phi0) * N_RADIUS * Math.PI) / 180; // metres per degree lon
const KZ = (M_RADIUS * Math.PI) / 180; // metres per degree lat

export function project(lat, lon) {
  return [(lon - WORLD_ORIGIN.lon) * KX, -(lat - WORLD_ORIGIN.lat) * KZ];
}
export function unproject(x, z) {
  return [WORLD_ORIGIN.lat - z / KZ, WORLD_ORIGIN.lon + x / KX]; // [lat, lon]
}

export const r2 = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};
export const r6 = (v) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};
export const r4 = (v) => {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polyLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

/** nearest point on segment AB to P: returns {t, x, z, d} */
export function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx;
  const z = a[1] + t * dz;
  return { t, x, z, d: Math.hypot(p[0] - x, p[1] - z) };
}

/** nearest point on polyline: {d, x, z, seg, t, s (arclength to point), dx, dz (unit travel dir of segment)} */
export function nearestOnPolyline(p, pts) {
  let best = null;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = nearestOnSegment(p, a, b);
    if (!best || n.d < best.d - 1e-9) {
      best = { d: n.d, x: n.x, z: n.z, seg: i, t: n.t, s: acc + n.t * segLen, dx: segLen > 0 ? (b[0] - a[0]) / segLen : 1, dz: segLen > 0 ? (b[1] - a[1]) / segLen : 0 };
    }
    acc += segLen;
  }
  return best;
}

/** densify polyline so no gap exceeds step */
export function densify(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    const n = Math.max(1, Math.ceil(l / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** +1 left, -1 right of travel direction (dx,dz) for point displacement (rx,rz); 0 if on line */
export function sideOf(dx, dz, rx, rz) {
  const c = dx * rz - dz * rx;
  if (c < 0) return 'left';
  return 'right';
}

export function headingOf(dx, dz) {
  const h = Math.atan2(-dx, -dz);
  return Object.is(h, -0) ? 0 : h;
}

/** signed shoelace area using (x,z) as (u,v) */
export function signedAreaXZ(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Orient ring "counter-clockwise when viewed from above (+Y) with north up (X right, Z down on screen)".
 * With Z pointing south this is a NEGATIVE shoelace area computed on (x,z).
 */
export function orientCCWFromAbove(ring) {
  return signedAreaXZ(ring) > 0 ? ring.slice().reverse() : ring.slice();
}
export function isCCWFromAbove(ring) {
  return signedAreaXZ(ring) < 0;
}

export function pointInPolygon(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1], xj = ring[j][0], zj = ring[j][1];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(ring) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (uniq.length < 3) return uniq;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Simple uniform grid index over segments for proximity queries. */
export class SegGrid {
  constructor(cell = 50) {
    this.cell = cell;
    this.map = new Map();
    this.segs = [];
  }
  _key(ix, iz) {
    return ix * 100003 + iz;
  }
  add(a, b, payload) {
    const id = this.segs.length;
    this.segs.push({ a, b, payload });
    const c = this.cell;
    const x0 = Math.floor(Math.min(a[0], b[0]) / c), x1 = Math.floor(Math.max(a[0], b[0]) / c);
    const z0 = Math.floor(Math.min(a[1], b[1]) / c), z1 = Math.floor(Math.max(a[1], b[1]) / c);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(id);
      }
  }
  /** nearest segment within radius (or null). Tie-break: smaller payload.order, then insertion order. */
  nearest(p, radius) {
    const c = this.cell;
    const x0 = Math.floor((p[0] - radius) / c), x1 = Math.floor((p[0] + radius) / c);
    const z0 = Math.floor((p[1] - radius) / c), z1 = Math.floor((p[1] + radius) / c);
    let best = null;
    const seen = new Set();
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.map.get(this._key(ix, iz));
        if (!arr) continue;
        for (const id of arr) {
          if (seen.has(id)) continue;
          seen.add(id);
          const s = this.segs[id];
          const n = nearestOnSegment(p, s.a, s.b);
          if (n.d <= radius && (!best || n.d < best.d - 1e-9 || (Math.abs(n.d - best.d) <= 1e-9 && id < best.id))) best = { id, d: n.d, t: n.t, x: n.x, z: n.z, payload: s.payload, a: s.a, b: s.b };
        }
      }
    return best;
  }
}

/** sub-polyline between arclengths s0..s1 (with interpolated end points) */
export function subPolyline(pts, cum, s0, s1) {
  const out = [];
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1];
    const t = seg > 0 ? (s - cum[i - 1]) / seg : 0;
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  out.push(at(s0));
  for (let i = 1; i < pts.length - 1; i++) if (cum[i] > s0 && cum[i] < s1) out.push(pts[i]);
  out.push(at(s1));
  return out;
}
export function offsetLine(pts, off) {
  // positive off = left of travel (left vector = (dz,-dx))
  const nrm = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dz = pts[i + 1][1] - pts[i][1];
    const L = Math.hypot(dx, dz) || 1;
    nrm.push([dz / L, -dx / L]);
  }
  return pts.map((p, i) => {
    const a = nrm[Math.max(0, i - 1)];
    const b = nrm[Math.min(nrm.length - 1, i)];
    let nx = a[0] + b[0];
    let nz = a[1] + b[1];
    const L = Math.hypot(nx, nz) || 1;
    nx /= L;
    nz /= L;
    return [p[0] + nx * off, p[1] + nz * off];
  });
}


export function cumulative(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}

/** all segments of a SegGrid within radius of p: [{id, d, payload}] */
SegGrid.prototype.within = function within(p, radius) {
  const c = this.cell;
  const x0 = Math.floor((p[0] - radius) / c), x1 = Math.floor((p[0] + radius) / c);
  const z0 = Math.floor((p[1] - radius) / c), z1 = Math.floor((p[1] + radius) / c);
  const out = [];
  const seen = new Set();
  for (let ix = x0; ix <= x1; ix++)
    for (let iz = z0; iz <= z1; iz++) {
      const arr = this.map.get(this._key(ix, iz));
      if (!arr) continue;
      for (const id of arr) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = this.segs[id];
        const d = nearestOnSegment(p, s.a, s.b).d;
        if (d <= radius) out.push({ id, d, payload: s.payload });
      }
    }
  return out;
};

function segsIntersect(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** true if the two simple polygons (rings, unclosed) overlap (edge crossing or containment) */
export function polygonsIntersect(A, B) {
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i], a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) if (segsIntersect(a1, a2, B[j], B[(j + 1) % B.length])) return true;
  }
  return pointInPolygon(A[0], B) || pointInPolygon(B[0], A);
}
/** distance from point to polygon (0 if inside) */
export function distPointPolygon(p, ring) {
  if (pointInPolygon(p, ring)) return 0;
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) best = Math.min(best, nearestOnSegment(p, ring[i], ring[(i + 1) % ring.length]).d);
  return best;
}
