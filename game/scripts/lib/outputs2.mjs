// v2 project-level generated files: sources manifest, scope manifest, GeoJSON, name registry, baseline, ledger world manifest.
import fs from 'node:fs';
import path from 'node:path';
import * as G from './geo.mjs';
import { writeOut, pretty, compact, sha256File, slugify } from './io.mjs';
import { buildFrontage } from './outputs.mjs';

const PROJECT_ID = 'hyderabad-metro-delivery';
export const SCOPE_REVISION = 'hyd-metro-v2-r1';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ll = (x, z) => {
  const p = G.unproject(x, z);
  return [G.r6(p[1]), G.r6(p[0])]; // GeoJSON [lon, lat]
};

const ATTR_OSM = '© OpenStreetMap contributors (ODbL 1.0, https://www.openstreetmap.org/copyright)';
const ATTRIBUTION = {
  transportation: 'Transportation data © OpenStreetMap contributors (ODbL 1.0), distributed by the Overture Maps Foundation (release 2026-09-23.1); segments sourced from TomTom Orbis Maps carry the dataset licence ODbL-1.0 recorded in each Overture source entry (© TomTom).',
  buildings: 'Building footprints from the Overture Maps Foundation buildings theme (release 2026-09-23.1): © OpenStreetMap contributors (ODbL 1.0) for the OpenStreetMap-sourced records, Microsoft ML Buildings (licence recorded as ODbL-1.0 in each source entry) and Google Open Buildings (no licence value in the Overture source entry; the publisher licence must be confirmed before release).',
  base: 'Land use / water from the Overture Maps Foundation base theme: © OpenStreetMap contributors (ODbL 1.0).',
  places: 'Places data © Overture Maps Foundation (CDLA-Permissive-2.0); business listings contributed by Meta, Microsoft, DAC and PinMeTo (CDLA-Permissive-2.0), Foursquare (Apache-2.0) and AllThePlaces (CC0-1.0), as recorded in each Overture source entry.',
};
const LICENCE_URL = {
  'ODbL-1.0': 'https://opendatacommons.org/licenses/odbl/1-0/',
  'CDLA-Permissive-2.0': 'https://cdla.dev/permissive-2-0/',
};

export function writeV2ProjectFiles(ctx) {
  const { OUT_ROOT, GAME, REPO, KIT, OSM_DIR, RAW_DIR, WORLD_ID, WORLD_VERSION, PKG_DIR, REF_DATE, SNAPSHOT_ID, GENERATED_AT, RELEASE, core, manifest, manifestOut, coreOut, chunkRefs, names, acq, fetchManifest, stations, storefronts, storefrontRecs, roadsInternal, deliveriesInternal, LINE_IDS, lineStops, primaryChain, invOut, invSummary, bldSrcCount } = ctx;
  const hashes = {};
  const out = (rel, text) => {
    const o = writeOut(path.join(OUT_ROOT, rel), text);
    hashes[rel] = o.sha256;
    return o;
  };
  const roads = roadsInternal;
  const licences = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'source-licences.json'), 'utf8'));

  // ------------------------------------------------------------ sources-manifest.json
  const themeKey = (t, ty) => (t === 'transportation' ? 'transportation' : t === 'buildings' ? 'buildings' : t === 'base' ? 'base' : 'places');
  const licOf = (theme, type) => {
    const rec = licences.themes[`${theme}/${type}`] || {};
    return Object.entries(rec).map(([k, n]) => {
      const [ds, lic] = k.split('|');
      return { dataset: ds, license: lic === 'None' ? null : lic, entries: n };
    });
  };
  const sources = [];
  for (const key of Object.keys(fetchManifest.files).sort()) {
    const f = fetchManifest.files[key];
    const full = path.join(RAW_DIR, f.file);
    const sha = sha256File(full);
    const lb = fetchManifest.lines[f.line].bbox_lonlat;
    const tk = themeKey(f.theme, f.type);
    const lics = licOf(f.theme, f.type);
    const licSet = [...new Set(lics.map((x) => x.license || 'unspecified-in-source-entry'))].sort();
    sources.push({
      id: 'src_overture_' + slugify(key),
      path: `game/data/raw/overture/${RELEASE}/${f.file}`,
      sha256: sha,
      bytes: fs.statSync(full).size,
      provider: 'Overture Maps Foundation',
      kind: 'overture_parquet',
      release: RELEASE,
      theme: f.theme,
      type: f.type,
      line: f.line,
      rows: f.rows,
      acquisition_date: f.fetched_at.slice(0, 10),
      acquired_at: f.fetched_at,
      source_url: `s3://overturemaps-us-west-2/release/${RELEASE}/theme=${f.theme}/type=${f.type}/ (anonymous, region us-west-2)`,
      bbox_west_south_east_north: [lb.xmin, lb.ymin, lb.xmax, lb.ymax],
      license: tk === 'places' ? 'CDLA-Permissive-2.0 (Overture, Meta, Microsoft, DAC, PinMeTo); Apache-2.0 (Foursquare); CC0-1.0 (AllThePlaces)' : 'ODbL-1.0' + (tk === 'buildings' ? ' (OpenStreetMap and Microsoft ML Buildings records); Google Open Buildings records carry no licence value' : ''),
      licenses_per_source_dataset: lics,
      license_url: tk === 'places' ? LICENCE_URL['CDLA-Permissive-2.0'] : LICENCE_URL['ODbL-1.0'],
      attribution: ATTRIBUTION[tk],
      used_by_import: !(f.theme === 'base'),
      sha256_expected_by_fetch_manifest: f.sha256,
      sha256_verified: f.sha256 === sha,
      coverage: `Rows of ${f.theme}/${f.type} whose bbox intersects the ${f.line} line alignment buffered by ${fetchManifest.buffer_m} m (${f.rows} of ${f.rows_in_line_bbox} rows in the line bbox).`,
      status: 'frozen_snapshot',
      gaps: f.theme === 'base' ? ['Fetched and cached for art use; not read by the importer.'] : f.theme === 'places' ? ['Listings are not imagery verified; contact fields (phone, email, website, social) are deliberately not fetched; confidence is a model score.'] : f.theme === 'buildings' ? ['Heights are present for few footprints (provisional heights otherwise); footprints can overlap carriageways.'] : ['Turn restrictions are sparse (prohibited_transitions); no signal nodes; widths are class defaults unless width_rules exist.'],
      licence_summary_note: licenseNote(tk, licSet),
    });
  }
  function licenseNote(tk, licSet) {
    return `licences found in the source entries of this theme: ${licSet.join(', ')}`;
  }
  for (const [rel, kind, desc] of [['fetch-manifest.json', 'overture_fetch_manifest', 'bbox, row counts, bytes, sha256 and timestamp of every frozen parquet file'], ['source-licences.json', 'overture_licence_summary', 'dataset|licence counts of the source entries in the frozen rows']]) {
    const full = path.join(RAW_DIR, rel);
    sources.push({ id: 'src_overture_' + slugify(rel), path: `game/data/raw/overture/${RELEASE}/${rel}`, sha256: sha256File(full), bytes: fs.statSync(full).size, provider: 'this project (derived from the Overture fetch)', kind, release: RELEASE, acquisition_date: REF_DATE, acquired_at: null, source_url: null, license: 'n/a (inventory of data under ODbL-1.0 / CDLA-Permissive-2.0 / Apache-2.0 / CC0-1.0)', license_url: null, attribution: ATTR_OSM, used_by_import: true, coverage: desc, status: 'derived_inventory', gaps: [] });
  }
  // OSM kit files (metro alignments and stations)
  const acqByFile = new Map(acq.files.map((f) => [f.file, f]));
  const usedKit = new Set(['metro-network-full.json', 'resource-acquisition-manifest.json']);
  for (const f of fs.readdirSync(OSM_DIR).sort()) {
    const full = path.join(OSM_DIR, f);
    const rec = acqByFile.get(f);
    const isOsmData = /\.(osm|json)$/.test(f) && f !== 'resource-acquisition-manifest.json';
    sources.push({
      id: 'src_' + slugify(f),
      path: 'hyderabad-game-handoff/resources/osm/' + f,
      sha256: sha256File(full),
      bytes: fs.statSync(full).size,
      provider: f.endsWith('.overpassql') ? 'handoff kit (query text)' : 'OpenStreetMap',
      kind: f.endsWith('.osm') ? 'osm_xml_extract' : f.endsWith('.overpassql') ? 'query' : f.startsWith('metro-') ? 'osm_overpass_json' : 'derived_inventory',
      acquisition_date: '2026-10-17',
      acquired_at: rec ? rec.received_at || rec.local_file_written_at || null : null,
      source_url: rec ? rec.url || null : null,
      bbox_west_south_east_north: rec && rec.bbox_west_south_east_north ? rec.bbox_west_south_east_north : null,
      license: isOsmData ? 'ODbL-1.0' : 'n/a (derived from OSM data under ODbL-1.0 or kit text)',
      license_url: LICENCE_URL['ODbL-1.0'],
      attribution: ATTR_OSM,
      used_by_import: usedKit.has(f),
      sha256_expected_by_acquisition_manifest: rec ? rec.sha256 : null,
      sha256_verified: rec ? rec.sha256 === sha256File(full) : null,
      coverage: usedKit.has(f) ? (f === 'metro-network-full.json' ? 'Hyderabad Metro network relation 8826295: Red 8297698, Blue 13986696, Green 8297697 route masters, routes, route ways and stop nodes (metro alignments, 57 stations).' : 'acquisition provenance record') : 'v1 Blue Line corridor extract; kept as history, not read by the v2 importer.',
      status: rec ? rec.status : 'kit_file',
      gaps: f === 'metro-network-full.json' ? ['Stops only (no platform/station polygons); no deck or pillar dimensions; Telugu names partial.'] : [],
    });
  }
  const assets = [];
  for (const [rel, license] of [['resources/fonts/asset-manifest.json', 'OFL-1.1'], ['resources/materials/asset-manifest.json', 'CC0-1.0']]) {
    const m = JSON.parse(fs.readFileSync(path.join(KIT, rel), 'utf8'));
    for (const f of m.files) {
      assets.push({ id: 'asset_' + slugify(f.local_path), path: 'hyderabad-game-handoff/resources/' + f.local_path, sha256: f.sha256, bytes: f.bytes, kind: f.kind, provider: rel.includes('fonts') ? 'Google Fonts / Noto Project' : 'Poly Haven', source_url: f.source_url, retrieved_at_utc: f.retrieved_at_utc, license: f.license || license, license_url: f.license_url || null, authors: f.authors || null, note: 'Source record only. The art worker builds assets-manifest.json; not geographic data.' });
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
    notice: 'Geographic data: © OpenStreetMap contributors, ODbL 1.0 (roads, building footprints, land use/water, metro alignments), via the Overture Maps Foundation release ' + RELEASE + '; business listings: Overture Maps Places, CDLA-Permissive-2.0 (some source datasets Apache-2.0 / CC0-1.0). Contributor metadata and contact fields are not copied into runtime packages.',
    licence_summary: {
      'transportation (roads, turn restrictions, footways)': 'ODbL-1.0 (OpenStreetMap; TomTom Orbis segments recorded as ODbL-1.0)',
      'buildings (footprints, heights)': 'per record: OpenStreetMap ODbL-1.0 (' + (bldSrcCount['OpenStreetMap'] || 0) + ' kept footprints), Microsoft ML Buildings ODbL-1.0 (' + (bldSrcCount['Microsoft ML Buildings'] || 0) + '), Google Open Buildings, licence value absent (' + (bldSrcCount['Google Open Buildings'] || 0) + '). NOT CDLA-Permissive-2.0 in this release.',
      'base (land use, water)': 'ODbL-1.0 (OpenStreetMap)',
      'places (storefront listings)': 'CDLA-Permissive-2.0 (Overture, Meta, Microsoft, DAC, PinMeTo), Apache-2.0 (Foursquare), CC0-1.0 (AllThePlaces)',
      'metro alignments and stations': 'ODbL-1.0 (OpenStreetMap, bundled kit snapshot)',
      combined_package: 'The v2 world package merges ODbL data (roads, buildings, metro) with permissive listings. If it is publicly distributed, the ODbL-derived database must be offered under ODbL-1.0 with the attributions above; the permissive listings keep their own licences. Legal classification needs review before release.',
    },
    sources,
    assets,
    network_note: 'The importer reads only the frozen snapshot files listed above (no network). Overture was fetched anonymously from S3 by scripts/overture/fetch.py; stac.overturemaps.org, Overpass, Geofabrik and the OSM API are blocked by the environment.',
  };
  out('sources-manifest.json', pretty(sourcesManifest));

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
      'Every record is verification=provisional: names are source claims (Overture / OpenStreetMap), not field verified.',
      'sourceName keeps the original spelling; displayName is whitespace-normalised (first letter capitalised) or, for stations, the line suffix is removed.',
      'Telugu aliases come from names.common["te"] / name:te only where present; none were invented (Overture Places carried no Telugu names in this snapshot).',
      'Storefront (shop signboard) names live in the chunk files and qa/storefront-inventory.json, not in this registry; only delivery destinations are registered as kind "poi".',
      'v2 has no neighbourhood records (the Overture divisions theme was not fetched).',
    ],
    records: names,
  };
  out('name-registry.json', pretty(registry));

  // ------------------------------------------------------------ scope tables
  const frontage = buildFrontage(roads);
  const frontageById = new Map(frontage.map((f) => [f.id, f]));
  const lineIdx = Object.fromEntries(LINE_IDS.map((l, i) => [l, i]));
  const corridorsOf = (r) => {
    const e = r._e;
    const lim = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'].includes(e.highway) ? 300 : 150;
    const ls = LINE_IDS.filter((l) => e.dl[l] <= lim);
    return (ls.length ? ls : [e.nearLine]).sort((a, b) => lineIdx[a] - lineIdx[b]);
  };
  const scopeRoads = roads.map((r) => ({
    id: r.id,
    length_metres: r.lengthM,
    corridor_ids: corridorsOf(r),
    source_refs: r.provenance.sourceIds.concat(['snapshot:overture-' + RELEASE]),
    implemented: false,
    geometry_verified: false,
    name: r.name,
    highway: r.highway,
    oneway: r.oneway,
    way_id: r.wayId,
    routable: r.routable,
  }));
  const scopeJunctions = core.junctions.map((j) => ({ id: j.id, implemented: false, verified: false, node_id: j.nodeId, signalled: j.signalled, movement_status: j.movementStatus }));
  const scopeStations = stations.map((s) => ({ id: s.id, position_verified: false, name_verified: false, lines: s.lines, lat: s.lat, lon: s.lon, osm_ids: s.osmIds }));
  const metroStructures = stations.map((s) => ({ id: 'ms_station_' + s.id.replace(/^st_/, ''), implemented: false, verified: false, kind: 'station_structure', station_id: s.id }));
  for (const lid of LINE_IDS) {
    const order = lineStops[lid] || [];
    for (let i = 0; i + 1 < order.length; i++) metroStructures.push({ id: `ms_viaduct_${lid}_${order[i].replace(/^st_/, '')}_${order[i + 1].replace(/^st_/, '')}`, implemented: false, verified: false, kind: 'viaduct_span', line: lid, from_station_id: order[i], to_station_id: order[i + 1] });
  }
  const scopeFrontage = frontage.map((f) => ({ id: f.id, road_id: f.road_id, side: f.side, length_metres: f.length_metres, inspection_status: 'uninspected', inventory_complete: false }));
  const scopeNames = names.map((n) => ({ id: 'dn_' + n.id, entity_id: n.runtimeRefs[0] || n.id, entity_type: n.kind, name: n.displayName, language: n.language, verified: false, source_date: n.sourceDate, source_refs: n.sourceIds.length ? n.sourceIds : ['overture:unknown'] }));
  const scopeDeliveries = core.deliveries.map((d) => ({ id: d.id, verified_access: false, road_id: d.roadId, poi_id: d.poiId, label: d.label, approach_edges: d.approachEdges }));
  // businesses: every rendered listing-based storefront, tied to the frontage interval it sits on (nothing verified)
  const roadById = new Map(roads.map((r) => [r.id, r]));
  const businesses = storefronts.map((sf) => {
    const r = roadById.get(sf.roadId);
    const mid = [(sf.facade[0][0] + sf.facade[1][0]) / 2, (sf.facade[0][1] + sf.facade[1][1]) / 2];
    const nr = G.nearestOnPolyline(mid, r.points);
    const L = G.polyLength(r.points);
    const n = Math.max(1, Math.ceil(L / 100));
    const k = Math.max(0, Math.min(n - 1, Math.floor((nr.s / L) * n)));
    const fid = `fi_${r.id}_${sf.side === 'left' ? 'L' : 'R'}_${k}`;
    return { id: 'biz_' + sf.id, storefront_id: sf.id, name: sf.name, frontage_interval_id: frontageById.has(fid) ? fid : `fi_${r.id}_${sf.side === 'left' ? 'L' : 'R'}_0`, implemented: false, identity_verified: false, placement_verified: false, listing_status: 'provisional_listing', confidence: sf.confidence, group: sf.group, source_refs: ['overture:place/' + sf.placeId, 'snapshot:overture-' + RELEASE] };
  }).sort((a, b) => cmp(a.id, b.id));
  // route cases: consecutive deliveries along each line (by arclength on the line's primary alignment) and boundary recoveries
  const ds = deliveriesInternal.slice().sort((a, b) => {
    const la = lineIdx[a._line], lb = lineIdx[b._line];
    if (la !== lb) return la - lb;
    const ch = (primaryChain[a._line] || [])[0];
    const sa = ch ? G.nearestOnPolyline(a.entrance, ch).s : 0;
    const sb = ch ? G.nearestOnPolyline(b.entrance, ch).s : 0;
    return sa - sb || cmp(a.id, b.id);
  });
  const routeCases = [];
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
  for (const s of stations) reviewViews.push({ id: 'rv_station_' + s.id.replace(/^st_/, ''), evidence_ids: [], station_id: s.id });
  for (const d of core.deliveries) reviewViews.push({ id: 'rv_delivery_' + d.id.replace(/^d_/, ''), evidence_ids: [], delivery_id: d.id });

  const totalLen = G.r2(roads.reduce((s, r) => s + r.lengthM, 0));
  const frontageTotal = G.r2(scopeFrontage.reduce((s, f) => s + f.length_metres, 0));

  // ------------------------------------------------------------ scope.geojson / coverage.geojson
  const metroFeatures = core.metroLines.map((L) => ({
    type: 'Feature',
    id: 'line_' + L.id,
    geometry: { type: 'MultiLineString', coordinates: L.geo.map((pl) => pl.map((p) => [p[1], p[0]])) },
    properties: { kind: 'metro_line', line: L.id, name: L.name, color: L.color, status: 'metro_geometry_imported_provisional', osm_route_master: L.osmRouteMasterId },
  }));
  const roadFeature = (r, cov) => ({
    type: 'Feature',
    id: r.id,
    geometry: { type: 'LineString', coordinates: r.points.map((p) => ll(p[0], p[1])) },
    properties: { kind: 'road', status: 'imported_provisional', name: r.name, highway: r.highway, oneway: r.oneway, bridge: r.bridge, length_metres: r.lengthM, corridor_ids: corridorsOf(r), segment: r.provenance.sourceIds[0], routable: r.routable, ...(cov ? { implemented: false, geometry_verified: false } : {}) },
  });
  const stationFeature = (s) => ({ type: 'Feature', id: s.id, geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { kind: 'station', name: s.name, lines: s.lines, in_corridor: true, status: 'position_unverified', position_verified: false, name_verified: false } });
  const deliveryFeature = (d) => {
    const p = G.unproject(d.entrance[0], d.entrance[1]);
    return { type: 'Feature', id: d.id, geometry: { type: 'Point', coordinates: [G.r6(p[1]), G.r6(p[0])] }, properties: { kind: 'delivery', label: d.label, road_id: d.roadId, side: d.side, status: 'provisional', verified_access: false } };
  };
  const storefrontFeature = (sf) => {
    const p = G.unproject(sf.x, sf.z);
    return { type: 'Feature', id: sf.id, geometry: { type: 'Point', coordinates: [G.r6(p[1]), G.r6(p[0])] }, properties: { kind: 'storefront_listing', name: sf.name, group: sf.group, confidence: sf.confidence, status: 'provisional_listing' } };
  };
  const mkGeo = (cov) => ({
    type: 'FeatureCollection',
    name: cov ? 'coverage' : 'scope',
    properties: {
      project_id: PROJECT_ID,
      source_snapshot_id: SNAPSHOT_ID,
      reference_date: REF_DATE,
      note: cov
        ? 'Geographic coverage view of the v2 package (all three lines). Everything is imported_provisional/unverified/uninspected; nothing is field verified. Storefront listing points are listing-based (Overture Places), not imagery verified.'
        : 'Frozen geography of the v2 package (revision ' + SCOPE_REVISION + '): roads, stations, deliveries and metro lines. Coordinates are [lon, lat]. Frontage intervals are defined by scope-manifest.json (road id + side + 100 m slice) and are not drawn here. Attribution: © OpenStreetMap contributors (ODbL 1.0); places © Overture Maps Foundation (CDLA-Permissive-2.0).',
    },
    features: [
      ...roads.map((r) => roadFeature(r, cov)),
      ...core.stations.map(stationFeature),
      ...core.deliveries.map(deliveryFeature),
      ...(cov ? storefronts.map(storefrontFeature) : []),
      ...metroFeatures,
    ],
  });
  const scopeGeo = out('scope.geojson', compact(mkGeo(false)) + '\n');
  out(path.join('qa', 'coverage.geojson'), compact(mkGeo(true)) + '\n');

  // ------------------------------------------------------------ baseline + scope manifest
  const baselinePath = path.join(OUT_ROOT, 'data', 'scope-baseline.json');
  const v1Backup = path.join(OUT_ROOT, 'data', 'scope-baseline-uppal-tarnaka-r1.json');
  if (fs.existsSync(baselinePath) && !fs.existsSync(v1Backup)) {
    try {
      if (JSON.parse(fs.readFileSync(baselinePath, 'utf8')).revision === 'uppal-tarnaka-r1') fs.copyFileSync(baselinePath, v1Backup);
    } catch (e) { /* ignore */ }
  }
  const baseline = {
    schema_version: 1,
    project_id: PROJECT_ID,
    revision: SCOPE_REVISION,
    note: 'Revised frozen inventory baseline for the v2 package (all three lines, Overture roads/buildings/places). Supersedes uppal-tarnaka-r1 (kept in data/scope-baseline-uppal-tarnaka-r1.json). Any change of IDs, road lengths or frontage intervals requires a reviewed new baseline revision.',
    roads: scopeRoads.map((r) => ({ id: r.id, length_metres: r.length_metres, corridor_ids: r.corridor_ids })),
    junctions: scopeJunctions.map((j) => ({ id: j.id })),
    stations: scopeStations.map((s) => ({ id: s.id })),
    metro_structures: metroStructures.map((m) => ({ id: m.id })),
    frontage_intervals: scopeFrontage.map((f) => ({ id: f.id, road_id: f.road_id, side: f.side, length_metres: f.length_metres })),
    businesses: businesses.map((b) => ({ id: b.id })),
    displayed_names: scopeNames.map((n) => ({ id: n.id })),
    delivery_locations: scopeDeliveries.map((d) => ({ id: d.id })),
    route_cases: routeCases.map((r) => ({ id: r.id })),
    review_views: reviewViews.map((v) => ({ id: v.id })),
  };
  const baselineOut = out(path.join('data', 'scope-baseline.json'), compact(baseline) + '\n');
  const perLine = {};
  for (const l of LINE_IDS) {
    const mine = roads.filter((r) => r._e.nearLine === l);
    perLine[l] = { roads: mine.length, physical_length_metres: G.r2(mine.reduce((s, r) => s + r.lengthM, 0)), routable_length_metres: G.r2(mine.filter((r) => r.routable).reduce((s, r) => s + r.lengthM, 0)) };
  }
  const scope = {
    schema_version: 1,
    project_id: PROJECT_ID,
    revision: SCOPE_REVISION,
    frozen: true,
    scope_extent: 'requested_network',
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
    businesses,
    displayed_names: scopeNames,
    delivery_locations: scopeDeliveries,
    route_cases: routeCases,
    review_views: reviewViews,
    requested_scope: {
      statement: 'All three operating Hyderabad Metro corridors: Red Miyapur to LB Nagar, Blue Nagole to Raidurg, Green JBS Parade Ground to MG Bus Station. v2 rule (EXPANSION_PLAN 1.2): all main classes (motorway to tertiary and links) within 300 m of an alignment, every drivable class within 150 m, kept strongly connected through real roads; boundary roads weakly connected.',
      route_masters: { red: 8297698, blue: 13986696, green: 8297697 },
    },
    achieved_scope: {
      statement: 'Frozen road inventory for the whole network (Red, Blue, Green) from Overture Maps ' + RELEASE + ' transportation segments; metro alignments and 57 stations from the bundled OSM kit snapshot. Nothing is field verified.',
      package: manifest.worldId + ' v' + WORLD_VERSION,
      road_inventory_by_corridor: perLine,
      requested_network_denominators: { roads_total_metres: totalLen, frontage_total_metres: frontageTotal, business_inventory_complete: false, note: 'Road and frontage totals are the selected network (rule-based). Business completeness is unknown: listings are model-scored and not imagery verified.' },
      achieved_package_totals: {
        roads: roads.length,
        roads_total_metres: totalLen,
        routable_roads: roads.filter((r) => r.routable).length,
        routable_roads_metres: G.r2(roads.filter((r) => r.routable).reduce((a, r) => a + r.lengthM, 0)),
        non_routable_boundary_roads: roads.filter((r) => !r.routable).length,
        non_routable_boundary_roads_metres: G.r2(roads.filter((r) => !r.routable).reduce((a, r) => a + r.lengthM, 0)),
        non_routable_note: 'Boundary roads are drivable Overture roads weakly (not strongly) connected to the routable core; never used for deliveries or routes.',
        frontage_intervals: scopeFrontage.length,
        frontage_total_metres: frontageTotal,
        junctions: scopeJunctions.length,
        stations: scopeStations.length,
        delivery_locations: scopeDeliveries.length,
        displayed_names: scopeNames.length,
        businesses_inventoried: businesses.length,
        business_inventory_complete: false,
        storefront_inventory: 'qa/storefront-inventory.json (' + invSummary.inventoryPlaces + ' places within 40 m of a selected road, ' + invSummary.rendered + ' rendered)',
      },
      all_metro_stations_in_source: core.stations.map((s) => ({ id: s.id, name: s.name, lines: s.lines, in_package: true })),
    },
    length_convention: 'Physical road length = sum of centreline lengths of the selected RoadEdges (rounded to 0.01 m), each two-way road counted once, one-way carriageways counted once each. Directed edges are never double counted. Frontage lengths are per street side (left/right of the edge forward direction), so frontage_total = 2 x road total. Displayed names cover roads, stations, lines and delivery destinations; shop signboard names are in the businesses table and qa/storefront-inventory.json.',
    selection_rules_ref: 'game/DATA_SOURCES.md#v2-selection',
    generated_from: { world_manifest: PKG_DIR.replace(/\\/g, '/') + '/manifest.json', world_manifest_sha256: manifestOut.sha256 },
  };
  const scopeOut = out('scope-manifest.json', pretty(scope));

  // ------------------------------------------------------------ coverage helper done; ledger-style world manifest
  const artifacts = [];
  const pkg = PKG_DIR.replace(/\\/g, '/');
  artifacts.push({ path: `${pkg}/manifest.json`, sha256: manifestOut.sha256 });
  artifacts.push({ path: `${pkg}/core.json`, sha256: coreOut.sha256 });
  for (const c of chunkRefs) artifacts.push({ path: `${pkg}/${c.file}`, sha256: c.sha256 });
  for (const f of ['sources-manifest.json', 'name-registry.json', 'scope.geojson', 'data/scope-baseline.json']) artifacts.push({ path: f, sha256: hashes[f] });
  if (invOut) artifacts.push({ path: 'qa/storefront-inventory.json', sha256: invOut.sha256 });
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
    note: 'Ledger binding for the v2 package (Red, Blue and Green corridors; Overture ' + RELEASE + ' + bundled OSM metro snapshot).',
    artifacts,
  };
  out(path.join('public', 'world', 'world-manifest.json'), pretty(worldManifest));
  hashes['scope-manifest.json'] = scopeOut.sha256;
  return { hashes, frontage: frontage.length, frontageTotal, totalLen, businesses: businesses.length };
}
