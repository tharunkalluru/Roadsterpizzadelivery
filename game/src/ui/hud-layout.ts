export interface HudRect { left: number; top: number; width: number; height: number }
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function mobileHudLayout(width: number, height: number, mapTop: number, taskBottom: number, left = 18, right = 18, bottom = 18) {
  const edgeLeft = left > 18 ? left : 12, edgeRight = right > 18 ? right : 12;
  const portrait = width <= 600 && height > width, compact = portrait && width <= 360, short = height <= 520;
  const steer = portrait ? compact ? 66 : 72 : short ? 76 : clamp(width * .104, 78, 108);
  const oldBrake = portrait ? compact ? 62 : 66 : short ? 66 : clamp(width * .09, 72, 96);
  const brake = oldBrake * 1.5; // Exactly 150% of the preceding control's linear dimensions.
  const goWidth = portrait ? compact ? 118 : 132 : short ? 152 : clamp(width * .19, 148, 222);
  const goHeight = portrait ? compact ? 70 : 74 : short ? 72 : clamp(width * .094, 78, 108);
  const flightHeight = short || portrait ? 44 : 52, cruiseHeight = short || portrait ? 32 : 38, gap = portrait ? compact ? 8 : 10 : short ? 12 : 18;
  const R = (x: number, y: number, w: number, h: number): HudRect => ({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) });
  const leftSteer = R(left, height - bottom - steer, steer, steer), rightSteer = R(left + steer + gap, leftSteer.top, steer, steer);
  const gas = R(width - right - goWidth, height - bottom - goHeight, goWidth, goHeight);
  const pedalBrake = portrait ? R(width - right - (goWidth + brake) / 2, gas.top - 12 - brake, brake, brake) : R(gas.left - 10 - brake, height - bottom - brake, brake, brake);
  const stackLeft = portrait ? gas.left : pedalBrake.left + (brake - goWidth) / 2;
  const cruise = R(stackLeft, pedalBrake.top - 18 - cruiseHeight, goWidth, cruiseHeight);
  const fly = R(stackLeft, cruise.top - 6 - flightHeight, goWidth, flightHeight);
  const speed = portrait ? R(left, leftSteer.top - 44, steer * 2 + gap, 30) : R(gas.left, gas.top - 44, goWidth, 30);
  const mapLimit = portrait ? fly.top - 12 - mapTop : speed.top - 12 - mapTop;
  const mapSize = Math.round(Math.min(clamp(portrait ? width * .37 : height * .34, 112, 152), Math.max(44, mapLimit)));
  const map = R(width - edgeRight - mapSize, mapTop, mapSize, mapSize);
  let context: HudRect;
  if (portrait && height <= 650) {
    const w = Math.min(220, fly.left - 12 - edgeLeft);
    context = R(edgeLeft, Math.min(Math.max(taskBottom + 12, 300), speed.top - 76), w, 64);
  } else if (portrait) {
    context = R((width - 200) / 2, Math.min(Math.max(taskBottom + 12, height * .5 - 32), fly.top - 76), 200, 64);
  } else {
    const w = Math.min(220, pedalBrake.left - (rightSteer.left + steer) - 24);
    context = R((rightSteer.left + steer + pedalBrake.left - w) / 2, height - bottom - brake / 2 - 32, w, 64);
  }
  return { portrait, oldBrake, leftSteer, rightSteer, brake: pedalBrake, gas, fly, cruise, speed, map, context };
}
