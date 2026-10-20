/** Validates committed source geometry only; never a verified-coverage assertion. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { ProvisionalZone } from '../../src/pilot/provisionalZone';
import { StreetSurvey } from '../../src/world/streetSurvey';
import { WorldPhysics } from '../../src/world/collision';

const read=(p:string)=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
describe('Real source-data provisional catalogue pin',()=>{
  it('admits the bounded source-road jobs while keeping every survey record unchanged',()=>{
    const bytes=read('public/research/street-survey.json'),survey=JSON.parse(bytes),core=JSON.parse(read('public/world/hyd-metro/v2/core.json'));
    const release=JSON.parse(read('config/provisional-preview.json'));
    const hash=createHash('sha256').update(bytes).digest('hex');
    expect(hash).toBe(release.surveySha256);
    const original=JSON.stringify(survey);
    const corrected=new StreetSurvey(survey,core).applyCoreCorrections(core);
    const world=new WorldPhysics(corrected);
    const zone=new ProvisionalZone(release.zone,world.core,survey,hash,JSON.parse(read('public/world/hyd-metro/v2/listings.json')));
    expect(zone.mode).toBe('provisional');expect(zone.missions).toHaveLength(2);
    expect(zone.missions.every(m=>m.pickupId==='d_domino_s_pizza_india')).toBe(true);
    expect(zone.definition.researchedRoadIds).toHaveLength(2);
    expect(JSON.stringify(survey)).toBe(original);
    const verified=JSON.parse(read('config/pilot-release.json'));
    expect(verified.zone).toBeNull();expect(verified.status).toBe('awaiting_verified_zone');
  });
});
