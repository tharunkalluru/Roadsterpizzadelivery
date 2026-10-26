import type { XZ, RoadEdge } from '../world/types';
import { roadStructureClearance } from '../world/structure-clearance';
import { buildingTransportClearance } from '../world/building-clearance';
import type { Wall } from '../world/city';

export interface CinemaFacade { c: { x: number; z: number }; n: { x: number; z: number }; w: number; top: number }
export interface CinemaFrontPart { id: string; group: 'canopy' | 'name' | 'poster' | 'counter'; x: number; y: number; z: number; w: number; h: number; d: number }

export function cinemaFrontParts(width: number): CinemaFrontPart[] {
  const W = Math.max(7.5, Math.min(width, 17)), HH = W * .5, y0 = 6.1, parts: CinemaFrontPart[] = [];
  const box = (id: string, group: CinemaFrontPart['group'], w: number, h: number, d: number, x: number, y: number, z: number) => parts.push({ id, group, w, h, d, x, y, z });
  box('canopy', 'canopy', W * .9, .35, 3.2, 0, 3.7, 1.6);
  box('canopy-light', 'canopy', W * .86, .05, .25, 0, 3.5, 3.05);
  for (const side of [-1, 1]) box(`post-${side}`, 'canopy', .35, 3.6, .35, side * W * .42, 1.8, 3);
  box('name', 'name', W * .92, 1.9, .02, 0, 4.95, .42);
  box('poster', 'poster', W, HH, .02, 0, y0 + HH / 2, .55);
  for (const side of [-1, 1]) box(`frame-${side}`, 'poster', W + .4, .25, .3, 0, side < 0 ? y0 - .1 : y0 + HH + .1, .4);
  for (const side of [-.5, -.17, .17, .5]) box(`upright-${side}`, 'poster', .2, HH + .5, .2, side * W, y0 + HH / 2, .3);
  for (const side of [-.33, 0, .33]) { box(`arm-${side}`, 'poster', .08, .08, 1.4, side * W, y0 + HH + .4, 1); box(`flood-${side}`, 'poster', .5, .25, .3, side * W, y0 + HH + .35, 1.7); }
  box('counter', 'counter', 2.4, 2.2, 1.2, -W * .3, 1.1, .9);
  box('tickets', 'counter', 2.2, .55, .02, -W * .3, 2.45, 1.52);
  return parts;
}

export function cinemaPartRing(facade: CinemaFacade, part: CinemaFrontPart): XZ[] {
  const length = Math.hypot(facade.n.x, facade.n.z) || 1, nx = facade.n.x / length, nz = facade.n.z / length;
  const x = facade.c.x + nz * part.x + nx * part.z, z = facade.c.z - nx * part.x + nz * part.z;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [x + nz * u * part.w / 2 + nx * v * part.d / 2, z - nx * u * part.w / 2 + nz * v * part.d / 2]);
}

export function planCinemaFront(facade: CinemaFacade, roads: RoadEdge[], metro?: Parameters<typeof buildingTransportClearance>[1]) {
  const road = roadStructureClearance(roads), extent = [facade.c.x - 24, facade.c.x + 24, facade.c.z - 24, facade.c.z + 24];
  const transit = buildingTransportClearance([], metro, extent), length = Math.hypot(facade.n.x, facade.n.z) || 1, nx = facade.n.x / length, nz = facade.n.z / length;
  const parts = cinemaFrontParts(facade.w).map(part => {
    const x = facade.c.x + nz * part.x + nx * part.z, z = facade.c.z - nx * part.x + nz * part.z;
    const bottom = part.y - part.h / 2, top = part.y + part.h / 2;
    const conflicts = road.conflicts({ x, z, hx: nx, hz: nz, hw: part.w / 2, hl: part.d / 2 }, bottom, top);
    return { ...part, clear: conflicts.length === 0 && transit.clear(cinemaPartRing(facade, part), bottom, top), roadConflicts: conflicts };
  });
  return { parts, groups: Object.fromEntries(['canopy', 'name', 'poster', 'counter'].map(group => [group, parts.filter(p => p.group === group).every(p => p.clear)])) as Record<CinemaFrontPart['group'], boolean> };
}

// Register the same objects with the loaded owner and global collision grids.
// World's normal tile removal therefore removes these dynamic decorations too.
export function registerCinemaGroundParts(facade: CinemaFacade, plan: ReturnType<typeof planCinemaFront>,
  city: { obstacles: Map<string, { x: number; z: number; r: number; top: number }[]>; walls: Map<string, Wall[]> }, owner: { built: Pick<typeof city, 'obstacles' | 'walls'> }) {
  const insert = <T>(a: Map<string, T[]>, b: Map<string, T[]>, key: string, value: T) => {
    for (const grid of a === b ? [a] : [a, b]) (grid.get(key) || grid.set(key, []).get(key)!).push(value);
  };
  for (const part of plan.parts) {
    if (!plan.groups[part.group]) continue;
    const ring = cinemaPartRing(facade, part);
    if (part.id.startsWith('post-')) {
      const x = (ring[0][0] + ring[2][0]) / 2, z = (ring[0][1] + ring[2][1]) / 2;
      insert(city.obstacles, owner.built.obstacles, `${Math.floor(x / 50)},${Math.floor(z / 50)}`, { x, z, r: Math.hypot(part.w, part.d) / 2, top: part.y + part.h / 2 });
    } else if (part.id === 'counter') for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], wall: Wall = { ax: a[0], az: a[1], bx: b[0], bz: b[1], y0a: 0, y0b: 0, y1a: part.h, y1b: part.h, kind: 'median' };
      for (let x = Math.floor(Math.min(a[0], b[0]) / 30); x <= Math.floor(Math.max(a[0], b[0]) / 30); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / 30); z <= Math.floor(Math.max(a[1], b[1]) / 30); z++) insert(city.walls, owner.built.walls, `${x},${z}`, wall);
    }
  }
}
