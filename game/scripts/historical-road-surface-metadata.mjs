// Metadata only: geometry is supplied by the strict historical City Surface.
// These helpers never infer a paint film from a road class or a cap flag.
export function literalHistoricalSurfaceMetadata(surface, sourceRoad, sourceArc) {
  const e = surface.e, i = surface.i, q = surface.roadQuad;
  if (!e || !Number.isInteger(i) || i < 0 || i >= e.pts.length - 1 ||
      typeof sourceRoad !== 'string' || !sourceRoad ||
      !Array.isArray(sourceArc) || sourceArc.length !== 2 || !sourceArc.every(Number.isFinite) ||
      !Number.isFinite(surface.paintLift) || !Array.isArray(q) || q.length !== 4 ||
      q.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))) {
    throw Error('Historical triangle requires a literal finite Surface lift, quad and source branch.');
  }
  return {
    paintLift: surface.paintLift,
    structuralQuad: q.map(p => [...p]),
    road: e.id,
    segment: i,
    sourceRoad,
    sourceArc: [...sourceArc],
    centre: [[...e.pts[i]], [...e.pts[i + 1]]],
  };
}

export function legacyHistoricalTriangle(record) {
  const { actualSurface, actualSurfaceBindings, ...legacy } = record;
  return legacy;
}

// Called for EVERY match, before duplicate removal. Equivalent owner/context
// origins may share one token; a different literal datum remains explicit.
export function appendHistoricalSurfaceRecord(registry, triangles, token, legacy, metadata) {
  const old = registry.get(token);
  if (old === undefined) {
    registry.set(token, triangles.length);
    triangles.push({ ...legacy, actualSurface: metadata });
    return { duplicate: false, distinctBinding: false };
  }
  const record = triangles[old], key = JSON.stringify(metadata);
  if (JSON.stringify(record.actualSurface) === key || record.actualSurfaceBindings?.some(b => JSON.stringify(b) === key)) {
    return { duplicate: true, distinctBinding: false };
  }
  (record.actualSurfaceBindings ??= [record.actualSurface]).push(metadata);
  return { duplicate: true, distinctBinding: true };
}

export function assertHistoricalMetadataParity(parent, replay) {
  const ignored = new Set(['inputs', 'generatorSHA256']);
  for (const key of new Set([...Object.keys(parent), ...Object.keys(replay)])) {
    if (ignored.has(key)) continue;
    const value = key === 'triangles' ? replay.triangles.map(legacyHistoricalTriangle) : replay[key];
    if (JSON.stringify(parent[key]) !== JSON.stringify(value)) throw Error(`Historical metadata replay changed legacy field: ${key}`);
  }
  return { fields: Object.keys(parent).filter(key => !ignored.has(key)).length,
    triangles: parent.triangles.length, roads: parent.roads.length,
    footprints: parent.physicalFootprints.length, copies: parent.copies.length,
    tiles: parent.summary.builtTiles };
}
