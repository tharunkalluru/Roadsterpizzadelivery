import { TPL } from '../core/util';
import type { StructureFootprint } from './structure-clearance';

export interface LampFixture {
  road: string; kind: 'road' | 'median' | 'deck' | 'mapped';
  pole: [number, number, number]; head: [number, number, number]; pool: [number, number, number];
}
export interface StreetLampSite { road: string; kind: LampFixture['kind']; x: number; z: number; base?: number;
  inwardX: number; inwardZ: number; height?: number; reach?: number; surfaceY?: number }
export interface StreetLampVolume { part: 'pole' | 'arm' | 'head'; footprint: StructureFootprint; bottom: number; top: number }

function streetLampModel(site: StreetLampSite) {
  const base = site.base || 0, height = site.height || 9, reach = site.reach || 1.6;
  const length = Math.hypot(site.inwardX, site.inwardZ) || 1, ux = site.inwardX / length, uz = site.inwardZ / length;
  return { base, height, reach, ux, uz, hx: site.x + ux * reach, hz: site.z + uz * reach, yaw: Math.atan2(ux, uz) };
}
/** Actual pole, arm, housing and diffuser extents, rather than the displaced
 * dynamic-light endpoint. Clearance and rendering share the same dimensions. */
export function streetLampVolumes(site: StreetLampSite): StreetLampVolume[] {
  const { base, height, reach, ux, uz, hx, hz } = streetLampModel(site);
  return [
    { part: 'pole', footprint: { x: site.x, z: site.z, r: .09 }, bottom: base, top: base + height },
    { part: 'arm', footprint: { x: site.x + ux * reach / 2, z: site.z + uz * reach / 2, hx: ux, hz: uz, hw: .04, hl: reach / 2 }, bottom: base + height - .09, top: base + height - .01 },
    { part: 'head', footprint: { x: hx, z: hz, hx: ux, hz: uz, hw: .35, hl: .15 }, bottom: base + height - .24, top: base + height - .08 },
  ];
}
export function streetLampFixture(site: StreetLampSite): LampFixture {
  const {base,height,hx,hz}=streetLampModel(site);
  return {road:site.road,kind:site.kind,pole:[site.x,base,site.z],head:[hx,base+height-.4,hz],pool:[hx,(site.surfaceY??base)+.03,hz]};
}

// Geometry, emissive underside, dynamic light and baked pool share one endpoint.
// Callers provide a world-space inward vector, avoiding two conflicting notions
// of "left" between road offsets and a rotated local lamp model.
export function drawStreetLamp(B: any, site: StreetLampSite): LampFixture {
  const { x, z } = site, { base, height, reach, ux, uz, hx, hz, yaw } = streetLampModel(site);
  B.st.add(TPL.cyl6, x, base + height / 2, z, .09, height, .09, '#8d8899');
  B.st.box(x + ux * reach / 2, base + height - .05, z + uz * reach / 2, .08, .08, reach, '#8d8899', { ry: yaw });
  B.st.box(hx, base + height - .15, hz, .7, .14, .3, '#3c3946', { ry: yaw });
  B.lit.box(hx, base + height - .23, hz, .55, .02, .22, '#fff0cc', { ry: yaw });
  const fixture=streetLampFixture(site),poolY=fixture.pool[1];
  B.glow.add(TPL.plane, hx, poolY, hz, 8, 8, 1, '#ffb066', { rx: -Math.PI / 2 });
  return fixture;
}
