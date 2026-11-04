import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { MapLabelIndex, ScreenLabelGrid, MAP_DETAIL, mapRoadMinScale } from '../../src/ui/map-labels';
import type { RoadEdge, CoreData } from '../../src/world/types';

const road = (name: string, z: number, cls = 'tertiary', length = 350): RoadEdge => ({ id: name, seg: name, name, cls, w: 8, lanes: 2, oneway: null,
  from: null, to: null, pts: [[-length / 2, z], [length / 2, z]], elev: null, maxspeed: null });
const view = (scale: number) => ({ cx: 0, cz: 0, scale, width: 800, height: 500 });
const measure = (text: string) => text.length * 6;
const prepare = (source: Pick<CoreData, 'roads' | 'places'>) => { const index = new MapLabelIndex(source); for (const _ of index.prepare()) {} return index; };

test('progressive detail keeps major areas at wide zoom and reveals real neighborhood and street names closer', () => {
  const source: Pick<CoreData, 'roads' | 'places'> = { places: [
    { name: 'Hyderabad', kind: 'locality', p: [-220, -180] }, { name: 'Chikkadpally', kind: 'macrohood', p: [220, -180] },
    { name: 'Jawahar Nagar', kind: 'neighborhood', p: [-220, 180] }, { name: 'Local block', kind: 'microhood', p: [220, 180] },
    { name: 'Ward 123', kind: 'macrohood', p: [0, 0] },
  ], roads: [road('Main Road', -80, 'primary'), road('Local Street', 90)] };
  const index = prepare(source);
  const wide = index.layout(view(.04), measure);
  assert.ok(wide.every(label => label.kind === 'area'));
  assert.ok(wide.some(label => label.major));
  assert.ok(!wide.some(label => /Jawahar|Local|Ward/.test(label.text)));
  const closer = index.layout(view(1), measure);
  assert.ok(closer.some(label => label.text === 'Jawahar Nagar'));
  assert.ok(closer.some(label => label.text === 'Main Road' && label.kind === 'road'));
  assert.ok(closer.some(label => label.text === 'Local Street' && label.kind === 'road'));
  assert.ok(!closer.some(label => /^Ward/.test(label.text)));
  assert.equal(mapRoadMinScale('major'), 0); assert.equal(mapRoadMinScale('ter'), MAP_DETAIL.districtRoads);
  assert.equal(mapRoadMinScale('minor'), MAP_DETAIL.localRoads);
  assert.ok(MAP_DETAIL.localRoads > MAP_DETAIL.districtRoads);
});

test('street names need enough visible screen length and stay upright along actual mapped geometry', () => {
  const reversed = road('Actual Road', -80); reversed.pts.reverse();
  const vertical = road('Vertical Road', 0); vertical.pts = [[200,-180],[200,180]];
  const index = prepare({ places: [], roads: [reversed, vertical, road('Too Short To Read', 100, 'tertiary', 12)] });
  const labels = index.layout(view(1), measure);
  assert.equal(labels.length, 2);
  assert.ok(labels.every(label => Math.abs(label.angle) <= Math.PI / 2));
  assert.equal(labels.find(label => label.text === 'Actual Road')!.y, 170);
  assert.equal(Math.abs(labels.find(label => label.text === 'Vertical Road')!.angle), Math.PI / 2);
  assert.ok(!index.layout(view(.1), measure).some(label => label.kind === 'road'), 'small local names stay hidden');
});

test('screen collision grid prevents overlapping names and respects map controls and navigation markers', () => {
  const source = { places: [{ name: 'Area Name', kind: 'locality', p: [0,0] as [number,number] }],
    roads: [road('Overlapping Road', 0), road('Unblocked Street', 100), road('Covered Street', -100)] };
  const blocked = [{ x: 400, y: 150, w: 250, h: 40 }];
  const labels = prepare(source).layout(view(1), measure, blocked), grid = new ScreenLabelGrid(blocked);
  for (const label of labels) assert.ok(grid.place(label), `overlap: ${label.text}`);
  assert.ok(labels.some(label => label.text === 'Area Name'));
  assert.ok(labels.some(label => label.text === 'Unblocked Street'));
  assert.ok(!labels.some(label => /Covered|Overlapping/.test(label.text)));
});

test('unchanged viewport reuses label layout and font widths, while zoom and font readiness invalidate it', () => {
  const index = prepare({ places: [], roads: [road('Existing Name', 0)] }); let measurements = 0;
  const width = (text: string) => { measurements++; return measure(text); };
  const first = index.layout(view(1), width), count = measurements;
  assert.strictEqual(index.layout(view(1), width), first); assert.equal(measurements, count);
  assert.equal(index.stats.layoutRuns, 1);
  index.layout(view(1), width, [], 'fonts-ready'); assert.equal(index.stats.layoutRuns, 2);
  index.layout(view(2), width, [], 'fonts-ready'); assert.equal(index.stats.layoutRuns, 3);
});

test('preparation yields in bounded batches, preserves input and caps dense-view candidates', () => {
  const source: Pick<CoreData, 'roads' | 'places'> = { places: Array.from({ length: 1800 }, (_, i) => ({ name: `Mapped area ${i}`, kind: 'neighborhood', p: [i % 10, i % 7] })),
    roads: Array.from({ length: 5000 }, (_, i) => road(`Mapped road ${i}`, i % 20)) };
  const before = JSON.stringify(source), index = new MapLabelIndex(source), job = index.prepare();
  assert.equal(job.next().done, false); assert.equal(index.stats.areas, 256); assert.equal(index.ready, false);
  for (const _ of job) {} assert.equal(index.ready, true);
  const labels = index.layout(view(1), measure);
  assert.ok(labels.length <= 100); assert.ok(index.stats.examined <= 3000);
  assert.equal(JSON.stringify(source), before);
});

test('shipped city label index retains real source names and exposes a real named arterial at street zoom', () => {
  const core: CoreData = JSON.parse(gunzipSync(readFileSync('public/city/core.pack.wasm')).toString());
  const index = prepare(core), names = new Set([...core.places.map(p => p.name), ...core.roads.flatMap(r => r.name ? [r.name] : [])]);
  const known = core.roads.find(r => r.name === 'Yousufguda Main Road' && r.pts.some((p, i) => i && Math.hypot(p[0]-r.pts[i-1][0],p[1]-r.pts[i-1][1])>80))!;
  assert.ok(known, 'regression fixture exists in the packed city');
  const point = known.pts[Math.floor(known.pts.length / 2)];
  const labels = index.layout({ ...view(2), cx: point[0], cz: point[1] }, measure);
  assert.ok(labels.some(label => label.kind === 'road'));
  assert.ok(labels.every(label => names.has(label.text)));
  assert.ok(index.stats.roadSpans > 10000);
});
