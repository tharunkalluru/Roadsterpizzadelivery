/** Endpoint inventory math. A match to one arm never clears a multi-level node. */
export function endpointLevels(roads, allowed = () => true) {
  const nodes = new Map();
  for (const e of roads) if (allowed(e.cls)) for (const [end, node, index] of [['from', e.from, 0], ['to', e.to, e.pts.length - 1]]) if (node) {
    const rows = nodes.get(node) || [];
    rows.push({id:e.id, end, y:e.elev?.[index] ?? 0, xz:e.pts[index]}); nodes.set(node, rows);
  }
  return nodes;
}
export function compareEndpointLevels(tileY, core, tolerance = .02) {
  const gaps = core.map(p => ({id:p.id, end:p.end, y:p.y, gap:Math.abs(p.y - tileY)}));
  const minimum = gaps.length ? Math.min(...gaps.map(p => p.gap)) : null;
  const maximum = gaps.length ? Math.max(...gaps.map(p => p.gap)) : null;
  const spread = core.length ? Math.max(...core.map(p => p.y)) - Math.min(...core.map(p => p.y)) : null;
  return {minimum, maximum, spread, gaps, matchesAnyCoreLevel:minimum !== null && minimum <= tolerance,
    matchesEveryCoreArm:maximum !== null && maximum <= tolerance, ambiguousCoreLevels:spread !== null && spread > tolerance};
}
export function summarizeNodeLevels(core, tiles, tolerance = .02) {
  const rows=[...core.map(p=>({...p,kind:'core'})),...tiles.map(p=>({...p,kind:'tile'}))];
  const spread=rows.length?Math.max(...rows.map(p=>p.y))-Math.min(...rows.map(p=>p.y)):null;
  let maxXZ=0;for(let i=0;i<rows.length;i++)for(let j=0;j<i;j++)maxXZ=Math.max(maxXZ,Math.hypot(rows[i].xz[0]-rows[j].xz[0],rows[i].xz[1]-rows[j].xz[1]));
  return {incidentRoads:new Set(rows.map(p=>p.id)).size, coreArms:core.length, tileArms:tiles.length, heightSpread:spread,
    maximumEndpointXZDisagreement:maxXZ, allIncidentArmsJoinWithin2cm:spread !== null && spread <= tolerance,
    requiresSurfaceClassification:spread !== null && spread > tolerance, classification:'unclassified-source-node-surface'};
}
