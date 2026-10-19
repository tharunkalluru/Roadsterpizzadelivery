#!/usr/bin/env node
/** Deterministic full-network inventory. Preserves authored evidence; never upgrades review status. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeStreetSurvey, validateStreetSurvey } from '../src/world/streetSurvey.ts';
import { unproject } from './lib/geo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = path.join(root, 'public/world/hyd-metro/v2');
const out = path.join(root, 'public/research');
const core = JSON.parse(fs.readFileSync(path.join(world, 'core.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(world, 'manifest.json'), 'utf8'));
const surveyFile = path.join(out, 'street-survey.json');
const check = process.argv.includes('--check');
const previous = fs.existsSync(surveyFile) ? JSON.parse(fs.readFileSync(surveyFile, 'utf8')) : null;
const previousRoads = new Map((previous?.roads ?? []).map((r) => [r.roadId, r]));
const roads = core.roads.slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
const data = previous ?? {
  schemaVersion: 1, revision: 1, worldId: manifest.worldId, worldVersion: manifest.version,
  generatedAt: '2026-10-17',
  referencePolicy: 'Survey factual street details from dated sources. Every playable road, both sides, remains unreviewed until measured evidence is recorded. Listing presence is not facade verification. Google imagery is reference only and must not be distributed as game textures. The map must expose gaps rather than imply complete reconstruction.',
  sources: [{
    id: 'sv-habsiguda-2026-01-prior', kind: 'street_view', title: 'Habsiguda — prior conversation observation point',
    url: 'https://www.google.com/maps/@?api=1&map_action=pano&pano=6InygWDOscgijOwrtOzQCw',
    captureDate: '2026-01', observedDate: '2026-10-17', reviewer: 'prior-conversation-reference',
    position: { lat: 17.4194797, lon: 78.5410293, panoId: '6InygWDOscgijOwrtOzQCw' },
    notes: 'Inherited reference to a previously inspected panorama. Records an observation point only. It does not establish any exact shop entrance, facade, floor, frontage order or reviewed road length. Recheck in Chrome before authoring geometry.',
    assetPolicy: 'reference_only',
  }],
  observations: [], storefrontOverrides: [], suppressions: [], corrections: [],
  roads: [],
};
data.roads = roads.map((r) => previousRoads.get(r.id) ?? { roadId: r.id, left: { status: 'unreviewed' }, right: { status: 'unreviewed' } });
const missingIds = [...previousRoads.keys()].filter((id) => !roads.some((r) => r.id === id));
if (missingIds.length) throw new Error(`Source world removed ${missingIds.length} reviewed IDs. Reconcile these manually before regenerating: ${missingIds.slice(0, 10).join(', ')}`);
const validation = validateStreetSurvey(data, core, { worldId: manifest.worldId, worldVersion: manifest.version });
if (validation.errors.length) { console.error(JSON.stringify(validation, null, 2)); process.exit(1); }
const summary = summarizeStreetSurvey(data, core);
const rounded = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v]));
const inventory = {
  schemaVersion: 1, worldId: manifest.worldId, worldVersion: manifest.version,
  sideConvention: 'left/right relative to road.points order; heading is road-forward bearing clockwise from north',
  columns: ['roadId', 'name', 'lengthM', 'latitude', 'longitude', 'headingDeg', 'leftStatus', 'rightStatus'],
  roads: roads.map((r) => {
    const target = r.lengthM / 2;
    let accumulated = 0, x = r.points[0][0], z = r.points[0][1], heading = 0;
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (accumulated + len >= target || i === r.points.length - 1) {
        const t = len ? Math.min(1, Math.max(0, (target - accumulated) / len)) : 0;
        x = a[0] + (b[0] - a[0]) * t; z = a[1] + (b[1] - a[1]) * t;
        heading = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI + 360) % 360;
        break;
      }
      accumulated += len;
    }
    const [lat, lon] = unproject(x, z), review = data.roads.find((s) => s.roadId === r.id);
    return [r.id, r.name, r.lengthM, +lat.toFixed(7), +lon.toFixed(7), +heading.toFixed(1), review.left.status, review.right.status];
  }),
};
const outputs = [
  [surveyFile, JSON.stringify(data) + '\n'],
  [path.join(out, 'street-survey-summary.json'), JSON.stringify({ schemaVersion: 1, revision: data.revision, worldId: data.worldId, worldVersion: data.worldVersion, generatedAt: data.generatedAt, ...rounded }, null, 2) + '\n'],
  [path.join(out, 'survey-network.json'), JSON.stringify(inventory) + '\n'],
];
fs.mkdirSync(out, { recursive: true });
let stale = false;
for (const [file, content] of outputs) {
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) { console.error(`${path.relative(root, file)} is out of date`); stale = true; } }
  else fs.writeFileSync(file, content);
}
console.log(JSON.stringify({ result: stale ? 'stale' : 'ok', mode: check ? 'check' : 'write', ...rounded, warnings: validation.warnings }, null, 2));
if (stale) process.exit(1);
