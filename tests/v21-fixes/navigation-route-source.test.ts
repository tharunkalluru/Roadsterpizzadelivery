import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../../src/game/game';
import { flightNavigationReadout } from '../../src/ui/flight-navigation';
import type { RoutePoint } from '../../src/game/route-guidance';

function fixture() {
  return Object.assign(Object.create(Game.prototype), {
    player: { pos: new THREE.Vector3(0, .55, 0), yaw: 0, flying: false, descending: false, jumping: false },
    // An unverified graph join must never overrule the actual local ribbon.
    route: { pts: [[0, 0, 0], [0, 0, -13], [-100, 0, -13]], len: 200 },
    routeGuide: [[0, 0, 0], [0, 0, -200]] as RoutePoint[], routeGuidanceBlocked: false,
    story: { localNavigation: undefined },
  }) as any;
}

test('actual Game road cue and rotating minimap share the checked straight ribbon', () => {
  const game = fixture();
  assert.equal(game.navigationRoadPoints(), game.routeGuide);
  const cue = game.roadNavigation({ x: -100, z: -13 });
  assert.equal(cue.hint, 'Continue straight'); assert.equal(cue.bearing, 0);
  const readout = flightNavigationReadout({ x: 0, z: 0, yaw: 0, flying: false,
    target: { x: -100, z: -13, kind: 'customer' }, road: cue });
  assert.equal(readout!.hint, 'Continue straight'); assert.equal(readout!.bearing, 0);
});

test('blocked geometry never creates an instruction beyond the safe road ribbon', () => {
  const game = fixture(); game.routeGuidanceBlocked = true;
  assert.equal(game.roadNavigation({ x: -100, z: -13 }).hint, 'Follow the map marker');
});

test('real turns remain directional, while final scene cues and flight overview keep their own roles', () => {
  const game = fixture(); game.routeGuide = [[0, 0, 0], [0, 0, -100], [100, 0, -100]];
  assert.equal(game.roadNavigation({ x: 100, z: -100 }).hint, 'Turn right');
  const scene = { metres: 7, bearing: -.3, hint: 'Approach ramp' };
  game.story.localNavigation = scene; assert.equal(game.roadNavigation({ x: 100, z: -100 }), scene);
  for (const mode of ['flying', 'descending', 'jumping']) {
    game.player[mode] = true; assert.equal(game.navigationRoadPoints(), game.route.pts);
    game.player[mode] = false;
  }
});

test('production minimap draws the same straight points used by the central cue', () => {
  const game = fixture(), strokes: number[][][] = [];
  let path: number[][] = [];
  const context: any = {
    save() {}, restore() {}, clearRect() {}, translate() {}, rotate() {}, scale() {}, arc() {}, clip() {}, fillRect() {}, fill() {}, closePath() {}, setLineDash() {},
    beginPath() { path = []; }, moveTo(x: number, z: number) { path.push([x, z]); }, lineTo(x: number, z: number) { path.push([x, z]); },
    stroke() { if (this.strokeStyle === '#45E3D3') strokes.push(path); },
  };
  Object.assign(game, { hud: { el: { minimap: { width: 256, getContext: () => context } } },
    graph: { nearestEdges: () => [] }, city: { railway: { profiles: [] } }, zone: { metro: { lines: [] } }, routeColor: '#45E3D3' });
  const originalPath = globalThis.Path2D;
  Object.assign(globalThis, { Path2D: class { moveTo() {} lineTo() {} } });
  try { game.drawMinimap(); } finally { Object.assign(globalThis, { Path2D: originalPath }); }
  assert.deepEqual(strokes, [[[0, 0], [0, -200]]]);
  assert.equal(game.roadNavigation({ x: -100, z: -13 }).hint, 'Continue straight');
});
