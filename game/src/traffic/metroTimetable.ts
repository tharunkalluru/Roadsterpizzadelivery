/** Authored metro presentation: 150 s headway, 20 s dwell. No claim of live service data. */
export interface MetroRun { distance: number; speed: number; dwelling: boolean; dwellProgress: number }
interface Leg { start: number; end: number; at: number; duration: number; ramp: number; peak: number; dwell: boolean }
export class MetroTimetable {
  readonly duration: number;
  private legs: Leg[] = [];
  constructor(readonly length: number, stations: number[], readonly dwellSeconds = 20, maxSpeed = 18, acceleration = 0.85) {
    const stops = [0, ...stations.filter(s => s > 1 && s < length - 1).sort((a,b) => a-b), length];
    let t = 0;
    for (let i=1;i<stops.length;i++) {
      const d = stops[i]-stops[i-1];
      if (d < 1) continue;
      const peak = Math.min(maxSpeed, Math.sqrt(d*acceleration));
      const ramp = peak / acceleration;
      const duration = d / peak + ramp;
      this.legs.push({ start: stops[i-1], end: stops[i], at:t, duration, ramp, peak, dwell:false });
      t += duration;
      if(i<stops.length-1) { this.legs.push({start:stops[i],end:stops[i],at:t,duration:dwellSeconds,ramp:0,peak:0,dwell:true}); t += dwellSeconds; }
    }
    this.duration = t;
  }
  sample(seconds: number): MetroRun {
    const t = Math.max(0,Math.min(this.duration,seconds));
    const l = this.legs.find(l => t < l.at+l.duration) ?? this.legs[this.legs.length-1];
    if(!l) return {distance:0,speed:0,dwelling:false,dwellProgress:0};
    const u = t-l.at;
    if(l.dwell) return {distance:l.start,speed:0,dwelling:true,dwellProgress:u/l.duration};
    const accel = l.peak / l.ramp;
    const brakeAt=l.duration-l.ramp;
    const distance = u < l.ramp ? .5*accel*u*u : u > brakeAt ? l.end-l.start-.5*accel*(l.duration-u)**2 : .5*l.peak*l.ramp+l.peak*(u-l.ramp);
    const speed = u < l.ramp ? accel*u : u > brakeAt ? Math.max(0,accel*(l.duration-u)) : l.peak;
    return {distance:l.start+distance,speed,dwelling:false,dwellProgress:0};
  }
}
