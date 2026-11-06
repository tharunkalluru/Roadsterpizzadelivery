import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { suites } = JSON.parse(readFileSync(resolve(root, 'tests/legacy/suites.json'), 'utf8'));
let failures = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [resolve(root, 'tests/legacy', suite)], { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
  if (result.status === 0) console.log('PASS legacy ' + suite);
  else { failures++; console.error('FAIL legacy ' + suite + '\n' + result.stdout + result.stderr); }
}
console.log(`${suites.length - failures}/${suites.length} portable legacy suites passed`);
process.exitCode = failures ? 1 : 0;
