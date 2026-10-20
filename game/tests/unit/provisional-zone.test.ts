import { describe, it, expect } from 'vitest';
import { fixture, hash } from './pilot-fixture';
import { ProvisionalZone, type ProvisionalZoneDefinition } from '../../src/pilot/provisionalZone';
import { PilotZone } from '../../src/pilot/zone';
import { Session } from '../../src/missions/session';
import { Autopilot } from '../../src/debug/autopilot';

/** Synthetic mechanics only. No real pickup, entrance or qualification is authored here. */
function provisional() {
  const f=fixture();
  for(const d of f.core.deliveries)if(!d.poiId){d.poiId='fixture-'+d.id;f.core.pois.push({id:d.poiId,category:'shop'} as any);}
  for(const front of f.survey.storefrontOverrides)front.placementStatus='provisional';
  for(const road of f.survey.roads){road.left.status='partial';road.right.status='unreviewed';}
  const definition:ProvisionalZoneDefinition={schemaVersion:1,id:'synthetic-provisional',label:'Synthetic provisional preview',surveyRevision:133,surveySha256:hash,scopeReceipt:'SYNTHETIC-ONLY',limitations:['Synthetic test; unverified geometry and entrances'],polygon:f.definition.polygon,roadIds:f.definition.roadIds,researchedRoadIds:['A1'],spawn:f.definition.spawn,entrances:f.definition.entrances.map(e=>({deliveryId:e.deliveryId})),jobs:[{id:'first',title:'Synthetic test pizza',pickupId:'d_start',stops:['d_main']}],maxHeightM:40};
  return {...f,definition};
}
describe('Separate provisional gameplay, never verified qualification',()=>{
  it('admits source-backed provisional jobs without promoting evidence or weakening verified mode',()=>{
    const f=provisional(),before=JSON.stringify(f.survey);
    const zone=new ProvisionalZone(f.definition,f.core,f.survey,hash);
    expect(zone.mode).toBe('provisional');expect(zone.missions).toHaveLength(1);
    expect(JSON.stringify(f.survey)).toBe(before);
    expect(()=>new PilotZone({...fixture().definition,id:'not-qualified'},f.core,f.survey,hash)).toThrow(/not verified/);
  });
  it.each(['hash','outside-road','no-listing','unbound-job','pizza','disconnected','missing-label'])('rejects %s instead of fabricating a route or place',kind=>{
    const f=provisional();let actual=hash;
    if(kind==='hash')actual='b'.repeat(64);
    if(kind==='outside-road')f.definition.polygon=[[-10,0],[10,0],[10,-100],[-10,-100]];
    if(kind==='no-listing')f.core.deliveries[0].poiId=null;
    if(kind==='unbound-job')f.definition.jobs[0].stops=['invented'];
    if(kind==='pizza')f.core.pois.find(p=>p.id==='fixture-pizza')!.category='bank';
    if(kind==='disconnected')f.core.directed.find(e=>e.id==='A1:f')!.next=[];
    if(kind==='missing-label')f.definition.limitations=[];
    expect(()=>new ProvisionalZone(f.definition,f.core,f.survey,actual)).toThrow(/Provisional preview/);
  });
  it('completes a provisional delivery and cannot restore it as a verified run',()=>{
    const f=provisional(),zone=new ProvisionalZone(f.definition,f.core,f.survey,hash);
    const s=new Session(f.world,zone.missions[0],{pilotZone:zone,trafficEnabled:false});s.start();const driver=new Autopilot(s);
    const save=s.checkpoint();expect(save.pilotMode).toBe('provisional');
    expect(()=>Session.fromCheckpoint(f.world,s.mission,{...save,pilotMode:'verified'},true,zone)).toThrow(/mode changed/);
    for(let i=0;i<60000&&s.phase!=='ENDED';i++){if(s.phase==='RECOVERING')s.completeRecovery();else s.step(driver.input());expect(zone.allowsPose(s.player)).toBe(true);}
    expect(s.outcome?.success).toBe(true);
  });
});
