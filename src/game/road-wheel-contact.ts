import type { CityData } from '../world/city';
import { supportAt } from './physics';
import { ROADSTER_WHEEL_CONTACTS, rotatedWheelContact } from './landmark-contact';
import { roadQuadHeight, type RoadQuad } from '../world/road-surface';

// A small visual suspension range keeps the tyres on a changing road grade
// while the existing body posture eases. This never moves the physical root.
const TRAVEL = .18;
function contactTravel(quad: RoadQuad, x: number, y: number, z: number, up: { x: number; y: number; z: number }) {
  for (let triangle = 0; triangle < 2; triangle++) {
    const a = quad[0], b = quad[triangle ? 2 : 1], c = quad[triangle ? 3 : 2];
    const bx = b[0] - a[0], bz = b[2] - a[2], cx = c[0] - a[0], cz = c[2] - a[2], determinant = bx * cz - bz * cx;
    if (Math.abs(determinant) < 1e-9) continue;
    const hx = ((b[1] - a[1]) * cz - (c[1] - a[1]) * bz) / determinant;
    const hz = (bx * (c[1] - a[1]) - cx * (b[1] - a[1])) / determinant;
    const response = up.y - hx * up.x - hz * up.z;
    if (response < .9) continue;
    const travel = (a[1] + hx * (x - a[0]) + hz * (z - a[2]) - y) / response;
    const actual = roadQuadHeight(quad, x + up.x * travel, z + up.z * travel);
    if (actual !== null && Math.abs(actual - y - up.y * travel) < 1e-7) return travel;
  }
  return null;
}
export function roadWheelContact(city: CityData, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, surfaceY: number, out: number[]) {
  const up = rotatedWheelContact(0, 1, 0, yaw, pitch, roll);
  if (up.y < .95) return false;
  for (let i = 0; i < ROADSTER_WHEEL_CONTACTS.length; i++) {
    const wheel = ROADSTER_WHEEL_CONTACTS[i], q = rotatedWheelContact(wheel[0], wheel[1], wheel[2], yaw, pitch, roll);
    let support = supportAt(city, x + q.x, z + q.z, surfaceY, true);
    // Missing wheels, another layer or a real pavement step must not become
    // invented suspension support. Only finite reachable asphalt qualifies.
    if (support.kind !== 'road' || !support.s?.roadQuad || Math.abs(support.y - surfaceY) > .3) return false;
    let travel = contactTravel(support.s.roadQuad, x + q.x, y + q.y, z + q.z, up);
    if (travel === null) {
      // At a mesh seam the small suspension displacement can enter the next
      // finite triangle. Re-query there instead of extending the old plane.
      const estimate = (support.y - y - q.y) / up.y;
      if (Math.abs(estimate) > TRAVEL) return false;
      support = supportAt(city, x + q.x + up.x * estimate, z + q.z + up.z * estimate, surfaceY, true);
      if (support.kind !== 'road' || !support.s?.roadQuad || Math.abs(support.y - surfaceY) > .3) return false;
      travel = contactTravel(support.s.roadQuad, x + q.x, y + q.y, z + q.z, up);
    }
    if (travel === null || Math.abs(travel) > TRAVEL) return false;
    out[i] = travel;
  }
  return true;
}
