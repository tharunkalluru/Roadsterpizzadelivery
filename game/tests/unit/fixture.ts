/**
 * DEVELOPMENT FIXTURE — not Hyderabad. A labelled proving ground for physics/flight/mission
 * edge cases (MASTER §4 "Internal proving ground").
 *
 *   main road A: (0,0) → (0,-1000) → (0,-2000), two-way, 12 m wide (north = -Z)
 *   side road B: (0,-1000) → (400,-1000), two-way, 8 m
 *   one-way road C: (400,-1000) → (400,-2000) north-bound only
 *   link D: (400,-2000) → (0,-2000) two-way
 *   overpass E: (-150,-1500) → (150,-1500), level 1, elevation 6.5 m (bridge, low clearance below)
 *   metro deck along x=0 from z=-200 to z=-700 at 12.5 m with pillars at x=+4.5 (east verge)
 */
import type { WorldCore, RoadEdge, GraphNode, DirectedEdge, DeliveryLocation, Vec2 } from '../../src/world/schema';
import { WorldPhysics } from '../../src/world/collision';
import { headingOf } from '../../src/world/roadIndex';
import type { MissionDef } from '../../src/missions/types';

function road(id: string, from: string, to: string, pts: Vec2[], width: number, opts: Partial<RoadEdge> = {}): RoadEdge {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return {
    id, wayId: 0, name: id, nameId: null, highway: 'primary', oneway: false, lanes: null, widthM: width, level: 0, bridge: false, tunnel: false,
    elevationM: 0, pointElevM: pts.map(() => 0), surfaceId: `s_0_${id}`, fromNode: from, toNode: to, points: pts, lengthM: len,
    status: { geometry: 'scenario_overlay' }, provenance: { source: 'authored', sourceIds: [], note: 'test fixture' }, ...opts,
  };
}

export function makeFixtureCore(): WorldCore {
  const roads: RoadEdge[] = [
    road('A1', 'n0', 'n1', [[0, 0], [0, -1000]], 12),
    road('A2', 'n1', 'n2', [[0, -1000], [0, -2000]], 12),
    road('B', 'n1', 'n3', [[0, -1000], [400, -1000]], 8),
    road('C', 'n3', 'n4', [[400, -1000], [400, -2000]], 8, { oneway: true }),
    road('D', 'n4', 'n2', [[400, -2000], [0, -2000]], 8),
    road('E', 'n5', 'n6', [[-150, -1500], [150, -1500]], 10, { level: 1, bridge: true, elevationM: 6.5, pointElevM: [6.5, 6.5], surfaceId: 's_1_E' }),
  ];
  const nodePos: Record<string, Vec2> = { n0: [0, 0], n1: [0, -1000], n2: [0, -2000], n3: [400, -1000], n4: [400, -2000], n5: [-150, -1500], n6: [150, -1500] };
  const nodes: GraphNode[] = Object.entries(nodePos).map(([id, [x, z]]) => ({ id, osmNodeId: 0, x, z, level: id === 'n5' || id === 'n6' ? 1 : 0, edges: roads.filter((r) => r.fromNode === id || r.toNode === id).map((r) => r.id), isJunction: false }));
  const directed: DirectedEdge[] = [];
  for (const r of roads) {
    directed.push({ id: `${r.id}:f`, roadId: r.id, forward: true, fromNode: r.fromNode, toNode: r.toNode, lengthM: r.lengthM, next: [] });
    if (!r.oneway) directed.push({ id: `${r.id}:b`, roadId: r.id, forward: false, fromNode: r.toNode, toNode: r.fromNode, lengthM: r.lengthM, next: [] });
  }
  for (const d of directed) {
    const outs = directed.filter((o) => o.fromNode === d.toNode && o.roadId !== d.roadId).map((o) => o.id);
    d.next = outs.length ? outs : directed.filter((o) => o.fromNode === d.toNode).map((o) => o.id);
  }
  const deliveries: DeliveryLocation[] = [
    // west curb of A1 for north-bound travel (driver's left in left-hand traffic)
    { id: 'd_main', poiId: null, label: 'Fixture Shop North', nameId: null, roadId: 'A1', approachEdges: ['A1:f'], side: 'left', level: 0, stopPolygon: [[-6, -793], [-1.5, -793], [-1.5, -807], [-6, -807]], entrance: [-7, -800], facingHeading: 0, status: { geometry: 'scenario_overlay' } },
    { id: 'd_start', poiId: null, label: 'Fixture Depot', nameId: null, roadId: 'A1', approachEdges: ['A1:f'], side: 'left', level: 0, stopPolygon: [[-6, -43], [-1.5, -43], [-1.5, -57], [-6, -57]], entrance: [-7, -50], facingHeading: 0, status: { geometry: 'scenario_overlay' } },
    { id: 'd_side', poiId: null, label: 'Fixture Side Shop', nameId: null, roadId: 'B', approachEdges: ['B:f'], side: 'left', level: 0, stopPolygon: [[193, -1003.5], [207, -1003.5], [207, -1000.2], [193, -1000.2]], entrance: [200, -1006], facingHeading: headingOf(1, 0), status: { geometry: 'scenario_overlay' } },
  ];
  const deckLine: Vec2[] = [[0, -200], [0, -700]];
  const pillars = [] as { x: number; z: number; heading: number; lineId: string }[];
  for (let z = -200; z >= -700; z -= 30) pillars.push({ x: 7.5, z, heading: 0, lineId: 'blue' });
  return {
    manifestVersion: 'fixture', roads, nodes, directed, junctions: [], pois: [],
    metroLines: [{ id: 'blue', name: 'Fixture line', color: '#0070c0', osmRouteMasterId: 0, geo: [], local: [deckLine] }],
    stations: [],
    metro: { pillars, deckHeightM: 12.5, deckWidthM: 9, heightStatus: 'scenario_overlay' },
    deliveries, names: [], boundary: { polygon: [], warningMarginM: 12, exits: [] },
  };
}

export function makeFixtureWorld(): WorldPhysics {
  return new WorldPhysics(makeFixtureCore());
}

export function fixtureMission(over: Partial<MissionDef> = {}): MissionDef {
  return {
    id: 'fixture_mt01', version: 1, templates: ['MT01'], title: 'Fixture', brief: 'fixture', pickupId: 'd_start', stops: ['d_main'],
    flightSeconds: 25, deadlineSeconds: 120, cargo: { label: 'Parcel', fragility: 1, failThreshold: 0 }, traffic: 'light', seed: 42,
    deadlineBasis: 'fixture', ...over,
  };
}
