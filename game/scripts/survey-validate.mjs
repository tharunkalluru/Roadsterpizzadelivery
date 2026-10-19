#!/usr/bin/env node
/** Full-world proof checks include all real building/storefront/chunk IDs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStreetSurvey } from '../src/world/streetSurvey.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const world = path.join(root, 'public/world/hyd-metro/v2');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const manifest = read(path.join(world, 'manifest.json'));
const core = read(path.join(world, manifest.core.file));
const chunks = manifest.chunks.map((c) => read(path.join(world, c.file)));
const data = read(path.join(root, 'public/research/street-survey.json'));
const result = validateStreetSurvey(data, core, { worldId: manifest.worldId, worldVersion: manifest.version, chunks });
console.log(JSON.stringify({ result: result.errors.length ? 'failed' : 'passed', ...result }, null, 2));
process.exitCode = result.errors.length ? 1 : 0;
