import { TPL } from '../core/util';

export interface LampFixture {
  road: string; kind: 'road' | 'median' | 'deck' | 'mapped';
  pole: [number, number, number]; head: [number, number, number]; pool: [number, number, number];
}

// Geometry, emissive underside, dynamic light and baked pool share one endpoint.
// Callers provide a world-space inward vector, avoiding two conflicting notions
// of "left" between road offsets and a rotated local lamp model.
export function drawStreetLamp(B: any, site: { road: string; kind: LampFixture['kind']; x: number; z: number; base?: number;
  inwardX: number; inwardZ: number; height?: number; reach?: number; surfaceY?: number }): LampFixture {
  const { x, z } = site, base = site.base || 0, height = site.height || 9, reach = site.reach || 1.6;
  const length = Math.hypot(site.inwardX, site.inwardZ) || 1, ux = site.inwardX / length, uz = site.inwardZ / length;
  const hx = x + ux * reach, hz = z + uz * reach, yaw = Math.atan2(ux, uz);
  B.st.add(TPL.cyl6, x, base + height / 2, z, .09, height, .09, '#8d8899');
  B.st.box(x + ux * reach / 2, base + height - .05, z + uz * reach / 2, .08, .08, reach, '#8d8899', { ry: yaw });
  B.st.box(hx, base + height - .15, hz, .7, .14, .3, '#3c3946', { ry: yaw });
  B.lit.box(hx, base + height - .23, hz, .55, .02, .22, '#fff0cc', { ry: yaw });
  const poolY = (site.surfaceY ?? base) + .03;
  B.glow.add(TPL.plane, hx, poolY, hz, 8, 8, 1, '#ffb066', { rx: -Math.PI / 2 });
  return { road: site.road, kind: site.kind, pole: [x, base, z], head: [hx, base + height - .4, hz], pool: [hx, poolY, hz] };
}
