#!/usr/bin/env node
/** Locked and atomic single-writer import; research agents author independent JSON batches. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestStreetSurveyBatch } from '../src/world/streetSurveyBatch.ts';
import { validateStreetSurvey } from '../src/world/streetSurvey.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'public/research/street-survey.json'), lock = file + '.lock';
const input = process.argv.slice(2).find((v) => !v.startsWith('--'));
if (!input) throw new Error('Usage: node --experimental-strip-types scripts/survey-import-batch.mjs data/research/batches/<block>.json [--check]');
const batch = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
const check = process.argv.includes('--check');
let fd;
try {
  fd = fs.openSync(lock, 'wx');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const world = path.join(root, 'public/world/hyd-metro/v2');
  const core = JSON.parse(fs.readFileSync(path.join(world, 'core.json')));
  const chunks = fs.readdirSync(path.join(world, 'chunks')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(world, 'chunks', f))));
  const result = await ingestStreetSurveyBatch(data, batch, core, validateStreetSurvey, { worldId: data.worldId, worldVersion: data.worldVersion, chunks });
  if (result.changed && !check) { fs.writeFileSync(file + '.tmp', JSON.stringify(result.data) + '\n'); fs.renameSync(file + '.tmp', file); }
  console.log(JSON.stringify({ result: check ? 'validated_preview' : result.changed ? 'imported' : 'already_applied', batchId: batch.id, revision: result.data.revision, contentHash: result.hash }, null, 2));
} finally { if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(lock); } }
