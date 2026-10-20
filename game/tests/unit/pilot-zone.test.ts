/** Synthetic proving ground only. These fixtures never qualify a real Hyderabad zone. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PilotZone } from '../../src/pilot/zone';
import { Session } from '../../src/missions/session';
import { NO_INPUT } from '../../src/player/player';
import { Autopilot } from '../../src/debug/autopilot';
import { fixtureMission } from './fixture';

import { fixture, hash } from './pilot-fixture';

function ready() { const f = fixture(); const zone = new PilotZone(f.definition, f.core, f.survey, hash); return { ...f, zone }; }
function session() { const f = ready(); const s = new Session(f.world, f.zone.missions[0], { pilotZone: f.zone, trafficEnabled: false }); s.start(); return { ...f, s }; }

describe('Qualified pilot admission and isolation', () => {
  it('keeps real survey133 locked despite an otherwise valid synthetic definition', () => {
    const f = fixture(); const actual = JSON.parse(readFileSync(new URL('../../public/research/street-survey.json', import.meta.url), 'utf8'));
    const release = JSON.parse(readFileSync(new URL('../../config/pilot-release.json', import.meta.url), 'utf8'));
    expect(release.zone).toBeNull(); expect(release.status).toBe('awaiting_verified_zone');
    expect(actual.revision).toBe(133);
    expect(() => new PilotZone({ ...f.definition, surveySha256: release.surveySha256 }, f.core, actual, release.surveySha256)).toThrow(/not verified/);
  });
  it('routes each explicit job on a copied graph and leaves world edges untouched', () => {
    const f = fixture(); const before = JSON.stringify(f.core.directed);
    const zone = new PilotZone(f.definition, f.core, f.survey, hash);
    expect(zone.missions).toHaveLength(2); expect(zone.nav.edges.has('E:f')).toBe(false);
    expect(JSON.stringify(f.core.directed)).toBe(before);
  });
  it.each(['pin', 'gap', 'partial', 'source', 'frontage', 'entrance', 'outside-stop', 'pizza', 'spawn', 'concave', 'disconnected', 'outside-job'])('rejects %s without an unrestricted fallback', kind => {
    const f = fixture(); let actualHash = hash;
    if (kind === 'pin') actualHash = 'b'.repeat(64);
    if (kind === 'gap') f.survey.roads[0].left.reviewedRanges![0].startM = 1;
    if (kind === 'partial') f.survey.roads[0].left.reviewedRanges![0].completeness = 'partial';
    if (kind === 'source') f.survey.sources = [];
    if (kind === 'frontage') f.survey.storefrontOverrides[0].placementStatus = 'provisional';
    if (kind === 'entrance') f.survey.storefrontOverrides[0].entrance = [300, 300];
    if (kind === 'outside-stop') f.core.deliveries[0].stopPolygon[0] = [900, 0];
    if (kind === 'pizza') f.core.pois[0].category = 'bank';
    if (kind === 'spawn') f.definition.spawn.x = 900;
    if (kind === 'concave') f.definition.polygon.splice(1, 0, [100, -500]);
    if (kind === 'disconnected') f.core.directed.find(d => d.id === 'A1:f')!.next = [];
    if (kind === 'outside-job') f.definition.jobs[0].stops = ['unknown'];
    expect(() => new PilotZone(f.definition, f.core, f.survey, actualHash)).toThrow(/Pilot qualification/);
  });
  it('rejects arbitrary missions and spawn overrides', () => {
    const { world, zone } = ready();
    expect(() => new Session(world, fixtureMission(), { pilotZone: zone })).toThrow(/catalogue/);
    expect(() => new Session(world, zone.missions[0], { pilotZone: zone, spawn: { ...zone.definition.spawn, x: 900 } })).toThrow(/spawn/);
  });
});

describe('Pilot gameplay boundary, recovery and persistence', () => {
  it.each([[451, -500, 0], [-51, -500, 0], [0, 51, 0], [0, -2051, 0], [451, 51, 0], [0, -500, 41], [0, -500, -20], [NaN, -500, 0]])('recovers immediately from invalid pose %j with no outside interaction', (x, z, y) => {
    const { s, zone } = session(); s.player.x = x; s.player.z = z; s.player.y = y;
    s.step({ ...NO_INPUT, interactPress: true, flightPress: true } as any);
    expect(zone.allowsPose(s.player)).toBe(true); expect(s.phase).toBe('RECOVERING'); expect(s.cargoLoaded).toBe(false);
    s.completeRecovery(); expect(zone.allowsPose(s.player)).toBe(true); expect(s.phase).toBe('PLAYING');
  });
  it('catches motion across a boundary on the same simulation tick', () => {
    const { s, zone } = session(); const original = s.player.step.bind(s.player);
    s.player.step = input => { const events = original(input); s.player.x = 460; return events; };
    s.step(NO_INPUT); expect(zone.allowsPose(s.player)).toBe(true); expect(s.phase).toBe('RECOVERING');
  });
  it('terminates an escaping flight without refunding spent boost', () => {
    const { s, zone } = session();
    s.player.ledger.beginTransaction();
    for (let i = 0; i < 10; i++) s.player.ledger.spendTick();
    const consumed = s.player.ledger.consumedTicks;
    s.player.move = 'FLYING'; s.player.y = 12; s.player.x = 460;
    s.step(NO_INPUT); s.completeRecovery();
    expect(zone.allowsPose(s.player)).toBe(true);
    expect(s.player.move).toBe('GROUNDED');
    expect(s.player.ledger.consumedTicks).toBe(consumed);
  });
  it('ignores poisoned recovery anchors and restores inside after manual recovery', () => {
    const { s, zone } = session(); s.anchors.push({ x: 1000, z: 0, heading: 0, roadId: 'A1', tick: 0 });
    s.requestManualRecovery(); s.completeRecovery(); expect(zone.allowsPose(s.player)).toBe(true);
  });
  it('binds reloads to the same zone/pin and safely recovers an outside saved pose', () => {
    const { s, zone, world } = session(); const cp = s.checkpoint();
    expect(() => Session.fromCheckpoint(world, s.mission, { ...cp, pilotZoneId: 'other' }, true, zone)).toThrow(/zone changed/);
    expect(() => Session.fromCheckpoint(world, s.mission, cp)).toThrow(/mode changed/);
    expect(() => Session.fromCheckpoint(world, s.mission, { ...cp, pilotPolicyKey: 'changed' }, true, zone)).toThrow(/policy changed/);
    cp.player.x = 999; cp.player.z = 999;
    const restored = Session.fromCheckpoint(world, s.mission, cp, true, zone);
    expect(zone.allowsPose(restored.player)).toBe(true); expect(restored.phase).toBe('RECOVERING');
    restored.completeRecovery(); expect(restored.route.length).toBeGreaterThan(0);
  });
  it.each([0, 1])('completes explicit pizza pickup and delivery job %i through real driving and supports retry', index => {
    const { zone, world } = ready(); const s = new Session(world, zone.missions[index], { pilotZone: zone, trafficEnabled: false }); s.start();
    const ap = new Autopilot(s);
    for (let i = 0; i < 60000 && s.phase !== 'ENDED'; i++) {
      if (s.phase === 'RECOVERING') s.completeRecovery(); else s.step(ap.input());
      expect(zone.allowsPose(s.player)).toBe(true);
      expect(s.route.every(id => zone.nav.edges.has(id))).toBe(true);
    }
    expect(s.outcome).toEqual({ success: true, reason: 'Delivered' });
    expect(s.eventLog.some(e => e.e.startsWith('collected '))).toBe(true);
    expect(s.eventLog.some(e => e.e.startsWith('delivered '))).toBe(true);
    expect(s.results().outcome.success).toBe(true);
    const retry = new Session(world, zone.missions[index], { pilotZone: zone, trafficEnabled: false });
    expect(retry.cargoLoaded).toBe(false); expect(retry.deliveryStage).toBe('PICKUP'); expect(zone.allowsPose(retry.player)).toBe(true);
  });
});
