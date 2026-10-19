#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStreetWorkQueue } from '../src/world/streetSurveyQueue.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = JSON.parse(fs.readFileSync(path.join(root, 'public/world/hyd-metro/v2/core.json')));
const survey = JSON.parse(fs.readFileSync(path.join(root, 'public/research/street-survey.json')));
const queue = buildStreetWorkQueue(core, survey);
const check = process.argv.includes('--check');
for (const [name, data] of [['survey-work-queue.json', queue], ['survey-work-queue-summary.json', { schemaVersion: queue.schemaVersion, revision: queue.revision, ...queue.summary, disclaimer: queue.disclaimer }]]) {
  const file = path.join(root, 'public/research', name), content = JSON.stringify(data) + '\n';
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) throw new Error(`${name} is stale`); }
  else { fs.writeFileSync(file + '.tmp', content); fs.renameSync(file + '.tmp', file); }
}
console.log(JSON.stringify({ result: 'ok', mode: check ? 'check' : 'write', ...queue.summary }, null, 2));
