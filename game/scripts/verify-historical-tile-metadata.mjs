import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
if (args.length !== 3) throw Error('Usage: node scripts/verify-historical-tile-metadata.mjs PARENT NEW_METADATA_FILE NEW_RECEIPT');
const [parentPath, metadataPath, receiptPath] = args.map(p => resolve(p));
const hash = b => createHash('sha256').update(b).digest('hex');
const parentBytes = await readFile(parentPath), metadataBytes = await readFile(metadataPath);
const parent = JSON.parse(parentBytes), output = JSON.parse(metadataBytes);
assert.equal(output.sourceHistoricalTileModelSHA256, hash(parentBytes));
const { sourceHistoricalTileModelSHA256, metadataExport, ...legacy } = output;
legacy.triangles = output.triangles.map(({ actualSurface, actualSurfaceBindings, ...t }) => t);
assert.deepEqual(legacy, parent, 'Every old field, record order and literal numeric coordinate must remain unchanged');
assert.equal(metadataExport.sourceHistoricalTileModelSHA256, hash(parentBytes));
const key = p => p.map(p => p.map(Math.fround).join(',')).sort().join('|');
const parentSource = new Map(parent.derivations.map(d => [d.actualRoadID, d.sourceRoadID]));
let bindings = 0, ambiguousTriangles = 0;
for (const t of output.triangles) {
  const surfaces = t.actualSurfaceBindings ?? [t.actualSurface];
  assert.ok(t.actualSurface && surfaces.length);
  if (t.actualSurfaceBindings) { ambiguousTriangles++; assert.deepEqual(surfaces[0], t.actualSurface); }
  const distinct = new Set();
  for (const s of surfaces) {
    bindings++;
    assert.ok(Number.isFinite(s.paintLift));
    assert.equal(s.structuralQuad.length, 4);
    assert.ok(s.structuralQuad.every(p => p.length === 3 && p.every(Number.isFinite)));
    assert.equal(s.road, t.road); assert.ok(Number.isInteger(s.segment) && s.segment >= 0);
    assert.equal(s.sourceRoad, parentSource.get(t.road) ?? t.road);
    assert.deepEqual(s.sourceArc, t.arc); assert.deepEqual(s.centre, t.centre);
    const q = s.structuralQuad, lifted = q.map(p => [p[0], p[1] + s.paintLift, p[2]]);
    assert.ok([[0, 1, 2], [0, 2, 3]].some(indices => key(indices.map(i => lifted[i])) === key(t.points)),
      'Each literal structural binding and film must reproduce its emitted Float32 triangle');
    distinct.add(JSON.stringify(s));
  }
  assert.equal(distinct.size, surfaces.length);
}
assert.equal(metadataExport.actualSurfaceRecords, output.triangles.length);
assert.equal(metadataExport.metadataSHA256, hash(JSON.stringify(output.triangles.map(t => ({ actualSurface: t.actualSurface, actualSurfaceBindings: t.actualSurfaceBindings })))));
assert.equal(metadataExport.ambiguousTriangleIndices.length, ambiguousTriangles);
assert.equal(metadataExport.distinctSurfaceBindings, bindings - output.triangles.length);
assert.deepEqual(metadataExport.sourceFiles, parent.sourceFiles);
assert.deepEqual(metadataExport.observer, parent.observer);
for (const [path, expected] of Object.entries(metadataExport.inputs)) assert.equal(hash(await readFile(path)), expected, `Changed metadata export input: ${path}`);
assert.equal(hash(await readFile(parentPath)), hash(parentBytes));
assert.equal(hash(await readFile(metadataPath)), hash(metadataBytes));
const report = { schemaVersion: 1, parent: { path: parentPath, sha256: hash(parentBytes) }, metadata: { path: metadataPath, sha256: hash(metadataBytes) },
  summary: { legacyFieldsExact: true, triangles: output.triangles.length, bindings, ambiguousTriangles,
    roads: output.roads.length, footprints: output.physicalFootprints.length, tiles: output.summary.builtTiles,
    copies: output.copies.length, sourceFiles: Object.keys(output.sourceFiles).length,
    allMetadataReproducesLiteralFloat32Triangles: true, sourceInputsUnchanged: true }, releaseApproved: false };
await writeFile(receiptPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
process.exitCode = ambiguousTriangles ? 1 : 0;
