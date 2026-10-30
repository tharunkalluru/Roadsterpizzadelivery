import * as THREE from 'three';

/** Lamp surfaces stay readable without bloom; only the hero owns paired real beams. */
export class PlayerLights {
  readonly headlights: THREE.SpotLight[] = [];
  readonly rear = new THREE.SpotLight('#ff160b', 0, 8, .8, .8, 2);
  private readonly tailColor = new THREE.Color('#ff160b');
  private readonly reverseColor = new THREE.Color('#f2f5ff');
  braking = false;
  reversing = false;
  constructor(readonly mount: THREE.Group, readonly tail: THREE.MeshBasicMaterial, readonly reverse: THREE.MeshBasicMaterial) {
    for (const x of [-.62, .62]) {
      const light = new THREE.SpotLight('#fff3dc', 0, 58, .43, .65, 2);
      light.name = 'Roadster headlight'; light.castShadow = false;
      // Front lamp strip, in the model's own coordinates. It follows yaw,
      // road pitch, flight and the kickflip, rather than the chase camera.
      light.position.set(x, .55, -2.35);
      light.target.position.set(x * 1.8, -.4, -36);
      mount.add(light, light.target); this.headlights.push(light);
    }
    this.rear.name = 'Roadster rear lamp spill'; this.rear.position.set(0, .7, 2.48);
    this.rear.castShadow = false; this.rear.target.position.set(0, -.15, 12);
    // Rear-facing spill cannot illuminate the car's own paint from behind.
    mount.add(this.rear, this.rear.target); this.update(0, 0, 0);
  }
  update(darkness: number, brake: number, speed: number, beamStrength = 1) {
    const night = Number.isFinite(darkness) ? THREE.MathUtils.clamp(darkness, 0, 1) : 0;
    this.reversing = speed < -.08;
    this.braking = brake > .05 && !this.reversing;
    this.tail.color.copy(this.tailColor).multiplyScalar(this.braking ? 3.2 : .25 + night * .35);
    this.reverse.color.set(this.reversing ? '#f2f5ff' : '#292b32');
    if (this.reversing) this.reverse.color.multiplyScalar(2);
    // The HDR bloom path sees pre-tone-mapped radiance; use its calibrated
    // gain so white traffic does not become a screen-covering glare source.
    const gain = Number.isFinite(beamStrength) ? THREE.MathUtils.clamp(beamStrength, 0, 1) : 1;
    for (const head of this.headlights) head.intensity = night * 1000 * gain;
    this.rear.color.copy(this.reversing ? this.reverseColor : this.tailColor);
    this.rear.intensity = night * (this.reversing ? 35 : this.braking ? 18 : 2);
  }
}

/** The existing mood blends street-lamp demand continuously through dusk/dawn. */
export function vehicleDarkness(lampLights: number) {
  return Number.isFinite(lampLights) ? THREE.MathUtils.clamp(lampLights / 4, 0, 1) : 0;
}
