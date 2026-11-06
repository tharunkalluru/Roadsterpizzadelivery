export interface DeliveryDestination { x: number; z: number; y?: number; label: string }
/** Reuses the existing map target. This readout reveals a place, never its customer. */
export class NavSystem {
  destination: DeliveryDestination | null = null;
  set(destination: DeliveryDestination | null) { this.destination = destination ? { ...destination } : null; }
  update(player: { x: number; z: number }, yaw: number) {
    const target = this.destination;
    if (!target) return null;
    const dx = target.x - player.x, dz = target.z - player.z;
    // Roadster faces -Z at yaw zero. Positive CSS rotation points right.
    const angle = Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw),
      -dx * Math.sin(yaw) - dz * Math.cos(yaw));
    return { label: target.label, distance: Math.hypot(dx, dz), angle: Math.atan2(Math.sin(angle), Math.cos(angle)) };
  }
}
