// Offline source geometry audit. No browser driving is claimed.
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "../game/node_modules/esbuild/lib/main.js";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await build({ stdin: { contents: `export{buildTile}from'./game/src/world/city';export{prepareRoadGrades,roadGradePatches,applyRoadGradePatches}from'./game/src/world/road-grades';export{initTemplates}from'./game/src/core/util';export{BoxGeometry,RingGeometry}from'./game/node_modules/three/build/three.module.js';`, resolveDir: root, loader: "ts" }, outfile: "/tmp/roadster-bridge-deck-production.mjs", bundle: true, platform: "node", format: "esm", logLevel: "error" });
const { buildTile, prepareRoadGrades, roadGradePatches, applyRoadGradePatches, initTemplates, BoxGeometry, RingGeometry } = await import(pathToFileURL("/tmp/roadster-bridge-deck-production.mjs"));
initTemplates({ rbox: new BoxGeometry(1, 1, 1), ring: new RingGeometry(1, 1.35, 12) });
const c = JSON.parse(gunzipSync(await readFile(join(root, "game/public/city/core.pack.wasm"))));
const model = prepareRoadGrades(c.roads), patches = roadGradePatches(model), packCache = /* @__PURE__ */ new Map(), all = [];
let counts = { tiles: 0, walls: 0, roadSurfaces: 0, tests: 0 };
function triangleHit(q, x, z) {
  const [a, b, d] = q, bx = b[0] - a[0], bz = b[2] - a[2], dx = d[0] - a[0], dz = d[2] - a[2], det = bx * dz - bz * dx;
  if (Math.abs(det) < 1e-10) return null;
  const px = x - a[0], pz = z - a[2], u = (px * dz - pz * dx) / det, v = (bx * pz - bz * px) / det;
  return u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8 ? a[1] + u * (b[1] - a[1]) + v * (d[1] - a[1]) : null;
}
function inset(q) {
  if (q[2][0] === q[3][0] && q[2][2] === q[3][2]) {
    const c2 = q.slice(0, 3).reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[2] / 3], [0, 0]), r = q.slice(0, 3).map((p) => {
      const dx = c2[0] - p[0], dz = c2[1] - p[2], L = Math.hypot(dx, dz) || 1;
      return [p[0] + dx / L * 0.35, p[1], p[2] + dz / L * 0.35];
    });
    return [r[0], r[1], r[2], r[2]];
  }
  return q.map((p, i) => {
    const opposite = q[[3, 2, 1, 0][i]], dx = opposite[0] - p[0], dz = opposite[2] - p[2], L = Math.hypot(dx, dz);
    return [p[0] + dx / L * 0.35, p[1], p[2] + dz / L * 0.35];
  });
}
const deckPairs = /* @__PURE__ */ new Map();
function intersect(poly, tri) {
  let area = 0;
  for (let i = 0; i < 3; i++) {
    const a = tri[i], b = tri[(i + 1) % 3];
    area += a[0] * b[2] - b[0] * a[2];
  }
  const sign = Math.sign(area);
  for (let i = 0; i < 3 && poly.length; i++) {
    const a = tri[i], b = tri[(i + 1) % 3], cross = (p) => sign * ((b[0] - a[0]) * (p[1] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])), out2 = [];
    for (let j = 0; j < poly.length; j++) {
      const p = poly[j], q = poly[(j + 1) % poly.length], d = cross(p), e = cross(q);
      if (d >= -1e-8) out2.push(p);
      if (d >= 0 !== e >= 0) {
        const t = d / (d - e);
        out2.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    poly = out2;
  }
  return poly;
}
const only = !process.argv.includes("--full");
for (const pack of c.packs) {
  if (only && !pack.tiles.some(([i, j]) => i >= -19 && i <= -11 && j >= -8 && j <= -1)) continue;
  const data = JSON.parse(gunzipSync(await readFile(join(root, "game/public/city", pack.file))));
  for (const [key, raw] of Object.entries(data.tiles)) {
    if (only && !(raw.i >= -19 && raw.i <= -11 && raw.j >= -8 && raw.j <= -1)) continue;
    const roads = applyRoadGradePatches(raw.roads, patches);
    if (!roads.some((e) => e.elev?.some((y) => y > 1.2))) continue;
    const built = buildTile({ ...raw, roads, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
    counts.tiles++;
    const surfaces = [...new Set([...built.surfaceGrid.values()].flat())].filter((s) => s.roadQuad && s.e), walls = [...new Set([...built.walls.values()].flat())].filter((w) => w.kind === "parapet");
    counts.walls += walls.length;
    counts.roadSurfaces += surfaces.length;
    const grid = /* @__PURE__ */ new Map();
    for (const s of surfaces) {
      const q = inset(s.roadQuad), xs = q.map((p) => p[0]), zs = q.map((p) => p[2]);
      for (let i = Math.floor(Math.min(...xs) / 15); i <= Math.floor(Math.max(...xs) / 15); i++) for (let j = Math.floor(Math.min(...zs) / 15); j <= Math.floor(Math.max(...zs) / 15); j++) {
        const k = `${i},${j}`;
        (grid.get(k) || grid.set(k, []).get(k)).push({ s, q });
      }
    }
    for (const upper of surfaces) {
      if (!upper.e.elev || Math.max(upper.ya, upper.yb) < 1.2) continue;
      const U = upper.roadQuad, near = /* @__PURE__ */ new Set();
      for (let x = Math.floor(Math.min(...U.map((p) => p[0])) / 15); x <= Math.floor(Math.max(...U.map((p) => p[0])) / 15); x++) for (let z = Math.floor(Math.min(...U.map((p) => p[2])) / 15); z <= Math.floor(Math.max(...U.map((p) => p[2])) / 15); z++) for (const entry of grid.get(`${x},${z}`) || []) near.add(entry.s);
      for (const lower of near) {
        if (lower.e.id === upper.e.id) continue;
        const id = upper.e.id + ":" + lower.e.id;
        for (const ui of [[0, 1, 2], [0, 2, 3]]) for (const li of [[0, 1, 2], [0, 2, 3]]) {
          const ut = ui.map((i) => U[i]), lt = li.map((i) => lower.roadQuad[i]), P = intersect(ut.map((p2) => [p2[0], p2[2]]), lt);
          if (P.length < 3) continue;
          let area = 0;
          for (let i = 0; i < P.length; i++) {
            const a = P[i], b = P[(i + 1) % P.length];
            area += a[0] * b[1] - b[0] * a[1];
          }
          if (Math.abs(area) < 0.02) continue;
          const x = P.reduce((s, p2) => s + p2[0], 0) / P.length, z = P.reduce((s, p2) => s + p2[1], 0) / P.length, uy = triangleHit(ut, x, z), ly = triangleHit(lt, x, z), gap = uy - ly;
          if (gap <= 1.02 || gap >= 5.69) continue;
          const p = deckPairs.get(id) || { upper: upper.e.id, un: upper.e.name, lower: lower.e.id, ln: lower.e.name, minGap: Infinity, maxGap: -Infinity, x, z, tile: key };
          p.minGap = Math.min(p.minGap, gap);
          p.maxGap = Math.max(p.maxGap, gap);
          deckPairs.set(id, p);
        }
      }
    }
    for (const w of walls) {
      const L = Math.hypot(w.bx - w.ax, w.bz - w.az), n = Math.max(1, Math.ceil(L / 0.4)), hits = /* @__PURE__ */ new Map();
      for (let j = 0; j <= n; j++) {
        const u = j / n, x = w.ax + (w.bx - w.ax) * u, z = w.az + (w.bz - w.az) * u, bottom = w.y0a + (w.y0b - w.y0a) * u, top = w.y1a + (w.y1b - w.y1a) * u;
        for (const { s, q } of grid.get(`${Math.floor(x / 15)},${Math.floor(z / 15)}`) || []) {
          counts.tests++;
          const y = triangleHit([q[0], q[1], q[2]], x, z) ?? triangleHit([q[0], q[2], q[3]], x, z);
          if (y !== null && top > y + 0.12 && bottom < y + 4.8 && y > -0.1) {
            const id = s.e.id;
            if (!hits.has(id)) hits.set(id, { road: id, name: s.e.name, x, z, y, bottom, top, wall: [w.ax, w.az, w.bx, w.bz], roadElev: s.e.elev ? [Math.min(...s.e.elev), Math.max(...s.e.elev)] : null });
          }
        }
      }
      for (const h of hits.values()) all.push({ tile: key, pack: pack.file, ...h });
    }
  }
  if (process.argv.includes("--progress")) console.log(JSON.stringify({ pack: pack.file, ...counts, conflicts: all.length }));
}
const out = { scope: "Independent finite rendered-road interior versus actual parapet collider panels; slab intersections are conservative potential overlaps for review, not all confirmed blocked routes.", counts, conflicts: all, potentialSlabOverlaps: [...deckPairs.values()] };
const reportAt = process.argv.indexOf("--report");
if (reportAt >= 0) await writeFile(process.argv[reportAt + 1], JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ ...counts, conflicts: all.length, deckPairs: deckPairs.size, first: all.slice(0, 5), decks: [...deckPairs.values()].slice(0, 10) }));
