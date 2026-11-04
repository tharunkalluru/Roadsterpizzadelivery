import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { initTemplates, rng } from '../../../../src/core/util';
import { RoadGraph } from '../../../../src/game/roadgraph';
import { Traffic } from '../../../../src/game/traffic';
import { busLane, busTurn } from '../../../../src/game/bus-path';
import * as M from '../../../../src/world/traffic_models';
const model = JSON.parse(readFileSync('/tmp/reported-flyover-model-current.json', 'utf8')), graph = new RoadGraph(model.roads);
const gradient = { addColorStop() {} }, context = new Proxy({ measureText: (s: string) => ({ width: s.length * 12 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, { get: (o: any, k) => k in o ? o[k] : () => {} });
(globalThis as any).document = { createElement: () => ({ width: 256, height: 128, getContext: () => context }) }; initTemplates({ rbox: new THREE.BoxGeometry(1, 1, 1) });
function bounds(m: M.Model) {
  const result = new THREE.Box3();
  for (const batch of [m.body, m.lights, m.tailLights, m.reverseLights]) if (batch) for (let i = 0; i < batch.pos.length; i += 3) result.expandByPoint(new THREE.Vector3(Math.fround(batch.pos[i]), Math.fround(batch.pos[i + 1]), Math.fround(batch.pos[i + 2])));
  for (const d of m.decals ?? []) { const a = d.geo.getAttribute('position'); for (let i = 0; i < a.count; i++) result.expandByPoint(new THREE.Vector3().fromBufferAttribute(a, i)); }
  return { min: result.min.toArray(), max: result.max.toArray(), collisionSize: m.size };
}
const bus = M.bus(rng(1)), busBody = bounds(bus), cars = (['hatch', 'sedan', 'suv', 'cab'] as const).map(kind => ({ kind, model: M.car(kind, '#eeeeee', rng(13)) }));
const rows: any[] = [];
for (const id of ['23427c8c-e37_0', 'bdf0bad3-182_0', 'ad6f78f1-dc9_0', '7f6aaa08-ec2_0', '38a7824d-0e1_0', '38a7824d-0e1_1', '37e421d1-548_1', '37e421d1-548_0']) {
  const edge = graph.byId.get(id)!; if (!edge) continue; const lane = busLane(edge), half = edge.e.w / 2;
  for (const c of cars) {
    const body = bounds(c.model), receiver = { r: () => .999999, laneRange: Traffic.prototype.laneRange };
    const carLane = Traffic.prototype.pickLane.call(receiver as any, edge, c.model.size[0], 'car');
    const busRange = [lane - busBody.max[0], lane - busBody.min[0]], carRange = [carLane - body.max[0], carLane - body.min[0]];
    rows.push({ id, width: edge.e.w, joinedPavement: !!edge.e.joinedPavement, busLane: lane, car: c.kind, carLane, busRange, carRange, lateralGap: busRange[0] - carRange[1], busShoulderMargin: Math.min(half - busRange[1], busRange[0] + half), carShoulderMargin: Math.min(half - carRange[1], carRange[0] + half), actualBusBody: busBody, actualCarBody: body });
  }
}
const turns: any[] = [];
for (const [from, fd, to, td] of [
  ['38a7824d-0e1_0', 1, '38a7824d-0e1_1', 1],
  ['37e421d1-548_1', -1, '37e421d1-548_0', -1],
  ['23427c8c-e37_0', -1, 'ad6f78f1-dc9_0', 1],
  ['bdf0bad3-182_0', -1, '38a7824d-0e1_0', 1],
] as [string, 1 | -1, string, 1 | -1][]) {
  const a = graph.byId.get(from)!, b = graph.byId.get(to)!, turn = busTurn(graph, a, fd, b, td);
  turns.push({ from, fd, to, td, sourceNodeConnected: (fd === 1 ? a.e.to : a.e.from) === (td === 1 ? b.e.from : b.e.to), generated: !!turn, radius: turn?.curve.minRadius, length: turn?.curve.length });
}
const result = { scope: 'Actual emitted prototype body bounds at production busLane and opposite production Traffic.pickLane; lane separation is local transverse geometry. Endpoint curves report planner feasibility only, not swept body clearance.', rows, turns };
writeFileSync('docs/qa/evidence/main-expansion/reported-road-final-independent-lanes.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
