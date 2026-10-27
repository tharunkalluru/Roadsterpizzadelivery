export interface HudRect { left: number; top: number; width: number; height: number }
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
// Portrait is covered by the mandatory orientation gate. This is the landscape
// thumb layout, with measured lanes rather than independent CSS breakpoints.
export function mobileHudLayout(width: number, height: number, mapTop: number, _taskBottom: number, left = 18, right = 18, bottom = 18) {
  const portrait = height > width, short = height <= 520;
  const steer = short ? width < 700 ? 66 : 76 : clamp(width * .104, 78, 108);
  const oldBrake = short ? 66 : clamp(width * .09, 72, 96);
  const brakeWidth = oldBrake * 1.5;
  const goWidth = short ? clamp(width * .19, 118, 152) : clamp(width * .19, 148, 222);
  const goHeight = short ? 72 : clamp(width * .094, 78, 108);
  const flightHeight = short ? 44 : 52, cruiseHeight = short ? 32 : 38, gap = short ? 12 : 18;
  const R = (x: number, y: number, w: number, h: number): HudRect => ({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) });
  const leftSteer = R(left, height - bottom - steer, steer, steer), rightSteer = R(left + steer + gap, leftSteer.top, steer, steer);
  const gas = R(width - right - goWidth, height - bottom - goHeight, goWidth, goHeight);
  const brake = R(gas.left - 10 - brakeWidth, gas.top, brakeWidth, gas.height);
  const cruise = R(gas.left, gas.top - 12 - cruiseHeight, gas.width, cruiseHeight);
  const fly = R(gas.left, cruise.top - 6 - flightHeight, gas.width, flightHeight);
  const steerEnd = rightSteer.left + rightSteer.width;
  const speedWidth = Math.floor(Math.min(140, 2 * (Math.min(width / 2 - steerEnd, brake.left - width / 2) - 8)));
  const speed = R((width - speedWidth) / 2, height - bottom - 30, speedWidth, 30);
  const mapSize = Math.round(clamp(height * .34, 112, 152));
  // Short landscape phones dock the map beside the FLY/CRUISE column, keeping
  // both the map and the right thumb stack at their usable sizes.
  const map = R(mapTop + mapSize + 12 > fly.top ? gas.left - 12 - mapSize : width - right - mapSize, mapTop, mapSize, mapSize);
  const contextTop = speed.top - 12 - 64;
  const contextEnd = contextTop < map.top + map.height && contextTop + 64 > map.top ? Math.min(brake.left, map.left) : brake.left;
  const contextWidth = Math.min(220, contextEnd - steerEnd - 24);
  const context = R((steerEnd + contextEnd - contextWidth) / 2, contextTop, contextWidth, 64);
  return { portrait, oldBrake, leftSteer, rightSteer, brake, gas, fly, cruise, speed, map, context };
}
