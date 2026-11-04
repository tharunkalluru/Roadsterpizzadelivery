// Preserve the existing speed lens/flight offsets. The fourteen-scene driving
// composition is deliberately separate from the simulation clock and physics.
export const CAMERA_SPEED_ZOOM_SCALE = .25;
export const speedCameraDistance = (speed: number) => Math.abs(speed) * .06 * CAMERA_SPEED_ZOOM_SCALE;
export const speedCameraFov = (speed: number) => 60 + Math.abs(speed) * .3 * CAMERA_SPEED_ZOOM_SCALE;

export const DRIVING_CAMERA = Object.freeze({
  distance: 6.8,
  height: 1.85, // above the grounded player pivot: about 2.4m above the road
  lookHeight: 1.05,
  lookAhead: 3.6,
  fastLookAhead: 7,
  aimDamping: 8,
});
const smooth01 = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
export function drivingCameraLookAhead(speed: number) {
  // No speed threshold that suddenly moves the aim twenty metres forward.
  // Reverse retains the same forward-facing composition without flipping it.
  return DRIVING_CAMERA.lookAhead + (DRIVING_CAMERA.fastLookAhead - DRIVING_CAMERA.lookAhead) * smooth01(Math.max(0, speed) / (120 / 3.6));
}
export function drivingCameraHeight(speed: number, pitch: number, back: number) {
  const lowerAtSpeed = .08 * smooth01(Math.abs(speed) / (120 / 3.6));
  const neutralBack = DRIVING_CAMERA.distance + speedCameraDistance(speed);
  const lowering = .4 + neutralBack * Math.sin(.38) * .95 - (DRIVING_CAMERA.height - lowerAtSpeed);
  // Lower the normal driver eye; blend back to the safe spherical orbit when
  // the user pitches away. In particular, far zoom + the lowest legal pitch
  // must never request a camera underneath the road and rely on floor escape.
  const driverWeight = smooth01(1 - Math.abs(pitch - .38) / .25);
  return Math.max(.55, .4 + back * Math.sin(pitch) * .95 - lowering * driverWeight);
}
export function drivingCameraAimWeight(orbitYaw: number, orbitPitch: number, dragging: boolean) {
  if (dragging) return 0;
  return smooth01(1 - Math.abs(orbitYaw) / .3) * smooth01(1 - Math.abs(orbitPitch - .38) / .2);
}
