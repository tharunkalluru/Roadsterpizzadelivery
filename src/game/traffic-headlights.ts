import * as THREE from 'three';

export interface HeadlightTrafficVehicle {
  g: THREE.Group;
  lamps?: { headlights: readonly { x: number; y: number; z: number }[] };
}

/** Real illumination is local and bounded; every vehicle keeps its visible lamp lenses. */
export class TrafficHeadlights {
  readonly lights: THREE.SpotLight[] = [];
  private vehicles: (HeadlightTrafficVehicle | null)[] = [];
  private distances: number[] = [];
  private worldPosition = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private disposed = false;

  constructor(private scene: THREE.Scene, private lowQ: boolean) {
    for (let i = 0; i < (lowQ ? 2 : 3); i++) {
      const light = new THREE.SpotLight('#fff1d7', 0, 45, .29, .65, 2);
      light.name = `Nearby traffic headlight ${i + 1}`;
      light.castShadow = false;
      this.scene.add(light, light.target);
      this.lights.push(light); this.vehicles.push(null); this.distances.push(Infinity);
    }
  }

  private distance(vehicle: HeadlightTrafficVehicle, player: { x: number; y: number; z: number }) {
    if (!vehicle.g.visible || !vehicle.lamps?.headlights.length) return Infinity;
    vehicle.g.getWorldPosition(this.worldPosition);
    // Do not spend a street beam on traffic far beneath an airborne player,
    // or on the other deck of a stacked junction.
    if (Math.abs(this.worldPosition.y - player.y) > 9) return Infinity;
    const dx = this.worldPosition.x - player.x, dz = this.worldPosition.z - player.z;
    const distance = dx * dx + dz * dz;
    return distance <= 65 * 65 ? distance : Infinity;
  }

  update(player: { x: number; y: number; z: number }, cars: readonly HeadlightTrafficVehicle[], darkness: number) {
    if (this.disposed) return;
    const night = Number.isFinite(darkness) ? THREE.MathUtils.clamp(darkness, 0, 1) : 0;
    if (night <= .001) {
      for (const light of this.lights) light.intensity = 0;
      return;
    }

    for (let i = 0; i < this.vehicles.length; i++) {
      const vehicle = this.vehicles[i];
      const distance = vehicle && cars.includes(vehicle) ? this.distance(vehicle, player) : Infinity;
      this.distances[i] = distance;
      if (!Number.isFinite(distance)) this.vehicles[i] = null;
    }
    for (const vehicle of cars) {
      if (this.vehicles.includes(vehicle)) continue;
      const distance = this.distance(vehicle, player);
      if (!Number.isFinite(distance)) continue;
      let slot = this.vehicles.indexOf(null);
      if (slot < 0) {
        slot = 0;
        for (let i = 1; i < this.distances.length; i++) if (this.distances[i] > this.distances[slot]) slot = i;
        // Twenty percent nearer before replacing an occupied source. This
        // prevents two adjacent vehicles exchanging beams every frame.
        if (distance >= this.distances[slot] * .64) continue;
      }
      this.vehicles[slot] = vehicle; this.distances[slot] = distance;
    }

    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i], vehicle = this.vehicles[i];
      if (!vehicle) { light.intensity = 0; continue; }
      const anchors = vehicle.lamps!.headlights;
      this.origin.set(0, 0, 0);
      for (const anchor of anchors) {
        this.origin.x += anchor.x; this.origin.y += anchor.y; this.origin.z += anchor.z;
      }
      this.origin.multiplyScalar(1 / anchors.length);
      this.origin.z -= .03;
      // Front is local -Z. A modest downward aim reaches the same road deck,
      // following the actual displayed vehicle pitch, yaw and roll.
      this.aim.set(this.origin.x, .06, this.origin.z - 35);
      vehicle.g.updateWorldMatrix(true, false);
      light.position.copy(this.origin.applyMatrix4(vehicle.g.matrixWorld));
      light.target.position.copy(this.aim.applyMatrix4(vehicle.g.matrixWorld));
      light.intensity = (this.lowQ ? 650 : 150) * night;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const light of this.lights) {
      this.scene.remove(light, light.target); light.dispose();
    }
    this.vehicles.fill(null);
  }
}
