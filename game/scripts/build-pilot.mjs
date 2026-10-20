import { readFile, copyFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(await readFile(new URL('../config/pilot-release.json', import.meta.url), 'utf8'));
const survey = await readFile(new URL('../public/research/street-survey.json', import.meta.url));
if (createHash('sha256').update(survey).digest('hex') !== release.surveySha256) throw new Error('Pilot build: pinned survey changed');
if (process.argv.includes('--release') && (release.status !== 'qualified' || !release.zone)) throw new Error('Pilot release blocked: no qualified zone. Development build only.');
for (const args of [['node_modules/typescript/bin/tsc', '--noEmit'], ['node_modules/vite/bin/vite.js', 'build']]) {
  const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ROADSTER_PILOT_ONLY: '1' }, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// The separate Site root must NEVER boot the unrestricted main application.
await copyFile(new URL('../dist/pilot.html', import.meta.url), new URL('../dist/index.html', import.meta.url));
// No inherited offline entry can serve a stale unrestricted application.
await rm(new URL('../dist/sw.js', import.meta.url), { force: true });
console.log(JSON.stringify({ pilotOnly: true, root: 'dist/index.html', release: release.status, published: false }));
