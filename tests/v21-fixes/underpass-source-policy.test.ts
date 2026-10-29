import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {prepareRoadGrades} from '../../src/world/road-grades';
import {prepareRoadUnderpasses} from '../../src/world/road-underpasses';
import {prepareRailwayTransport} from '../../src/world/railway-geometry';
import {RAILWAY_UNDERPASS_EVIDENCE, RAILWAY_RESEARCH_SOURCES, railwayUnderpassAt} from '../../src/world/railway-evidence';
import type {RoadEdge, XZ} from '../../src/world/types';
import type {RailProfile} from '../../src/world/railway-geometry';

test('every shipped road crossing below a railway requires exact local source evidence, including yard strands', t => {
  const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const roads = prepareRoadUnderpasses(prepareRoadGrades(core.roads)).roads;
  const model = prepareRailwayTransport(roads, {underpasses: RAILWAY_UNDERPASS_EVIDENCE});
  type Segment = {rail: RailProfile; j: number; a: XZ; b: XZ};
  const grid = new Map<string, Segment[]>(), cell = 100;
  for (const rail of model.railway.profiles) for (let j = 1; j < rail.pts.length; j++) {
    const a = rail.pts[j - 1], b = rail.pts[j], span = {rail, j, a, b};
    for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++)
      for (let z = Math.floor(Math.min(a[1], b[1]) / cell); z <= Math.floor(Math.max(a[1], b[1]) / cell); z++) {
        const key = `${x},${z}`, list = grid.get(key) || []; list.push(span); grid.set(key, list);
      }
  }
  const seen = new Set<string>(), unauthorized: {road: string; rail: string; x: number; z: number; y: number}[] = [];
  let below = 0, yard = 0, unverifiedAtGrade = 0;
  for (const e of model.roads as RoadEdge[]) {
    if (/^(footway|path|steps|pedestrian|cycleway|bridleway)$/.test(e.cls)) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], near = new Set<Segment>();
      for (let x = Math.floor(Math.min(a[0], b[0]) / cell); x <= Math.floor(Math.max(a[0], b[0]) / cell); x++)
        for (let z = Math.floor(Math.min(a[1], b[1]) / cell); z <= Math.floor(Math.max(a[1], b[1]) / cell); z++)
          for (const span of grid.get(`${x},${z}`) || []) near.add(span);
      for (const q of near) {
        const ex = q.b[0] - q.a[0], ez = q.b[1] - q.a[1], determinant = dx * ez - dz * ex;
        if (Math.abs(determinant) < 1e-7) continue;
        const u = ((q.a[0] - a[0]) * ez - (q.a[1] - a[1]) * ex) / determinant;
        const v = ((q.a[0] - a[0]) * dz - (q.a[1] - a[1]) * dx) / determinant;
        if (u < -1e-6 || u > 1.000001 || v < -1e-6 || v > 1.000001) continue;
        const x = a[0] + dx * u, z = a[1] + dz * u, key = `${e.id}/${q.rail.id}/${x.toFixed(2)}/${z.toFixed(2)}`;
        if (seen.has(key)) continue; seen.add(key);
        const y = (e.elev?.[i - 1] || 0) + ((e.elev?.[i] || 0) - (e.elev?.[i - 1] || 0)) * u;
        const evidence = railwayUnderpassAt(RAILWAY_UNDERPASS_EVIDENCE, e.id, q.rail.id, x, z);
        if (q.rail.service) yard++;
        if (y < -.55) { below++; if (!evidence) unauthorized.push({road: e.id, rail: q.rail.id, x, z, y}); }
        if (!evidence && Math.abs(y) <= .55) unverifiedAtGrade++;
      }
    }
  }
  assert.ok(seen.size > 300, 'audit the city network, not only hand-picked examples');
  assert.ok(below > 30 && yard > 20 && unverifiedAtGrade > 100, 'exercise genuine underpasses, yard tracks and ordinary level crossings');
  assert.deepEqual(unauthorized, [], 'neither an approach spread nor a bridge/name hint may silently invent an underpass elsewhere');
  assert.ok(model.report.underpassRoadIds.every(id => RAILWAY_UNDERPASS_EVIDENCE.some(site => site.roads.includes(id))));
  t.diagnostic(JSON.stringify({intersections: seen.size, below, yard, unverifiedAtGrade}));
});

test('the verified short road tunnel cannot authorize its neighboring railway bridge or a distant crossing', () => {
  const site = RAILWAY_UNDERPASS_EVIDENCE.find(s => s.source === 'osm-tunnel-1188612305');
  assert.ok(site);
  assert.equal(RAILWAY_RESEARCH_SOURCES['osm-tunnel-1188612305'], 'https://api.openstreetmap.org/api/0.6/way/1188612305/full');
  assert.equal(railwayUnderpassAt([site], '16e6f5fa-4ea_0', 'w818582231', 1722.2, -3180.4), site);
  assert.equal(railwayUnderpassAt([site], '16e6f5fa-4ea_0', 'w28094784', 1722.2, -3180.4), undefined);
  assert.equal(railwayUnderpassAt([site], '16e6f5fa-4ea_0', 'w818582231', 1722, -3141), undefined);
  const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const road = core.roads.find((e: RoadEdge) => e.id === '16e6f5fa-4ea_0') as RoadEdge;
  assert.ok(road);
  for (const p of [[1717.8, -3181.1], [1726.7, -3179.7]]) assert.ok(road.pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < .1), 'retain the exact segment matched to the source tunnel');
});
