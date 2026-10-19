/**
 * v2 whole-network calibration: every level mission is driven on the ground by the reference
 * agent through real physics with mission traffic (MASTER §15). Writes
 * qa/artifacts/calibration/deadlines-v2.json. Levels 3–5 only run with CALIBRATE_ALL=1;
 * the complete sweep has its own deadlines-v2-all.json evidence file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WorldPhysics } from '../../src/world/collision';
import { isFoodPickup } from '../../src/missions/catalog';
import { buildLevelCatalog } from '../../src/missions/levels';
import { Session } from '../../src/missions/session';
import { Autopilot } from '../../src/debug/autopilot';
import { StreetSurvey, type StreetSurveyData } from '../../src/world/streetSurvey';
import { SourceAccuracyLayer } from '../../src/world/sourceAccuracy';
import { streetscapeBarriers, type StreetscapeData } from '../../src/art/streetscape';
import { stationObstacles } from '../../src/art/metro';
import { structureObstacles } from '../../src/art/structures';
import type { WorldCore, WorldCoreV2, WorldManifest, WorldChunk } from '../../src/world/schema';
import {applyAuthoredContext} from './authored-context';
import {getAccessPits} from '../../src/world/accessPits';
import {PHYSICS_LAYOUT_VERSION} from '../../src/world/identity';

const base = 'public/world/hyd-metro/v2/';
const have = existsSync(base + 'manifest.json');
const all = process.env.CALIBRATE_ALL === '1';
// Optional independent QA shards keep the full physical run practical without sharing reports.
const shardSpec=process.env.CALIBRATE_SHARD;
const shard=shardSpec?shardSpec.match(/^(\d+)\/(\d+)$/):null;
if(shardSpec&&(!shard||+shard[2]<1||+shard[2]>8||+shard[1]>=+shard[2]))throw new Error('CALIBRATE_SHARD must be a zero-based index/count, count1..8');
const shardIndex=shard?+shard[1]:0,shardCount=shard?+shard[2]:1;
const reportSuffix=shard?`-shard${shardIndex}of${shardCount}`:'';
const sourceFiles=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(`${directory}/${entry.name}`):entry.name.endsWith('.ts')?[`${directory}/${entry.name}`]:[]);
const runtimeSourceSha256=createHash('sha256').update(sourceFiles('src').sort().map(path=>`${path}\0${readFileSync(path,'utf8')}\0`).join('')).digest('hex');

describe.skipIf(!have)('v2 network missions (reference agent, ground only)', () => {
  const m = have ? (JSON.parse(readFileSync(base + 'manifest.json', 'utf8')) as WorldManifest) : null;
  const rawCore = have ? (JSON.parse(readFileSync(base + m!.core.file, 'utf8')) as WorldCore) : null;
  const accuracy = m?.sourceAccuracy ? new SourceAccuracyLayer(JSON.parse(readFileSync(base + m.sourceAccuracy.file, 'utf8'))) : null;
  const sourceCore = rawCore && accuracy ? accuracy.applyCore(rawCore) : rawCore;
  // Use App's complete authored world, including survey corrections and the exact render-derived
  // collision footprints. A raw network pass cannot prove the actual player route remains open.
  const survey = have ? new StreetSurvey(JSON.parse(readFileSync('public/research/street-survey.json', 'utf8')) as StreetSurveyData, sourceCore!, { worldVersion: sourceCore!.manifestVersion }) : null;
  const core = survey ? applyAuthoredContext(survey.applyCoreCorrections(sourceCore!)) : null;
  const streetscape = have ? JSON.parse(readFileSync('public/research/streetscape.json', 'utf8')) as StreetscapeData : null;
  if (core && streetscape) (core as WorldCore & { streetscape: StreetscapeData }).streetscape = streetscape;
  const w = have ? new WorldPhysics(core!, m!.chunkSizeM) : null;
  const barriers = core && streetscape ? streetscapeBarriers(streetscape, core) : [];
  const stations = core ? stationObstacles(core) : [];
  const structures = core && (core as WorldCoreV2).structures?.length ? structureObstacles(core as WorldCoreV2) : [];
  if (w) {
    w.addRoadBarriers(barriers);
    w.setKnownChunks(m!.chunks.map((c) => c.id));
    w.addStructures(stations); w.addStructures(structures);
    for (const c of m!.chunks) {
      const rawChunk = JSON.parse(readFileSync(base + c.file, 'utf8')) as WorldChunk;
      w.addChunk(survey!.applyChunk(accuracy ? accuracy.applyChunk(rawChunk) : rawChunk));
    }
  }
  const missions = have ? buildLevelCatalog(core!, w!) : [];
  const accessPlanSha256 = createHash('sha256').update(readFileSync('src/world/buildingAccess.ts')).digest('hex');
  const authoredInputs = Object.fromEntries([
    'street-survey','streetscape','transport','public-realm','observed-public-realm',
    'scenario-public-realm','station-entrances','station-geometry','landscape',
  ].flatMap(name=>{
    const path=`public/research/${name}.json`;
    return existsSync(path)?[[name,{path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}]]:[];
  }));
  const report: any[] = [];

  it('builds missions for every level with growing route lengths', () => {
    for (const q of missions) expect(isFoodPickup(core!, core!.deliveries.find((d) => d.id === q.pickupId)!)).toBe(true);
    for (const lv of [1, 2, 3, 4, 5]) expect(missions.filter((q) => q.level === lv).length, `level ${lv}`).toBeGreaterThan(0);
    const avg = (lv: number) => { const ms = missions.filter((q) => q.level === lv); return ms.reduce((a, q) => a + (q.routeLengthM ?? 0), 0) / ms.length; };
    for (const lv of [2, 3, 5]) expect(avg(lv)).toBeGreaterThan(avg(lv - 1));
  });

  for (const q of missions.filter((x) => all || (x.level ?? 1) <= 2).filter((_,index)=>index%shardCount===shardIndex)) {
    it(`${q.id} (L${q.level}) completes on the ground within its deadline`, () => {
      const s = new Session(w!, q, { runId: `cal_${q.id}`, seed: q.seed });
      s.start();
      const ap = new Autopilot(s);
      let guard = 0;
      while (s.phase !== 'ENDED' && guard++ < q.deadlineSeconds * 60 + 600) {
        if (s.phase === 'RECOVERING') { s.completeRecovery(); continue; }
        s.step(ap.input());
      }
      const r = s.results();
      report.push({ id: q.id, level: q.level, from: q.fromArea, to: q.toArea, routeLengthM: q.routeLengthM, deadlineS: q.deadlineSeconds, chargedS: +r.chargedSeconds.toFixed(1), marginPct: +((1 - r.chargedSeconds / q.deadlineSeconds) * 100).toFixed(1), recoveries: r.recoveries, cargo: r.cargo, outcome: r.outcome.reason });
      writeFileSync(`qa/artifacts/calibration/deadlines-v2${all ? '-all' : ''}${reportSuffix}.json`, JSON.stringify({ method: 'reference agent through App-composed sourced and provisional geometry, shared basement voids and physical access, public furniture, station/structure solids, mission traffic; ground driving only', ...(shard?{shard:{index:shardIndex,count:shardCount}}:{}),world: m!.worldId + '@v' + m!.version, catalogueIds:missions.map(m=>m.id),sourceAccuracy: m!.sourceAccuracy, sourceSummary: accuracy?.data.summary, authored: { revision: survey!.data.revision, storefronts: survey!.data.storefrontOverrides.length, corrections: survey!.data.corrections.length, barriers: barriers.length, stationObstacles: stations.length, structureObstacles: structures.length, basementPits:getAccessPits(core!).length, profileAccessPlanSha256: accessPlanSha256, physicsLayoutVersion:PHYSICS_LAYOUT_VERSION, runtimeSourceSha256,inputs:authoredInputs }, runs: report }, null, 2));
      expect(r.outcome.success, `${q.id}: ${r.outcome.reason} charged ${r.chargedSeconds.toFixed(1)}s / ${q.deadlineSeconds}s, recoveries ${r.recoveries}`).toBe(true);
    }, 600_000);
  }
});
