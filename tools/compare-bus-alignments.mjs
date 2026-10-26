// Record every changed inferred path without changing either source pack.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const [beforePath, afterPath, output] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Usage: node tools/compare-bus-alignments.mjs BEFORE AFTER [REPORT.json]');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const beforeBytes = await readFile(beforePath), afterBytes = await readFile(afterPath);
const before = JSON.parse(gunzipSync(beforeBytes)), after = JSON.parse(gunzipSync(afterBytes));
const identity = feed => feed.patterns.map(({ alignmentIds, ...pattern }) => pattern);
const pathHash = alignment => alignment?.steps ? hash(JSON.stringify(alignment.steps)) : null;
const changed = [];
for (const id of new Set([...Object.keys(before.alignments), ...Object.keys(after.alignments)])) {
  const a = before.alignments[id], b = after.alignments[id];
  const fromHash = pathHash(a), toHash = pathHash(b);
  if (a?.status === b?.status && fromHash === toHash && a?.reason === b?.reason) continue;
  changed.push({ id, fromStop:b?.fromStop || a?.fromStop, toStop:b?.toStop || a?.toStop,
    previousStatus:a?.status || 'absent', currentStatus:b?.status || 'absent',
    previousPathSha256:fromHash, currentPathSha256:toHash,
    previousLengthM:a?.lengthM ?? null, currentLengthM:b?.lengthM ?? null,
    reason:b?.reason || null });
}
const summary = {
  previousPackSha256:hash(beforeBytes), currentPackSha256:hash(afterBytes),
  publishedStopRecordsUnchanged:JSON.stringify(before.stops) === JSON.stringify(after.stops),
  publishedPatternIdentitiesAndOrderUnchanged:JSON.stringify(identity(before)) === JSON.stringify(identity(after)),
  changedAlignmentRecords:changed.length,
  newlyResolvedUnique:changed.filter(c => c.previousStatus !== 'inferred_legal_road_path' && c.currentStatus === 'inferred_legal_road_path').length,
  newlyUnresolvedUnique:changed.filter(c => c.previousStatus === 'inferred_legal_road_path' && c.currentStatus !== 'inferred_legal_road_path').length,
  changedAdmittedPaths:changed.filter(c => c.previousStatus === 'inferred_legal_road_path' && c.currentStatus === 'inferred_legal_road_path' && c.previousPathSha256 !== c.currentPathSha256).length,
};
if (!summary.publishedStopRecordsUnchanged || !summary.publishedPatternIdentitiesAndOrderUnchanged) throw new Error('Published stop records or route identities/order changed');
if (output) await writeFile(output, JSON.stringify({ schema:1, summary, changed }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
