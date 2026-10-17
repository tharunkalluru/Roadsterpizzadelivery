import type { Session } from '../missions/session';
import { SIM_HZ } from '../config/gameplay';

export interface Lesson { id: string; title: string; text: string }

/**
 * Practice lessons (MASTER §18): shown one at a time when relevant; the world is paused while a
 * lesson is on screen so explanation never costs time. Practice has its own allowance.
 */
export class Tutorial {
  private shown = new Set<string>();
  check(s: Session): Lesson | null {
    const p = s.player;
    const once = (id: string, title: string, text: string): Lesson | null => {
      if (this.shown.has(id)) return null;
      this.shown.add(id);
      return { id, title, text };
    };
    if (s.tick === 1) return once('steer', 'Steer and brake', 'Left thumb: drag on the steering pad (or ←/→). The car accelerates by itself. Hold BRAKE (or ↓) to slow down or stop. FAST (↑) goes up to 60 km/h.');
    for (const e of p.events) {
      if (e.type === 'launch_denied') return once('denied', 'Fly is unavailable here', `"${e.reason}". A refused launch spends nothing and is not queued for later. Try again on an open stretch.`);
      if (e.type === 'launch') return once('flying', 'You are flying', 'Steer as usual. The meter keeps counting while you climb, hover, brake or descend. The striped part is the reserve needed to land — it is part of the same balance. Press LAND (Space) to come down early and keep the rest.');
      if (e.type === 'landed') return once('landed', 'Landed — nothing refills', `You kept ${(p.ledger.remainingTicks / SIM_HZ).toFixed(1)} s. Driving, landing and stops never refill flight. A new delivery gets a fresh allowance.`);
    }
    if (s.tick > 6 * SIM_HZ && p.move === 'GROUNDED') return once('fly', 'One shared flight allowance', `${s.mission.flightSeconds} seconds for this whole delivery. Use it together or in parts. Press FLY (Space) when the road ahead is open.`);
    if (s.offRouteTicks > 0) return once('reroute', 'Missed a turn?', 'The route is recalculated along real connected roads. There are no shortcuts through medians or buildings.');
    if (s.currentStop && s.routeRemainingM() < 90) return once('stop', 'Stop at the entrance', 'Slow down inside the glowing area at the entrance and hold still for about a second to hand over the parcel.');
    return null;
  }
}
