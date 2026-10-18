// Projection / float32 quantisation error report for the v2 extent (documented in DATA_SOURCES.md).
import * as G from './geo.mjs';

const A = 6378137.0;
const F = 1 / 298.257223563;
const B = (1 - F) * A;

/** Vincenty inverse distance on WGS84 (metres); lat/lon in degrees */
export function vincenty(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const U1 = Math.atan((1 - F) * Math.tan(lat1 * rad));
  const U2 = Math.atan((1 - F) * Math.tan(lat2 * rad));
  const L = (lon2 - lon1) * rad;
  let lam = L;
  let sinSig, cosSig, sig, cos2a, cos2sm;
  for (let i = 0; i < 200; i++) {
    const sinLam = Math.sin(lam), cosLam = Math.cos(lam);
    sinSig = Math.hypot(Math.cos(U2) * sinLam, Math.cos(U1) * Math.sin(U2) - Math.sin(U1) * Math.cos(U2) * cosLam);
    if (sinSig === 0) return 0;
    cosSig = Math.sin(U1) * Math.sin(U2) + Math.cos(U1) * Math.cos(U2) * cosLam;
    sig = Math.atan2(sinSig, cosSig);
    const sinAlpha = (Math.cos(U1) * Math.cos(U2) * sinLam) / sinSig;
    cos2a = 1 - sinAlpha * sinAlpha;
    cos2sm = cos2a ? cosSig - (2 * Math.sin(U1) * Math.sin(U2)) / cos2a : 0;
    const C = (F / 16) * cos2a * (4 + F * (4 - 3 * cos2a));
    const lamP = lam;
    lam = L + (1 - C) * F * sinAlpha * (sig + C * sinSig * (cos2sm + C * cosSig * (-1 + 2 * cos2sm * cos2sm)));
    if (Math.abs(lam - lamP) < 1e-12) break;
  }
  const u2 = (cos2a * (A * A - B * B)) / (B * B);
  const Ka = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const Kb = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dSig = Kb * sinSig * (cos2sm + (Kb / 4) * (cosSig * (-1 + 2 * cos2sm * cos2sm) - (Kb / 6) * cos2sm * (-3 + 4 * sinSig * sinSig) * (-3 + 4 * cos2sm * cos2sm)));
  return B * Ka * (sig - dSig);
}

export function projectionReport({ roads, buildings, storefronts, stations, bounds }) {
  // float32 round-off of the 0.01 m quantised coordinates
  let f32 = 0;
  const upd = (v) => {
    const e = Math.abs(Math.fround(v) - v);
    if (e > f32) f32 = e;
  };
  for (const r of roads) for (const p of r.points) { upd(p[0]); upd(p[1]); }
  for (const b of buildings) for (const p of b.footprint) { upd(p[0]); upd(p[1]); }
  for (const s of storefronts) for (const p of s.facade) { upd(p[0]); upd(p[1]); }
  // projection error: pairs among sampled points (stations + a deterministic lattice over the extent)
  const pts = stations.map((s) => [s.lat, s.lon]);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 60; i++) {
    const x = bounds.minX + rnd() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rnd() * (bounds.maxZ - bounds.minZ);
    pts.push(G.unproject(x, z));
  }
  pts.push([G.WORLD_ORIGIN.lat, G.WORLD_ORIGIN.lon]);
  let maxRel = 0, maxAbs = 0, maxRel5 = 0, maxRelOrigin = 0, maxDist = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j];
      const g = vincenty(a[0], a[1], b[0], b[1]);
      if (g < 200) continue;
      const pa = G.project(a[0], a[1]);
      const pb = G.project(b[0], b[1]);
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
      const rel = Math.abs(d - g) / g;
      maxRel = Math.max(maxRel, rel);
      maxAbs = Math.max(maxAbs, Math.abs(d - g));
      maxDist = Math.max(maxDist, g);
      if (g <= 5000) maxRel5 = Math.max(maxRel5, rel);
      if (i === pts.length - 1 || j === pts.length - 1) maxRelOrigin = Math.max(maxRelOrigin, rel);
    }
  return {
    extentM: { x: [bounds.minX, bounds.maxX], z: [bounds.minZ, bounds.maxZ], maxAbsCoordM: Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minZ), Math.abs(bounds.maxZ)) },
    float32MaxErrM: f32,
    samplePairs: (pts.length * (pts.length - 1)) / 2,
    maxPairDistM: Math.round(maxDist),
    maxRelErrPct: maxRel * 100,
    maxRelErrPctWithin5km: maxRel5 * 100,
    maxRelErrPctFromOrigin: maxRelOrigin * 100,
    maxAbsErrM: maxAbs,
  };
}
