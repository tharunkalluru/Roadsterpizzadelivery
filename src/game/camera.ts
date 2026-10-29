// Keep the V21 resting composition and all chase/orbit smoothing unchanged.
// Only the extra distance and FOV caused by speed are reduced to a quarter.
export const CAMERA_SPEED_ZOOM_SCALE = .25;
export const speedCameraDistance = (speed: number) => Math.abs(speed) * .06 * CAMERA_SPEED_ZOOM_SCALE;
export const speedCameraFov = (speed: number) => 60 + Math.abs(speed) * .3 * CAMERA_SPEED_ZOOM_SCALE;
