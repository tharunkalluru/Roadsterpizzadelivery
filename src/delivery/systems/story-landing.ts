import type { DeliveryPlayer, ModuleStoryFrame, ModuleStoryLandingZone } from '../modules/types';

export function storyLandingZone(frame:ModuleStoryFrame|undefined):ModuleStoryLandingZone|undefined {
  return frame?.landing ?? (frame ? {point:frame.point,radius:3.15} : undefined);
}
export function storyLandingMarker(zone:ModuleStoryLandingZone) {
  return {...zone.point,y:zone.markerHeight??zone.point.y-.55};
}

/** A settled physical arrival, never a proximity trigger or an auto-landing.
 * Speed on a moving roof is relative to that support, as in Player physics. */
export class StoryLandingGate {
  private held = 0;
  private revision: number | undefined;
  reset() { this.held = 0; this.revision = undefined; }
  update(dt: number, player: DeliveryPlayer, frame: ModuleStoryFrame | undefined,
    supportY: number, allowed: boolean, placementRevision = 0, gliding = false) {
    if (this.revision !== placementRevision) this.held = 0;
    this.revision = placementRevision;
    const zone = storyLandingZone(frame);
    // Only explicitly authored moving road handoffs can use relative speed.
    // Ordinary destinations, trains and metro retain the stopped arrival rule.
    const moving=frame?.allowMovingEntry===true;
    const headingMatches=!moving||frame.yaw!==undefined&&Math.abs(Math.atan2(Math.sin(player.yaw-frame.yaw),Math.cos(player.yaw-frame.yaw)))<.45;
    const speedMatches=moving?Number.isFinite(frame.speed)&&frame.speed!>=0&&Math.abs(player.speed-frame.speed!)<(frame.speed!<=1?1.5:4):Math.abs(player.speed)<=.35;
    const settled = allowed && frame?.entry && zone && !player.flying && !player.descending && !player.jumping && !gliding &&
      [dt, player.x, player.y, player.z, player.speed, player.verticalSpeed ?? 0, supportY,
        zone.point.x, zone.point.y, zone.point.z, zone.radius].every(Number.isFinite) &&
      headingMatches && speedMatches && Math.abs(player.verticalSpeed ?? 0) <= .15 &&
      Math.abs(player.y - .55 - supportY) <= .2 &&
      Math.abs(player.y - zone.point.y) <= .65 &&
      Math.hypot(player.x - zone.point.x, player.z - zone.point.z) <= zone.radius;
    this.held = settled ? this.held + Math.max(0, Math.min(.1, dt)) : 0;
    return this.held >= .4 - 1e-8;
  }
}
