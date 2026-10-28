export interface HudRect { left: number; top: number; width: number; height: number }
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
// Keep the area notice centered on the availability row, below the measured
// header. The map starts below that row even while the notice is fading out.
export function hudStatusLayout(width: number, headerBottom: number, walletBottom: number, left: number, toggleWidth: number, obstacles: HudRect[] = []) {
  let top = headerBottom + 8;
  const available = () => Math.max(0, Math.min(300, width - 24, width - 2 * (left + toggleWidth + 12), ...obstacles.filter(r => r.top < top + 42 && r.top + r.height > top).map(r => 2 * (r.left - 12 - width / 2))));
  let areaWidth = available();
  for (let i = 0; areaWidth < 120 && i < obstacles.length; i++) {
    const ends = obstacles.filter(r => r.top < top + 42 && r.top + r.height > top).map(r => r.top + r.height + 8);
    if (!ends.length) break;
    top = Math.min(...ends); areaWidth = available();
  }
  return { top, mapTop: Math.max(walletBottom + 8, top + 50), area: { left: (width - areaWidth) / 2, top, width: areaWidth, height: 42 } };
}
// Portrait is covered by the mandatory orientation gate. This is the landscape
// thumb layout, with measured lanes rather than independent CSS breakpoints.
export function mobileHudLayout(width: number, height: number, mapTop: number, _taskBottom: number, left = 18, right = 18, bottom = 18) {
  const portrait = height > width, short = height <= 520;
  const steer = short ? width < 700 ? 66 : 76 : clamp(width * .104, 78, 108);
  const oldBrake = short ? 66 : clamp(width * .09, 72, 96);
  const brakeWidth = oldBrake * 1.5;
  const goWidth = short ? clamp(width * .19, 118, 152) : clamp(width * .19, 148, 222);
  const goHeight = short ? 72 : clamp(width * .094, 78, 108);
  const flightHeight = short ? 44 : 52, jumpHeight = short ? 32 : 38, gap = short ? 12 : 18;
  const R = (x: number, y: number, w: number, h: number): HudRect => ({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) });
  const leftSteer = R(left, height - bottom - steer, steer, steer), rightSteer = R(left + steer + gap, leftSteer.top, steer, steer);
  const gas = R(width - right - goWidth, height - bottom - goHeight, goWidth, goHeight);
  const brake = R(gas.left - 10 - brakeWidth, gas.top, brakeWidth, gas.height);
  const jump = R(gas.left, gas.top - 12 - jumpHeight, gas.width, jumpHeight);
  const fly = R(gas.left, jump.top - 6 - flightHeight, gas.width, flightHeight);
  const steerEnd = rightSteer.left + rightSteer.width;
  const speedWidth = Math.floor(Math.min(140, 2 * (Math.min(width / 2 - steerEnd, brake.left - width / 2) - 8)));
  const speed = R((width - speedWidth) / 2, height - bottom - 30, speedWidth, 30);
  const compactMap = height <= 520;
  const mapSize = Math.round(Math.min(clamp(height * .34, 112, 152), compactMap ? Math.max(80, fly.top - 22) : Infinity));
  // The map always stays against the right safe edge. Short phones move the
  // toolbar and wallet to its left, freeing the top corner above FLY/JUMP.
  const map = R(width - right - mapSize, compactMap ? 10 : mapTop, mapSize, mapSize);
  const contextTop = speed.top - 12 - 64;
  const contextEnd = contextTop < map.top + map.height && contextTop + 64 > map.top ? Math.min(brake.left, map.left) : brake.left;
  const contextWidth = Math.min(220, contextEnd - steerEnd - 24);
  const context = R((steerEnd + contextEnd - contextWidth) / 2, contextTop, contextWidth, 64);
  return { portrait, compactMap, oldBrake, leftSteer, rightSteer, brake, gas, fly, jump, speed, map, context };
}
