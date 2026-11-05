import * as THREE from 'three';

/** Smooth the chase offset, rather than making the camera chase an old world
 * position. Uses actual post-collision/train-carried displacement. It never
 * changes the player, physics step, speed or rendered world visibility. */
export class CameraTranslationFollow {
  private previous = new THREE.Vector3();
  private sampled = false;
  private following = false;

  reset() { this.sampled = false; this.following = false; }

  /** Returns true on an unannounced discontinuity so the owner can snap to its
   * independently collision-checked desired view. World-anchored actor shots
   * are sampled but never advected with the car. */
  advance(position: THREE.Vector3, look: THREE.Vector3, player: Readonly<{x:number;y:number;z:number}>, dt: number, followsPlayer: boolean) {
    const dx = player.x - this.previous.x, dy = player.y - this.previous.y, dz = player.z - this.previous.z;
    const discontinuity = this.sampled && dx * dx + dy * dy + dz * dz > 32 * 32;
    if (this.sampled && this.following && followsPlayer && !discontinuity && dt > 0 && position.lengthSq() && look.lengthSq()) {
      position.x += dx; position.y += dy; position.z += dz;
      look.x += dx; look.y += dy; look.z += dz;
    }
    this.previous.set(player.x, player.y, player.z); this.sampled = true; this.following = followsPlayer;
    return discontinuity;
  }
}
