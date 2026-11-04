import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { drawMetroPlatformLamps, metroPlatformLampFixtures, nearestActualMetroPlatformLamp } from '../../src/world/metro-platform-lamps';
import { metroCorridors, metroPlatformAssemblies, projectMetroPath, sampleMetroPath, type MetroPlatformAssembly } from '../../src/world/metro-geometry';
import type { CoreData } from '../../src/world/types';

const core = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString()) as CoreData;
const assemblies = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight);
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
function doorAt(assembly: MetroPlatformAssembly, u: number, side: number) {
  const path = assembly.corridor.center, s = projectMetroPath(path, [assembly.frame.cx, assembly.frame.cz]).s;
  const p = sampleMetroPath(path, s + u), outward = { x: -p.hz * side, z: p.hx * side };
  return { door: { x: p.x + outward.x * 3.45, z: p.z + outward.z * 3.45 }, outward };
}

test('actual station fixtures follow both source platform rows, including a curved Hyderabad station', () => {
  assert.ok(assemblies.length > 50); let maximumCurveDeviation = 0;
  for (const assembly of assemblies) {
    const lamps = metroPlatformLampFixtures(assembly); assert.equal(lamps.length, 26, assembly.key);
    assert.equal(metroPlatformLampFixtures(assembly), lamps, 'immutable station fixtures are not rebuilt in gameplay');
    const path = assembly.corridor.center, { cx, cz, hx, hz } = assembly.frame, s = projectMetroPath(path, [cx, cz]).s;
    for (const lamp of lamps) {
      const p = sampleMetroPath(path, s + lamp.u);
      close(lamp.position.x, p.x - p.hz * lamp.side * 6.9); close(lamp.position.z, p.z + p.hx * lamp.side * 6.9);
      close(lamp.position.y, assembly.deckHeight + 4.2); close(lamp.hx, p.hx); close(lamp.hz, p.hz);
      maximumCurveDeviation = Math.max(maximumCurveDeviation, Math.hypot(p.x - cx - hx * lamp.u, p.z - cz - hz * lamp.u));
    }
  }
  assert.ok(maximumCurveDeviation > 1, 'the real source contains curvature that a straight guessed fixture row would miss');
});

test('nearest fixture stays on the outward platform, rejects invalid doors and is the actually rendered diffuser', () => {
  const assembly = assemblies.find(a => a.stationId === 'st_begumpet')!; assert.ok(assembly);
  const emitted: { x: number; y: number; z: number; yaw: number }[] = [];
  drawMetroPlatformLamps(assembly, { st: { box() {} }, lit: { box(x, y, z, _w, _h, _d, _color, options) { emitted.push({ x, y, z, yaw: options?.ry ?? 0 }); } } });
  assert.equal(emitted.length, 26);
  for (const side of [-1, 1]) for (const u of [-28, -4, 24]) {
    const { door, outward } = doorAt(assembly, u, side), lamp = nearestActualMetroPlatformLamp(assembly, door, outward); assert.ok(lamp);
    assert.equal(lamp.side, side);
    assert.ok(emitted.some(p => p.x === lamp.position.x && p.y === lamp.position.y && p.z === lamp.position.z && p.yaw === Math.atan2(lamp.hx, lamp.hz)), 'pooled light anchor must be an emitted physical diffuser');
    const actor = { x: door.x + outward.x * 2.8, z: door.z + outward.z * 2.8 };
    const distances = metroPlatformLampFixtures(assembly).filter(p => p.side === side).map(p => Math.hypot(p.position.x - actor.x, p.position.z - actor.z));
    close(Math.hypot(lamp.position.x - actor.x, lamp.position.z - actor.z), Math.min(...distances));
  }
  const { door, outward } = doorAt(assembly, 0, 1);
  assert.equal(nearestActualMetroPlatformLamp(assembly, { ...door, x: NaN }, outward), null);
  assert.equal(nearestActualMetroPlatformLamp(assembly, door, { x: 0, z: 0 }), null);
  assert.equal(nearestActualMetroPlatformLamp(assembly, door, { x: -outward.z, z: outward.x }), null);
  assert.equal(nearestActualMetroPlatformLamp(assembly, doorAt(assembly, 100, 1).door, outward), null);
});

test('every hanger reaches the underside of the existing transformed roof slat with clear three-metre platform headroom', () => {
  let checked = 0;
  for (const assembly of assemblies) {
    const { cx, cz, hx, hz } = assembly.frame, yaw = Math.atan2(hx, hz);
    const roofs = Array.from({ length: 7 }, (_, k) => {
      const a0 = -1 + 2 * k / 7, a1 = -1 + 2 * (k + 1) / 7, v0 = a0 * 13, v1 = a1 * 13;
      const h0 = assembly.deckHeight + 9.2 - 2.4 * a0 * a0, h1 = assembly.deckHeight + 9.2 - 2.4 * a1 * a1;
      const v = (v0 + v1) / 2, width = Math.hypot(v1 - v0, h1 - h0) + .05;
      // Independent Three transform matches the actual City B.st.box (YXZ).
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(cx - hz * v, (h0 + h1) / 2, cz + hx * v),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -Math.atan2(h1 - h0, v1 - v0), 'YXZ')), new THREE.Vector3(1, 1, 1));
      return { inverse: matrix.invert(), width };
    });
    for (const lamp of metroPlatformLampFixtures(assembly)) for (const rod of lamp.rods) {
      assert.ok(rod.bottom > assembly.deckHeight + 4.2); assert.ok(rod.top > rod.bottom);
      assert.ok(roofs.some(roof => {
        const p = new THREE.Vector3(rod.x, rod.top, rod.z).applyMatrix4(roof.inverse);
        return Math.abs(p.y + .15) < 1e-7 && Math.abs(p.x) <= roof.width / 2 + 1e-7 && Math.abs(p.z) <= 67 + 1e-7;
      }), `${lamp.id}: unsupported roof hanger`);
      checked++;
    }
  }
  assert.ok(checked > 3000, 'inspect both mounts on every real source fixture');
});
