import type { ModuleStoryFrame } from '../modules/types';

export type StoryPhase = 'driving' | 'playing' | 'viewing' | 'transition';
/** Story capture never pauses the simulation. Pause/map/background are owned
 * by Game; this clock is advanced only by its active simulation frames. */
export class StoryDirector {
  phase: StoryPhase = 'driving';
  private actionDelay = 0;
  get captured() { return this.phase !== 'driving'; }
  get viewing() { return this.phase === 'viewing'; }
  tryStart(frame: ModuleStoryFrame | undefined, allowed: boolean) {
    if (this.phase !== 'driving' || !allowed || !frame?.entry || !validStoryPoint(frame)) return false;
    this.phase = 'playing'; this.actionDelay = .45; return true;
  }
  actionReady(dt: number, canDrop: boolean) {
    this.actionDelay = Math.max(0, this.actionDelay - Math.max(0, dt));
    if (this.phase !== 'playing' || !canDrop || this.actionDelay > 0) return false;
    this.actionDelay = .5; return true;
  }
  complete() { if (this.phase === 'playing') this.phase = 'viewing'; }
  next() { if (!this.viewing) return false; this.phase = 'transition'; return true; }
  reset() { this.phase = 'driving'; this.actionDelay = 0; }
}

export function validStoryPoint(frame: ModuleStoryFrame) {
  return [frame.point.x, frame.point.y, frame.point.z, frame.yaw ?? 0, frame.speed ?? 0,
    frame.maxSpeed ?? 8, frame.verticalSpeed ?? 5].every(Number.isFinite);
}

/** Bounded cinematic interpolation follows authored floor/ramp/coach points.
 * No teleport, frame-count animation, catch-up clock, or ordinary drive tuning. */
export function stepStoryPose(p: {x:number;y:number;z:number;yaw:number}, frame: ModuleStoryFrame, dt:number) {
  if (!validStoryPoint(frame) || ![p.x,p.y,p.z,p.yaw,dt].every(Number.isFinite) || dt <= 0) return null;
  dt=Math.min(.05,dt);
  const dx=frame.point.x-p.x,dz=frame.point.z-p.z,length=Math.hypot(dx,dz);
  const travel=Math.min(length,Math.max(.1,frame.maxSpeed??8)*dt);
  const yStep=Math.max(.1,frame.verticalSpeed??5)*dt,dy=frame.point.y-p.y;
  const heading=frame.yaw??(length>.15?Math.atan2(-dx,-dz):p.yaw);
  const turn=Math.atan2(Math.sin(heading-p.yaw),Math.cos(heading-p.yaw));
  return {x:p.x+(length?dx/length*travel:0),z:p.z+(length?dz/length*travel:0),
    y:p.y+Math.max(-yStep,Math.min(yStep,dy)),yaw:p.yaw+Math.max(-3*dt,Math.min(3*dt,turn)),speed:frame.speed??0};
}
