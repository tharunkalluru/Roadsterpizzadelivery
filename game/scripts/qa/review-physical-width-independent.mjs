import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url)), output = process.argv[2];
if (!output) throw Error('Supply a new review receipt path.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), inputs = {};
async function held(file, expected) { const bytes = await readFile(file), h = sha(bytes); if (expected && h !== expected) throw Error(`Input SHA mismatch: ${file}`); inputs[file] = h; return bytes; }
const workerPath = resolve(root, 'docs/qa/evidence/reported-roads/physical-width-worker-independent-9413-20261103-v2.json');
const worker = JSON.parse(await held(workerPath, '8d307b84b9cd5bb8f9fb48b95e0f43a9bfe3eb3fbcca4445371cd6ba9884925b'));
for (const [file, expected] of Object.entries(worker.beforeAfterUnchangedInputs)) await held(file, expected);
const baselinePath = Object.keys(inputs).find(p => /\/baseline21-1bed9d3/.test(p));
const jointPath = Object.keys(inputs).find(p => /\/jointInputBaseline21-e866b9/.test(p));
const baseline = JSON.parse(await held(baselinePath)), joint = JSON.parse(await held(jointPath));
const targets = new Map(joint.tileRoads.map(e => [e.id, e])), transports = new Map(joint.transports.map(e => [e.id, e]));
for (const row of baseline.roads) {
  const actual = worker.rows.find(r => r.id === row.id), target = targets.get(row.id), transport = transports.get(row.id);
  assert.equal(actual.sourceWidth, row.expected.w); assert.equal(actual.lanes, row.expected.lanes); assert.equal(actual.oneway, row.expected.oneway);
  assert.deepEqual(target.pts, row.historicalRoad.pts); assert.deepEqual(target.elev, row.historicalRoad.elev);
  assert.deepEqual(transport.expected, row.expected); assert.deepEqual(transport.sourceXY, target.pts);
  const arc = [0]; for (let i = 1; i < target.pts.length; i++) arc.push(arc[i - 1] + Math.hypot(target.pts[i][0] - target.pts[i - 1][0], target.pts[i][1] - target.pts[i - 1][1]));
  assert.deepEqual(transport.sourceArc, arc);
}
for (const file of ['tests/v21-fixes/physical-width-independent.test.ts', 'scripts/test-v21-fixes.mjs', 'src/world/road-source-stage-manifest.json', 'package-lock.json']) await held(resolve(root, file));
await held(fileURLToPath(import.meta.url));
const run = promisify(execFile), checks = [];
for (const [label, command, args] of [['focused-unit', process.execPath, ['scripts/test-v21-fixes.mjs', 'physical-width-independent']], ['typecheck', 'npm', ['run', 'typecheck']]]) {
  let code = 0, stdout = '', stderr = '';
  try { ({ stdout, stderr } = await run(command, args, { cwd: root, maxBuffer: 8 * 1024 * 1024 })); }
  catch (error) { code = error.code; stdout = error.stdout; stderr = error.stderr; }
  const path = resolve(output + `.${label}.log`); await writeFile(path, stdout + stderr, { flag: 'wx' });
  checks.push({ label, command: [command, ...args], exitCode: code, log: { path, sha256: sha(await readFile(path)) } });
}
const manifests = {};
for (const file of ['src/world/road-source-stage-manifest.json', 'src/world/road-profile-cache-manifest.json', 'src/world/road-profile-corrections.json']) {
  const value = JSON.parse(await held(resolve(root, file))); manifests[file] = { enabled: value.enabled ?? null, hasGeometry: !!value.geometry, hasTileProfiles: !!value.tileProfiles?.length };
}
for (const [file, expected] of Object.entries(inputs)) if (sha(await readFile(file)) !== expected) throw Error(`Source changed during independent verification: ${file}`);
const pass = worker.pass && checks.every(c => c.exitCode === 0) && !manifests['src/world/road-source-stage-manifest.json'].enabled && !manifests['src/world/road-profile-cache-manifest.json'].enabled && !manifests['src/world/road-profile-corrections.json'].hasGeometry;
const report = { version: 1, scope: 'Scoped physicalWidth21 metadata/consumer review only; no feasible final profile or release acceptance', pass, releaseApproved: false, sourceCapacityAndCoarseControlBindings: { roads: baseline.roads.length, exactRawWidthsLanesOneway: true, exactHistoricalCoarseXYZ: true, exactSourceXYAndCumulativeArc: true }, checks, manifests, worker: { path: workerPath, sha256: inputs[workerPath], summary: worker.summary },
  defectFoundAndCorrected: { original: 'New literal-baseline joinedPavement profiles shifted historical narrow one-way bus lanes0m to1.2m on3 actual roads.', ids: ['a7d70aad-dd0_0', 'c5a4de33-6f9_0', 'dbb99bac-943_0'], fixOwner: 'Root', fix: 'Explicit physicalWidth without usableLanes uses original source lane rule; absent physicalWidth and explicit capacity profiles retain prior branch arithmetic.', negativeLog: 'docs/qa/evidence/reported-roads/physical-width-independent-bus-lane-negative-9413-20261103.log', verified: true },
  remaining: { offOwnPavementShoulderPoses: worker.summary.graphOutsideOwnRibbon, roads: worker.outsideByRoad, status: 'Open finite-shape controls, not accepted support; exact historical strip parity does not make these driveable.', globalFinalGates: worker.gatesOpen, producerOnlyCoreLRReceipt: 'The held producer reports52411 core L/R unchanged; this scoped independent review checks the absent-field scalar oracle and held model/source binding, not a new full-core emission export.' },
  beforeAfterUnchangedInputs: inputs };
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, sha256: sha(await readFile(output)), pass, focusedChecks: 8, unchangedInputs: Object.keys(inputs).length, workerSummary: worker.summary }));
process.exitCode = pass ? 0 : 1;
