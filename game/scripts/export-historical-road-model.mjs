import { build, version as esbuildVersion } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = { commit: 'a679b72bacefb751057f0282a86571e8e6ef006d', stage: 'world' };
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i];
  if (name === '--help') {
    console.log('node scripts/export-historical-road-model.mjs [--commit SHA] [--stage grades|world] --output FILE [--footprints FILE] [--provenance FILE]');
    process.exit(0);
  }
  if (!['--commit', '--stage', '--output', '--footprints', '--provenance'].includes(name) || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option: ${name}`);
  options[name.slice(2)] = process.argv[++i];
}
if (!options.output || !['grades', 'world'].includes(options.stage)) throw new Error('--output and a valid --stage are required.');
const revision = execFileSync('git', ['rev-parse', '--verify', `${options.commit}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
const sourceBlob = execFileSync('git', ['rev-parse', `${revision}:public/city/core.pack.wasm`], { cwd: root, encoding: 'utf8' }).trim();
const currentBlob = execFileSync('git', ['hash-object', 'public/city/core.pack.wasm'], { cwd: root, encoding: 'utf8' }).trim();
if (sourceBlob !== currentBlob) throw new Error('The current core pack differs from the historical source; export refused.');
const output = resolve(options.output), footprints = options.footprints ? resolve(options.footprints) : null;
const provenancePath = resolve(options.provenance || `${output}.provenance.json`);
for (const path of [output, footprints, provenancePath].filter(Boolean)) mkdirSync(dirname(path), { recursive: true });
const bundle = join(mkdtempSync(join(tmpdir(), 'road-history-')), 'export.mjs');
const imported = {};
const entry = `
  import { readFileSync, writeFileSync } from 'node:fs';
  import { gunzipSync } from 'node:zlib';
  import { createHash } from 'node:crypto';
  import { prepareRoadGrades, roadGradeReport } from './src/world/road-grades';
  import { prepareRoadUnderpasses } from './src/world/road-underpasses';
  import { excludeStadiumRoads, stadiumExclusions } from './src/world/stadium-roads';
  import { planConstruction, applyConstructionRoads } from './src/world/construction';
  import { prepareRailwayTransport } from './src/world/railway-geometry';
  import { RAILWAY_UNDERPASS_EVIDENCE } from './src/world/railway-evidence';
  import { roadRibbon } from './src/world/bridge-clearance';
  const core = JSON.parse(gunzipSync(readFileSync(${JSON.stringify(join(root, 'public/city/core.pack.wasm'))})).toString());
  let roads = prepareRoadGrades(core.roads), payload;
  if (${JSON.stringify(options.stage)} === 'grades') payload = { roads, report: roadGradeReport(roads) };
  else {
    roads = prepareRoadUnderpasses(roads).roads;
    roads = excludeStadiumRoads(roads, stadiumExclusions(core.origin));
    const construction = planConstruction(roads, core.origin);
    roads = applyConstructionRoads(roads, construction);
    const transport = prepareRailwayTransport(roads, { underpasses: RAILWAY_UNDERPASS_EVIDENCE });
    roads = transport.roads;
    payload = { roads, railway: transport.railway.profiles, railwayReport: transport.report, railwayPatches: transport.patches, metro: core.metro, construction };
  }
  const bytes = JSON.stringify(payload);
  writeFileSync(${JSON.stringify(output)}, bytes);
  if (${JSON.stringify(footprints)}) writeFileSync(${JSON.stringify(footprints)}, JSON.stringify({
    sourceModelSHA256: createHash('sha256').update(bytes).digest('hex'),
    roads: roads.map(e => { const { L, R } = roadRibbon(e, roads); return { id: e.id, L, R }; })
  }));
`;
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' }, logLevel: 'error',
  plugins: [{ name: 'historical-source', setup(builder) {
    builder.onLoad({ filter: /[/\\]src[/\\]/ }, args => {
      if (!args.path.startsWith(join(root, 'src') + sep)) return;
      const path = relative(root, args.path).split(sep).join('/');
      const contents = execFileSync('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      imported[path] = createHash('sha256').update(contents).digest('hex');
      return { contents, loader: extname(path) === '.json' ? 'json' : 'ts', resolveDir: dirname(args.path) };
    });
  } }],
});
await import(pathToFileURL(bundle).href);
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const provenance = {
  revision, stage: options.stage, sourceCoreGitBlob: sourceBlob,
  sourceCoreSHA256: sha256(join(root, 'public/city/core.pack.wasm')),
  sourceFiles: Object.fromEntries(Object.entries(imported).sort(([a], [b]) => a.localeCompare(b))),
  outputSHA256: sha256(output), footprintSHA256: footprints ? sha256(footprints) : null,
  nodeVersion: process.version, esbuildVersion,
  pipeline: options.stage === 'grades' ? ['historical prepareRoadGrades'] : ['historical prepareRoadGrades', 'historical prepareRoadUnderpasses', 'historical stadium exclusion', 'historical construction', 'historical prepareRailwayTransport with historical railway evidence'],
  authority: 'Reproduced historical game model; elevations are not a survey.',
};
writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
console.log(JSON.stringify({ output, provenance: provenancePath, sha256: provenance.outputSHA256, files: Object.keys(imported).length }));
