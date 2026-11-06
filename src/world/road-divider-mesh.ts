import type { Batch } from '../core/util';

/** Fixed metre repeat, including very short source pieces. Clipped runs retain
 * their original distance phase; solid end faces finish partial painted blocks. */
export function dividerStripeDistance(distance: number, total: number) {
  if (!(total > 0) || !Number.isFinite(distance + total)) return 0;
  if (distance <= 0) return 0;
  return Math.min(distance, total);
}

/** A closed prism inside the existing divider footprint. End faces use the
 * light part of the kerb texture so yellow/white terminal paint stays solid. */
export function drawClosedDivider(batch: Pick<Batch, 'quad'>, a: number[], b: number[],
  width: number, height: number, ya: number, yb: number, color: string, u0: number, u1: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  if (!(length > 1e-8) || !(width > 0) || !(height > 0)) return;
  const nx = -dz / length * width / 2, nz = dx / length * width / 2;
  const n0 = [a[0] - nx, ya, a[1] - nz], n1 = [b[0] - nx, yb, b[1] - nz];
  const p0 = [a[0] + nx, ya, a[1] + nz], p1 = [b[0] + nx, yb, b[1] + nz];
  const top = (p: number[]) => [p[0], p[1] + height, p[2]];
  const n0t = top(n0), n1t = top(n1), p0t = top(p0), p1t = top(p1);
  batch.quad(n0t, p0t, p1t, n1t, color, [[u0, 0], [u0, 1], [u1, 1], [u1, 0]]);
  batch.quad(n0, n1, p1, p0, color, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
  batch.quad(n0, n0t, n1t, n1, color, [[u0, 0], [u0, 1], [u1, 1], [u1, 0]]);
  batch.quad(p1, p1t, p0t, p0, color, [[u1, 0], [u1, 1], [u0, 1], [u0, 0]]);
  const capUV = [[.25, 0], [.25, 1], [.25, 1], [.25, 0]];
  batch.quad(p0, p0t, n0t, n0, color, capUV);
  batch.quad(n1, n1t, p1t, p1, color, capUV);
}
