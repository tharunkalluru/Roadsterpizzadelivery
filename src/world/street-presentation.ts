import type { TiledBatch } from '../core/util';

/** This decorates existing mapped shelters only, inside their already checked
 * 6.4 x 2.5 m envelope. It never creates a new location or road obstacle. */
export const STREET_DETAIL_KIT_LIMIT = Object.freeze({ low: 8, high: 16 });
export class StreetPresentationBudget {
  private used = 0;
  constructor(public readonly limit: number) {}
  take() { if (this.used >= this.limit) return false; this.used++; return true; }
  get count() { return this.used; }
}

export function drawShelterPresentation(x: number, z: number, hx: number, hz: number, outwardX: number, outwardZ: number, base: number, B: { st: Pick<TiledBatch, 'box'>; lit: Pick<TiledBatch, 'box'> }, budget: StreetPresentationBudget) {
  if (!budget.take()) return false;
  const yaw = Math.atan2(hx, hz), P = (u: number, v: number) => [x + hx * u + outwardX * v, z + hz * u + outwardZ * v];
  // A properly backed bench, a bin beside its end, and a roof diffuser are
  // useful silhouette cues. Reuse city batches; no per-fixture Light.
  let p = P(0, .7); B.st.box(p[0], base + .84, p[1], .08, .5, 4.1, '#727f89', { ry: yaw });
  for (const u of [-1.7, 1.7]) { p = P(u, .45); B.st.box(p[0], base + .32, p[1], .32, .46, .1, '#56636d', { ry: yaw }); }
  p = P(-2.9, .55); B.st.box(p[0], base + .36, p[1], .42, .72, .42, '#326764', { ry: yaw });
  B.st.box(p[0], base + .74, p[1], .44, .06, .44, '#263b42', { ry: yaw });
  p = P(0, -.1); B.lit.box(p[0], base + 2.56, p[1], .16, .035, 3.8, '#e6ebdf', { ry: yaw });
  return true;
}
