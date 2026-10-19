import fs from 'node:fs';
import crypto from 'node:crypto';
import { SourceAccuracyLayer } from '../src/world/sourceAccuracy.ts';
import { StreetSurvey } from '../src/world/streetSurvey.ts';
import { buildingAccessPlan } from '../src/world/buildingAccess.ts';
import { RoadIndex } from '../src/world/roadIndex.ts';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const base = 'public/world/hyd-metro/v2/', manifest = read(base + 'manifest.json');
const rawCore = read(base + manifest.core.file), source = read(base + manifest.sourceAccuracy.file);
const data = read('public/research/street-survey.json'), layer = new SourceAccuracyLayer(source);
const survey = new StreetSurvey(data, rawCore), core = survey.applyCoreCorrections(layer.applyCore(rawCore)), roads = new RoadIndex(core);
const bases = {}, statuses = {}, profiles = [], rawParents = new Set(), reclaimed = new Set();
let chunksMatch = true, originals = 0, components = 0, visible = 0, authoredOnReconciled = 0, unsupported = 0;
for (const record of manifest.chunks) {
  const bytes = fs.readFileSync(base + record.file); chunksMatch &&= sha(bytes) === record.sha256;
  const raw = JSON.parse(bytes), chunk = survey.applyChunk(layer.applyChunk(raw));
  for (const b of raw.buildings) {
    rawParents.add(b.id);
  }
  for (const b of chunk.buildings) {
    if (b.geometryReconciliation?.parentBuildingId) reclaimed.add(b.geometryReconciliation.parentBuildingId);
    components++; if (!b.intrudesCarriageway) visible++;
    if (rawParents.has(b.id)) { originals++; bases[b.heightBasis] = (bases[b.heightBasis] ?? 0) + 1; statuses[b.heightStatus] = (statuses[b.heightStatus] ?? 0) + 1; }
    if (b.researchedProfile || b.surveyStyle) {
      const plan = buildingAccessPlan(b, chunk.storefronts.filter(f => f.buildingId === b.id), roads);
      profiles.push({ id: b.id, boxes: plan.boxes.length, beams: plan.beams.length, pits: plan.pits.length, recesses: plan.recesses.length, planSha256: sha(JSON.stringify(plan)) });
    }
  }
  for (const sf of chunk.storefronts) if (sf.buildingId && reclaimed.has(sf.buildingId)) {
    if (sf.placeId.startsWith('survey:')) authoredOnReconciled++;
    else if (sf.placement?.display === 'facade') unsupported++;
  }
}
const result = { surveyRevision: data.revision, chunks: manifest.chunks.length, chunksMatch, coreMatches: sha(fs.readFileSync(base + manifest.core.file)) === manifest.core.sha256,
  sourceMatches: sha(fs.readFileSync(base + manifest.sourceAccuracy.file)) === manifest.sourceAccuracy.sha256,
  originals, components, visible, actuallyReconciledParents: reclaimed.size, afterManual: bases, statusAfterManual: statuses, authoredOnReconciledParents: authoredOnReconciled, unsupportedPlaquesOnRestoredBodies: unsupported,
  profiles, surveySha256: sha(fs.readFileSync('public/research/street-survey.json')), correctionsByKind: Object.fromEntries([...new Set(data.corrections.map(c => c.kind))].map(k => [k, data.corrections.filter(c => c.kind === k).length])) };
fs.writeFileSync('work/current-data-ledger-counts.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, profiles: result.profiles.length }, null, 2));
