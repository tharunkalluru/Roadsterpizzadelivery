/** Nearby simulation population, not a claim about city-wide vehicle counts.
 * Preserve quieter colonies and bounded mobile work while filling arterials.
 * Neither visual quality nor per-vehicle simulation cadence changes here. */
export function trafficPopulationLimit(lowQuality:boolean,shopActivity:number,roadActivity:number) {
  const finite=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
  const activity=Math.max(finite(shopActivity),finite(roadActivity));
  return Math.round(lowQuality?22+26*activity:34+52*activity);
}
