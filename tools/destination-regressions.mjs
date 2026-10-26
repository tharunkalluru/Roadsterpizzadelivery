// Source-bound architecture, map identity, transport clearance and proximity.
// These are offline production fixtures, not a claim of street/photo accuracy.
import assert from 'node:assert/strict';
import { build } from '../game/node_modules/esbuild/lib/main.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'roadster-destinations-'));
let checks = 0;
const test = (label, run) => { run(); checks++; console.log(`PASS ${label}`); };
try {
  await build({ stdin: { contents: "export * from './game/src/world/destination-identity';export * from './game/src/world/destination-data';export * from './game/src/world/destination-recognition';export * from './game/src/world/destination-hero-models';export * from './game/src/world/destination-hero-data';export * from './game/src/world/destination-proximity';export * from './game/src/world/landmarks';export {initTemplates,TiledBatch} from './game/src/core/util';export {buildingTransportClearance} from './game/src/world/building-clearance';", resolveDir: root }, outfile: join(tmp, 'm.mjs'), bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
  const m = await import(pathToFileURL(join(tmp, 'm.mjs'))); m.initTemplates();
  const core = JSON.parse(gunzipSync(readFileSync(join(root, 'game/public/city/core.pack.wasm'))));
  const records = m.DESTINATION_IDENTITIES, markers = m.DESTINATION_MAP_IDENTITIES;
  const record = kind => ({ id: 'fixture-'+kind, name: 'Fixture '+kind, kind, tile: [0, 0], buildingId: 'bound', boardId: 'board', a: [-20, -10], b: [20, -10], confidence: .8 });
  const building = { id: 'bound', h: 18, ring: [[-20, -10], [20, -10], [20, 20], [-20, 20]] };
  const fixture = (overrides = {}) => {
    const boxes = [], solids = [], calls = [], batch = { box: (...a) => boxes.push(a) };
    const C = { B: new Proxy({}, { get: () => batch }), clear: (ring, low, high) => { calls.push({ ring, low, high }); return true; }, sign() {}, solid: (...a) => solids.push(a), inOtherBuilding: () => false, ...overrides };
    return { C, boxes, solids, calls };
  };
  test('complete shipped inventory has stable distinct IDs and conservative architecture gates', () => {
    const evidence = JSON.parse(readFileSync(join(root, 'pipeline/evidence/destination-inventory-2026-10-26.json')));
    assert.equal(markers.length, evidence.entries.length); assert.equal(records.length, evidence.summary.decoratedBuildingRecords);
    assert.equal(new Set(markers.map(r => r.id)).size, markers.length); assert.ok(records.length > 500);
    const markerIds = new Set(markers.map(r => r.id));
    for (const r of records) { assert.ok(markerIds.has(r.id)); assert.ok(r.confidence >= .55); assert.ok(r.buildingId && r.boardId); }
    const map = m.destinationPlaceCatalogue(markers, core.origin);
    assert.ok(map.every(p => [p.lat, p.lon, p.x, p.z].every(Number.isFinite)));
    assert.ok(map.every(p => p.x >= core.bounds.minX && p.x <= core.bounds.maxX && p.z >= core.bounds.minZ && p.z <= core.bounds.maxZ));
    for (let i = 0; i < markers.length; i++) if (['university', 'college'].includes(markers[i].kind)) assert.equal(map[i].category, 'Education');
  });
  test('repair shops, lecture/operating theatres and unrelated place names are not promoted', () => {
    const program = "import sys;sys.path.insert(0,'pipeline');from destination_inventory import classify;assert classify('LN Engineering and Electrical Rewinding Works') is None;assert classify('BPL Engineering LTD.') is None;assert classify('lecture theatre D','cinema') is None;assert classify('Operating Theatre') is None;assert classify('College Consultants') is None;assert classify('College Consult') is None;assert classify('University Connect Overseas') is None;assert classify('New College Book Centre best book store in Kothi') is None;assert classify('Facebook Marketing University') is None;assert classify('Mallikarjuna Nagar') is None;assert classify('Vasavi College of Engineering')=='college';assert classify('AMB Cinemas')=='cinema';assert classify('University of Hyderabad')=='university'";
    execFileSync('python3', ['-c', program], { cwd: root });
  });
  test('campus/address and company amenity names are reviewed instead of promoted into institutions or offices', () => {
    const cases = {
      excluded: ['Apollo 247 Diagnostics in Vidya Nagar, Osmania University Rd', 'Hyderabad - Osmania Medical College Offsite ATM',
        'Jamai Masjid Himayath Ali Khan Bagh Osmania University Road', 'Juice Stall Outside Osmania University',
        'Osmania University Police Station', 'Osmania Medical College Metro', 'accenture lift', 'Accenture - rest room', 'accenture bus',
        'CMR College Bus Stop', 'Microsoft Bus Stop Gate No.5', 'College Canteen,OMC', 'Google Yoga Room',
        'University of Hyderabad Men\'s Hostel - D', 'Apollo Pharmacy Madikeri College Road',
        'Super OYO Anuguna Tulasi Grand Near JNTU University Hyderabad', 'Townhouse Cyber Gateway Bus Stand',
        'State Bank of India Doctor BR Ambedkar Open University Branch', 'ICICI Bank Limited, Hyderabad - BSR Tech Park',
        'University of Hyderabad Campus School', 'Amelio Early Education - V Ascendas IT Park', 'Amazon Rose School',
        'Fellow bags - manufacturers corporate gifts tote jute school and college bags', 'gowtham jr college office room', 'Wipro X Road'],
      retained: { 'Osmania Medical College': 'college', 'Osmania University College of Engineering': 'university',
        'Department of Diagnostic Imaging, Osmania Medical College': 'college', 'Malla Reddy College Of Pharmacy': 'college',
        'Bhaskar Pharmacy College': 'college', 'St. John\'s Church Junior College': 'college', 'Church of the Cross Theological College': 'college',
        'NSKK High School And Junior College': 'college', 'University College of Hotel Management': 'university',
        'Accenture Services Pvt. Ltd.': 'office', 'Accenture HDC3': 'office', 'Microsoft India Development Center': 'office',
        'State Bank Staff College': 'college', 'HDFC Bank Staff Training College': 'college',
        'School of Physics, University of Hyderabad': 'university', 'Osmania University Admissions Office': 'university' },
    };
    const check = `import json,sys
sys.path.insert(0,'pipeline')
from destination_inventory import classify
cases=json.load(sys.stdin)
for name in cases['excluded']:
    assert classify(name) is None, name
for name,kind in cases['retained'].items():
    assert classify(name)==kind, name
`;
    execFileSync('python3', ['-c', check], { cwd: root, input: JSON.stringify(cases) });
    const evidence = JSON.parse(readFileSync(join(root, 'pipeline/evidence/destination-inventory-2026-10-26.json')));
    const excluded = evidence.reviewQueue.filter(r => r.status === 'review-excluded-nondestination'), markerIds = new Set(markers.map(r => r.id));
    assert.ok(excluded.length >= 15); assert.equal(excluded.length, evidence.summary.excludedAmenityOrAddressRecords);
    for (const r of excluded) { assert.ok(r.exclusionReason && r.buildingId && r.boardIds.length && r.sourcePack); assert.ok(!markerIds.has(r.id)); }
    for (const name of cases.excluded.slice(0, 9)) assert.ok(!markers.some(r => r.name.toLowerCase() === name.toLowerCase()), name);
  });
  test('all five typologies emit visible geometry while preserving original source records', () => {
    for (const kind of ['university', 'college', 'mall', 'cinema', 'office']) {
      const source = JSON.stringify(building), r = record(kind), f = fixture();
      const out = m.decorateDestinationBuilding(building, [r], f.C);
      assert.ok(out.features >= 5, kind); assert.ok(f.boxes.length >= 5); assert.equal(JSON.stringify(building), source);
      assert.ok(f.boxes.every(b => b.slice(0, 6).every(Number.isFinite)));
      assert.ok(f.boxes.some(b => b[2] < -10), 'facade trims must be visible outside the old wall plane');
      assert.ok(f.solids.length > 0, 'roof volumes register matching collision tops');
    }
  });
  test('failed transport clearance emits no decorative bodies or orphaned colliders', () => {
    const f = fixture({ clear: () => false }); const out = m.decorateDestinationBuilding(building, [record('college')], f.C);
    assert.equal(out.features, 0); assert.equal(f.boxes.length, 0); assert.equal(f.solids.length, 0);
    assert.equal(m.decorateDestinationBuilding({ ...building, id: 'unrelated' }, [record('college')], f.C), null);
  });
  test('corrected source fragments keep ID binding and cannot bridge a concave courtyard', () => {
    const concave = { ...building, id: 'bound~clear0', sourceId: 'bound', ring: [[-20,-10],[20,-10],[20,20],[1,20],[1,1],[-1,1],[-1,20],[-20,20]] };
    const f = fixture(); assert.ok(m.decorateDestinationBuilding(concave, [record('office')], f.C));
    assert.ok(f.solids.every(([ring]) => !ring.some(p => p[0] > -1 && p[0] < 1 && p[1] > 1)));
  });
  test('every runtime source building and board ID resolves in its original shipped tile', () => {
    const packs = new Map();
    for (const r of records) {
      const p = core.packs.find(p => p.tiles.some(t => t[0] === r.tile[0] && t[1] === r.tile[1])); assert.ok(p);
      if (!packs.has(p.file)) { packs.clear(); packs.set(p.file, JSON.parse(gunzipSync(readFileSync(join(root, 'game/public/city', p.file))))); }
      const zone = packs.get(p.file).tiles[r.tile.join('_')];
      assert.ok(zone.buildings.some(b => b.id === r.buildingId));
      assert.ok(zone.boards.some(b => b.id === r.boardId && b.building === r.buildingId));
    }
  });
  test('hero plans bind exact named OSM IDs and retain every original geographic vertex', () => {
    const evidence = JSON.parse(readFileSync(join(root, 'pipeline/evidence/destination-hero-source-2026-10-26.json')));
    const models = new Map(m.placeLandmarks(core.origin).map(l => [l.id, l]));
    for (const [id, p] of Object.entries(m.DESTINATION_HERO_PLANS)) {
      const source = evidence.elements.find(e => 'w'+e.id === p.sourceId); assert.ok(source);
      assert.match(p.source, /^https:\/\/www.openstreetmap.org\/way\//); assert.ok(p.official.startsWith('https://'));
      const raw = source.geometry.slice(0, -1), kx = Math.cos(p.anchor.lat * Math.PI / 180) * 6380050.094 * Math.PI / 180, kz = 6341141.9 * Math.PI / 180;
      assert.equal(p.ring.length, raw.length);
      raw.forEach((v, i) => { assert.ok(Math.abs(p.ring[i][0] - (v.lon - p.anchor.lon) * kx) < .0001); assert.ok(Math.abs(p.ring[i][1] + (v.lat - p.anchor.lat) * kz) < .0001); });
      const model = models.get(id); assert.ok(model); assert.equal(model.lat, p.anchor.lat); assert.equal(model.lon, p.anchor.lon);
    }
    const amb = evidence.elements.find(e => e.type === 'node' && e.id === 6771713703), mall = evidence.elements.find(e => e.type === 'way' && e.id === 574673965);
    assert.equal(amb.tags.name, 'AMB Cinemas'); assert.equal(amb.tags.amenity, 'cinema'); assert.ok(amb.version && amb.timestamp);
    let contained = false;
    for (let i = 0, j = mall.geometry.length - 1; i < mall.geometry.length; j = i++) {
      const a = mall.geometry[i], b = mall.geometry[j];
      if ((a.lat > amb.lat) !== (b.lat > amb.lat) && amb.lon < (b.lon - a.lon) * (amb.lat - a.lat) / (b.lat - a.lat) + a.lon) contained = !contained;
    }
    assert.ok(contained, 'AMB identity must be explicitly contained by its named Sarath mall footprint');
    assert.equal(models.size, 192);
  });
  test('mall source models render finite source-plan roofs with upward support normals', () => {
    for (const id of ['inorbit','forum','lulu','asian_amb']) {
      const B = Object.fromEntries(['st','wall','roof','park'].map(k => [k, new m.TiledBatch()])), solids = [];
      const K = new m.Kit(0, 0, 0, { B, solid: (...a) => solids.push(a), obstacle() {}, road: () => false, roadY: () => null, sign() {}, clear: () => true, trim: ring => [ring] });
      m.drawDestinationMall(K, id); assert.ok(solids.length);
      for (const batch of Object.values(B)) for (const part of batch.tiles.values()) assert.ok(part.pos.every(Number.isFinite));
      const roofs = [...B.roof.tiles.values()]; assert.ok(roofs.length); assert.ok(roofs.every(part => part.nor.filter((_, i) => i % 3 === 1).every(y => y > .99)));
    }
  });
  test('Sarath City and Asian AMB retain two place IDs but only one physical mall/clear owner', () => {
    const models = m.placeLandmarks(core.origin), alias = models.find(l => l.id === 'sarath_city'), owner = models.find(l => l.id === 'asian_amb');
    assert.equal(alias.modelAliasOf, owner.id); assert.ok(!owner.modelAliasOf);
    assert.equal(alias.lat, owner.lat); assert.equal(alias.lon, owner.lon); assert.equal(alias.clear, 0);
    const B = Object.fromEntries(['st','wall','roof','park'].map(k => [k, new m.TiledBatch()])), solids = [];
    m.drawLandmark(alias, { B, solid: (...args) => solids.push(args), obstacle() {}, road: () => false, roadY: () => null, sign() {} });
    assert.equal(Object.values(B).reduce((n, b) => n + [...b.tiles.values()].reduce((s, t) => s + t.pos.length, 0), 0), 0);
    assert.equal(solids.length, 0); assert.equal(m.inClear(alias, alias.x, alias.z), false);
    assert.equal(m.inClear(owner, owner.x, owner.z), true);
    const ledger = JSON.parse(readFileSync(join(root, 'pipeline/evidence/landmark-source-decisions-2026-10-26.json')));
    const ids = new Set(models.map(l => l.id)); for (const row of ledger.entries) assert.ok(ids.has(row.id), 'preserve original ID '+row.id);
  });
  test('Uppal bowl has six floodlight towers, seating rows, standard pitch and an open field', () => {
    const f = fixture(), batch = { ...f.C.B.st, tri() {} }, B = new Proxy({}, { get: () => batch });
    const K = new m.Kit(0, 0, 0, { B, solid: f.C.solid, obstacle() {}, road: () => false, roadY: () => null, sign() {}, clear: () => true });
    m.drawUppalStadium(K);
    assert.equal(f.boxes.filter(b => b[3] === .65 && b[4] === 37 && b[5] === .65).length, 6);
    assert.equal(f.boxes.filter(b => b[4] === .48).length, 560);
    assert.ok(f.boxes.some(b => b[3] === 3.05 && b[5] === 20.12));
    assert.ok(!f.solids.some(([r]) => r.some(p => p[0] < 0) && r.some(p => p[0] > 0) && r.some(p => p[1] < 0) && r.some(p => p[1] > 0)), 'no blanket stadium collider fills the playing field');
  });
  test('campus proximity requires a stable ground visit and rearms only after leaving', () => {
    const c = new m.CampusProximity([record('college'), { ...record('mall'), a: [100,100], b: [120,100] }]);
    assert.equal(c.update(0,-10,.55,0), null); assert.equal(c.update(0,-10,.55,1.99), null);
    assert.equal(c.update(0,-10,.55,2), 'Fixture college'); assert.equal(c.update(0,-10,.55,4), null);
    assert.equal(c.update(300,300,.55,5), null); assert.equal(c.update(0,-10,.55,6), null); assert.equal(c.update(0,-10,.55,8), 'Fixture college');
    assert.equal(c.update(110,100,.55,10), null); assert.equal(c.update(110,100,.55,13), null);
    const fly = new m.CampusProximity([record('university')]);
    assert.equal(fly.update(0,-10,24,0), null); assert.equal(fly.update(0,-10,24,5), null);
    assert.equal(fly.update(0,-10,.55,6), null); assert.equal(fly.update(0,-10,.55,8), 'Fixture university');
    const far = new m.CampusProximity([record('college')]); assert.equal(far.update(65,-10,.55,0), null); assert.equal(far.update(65,-10,.55,4), null);
  });
  console.log(`${checks} destination source/architecture/proximity groups passed. Offline fixtures are not photo or gameplay verification.`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
