import { initTemplates } from '../../../../src/core/util';
import { buildTile } from '../../../../src/world/city';
import { RoadGraph } from '../../../../src/game/roadgraph';
import { TrafficCurve } from '../../../../src/game/traffic-path';
import { TrafficCurveRoadSupport, trafficCurveRoadWindow } from '../../../../src/game/traffic-curve-road-support';
import type { RoadEdge } from '../../../../src/world/types';

initTemplates();
const road: RoadEdge = { id: 'cpu-owned', cls: 'primary', name: null, w: 9.6, lanes: 3, oneway: null, from: 'a', to: 'b',
  pts: [[100, 100], [120, 100], [140, 100], [160, 100]], elev: [0, 1, 1.6, 1.8], maxspeed: 40 };
const built = buildTile({ i: 0, j: 0, roads: [road], nodes: {}, buildings: [], boards: [], furniture: [], areas: [], osm: [] }, { lowQ: true });
const graph = new RoadGraph([road]), edge = graph.byId.get(road.id)!;
const a = graph.pointAt(edge, 4, 1, 2), b = graph.pointAt(edge, 56, 1, 2), window = trafficCurveRoadWindow(edge, 1, 4, 56);

export function sample(supported: boolean, frames = 1000) {
  const curves = Array.from({ length: 55 }, () => {
    const curve = new TrafficCurve(a, b, 52 / 3);
    if (supported) curve.setRoadSupport(new TrafficCurveRoadSupport(built.surfaceGrid, [window]));
    return curve;
  });
  let checksum = 0;
  for (let n = 0; n < 80; n++) for (const curve of curves) checksum += curve.sample(curve.length * (n % 71) / 71).y;
  const start = performance.now();
  for (let n = 0; n < frames; n++) for (const curve of curves) {
    const p = curve.sample(curve.length * (n % 997) / 997);
    checksum += p.x + p.z + p.hx + p.hz + p.y;
  }
  const elapsed = performance.now() - start;
  return { frames, curves: curves.length, queries: frames * curves.length, millisecondsPerFrame: elapsed / frames,
    microsecondsPerQuery: elapsed * 1000 / frames / curves.length, checksum };
}

export function coldSample(iterations = 500) {
  let checksum = 0;
  const start = performance.now();
  for (let n = 0; n < iterations; n++) {
    const support = new TrafficCurveRoadSupport(built.surfaceGrid, [window]);
    checksum += support.heightAt(115 + n % 30, 98, .8) ?? 0;
  }
  return { iterations, microsecondsPerColdSamplerAndLookup: (performance.now() - start) * 1000 / iterations, checksum };
}
