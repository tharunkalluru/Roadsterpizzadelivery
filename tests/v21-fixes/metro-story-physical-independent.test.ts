import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { initTemplates } from '../../src/core/util';
import { buildTile, type CityData } from '../../src/world/city';
import type { CoreData } from '../../src/world/types';
import { metroCorridors, metroPlatformAssemblies, projectMetroPath, sampleMetroPath } from '../../src/world/metro-geometry';
import { prepareRoadGrades, currentRoadGradePatches, applyRoadGradePatches } from '../../src/world/road-grades';
import { clearCameraPosition } from '../../src/game/spatial-safety';
import { roadster } from '../../src/world/vehicles';
import { MetroRide } from '../../src/delivery/modules/metro-ride';
import { stepStoryPose } from '../../src/delivery/systems/story-director';
import { deliveryStoryPoseClear } from '../../src/delivery/runtime';
import type { DeliveryModuleContext, DeliveryPlayer } from '../../src/delivery/modules/types';
import type { MovingRailBody } from '../../src/game/moving-rail';
import type { MetroStationDwell } from '../../src/game/metro';

/** Independent physical review of the camera-selected bay. Source-camera rays
 * can all pass while the actual car skin penetrates an upper interchange lift. */
const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
const assembly = metroPlatformAssemblies(core.metro.stations, metroCorridors(core.metro.lines), core.metro.deckHeight)
  .find(a => a.key === 'st_ameerpet:blue')!;
initTemplates();
const i = Math.floor(assembly.source.p[0] / 1000), j = Math.floor(assembly.source.p[1] / 1000);
const pack = core.packs.find(p => p.tiles.some(([x, z]) => x === i && z === j))!;
const zone = JSON.parse(gunzipSync(readFileSync(`public/city/${pack.file}`)).toString()).tiles[`${i}_${j}`];
const patches = currentRoadGradePatches(prepareRoadGrades(core.roads));
const tile = buildTile({ ...zone, roads: applyRoadGradePatches(zone.roads, patches) }, { lowQ: true, metro: core.metro });
const city = { ...tile, movingRail: [], byBuilding: new Map() } as unknown as CityData;
// These exact retained boxes are rendered as 2.5m shafts by drawStationLift.
// Floors and open staircase envelopes are deliberately excluded.
const shafts = tile.structureSupports!.filter(s => s.part === 'station_stairs' && s.bottom === 0 &&
  'hw' in s.footprint && s.footprint.hw === 1.35 && s.footprint.hl === 1.35);

function fixture() {
  let queryCount = 0;
  const track = assembly.corridor.tracks.find(t => t.dir === -1)!;
  const stationS = projectMetroPath(track.path, [assembly.frame.cx, assembly.frame.cz]).s;
  const at = (coach: number, offset: number) => {
    const q = sampleMetroPath(track.path, stationS - coach - offset, 8), side = 1;
    return { q, door: { x: q.x - q.hz * side * 1.5, y: assembly.deckHeight + 1.2,
      z: q.z + q.hx * side * 1.5, hx: q.hx, hz: q.hz } };
  };
  const original = at(22.1, 0), y = original.door.y;
  const body: MovingRailBody = { id: 'metro:independent:1:2', ...original.q,
    hx: -original.q.hx, hz: -original.q.hz, y, bottom: y, roof: y + 3.45,
    halfLength: 11.05, halfWidth: 1.5, previous: { ...original.q, y } };
  const player: DeliveryPlayer = { x: body.x, y: body.roof + .55, z: body.z,
    yaw: Math.atan2(-body.hx, -body.hz), speed: 0, flying: false, descending: false, jumping: false,
    railSupportId: body.id, verticalSpeed: 0 };
  const stop: MetroStationDwell = { trainId: 'metro:independent:1', stationId: assembly.stationId,
    lineId: assembly.lineId, direction: -1, platformSide: 1, elapsed: 1, remaining: 17,
    doors: [-22.1, 0, 22.1].flatMap(coach => [-6.5, 0, 6.5].map(offset => at(coach, offset).door)), platform: assembly };
  const ctx: DeliveryModuleContext = { scene: new THREE.Scene(), destination: original.door,
    player: () => player, canInteract: () => true, automaticStories: true, storyActive: () => true,
    metroService: () => ({ bodies: [body], dwells: [stop] }), emit() {},
    storyPoseClear: pose => { queryCount++; return deliveryStoryPoseClear(city, pose); },
    cameraPathClear: (from, to) => {
      queryCount++;
      const clear = clearCameraPosition(city, from, to);
      return Math.hypot(clear.x - to.x, clear.y - to.y, clear.z - to.z) < .01;
    } };
  const module = new MetroRide(); module.setup(ctx, { immersiveHandoff: true });
  // This fixture isolates real station geometry, not likeness/release approval.
  ctx.scene.getObjectByName('vakeel-platform-group')!.children.forEach(a => a.userData.characterRelease = 'physical-review-fixture');
  // Isolate the physically landed arrival at this actual station. Separate
  // manual-contact tests own the preceding ride; do not invent new geometry.
  Object.assign(module, { phase: 'riding', boarded: 'metro:independent:1', referenceCoach: body.id,
    departed: true, startStation: 'independent-upstream', travelled: 100 });
  const stepQueries: number[] = [], stepTimes: number[] = [];
  const prepareStep = (step: () => void) => {
    const before = queryCount, start = performance.now(); step();
    stepTimes.push(performance.now() - start); stepQueries.push(queryCount - before);
  };
  prepareStep(() => (module as any).beginExit(stop, body));
  // Allow bounded staged planning; the player remains on the real roof.
  for (let frame = 0; frame < 240 && (module as any).phase === 'riding'; frame++) prepareStep(() => module.update(.05));
  assert.equal((module as any).phase, 'exiting', 'a real supported, physically clear door must be selectable here');
  const material = new THREE.MeshBasicMaterial();
  const model = roadster(new Proxy({}, { get: () => material }), { logo: material, plate: material });
  const skin = model.group.getObjectByName('Faceted body with open wheel arches') as THREE.Mesh;
  const position = skin.geometry.getAttribute('position'), point = new THREE.Vector3();
  const intersections = () => {
    model.group.position.set(player.x, player.y, player.z); model.group.rotation.y = player.yaw;
    model.group.updateMatrixWorld(true);
    const hits: { source: string; point: number[] }[] = [];
    for (let v = 0; v < position.count; v++) {
      point.set(position.getX(v), position.getY(v), position.getZ(v)).applyMatrix4(skin.matrixWorld);
      for (const shaft of shafts) {
        const fp = shaft.footprint; if (!('hw' in fp)) continue;
        const dx = point.x - fp.x, dz = point.z - fp.z;
        // Strict drawn-box interior: no padded collider or floor-contact false positive.
        if (Math.abs(dx * fp.hx + dz * fp.hz) < 1.25 - 1e-5 &&
          Math.abs(dx * fp.hz - dz * fp.hx) < 1.25 - 1e-5 && point.y > shaft.bottom + 1e-5 && point.y < shaft.top - .1)
          hits.push({ source: shaft.source, point: point.toArray() });
      }
    }
    return hits;
  };
  const dispose = () => {
    module.teardown(); model.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); material.dispose();
  };
  return { module, player, stop, body, intersections, dispose, stepQueries, stepTimes, get queryCount() { return queryCount; } };
}

test('the real camera-selected Ameerpet bay cannot place actual Roadster body vertices inside an existing interchange lift', () => {
  const f = fixture();
  try {
    const actualDoor = (f.module as any).door;
    assert.ok(f.stop.doors.some(d => Math.hypot(d.x - actualDoor.x, d.z - actualDoor.z) < 1e-6), 'retain a real train door');
    Object.assign(f.player, f.module.target, { y: f.module.target.y + .55, yaw: Math.atan2(-actualDoor.hx, -actualDoor.hz) });
    const hits = f.intersections();
    assert.equal(hits.length, 0, `actual held body intersects retained station shaft: ${JSON.stringify(hits.slice(0, 4))}`);
  } finally { f.dispose(); }
});

test('the automatic real-roof-to-bay movement clears existing interchange shafts throughout its actual StoryDirector poses', () => {
  const f = fixture();
  try {
    let settled = false;
    for (let frame = 0; frame < 360; frame++) {
      f.module.update(.05); const story = f.module.story; assert.ok(story?.entry);
      const pose = stepStoryPose(f.player, story, .05)!; Object.assign(f.player, pose);
      const hits = f.intersections();
      assert.equal(hits.length, 0, `automatic entry body intersects retained shaft at frame ${frame}: ${JSON.stringify(hits.slice(0, 4))}`);
      if (Math.hypot(f.player.x - story.point.x, f.player.y - story.point.y, f.player.z - story.point.z) < .01) { settled = true; break; }
    }
    assert.equal(settled, true, 'clear routing must still finish at the supported real bay');
  } finally { f.dispose(); }
});

test('real Ameerpet placement preparation bounds each update and keeps the chosen physical route cached during held frames', t => {
  const f = fixture();
  try {
    assert.ok(f.stepQueries.every(n => n <= 4), 'one update must never drain the entire cold geometry search');
    assert.ok(f.queryCount > 10 && f.queryCount < 4000, 'exercise a finite real obstruction search, not a stub or unbounded retry');
    const before = f.queryCount;
    for (let frame = 0; frame < 120; frame++) { f.module.update(.05); void f.module.cameraFocus; }
    assert.equal(f.queryCount, before, 'chosen door, physical route and camera checks do not repeat on animation/held frames');
    t.diagnostic(JSON.stringify({ geometryQueries: before, preparationUpdates: f.stepQueries.length,
      maximumQueriesPerUpdate: Math.max(...f.stepQueries), measuredMaximumUpdateMs: Math.max(...f.stepTimes),
      measuredTotalPlanningMs: f.stepTimes.reduce((a, b) => a + b, 0), limitations: 'Desktop Node timing; not phone FPS or a strict upper bound for one OS-scheduled query.' }));
  } finally { f.dispose(); }
});
