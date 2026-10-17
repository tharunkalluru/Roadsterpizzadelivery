// Project-level generated files: sources manifest, scope manifest, GeoJSON, name registry, baseline, ledger world manifest.
import fs from 'node:fs';
import path from 'node:path';
import * as G from './geo.mjs';
import { writeOut, pretty, compact, sha256File, slugify } from './io.mjs';

const PROJECT_ID = 'hyderabad-metro-delivery';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const ll = (x, z) => {
  const p = G.unproject(x, z);
  return [G.r6(p[1]), G.r6(p[0])]; // GeoJSON [lon, lat]
};

export function buildFrontage(roads) {
  const out = [];
  for (const r of roads) {
    const cum = [0];
    for (let i = 1; i < r.points.length; i++) cum.push(cum[i - 1] + G.dist(r.points[i - 1], r.points[i]));
    const L = cum[cum.length - 1];
    const n = Math.max(1, Math.ceil(L / 100));
    const each = G.r2(L / n);
    for (const side of ['L', 'R']) {
      let acc = 0;
      for (let k = 0; k < n; k++) {
        const len = k === n - 1 ? G.r2(L - acc) : each;
        const s0 = (L * k) / n;
        const s1 = (L * (k + 1)) / n;
        acc += each;
        out.push({ id: `fi_${r.id}_${side}_${k}`, road_id: r.id, side: side === 'L' ? 'left' : 'right', length_metres: len, s0, s1, _road: r });
      }
    }
  }
  return out;
}

export function writeProjectFiles(ctx) {
  const { OUT_ROOT, GAME, REPO, KIT, OSM_DIR, WORLD_ID, WORLD_VERSION, PKG_DIR, REF_DATE, SNAPSHOT_ID, GENERATED_AT, core, manifest, acq } = ctx;
  const hashes = {};
  const out = (rel, text) => {
    const o = writeOut(path.join(OUT_ROOT, rel), text);
    hashes[rel] = o.sha256;
    return o;
  };

  // ------------------------------------------------------------ sources-manifest.json
  const acqByFile = new Map(acq.files.map((f) => [f.file, f]));
  const osmDirFiles = fs.readdirSync(OSM_DIR).sort();
  const usedSet = new Set(ctx.usedSources.map((s) => path.basename(s)));
  const corridorNotes = {
    'corridor-01-uppal-stadium.osm': 'OSM API 0.6 map bbox (W,S,E,N) 78.551,17.398,78.564,17.410: Uppal to Stadium Blue Line corridor area.',
    'corridor-02-stadium-ngri.osm': 'OSM API 0.6 map bbox 78.542,17.405,78.557,17.417: Stadium to NGRI corridor area.',
    'corridor-03-ngri-habsiguda.osm': 'OSM API 0.6 map bbox 78.537,17.412,78.550,17.423: NGRI to Habsiguda corridor area.',
    'corridor-04-habsiguda-tarnaka.osm': 'OSM API 0.6 map bbox 78.522,17.418,78.544,17.431: Habsiguda to Tarnaka corridor area.',
    'metro-network-full.json': 'Overpass recursive dump of relation 8826295 (Hyderabad Metro network): Red 8297698, Blue 13986696, Green 8297697 route masters, route relations, route ways and stop nodes.',
    'uppal-starter-osm-map.osm': 'OSM API 0.6 map bbox 78.556,17.398,78.563,17.405 (Uppal only). Subset of corridor-01; not used by the importer.',
  };
  const sources = [];
  for (const f of osmDirFiles) {
    const full = path.join(OSM_DIR, f);
    const rec = acqByFile.get(f);
    const sha = sha256File(full);
    const isOsmData = /\.(osm|json)$/.test(f) && f !== 'resource-acquisition-manifest.json';
    sources.push({
      id: 'src_' + slugify(f),
      path: 'hyderabad-game-handoff/resources/osm/' + f,
      sha256: sha,
      bytes: fs.statSync(full).size,
      provider: f.endsWith('.overpassql') ? 'handoff kit (query text)' : 'OpenStreetMap',
      kind: f.endsWith('.osm') ? 'osm_xml_extract' : f.endsWith('.overpassql') ? 'query' : f.startsWith('metro-') ? 'osm_overpass_json' : 'derived_inventory',
      acquisition_date: REF_DATE,
      acquired_at: rec ? rec.received_at || rec.local_file_written_at || null : null,
      source_url: rec ? rec.url || null : null,
      bbox_west_south_east_north: rec && rec.bbox_west_south_east_north ? rec.bbox_west_south_east_north : null,
      license: isOsmData ? 'ODbL-1.0' : 'n/a (derived from OSM data under ODbL-1.0 or kit text)',
      license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors',
      used_by_import: usedSet.has(f),
      sha256_expected_by_acquisition_manifest: rec ? rec.sha256 : null,
      sha256_verified: rec ? rec.sha256 === sha : null,
      coverage: corridorNotes[f] || (rec ? rec.status : 'acquisition manifest / inventory'),
      status: rec ? rec.status : 'kit_file',
      gaps: f.startsWith('corridor-0')
        ? ['Not field verified; no turn_restriction relations present; 2 height tags and 26 building:levels tags only; boxes were requested separately over seconds (not one atomic snapshot).']
        : f === 'metro-network-full.json'
          ? ['Stops only (no platform/station polygons); no deck or pillar dimensions; Telugu names partial.']
          : [],
    });
  }
  const assets = [];
  for (const [rel, license] of [['resources/fonts/asset-manifest.json', 'OFL-1.1'], ['resources/materials/asset-manifest.json', 'CC0-1.0']]) {
    const m = JSON.parse(fs.readFileSync(path.join(KIT, rel), 'utf8'));
    for (const f of m.files) {
      assets.push({
        id: 'asset_' + slugify(f.local_path),
        path: 'hyderabad-game-handoff/resources/' + f.local_path,
        sha256: f.sha256,
        bytes: f.bytes,
        kind: f.kind,
        provider: rel.includes('fonts') ? 'Google Fonts / Noto Project' : 'Poly Haven',
        source_url: f.source_url,
        retrieved_at_utc: f.retrieved_at_utc,
        license: f.license || license,
        license_url: f.license_url || null,
        authors: f.authors || null,
        note: 'Source record only. The art worker builds assets-manifest.json; not geographic data.',
      });
    }
  }
  const kit = JSON.parse(fs.readFileSync(path.join(KIT, 'kit-manifest.json'), 'utf8'));
  const masterSha = sha256File(path.join(KIT, 'MASTER_PROMPT.md'));
  const sourcesManifest = {
    schema_version: 1,
    project_id: PROJECT_ID,
    source_snapshot_id: SNAPSHOT_ID,
    reference_date: REF_DATE,
    generated_at: GENERATED_AT,
    kit: { version: kit.kit_version, prepared_at: kit.prepared_at, master_prompt_sha256: masterSha },
    notice: 'Geographic data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Contributor metadata (user, uid, changeset, timestamps) is not copied into runtime packages.',
    sources,
    assets,
    network_note: 'Overpass and Geofabrik endpoints are blocked by the environment network policy; no network access was used by the importer. Only bundled files listed above are read.',
  };
  hashes['sources-manifest.json'] = out('sources-manifest.json', pretty(sourcesManifest)).sha256;

  // ------------------------------------------------------------ scope inventories
  const roads = ctx.core.roads;
  const frontage = buildFrontage(roads);
  const stationsIn = core.stations.filter((s) => s.inCorridor);
  const stationOrder = ['Uppal', 'Stadium', 'NGRI', 'Habsiguda', 'Tarnaka'];
  const anchors = stationOrder.map((n) => stationsIn.find((s) => s.name === n)).filter(Boolean);
  const scopeRoads = roads.map((r) => ({
    id: r.id,
    length_metres: r.lengthM,
    corridor_ids: ['blue'],
    source_refs: r.provenance.sourceIds.concat(r.provenance.snapshot.map((s) => 'snapshot:' + s)),
    implemented: false,
    geometry_verified: false,
    name: r.name,
    highway: r.highway,
    oneway: r.oneway,
    way_id: r.wayId,
    routable: r.routable,
  }));
  const scopeJunctions = core.junctions.map((j) => ({
    id: j.id,
    implemented: false,
    verified: false,
    node_id: j.nodeId,
    signalled: j.signalled,
    movement_status: j.movementStatus,
  }));
  const scopeStations = anchors.map((s) => ({ id: s.id, position_verified: false, name_verified: false, lines: s.lines, lat: s.lat, lon: s.lon, osm_ids: s.osmIds }));
  const metroStructures = [];
  for (const s of anchors) metroStructures.push({ id: 'ms_station_' + s.id.replace(/^st_/, ''), implemented: false, verified: false, kind: 'station_structure', station_id: s.id });
  for (let i = 0; i + 1 < anchors.length; i++)
    metroStructures.push({ id: `ms_viaduct_${anchors[i].id.replace(/^st_/, '')}_${anchors[i + 1].id.replace(/^st_/, '')}`, implemented: false, verified: false, kind: 'viaduct_span', from_station_id: anchors[i].id, to_station_id: anchors[i + 1].id });
  const scopeFrontage = frontage.map((f) => ({ id: f.id, road_id: f.road_id, side: f.side, length_metres: f.length_metres, inspection_status: 'uninspected', inventory_complete: false }));
  const scopeNames = ctx.names.map((n) => ({
    id: 'dn_' + n.id,
    entity_id: n.runtimeRefs[0] || n.id,
    entity_type: n.kind,
    name: n.displayName,
    language: n.language,
    verified: false,
    source_date: n.sourceDate,
    source_refs: n.sourceIds.length ? n.sourceIds : ['osm:unknown'],
  }));
  const scopeDeliveries = ctx.deliveries.map((d) => ({ id: d.id, verified_access: false, road_id: d.roadId, poi_id: d.poiId, label: d.label, approach_edges: d.approachEdges }));
  const routeCases = [];
  const ds = ctx.deliveries;
  for (let i = 0; i + 1 < ds.length; i++) {
    routeCases.push({ id: `rc_${ds[i].id}__${ds[i + 1].id}`, from: ds[i].id, to: ds[i + 1].id, evidence_ids: [] });
    routeCases.push({ id: `rc_${ds[i + 1].id}__${ds[i].id}`, from: ds[i + 1].id, to: ds[i].id, evidence_ids: [] });
  }
  if (ds.length > 2) {
    routeCases.push({ id: `rc_${ds[0].id}__${ds[ds.length - 1].id}`, from: ds[0].id, to: ds[ds.length - 1].id, evidence_ids: [] });
    routeCases.push({ id: `rc_${ds[ds.length - 1].id}__${ds[0].id}`, from: ds[ds.length - 1].id, to: ds[0].id, evidence_ids: [] });
  }
  for (const e of core.boundary.exits) routeCases.push({ id: `rc_boundary_exit_${e}`, kind: 'boundary_recovery', road_id: e, evidence_ids: [] });
  const reviewViews = [];
  for (const s of anchors) reviewViews.push({ id: 'rv_station_' + s.id.replace(/^st_/, ''), evidence_ids: [], station_id: s.id });
  for (const d of ds) reviewViews.push({ id: 'rv_delivery_' + d.id.replace(/^d_/, ''), evidence_ids: [], delivery_id: d.id });

  const totalLen = G.r2(roads.reduce((s, r) => s + r.lengthM, 0));
  const frontageTotal = G.r2(scopeFrontage.reduce((s, f) => s + f.length_metres, 0));

  // ------------------------------------------------------------ scope.geojson / coverage.geojson
  const metroFeatures = core.metroLines.map((L) => ({
    type: 'Feature',
    id: 'line_' + L.id,
    geometry: { type: 'MultiLineString', coordinates: L.geo.map((pl) => pl.map((p) => [p[1], p[0]])) },
    properties: { kind: 'metro_line', line: L.id, name: L.name, color: L.color, status: L.id === 'blue' ? 'metro_geometry_imported_provisional' : 'requested_roads_not_acquired', osm_route_master: L.osmRouteMasterId },
  }));
  const roadFeature = (r, cov) => ({
    type: 'Feature',
    id: r.id,
    geometry: { type: 'LineString', coordinates: r.points.map((p) => ll(p[0], p[1])) },
    properties: {
      kind: 'road',
      status: 'imported_provisional',
      name: r.name,
      highway: r.highway,
      oneway: r.oneway,
      bridge: r.bridge,
      length_metres: r.lengthM,
      corridor_ids: ['blue'],
      way: 'way/' + r.wayId,
      routable: r.routable,
      ...(cov ? { implemented: false, geometry_verified: false } : {}),
    },
  });
  const stationFeature = (s) => ({
    type: 'Feature',
    id: s.id,
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: { kind: 'station', name: s.name, lines: s.lines, in_corridor: s.inCorridor, status: s.inCorridor ? 'position_unverified' : 'outside_package', position_verified: false, name_verified: false },
  });
  const deliveryFeature = (d) => {
    const p = G.unproject(d.entrance[0], d.entrance[1]);
    return { type: 'Feature', id: d.id, geometry: { type: 'Point', coordinates: [G.r6(p[1]), G.r6(p[0])] }, properties: { kind: 'delivery', label: d.label, road_id: d.roadId, side: d.side, status: 'provisional', verified_access: false } };
  };
  const frontageFeature = (f, cov) => {
    const r = f._road;
    const cum = [0];
    for (let i = 1; i < r.points.length; i++) cum.push(cum[i - 1] + G.dist(r.points[i - 1], r.points[i]));
    const sub = G.subPolyline(r.points, cum, f.s0, f.s1);
    const off = G.offsetLine(sub, (f.side === 'left' ? 1 : -1) * (r.widthM / 2 + 2));
    return {
      type: 'Feature',
      id: f.id,
      geometry: { type: 'LineString', coordinates: off.map((p) => ll(p[0], p[1])) },
      properties: { kind: 'frontage_interval', road_id: f.road_id, side: f.side, length_metres: f.length_metres, inspection_status: 'uninspected', inventory_complete: false, ...(cov ? { status: 'uninspected' } : {}) },
    };
  };
  const mkGeo = (cov) => ({
    type: 'FeatureCollection',
    name: cov ? 'coverage' : 'scope',
    properties: {
      project_id: PROJECT_ID,
      source_snapshot_id: SNAPSHOT_ID,
      reference_date: REF_DATE,
      note: cov
        ? 'Geographic coverage view. Everything is imported_provisional/unverified/uninspected; nothing is field verified. Red and Green road coverage: unknown (not acquired).'
        : 'Frozen geography of the Uppal-Tarnaka corridor package (revision uppal-tarnaka-r1). Coordinates are [lon, lat]. Attribution: © OpenStreetMap contributors (ODbL 1.0).',
    },
    features: [
      ...roads.map((r) => roadFeature(r, cov)),
      ...core.stations.map(stationFeature),
      ...ctx.deliveries.map(deliveryFeature),
      ...frontage.map((f) => frontageFeature(f, cov)),
      ...metroFeatures,
    ],
  });
  const scopeGeo = out('scope.geojson', compact(mkGeo(false)) + '\n');
  out(path.join('qa', 'coverage.geojson'), compact(mkGeo(true)) + '\n');

  // ------------------------------------------------------------ baseline + scope manifest
  const baseline = {
    schema_version: 1,
    project_id: PROJECT_ID,
    revision: 'uppal-tarnaka-r1',
    note: 'Initial frozen inventory baseline for the Uppal-Tarnaka corridor package. Any change of IDs, road lengths or frontage intervals requires a reviewed new baseline revision; keep this one.',
    roads: scopeRoads.map((r) => ({ id: r.id, length_metres: r.length_metres, corridor_ids: r.corridor_ids })),
    junctions: scopeJunctions.map((j) => ({ id: j.id })),
    stations: scopeStations.map((s) => ({ id: s.id })),
    metro_structures: metroStructures.map((m) => ({ id: m.id })),
    frontage_intervals: scopeFrontage.map((f) => ({ id: f.id, road_id: f.road_id, side: f.side, length_metres: f.length_metres })),
    businesses: [],
    displayed_names: scopeNames.map((n) => ({ id: n.id })),
    delivery_locations: scopeDeliveries.map((d) => ({ id: d.id })),
    route_cases: routeCases.map((r) => ({ id: r.id })),
    review_views: reviewViews.map((v) => ({ id: v.id })),
  };
  const baselineOut = out(path.join('data', 'scope-baseline.json'), compact(baseline) + '\n');

  const scope = {
    schema_version: 1,
    project_id: PROJECT_ID,
    revision: 'uppal-tarnaka-r1',
    frozen: true,
    scope_extent: 'achieved_package_uppal_tarnaka_blue_only',
    requested_corridor_ids: ['red', 'blue', 'green'],
    source_snapshot_id: SNAPSHOT_ID,
    reference_date: REF_DATE,
    geometry_artifact: { path: 'scope.geojson', sha256: scopeGeo.sha256 },
    baseline_artifact: { path: 'data/scope-baseline.json', sha256: baselineOut.sha256 },
    roads: scopeRoads,
    junctions: scopeJunctions,
    stations: scopeStations,
    metro_structures: metroStructures,
    frontage_intervals: scopeFrontage,
    businesses: [],
    displayed_names: scopeNames,
    delivery_locations: scopeDeliveries,
    route_cases: routeCases,
    review_views: reviewViews,
    requested_scope: {
      statement: 'All three operating Hyderabad Metro corridors: Red Miyapur to LB Nagar, Blue Nagole to Raidurg, Green JBS Parade Ground to MG Bus Station (selected roads within ~200 m of the alignment, up to ~500 m where justified).',
      route_masters: { red: 8297698, blue: 13986696, green: 8297697 },
    },
    achieved_scope: {
      statement: 'Frozen road inventory for ONE corridor package only: Blue Line Uppal to Tarnaka (stations Uppal, Stadium, NGRI, Habsiguda, Tarnaka). Red and Green corridors and the rest of Blue (Nagole to Uppal, Tarnaka to Raidurg) have NO selected roads: no road data was acquired (Overpass/Geofabrik blocked by environment network policy).',
      package: manifest.worldId + ' v' + WORLD_VERSION,
      road_inventory_by_corridor: {
        blue_uppal_tarnaka: { roads: roads.length, physical_length_metres: totalLen },
        blue_rest: { roads: null, physical_length_metres: null, status: 'unknown_not_acquired' },
        red: { roads: null, physical_length_metres: null, status: 'unknown_not_acquired' },
        green: { roads: null, physical_length_metres: null, status: 'unknown_not_acquired' },
      },
      requested_network_denominators: {
        roads_total_metres: null,
        frontage_total_metres: null,
        business_inventory_complete: false,
        note: 'null = unknown. Never 0 or 100 percent. Package-only totals are given separately under achieved_package_totals.',
      },
      achieved_package_totals: {
        roads: roads.length,
        roads_total_metres: totalLen,
        routable_roads: roads.filter((r) => r.routable).length,
        routable_roads_metres: G.r2(roads.filter((r) => r.routable).reduce((a, r) => a + r.lengthM, 0)),
        non_routable_boundary_roads: roads.filter((r) => !r.routable).length,
        non_routable_boundary_roads_metres: G.r2(roads.filter((r) => !r.routable).reduce((a, r) => a + r.lengthM, 0)),
        non_routable_note: 'Non-routable boundary roads are drivable OSM roads weakly connected to the strongly connected routable core (they leave or enter the acquired data); implemented as roads, never used for deliveries or routes, not field verified.',
        frontage_intervals: scopeFrontage.length,
        frontage_total_metres: frontageTotal,
        junctions: scopeJunctions.length,
        stations: scopeStations.length,
        delivery_locations: scopeDeliveries.length,
        displayed_names: scopeNames.length,
        businesses_inventoried: 0,
        business_inventory_complete: false,
      },
      all_metro_stations_in_source: core.stations.map((s) => ({ id: s.id, name: s.name, lines: s.lines, in_package: s.inCorridor })),
    },
    length_convention: 'Physical road length = sum of OSM centreline lengths of the selected RoadEdges (rounded to 0.01 m), each two-way road counted once, one-way carriageways counted once each. Directed edges are never double counted. Frontage lengths are per street side (left/right of the edge forward direction), so frontage_total = 2 x road total.',
    selection_rules_ref: 'game/DATA_SOURCES.md#road-selection',
    generated_from: { world_manifest: PKG_DIR.replace(/\\/g, '/') + '/manifest.json', world_manifest_sha256: ctx.manifestOut.sha256 },
  };
  const scopeOut = out('scope-manifest.json', pretty(scope));

  // ------------------------------------------------------------ name-registry.json
  const registry = {
    schema_version: 1,
    project_id: PROJECT_ID,
    world_id: WORLD_ID,
    world_version: WORLD_VERSION,
    source_snapshot_id: SNAPSHOT_ID,
    reference_date: REF_DATE,
    generated_at: GENERATED_AT,
    notes: [
      'Every record is verification=provisional: names are OpenStreetMap source claims, not field verified.',
      'sourceName keeps the original OSM spelling; displayName is whitespace-normalised (first letter capitalised) or, for stations, the line suffix is removed.',
      'Neighbourhood records carry an extra position (not part of the runtime NameRecord) for map labelling.',
      'Telugu aliases come from name:te tags only where present; none were invented. The Blue route-level name:te tag (నాగోల్) is NOT a line name and is not used.',
    ],
    records: ctx.names.map((n) => (ctx.neighbourhoodPos.has(n.id) ? { ...n, position: ctx.neighbourhoodPos.get(n.id) } : n)),
  };
  hashes['name-registry.json'] = out('name-registry.json', pretty(registry)).sha256;

  // ------------------------------------------------------------ ledger-style world manifest
  const artifacts = [];
  const pkg = PKG_DIR.replace(/\\/g, '/');
  artifacts.push({ path: `public/world/${WORLD_ID}/v1/manifest.json`, sha256: ctx.manifestOut.sha256 });
  artifacts.push({ path: `public/world/${WORLD_ID}/v1/core.json`, sha256: ctx.coreOut.sha256 });
  for (const c of ctx.chunkRefs) artifacts.push({ path: `${pkg}/${c.file}`, sha256: c.sha256 });
  for (const f of ['sources-manifest.json', 'name-registry.json', 'scope.geojson', 'data/scope-baseline.json']) artifacts.push({ path: f, sha256: hashes[f] || baselineOut.sha256 });
  artifacts.sort((a, b) => cmp(a.path, b.path));
  const worldManifest = {
    schema_version: 1,
    project_id: PROJECT_ID,
    kind: 'world_manifest',
    scope_sha256: scopeOut.sha256,
    source_snapshot_id: SNAPSHOT_ID,
    world_id: WORLD_ID,
    world_version: WORLD_VERSION,
    reference_date: REF_DATE,
    note: 'Ledger binding for the generated Uppal-Tarnaka package only (achieved scope). The requested network (Red, Green, rest of Blue) is NOT represented.',
    artifacts,
  };
  hashes['public/world/world-manifest.json'] = out(path.join('public', 'world', 'world-manifest.json'), pretty(worldManifest)).sha256;
  hashes['scope-manifest.json'] = scopeOut.sha256;
  hashes['data/scope-baseline.json'] = baselineOut.sha256;
  hashes['scope.geojson'] = scopeGeo.sha256;
  return { hashes, frontage: frontage.length, frontageTotal, totalLen };
}
