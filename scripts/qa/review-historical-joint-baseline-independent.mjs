import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';

// Independent, read-only evidence review. This never rebuilds geometry, accepts
// an unmatched surface, changes a source profile, or substitutes an analytic cap.
const root = resolve(new URL('../../', import.meta.url).pathname);
const historical = '/tmp/road-historical-joint-487-tile-806-context-505-core-9413-v3.json';
const joint = '/tmp/source-9413-joint-tile-input-1f989-v2.json';
const candidate = '/tmp/roadster-road-freezes/source-9413-width-union-v1/manifest-43ec75a86c41175368f1d7404a6fa0f0ef4b03c82b71067a4d7796915ba6ab04.json';
const output = process.argv[2];
if (!output) throw Error('Provide a new output receipt path.');
const sha = b => createHash('sha256').update(b).digest('hex');
const bindings = new Map();
async function held(path, expected) {
  const b = await readFile(path), actual = sha(b);
  if (expected && expected !== actual) throw Error(`Input SHA mismatch: ${path}`);
  bindings.set(path, actual); return b;
}
await held(resolve(new URL(import.meta.url).pathname));
const h = JSON.parse(await held(historical, 'd746a980fcb73574f5759f779e487b68f7dac54794edaabd33f35ef6562ebd90'));
const j = JSON.parse(await held(joint, '740221cfb0d110ca1e4b5c9ead78d200ffa83f672c08c876470cdb074ffed7e6'));
const m = JSON.parse(await held(candidate, '43ec75a86c41175368f1d7404a6fa0f0ef4b03c82b71067a4d7796915ba6ab04'));
const cm = JSON.parse(await held(m.model.path, m.model.sha256));
const problems = [], checks = [];
const check = (name, ok, detail = undefined) => { checks.push({ name, pass: !!ok, detail }); if (!ok) problems.push(name); };
for (const [path, expected] of Object.entries(h.inputs)) await held(path, expected);
await held(resolve(root, h.observer.path), h.observer.sha256);
const revision = 'a679b72bacefb751057f0282a86571e8e6ef006d';
check('Exact accepted historical revision and no release approval', h.revision === revision && h.releaseApproved === false);
for (const [path, expected] of Object.entries(h.sourceFiles)) {
  const bytes = execFileSync('git', ['show', `${revision}:${path}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (sha(bytes) !== expected) problems.push(`Historical imported source SHA: ${path}`);
}
check('All imported historical modules equal literal accepted Git source', !problems.length, { modules: Object.keys(h.sourceFiles).length });
const selectors = [...h.requestedRoadIDs, ...h.includedCoreRoadIDs, ...h.contextRoadIDs], selected = new Set(selectors);
const roads = new Map(h.roads.map(e => [e.id, e])), triangles = new Set(h.triangles.map(t => t.road));
check('Selectors are distinct and match coverage selector', selected.size === selectors.length && JSON.stringify([...selected].sort()) === JSON.stringify(h.coverageRegion.selectedIDs));
check('Every selected and boundary ID has actual physical road and triangles', [...selected, ...j.boundaryRoads.map(e => e.id)].every(id => roads.has(id) && triangles.has(id)), { selected: selected.size, boundary: j.boundaryRoads.length });
check('No physical record is triangle-empty', h.roads.every(e => triangles.has(e.id)));
for (const field of ['unmatched', 'inputDisagreements', 'footprintVariants', 'requestedNotRendered', 'contextNotRendered', 'includedCoreNotRendered', 'includedCoreWithoutRawTileCopy']) check(`Explicit empty ${field}`, Array.isArray(h[field]) && !h[field].length);
const raw = new Map(), packs = new Map(), tree = execFileSync('git', ['ls-tree', '-r', revision, '--', 'public/city', 'package-lock.json'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const blobs = new Map(tree.trim().split('\n').map(line => { const match = /^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line); if (!match) throw Error('Unexpected Git tree'); return [match[2], match[1]]; }));
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
let rawCopies = 0;
for (const [path, expected] of Object.entries(h.scannedSourceSHA256)) {
  const bytes = await held(resolve(root, path), expected);
  if (blob(bytes) !== blobs.get(path)) problems.push(`Raw source differs from historical Git blob: ${path}`);
  if (path.endsWith('core.pack.wasm')) continue;
  const pack = JSON.parse(gunzipSync(bytes));
  for (const [tile, data] of Object.entries(pack.tiles)) for (let i = 0; i < data.roads.length; i++) {
    const e = data.roads[i];
    if (selected.has(e.id)) rawCopies++;
    if (roads.has(e.id) || selected.has(e.id) || h.derivations.some(d => d.sourceRoadID === e.id)) {
      const prior = raw.get(e.id); if (!prior || !e.ctx) raw.set(e.id, e);
      packs.set(`${path.slice('public/city/'.length)}/${tile}/${i}`, e);
    }
  }
}
check('Raw Git-bound selected-copy census is exact', rawCopies === h.rawRequestedCopies.length, { rawCopies });
check('Dependency lock equals accepted Git blob', blob(await held(resolve(root, 'package-lock.json'))) === blobs.get('package-lock.json'));
const fp = new Map(h.physicalFootprints.map(f => [f.id, f]));
const physical = e => ({ pts: e.pts, elev: e.elev ?? null, w: e.w, from: e.from ?? null, to: e.to ?? null, oneway: e.oneway ?? null });
check('Physical copies and footprints bind exact exported owners', h.copies.every(c => sha(JSON.stringify(physical(roads.get(c.id)))) === c.physicalSHA256 && sha(JSON.stringify(fp.get(c.id))) === c.footprintSHA256));
const hm = JSON.parse(await held(Object.keys(h.inputs).find(path => /model-f6c089/.test(path))));
const historicalCore = new Map(hm.roads.map(e => [e.id, e]));
const cells = new Set(), cell = h.coverageRegion.cellSizeM;
for (const id of selected) {
  const e = historicalCore.get(id) || raw.get(id); if (!e) throw Error(`Region road missing ${id}`);
  const margin = Math.max(e.w, e.sceneryWidth || 0) / 2 + h.coverageRegion.auxiliaryAllowanceM + h.coverageRegion.paddingM;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i];
    for (let x = Math.floor((Math.min(a[0], b[0]) - margin) / cell); x <= Math.floor((Math.max(a[0], b[0]) + margin) / cell); x++)
      for (let z = Math.floor((Math.min(a[1], b[1]) - margin) / cell); z <= Math.floor((Math.max(a[1], b[1]) + margin) / cell); z++) cells.add(`${x},${z}`);
  }
}
const intersects = ps => {
  const xs = ps.map(p => p[0]), zs = ps.map(p => p[2]);
  for (let x = Math.floor(Math.min(...xs) / cell); x <= Math.floor(Math.max(...xs) / cell); x++)
    for (let z = Math.floor(Math.min(...zs) / cell); z <= Math.floor(Math.max(...zs) / cell); z++) if (cells.has(`${x},${z}`)) return true;
  return false;
};
check('Independently rebuilt full-path ROI cell census matches', cells.size === h.coverageRegion.cells, { cells: cells.size });
check('All outside-region unknowns remain outside ROI', h.outsideRegionUnmatched.every(t => !intersects(t.points)), { unresolvedOutsideROI: h.outsideRegionUnmatched.length });
check('Every unselected retained actual triangle intersects ROI', h.triangles.every(t => selected.has(t.road) || intersects(t.points)));
const candidateByID = new Map([...cm.roads, ...j.tileRoads, ...j.contextRoads, ...j.boundaryRoads].map(e => [e.id, e]));
const escaped = [];
for (const id of selected) {
  const e = candidateByID.get(id); if (!e) { escaped.push({ id, missing: true }); continue; }
  for (const p of e.pts) if (!cells.has(`${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`)) { escaped.push({ id, p }); break; }
}
check('Every current held candidate selected path stays within old ROI', escaped.length === 0, { escaped: escaped.slice(0, 8) });
let invalidTriangles = 0, invalidSourceIntervals = 0;
const segments = new Map(h.roads.map(e => [e.id, new Set(e.pts.slice(1).map((p, i) => JSON.stringify([e.pts[i], p])))]));
for (const t of h.triangles) {
  if (!roads.has(t.road) || t.points.length !== 3 || t.points.some(p => p.length !== 3 || p.some(v => !Number.isFinite(v) || !Object.is(v, Math.fround(v)))) || !segments.get(t.road).has(JSON.stringify(t.centre))) invalidTriangles++;
  if (t.arc.length !== 2 || !t.arc.every(Number.isFinite) || t.arc[1] < t.arc[0] - .15) invalidSourceIntervals++;
}
check('All retained triangle coordinates are literal finite Float32 with exact own segment centres', invalidTriangles === 0, { triangles: h.triangles.length, invalidTriangles });
check('No retained legacy source intervals are nonfinite or silently reversed', invalidSourceIntervals === 0, { invalidSourceIntervals });
const sourceIntervals = new Map();
for (const t of h.triangles) sourceIntervals.set(`${t.road}/${JSON.stringify(t.centre)}/${t.arc}`, t);
let unboundSourceIntervals = 0, maxSourceResidualM = 0;
function rawAt(e, s) {
  let consumed = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= consumed + length + 1e-8 && s >= consumed - 1e-8) { const u = length ? (s - consumed) / length : 0; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
    consumed += length;
  }
}
for (const t of sourceIntervals.values()) {
  const e = raw.get(t.road); if (!e) { unboundSourceIntervals++; continue; }
  for (let k = 0; k < 2; k++) {
    const p = rawAt(e, t.arc[k]); if (!p) { unboundSourceIntervals++; continue; }
    const residual = Math.hypot(p[0] - t.centre[k][0], p[1] - t.centre[k][1]);
    maxSourceResidualM = Math.max(maxSourceResidualM, residual); if (residual > .15 + 1e-8) unboundSourceIntervals++;
  }
}
check('Every retained historical interval reconstructs its exact raw source segment without suffix aliasing', unboundSourceIntervals === 0, { uniqueIntervals: sourceIntervals.size, maxSourceResidualM, unboundSourceIntervals });
let invalidDerivations = 0;
for (const d of h.derivations) {
  const owner = packs.get(`${d.rawOwner.pack}/${d.rawOwner.tile}/${d.rawOwner.roadIndex}`);
  if (!owner || owner.id !== d.sourceRoadID || sha(JSON.stringify(owner)) !== d.rawOwner.rawSHA256 || d.fragmentPoints.length !== d.fragmentLegacyArc.length) { invalidDerivations++; continue; }
  let at = 0;
  for (let i = 0; i < d.fragmentPoints.length; i++) {
    const s = d.fragmentLegacyArc[i]; let consumed = 0, point;
    for (let k = 1; k < owner.pts.length; k++) { const a = owner.pts[k - 1], b = owner.pts[k], length = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= consumed + length + 1e-9) { const u = length ? (s - consumed) / length : 0; point = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; break; } consumed += length; }
    if (!point || s < at - .15 || Math.hypot(point[0] - d.fragmentPoints[i][0], point[1] - d.fragmentPoints[i][1]) > .15) invalidDerivations++;
    at = s;
  }
}
const derivedIDs = [...new Set(h.derivations.map(d => d.actualRoadID))];
check('Every stadium trace binds exact parent owner and immutable raw arc', invalidDerivations === 0, { derivations: h.derivations.length, uniqueIDs: derivedIDs.length, invalidDerivations });
check('Stadium fragments are metadata-only outside this retained ROI', derivedIDs.every(id => !roads.has(id) && !triangles.has(id)));
const pieces = h.derivations.filter(d => d.sourceRoadID === 'b74ec454-8b3_0' && d.rawOwner.context === false).map(d => ({ id: d.actualRoadID, arc: [d.fragmentLegacyArc[0], d.fragmentLegacyArc.at(-1)] }));
check('Known stadium excision preserves two disjoint source intervals', pieces.some(p => p.id.endsWith(':stadium:1') && p.arc[0] > 200) && pieces.some(p => !p.id.includes(':stadium:') && p.arc[1] < 30), { pieces });
for (const [path, expected] of bindings) if (sha(await readFile(path)) !== expected) throw Error(`Input changed during review: ${path}`);
const report = { schemaVersion: 1, kind: 'bounded independent historical joint baseline source/schema/ROI review', releaseApproved: false,
  pass: problems.length === 0, checks, problems, beforeAfterUnchangedInputs: Object.fromEntries(bindings),
  summary: { selected: selected.size, boundary: j.boundaryRoads.length, roads: roads.size, triangles: h.triangles.length, importedHistoricalModules: Object.keys(h.sourceFiles).length, builtTiles: h.summary.builtTiles, retainedROIOnly: true, outsideROIUnmatchedNotAccepted: h.outsideRegionUnmatched.length },
  limits: ['No second 620-tile emission replay in this bounded review; literal-emission origin is supported by reviewed strict historical exporter and its retained source receipts.', 'All 3D, full-body, headroom, source-node co-elevation, final changed-tile inventory, cache/reuse/worker and native final-model acceptance gates remain open.', 'Future derived fragments must carry explicit immutable parent raw arcs; never strip stadium suffixes or interpolate across the removed source interval.', 'The exporter arc() nearest monotonic projection is not a general loop-ambiguity proof. This reviewed ROI contains none of its 13 derived fragment IDs.', 'Generic unionPhysicalRoads does not currently gate contextNotRendered; this artifact explicitly has zero. A future artifact must be validated with the stronger context coverage check before solver use.', 'The current cross-road finite oracle skips identical road IDs. A separate own-source local-fold/remote-self-crossing headroom gate is required before final geometry acceptance.'] };
await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output: resolve(output), sha256: sha(await readFile(resolve(output))), pass: report.pass, checks: checks.length, problems, summary: report.summary }));
process.exitCode = report.pass ? 0 : 1;
