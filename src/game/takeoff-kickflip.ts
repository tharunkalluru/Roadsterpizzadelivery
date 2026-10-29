export const TAKEOFF_KICKFLIP_SECONDS = 0.82;
const TAU = Math.PI * 2;
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

// A visual pose only: flight height, support, yaw and collisions remain owned by Player.
// Accumulating game dt (rather than wall-clock time) also freezes a paused takeoff.
export class TakeoffKickflip {
  active = false;
  private progress = 0;
  private from = 0;
  private target = 1;
  private elapsed = 0;
  private duration = TAKEOFF_KICKFLIP_SECONDS;
  private settling = false;
  constructor(private halfWidth = 1.2, private halfHeight = 0.7) {}
  begin(duration = TAKEOFF_KICKFLIP_SECONDS) {
    // A second takeoff during a cancelled flip resumes the same turn instead of
    // stacking rotations or snapping an already tilted body to its starting pose.
    if (this.active && !this.settling) return;
    this.from = this.progress; this.target = 1; this.elapsed = 0;
    this.duration = Math.max(0.2, duration * (1 - this.progress));
    this.active = true; this.settling = false;
  }
  cancel() {
    if (!this.active || this.settling) return;
    // LAND keeps descending immediately; the visual body takes the shortest
    // remaining roll back to upright, without initiating another full flip.
    this.from = this.progress; this.target = this.progress < 0.5 ? 0 : 1;
    this.elapsed = 0; this.duration = 0.18; this.settling = true;
  }
  reset() { this.active = false; this.progress = 0; this.from = 0; this.target = 1; this.elapsed = 0; this.settling = false; }
  update(dt: number) {
    if (this.active && Number.isFinite(dt) && dt > 0) {
      this.elapsed += dt;
      const p = Math.min(1, this.elapsed / this.duration);
      this.progress = this.from + (this.target - this.from) * ease(p);
      if (p >= 1) this.reset();
    }
    const roll = this.progress * TAU;
    // Lift by the change in the body's rotated vertical extent. Even a cancelled
    // flip very close to its launch surface never swings a wing/tyre below it.
    const clearance = Math.max(0, Math.abs(Math.sin(roll)) * this.halfWidth + Math.abs(Math.cos(roll)) * this.halfHeight - this.halfHeight);
    const arc = 0.45 * Math.sin(Math.PI * this.progress) ** 2;
    return { active: this.active, roll, lift: clearance + arc };
  }
}
