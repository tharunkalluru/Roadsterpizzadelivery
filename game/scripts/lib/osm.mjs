// OSM XML parsing + merge (dedupe by id, highest version wins). Deterministic.
import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const ARR = new Set(['node', 'way', 'relation', 'nd', 'tag', 'member']);

export function parseOsmXml(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => ARR.has(name),
    parseAttributeValue: false,
    parseTagValue: false,
  });
  const doc = parser.parse(xml);
  const osm = doc.osm || {};
  const out = { nodes: [], ways: [], relations: [] };
  const tagsOf = (e) => {
    const t = {};
    for (const x of e.tag || []) t[x.k] = x.v;
    return t;
  };
  for (const n of osm.node || []) {
    out.nodes.push({ id: Number(n.id), version: Number(n.version || 0), lat: Number(n.lat), lon: Number(n.lon), tags: tagsOf(n) });
  }
  for (const w of osm.way || []) {
    out.ways.push({ id: Number(w.id), version: Number(w.version || 0), nodes: (w.nd || []).map((x) => Number(x.ref)), tags: tagsOf(w) });
  }
  for (const r of osm.relation || []) {
    out.relations.push({
      id: Number(r.id),
      version: Number(r.version || 0),
      members: (r.member || []).map((m) => ({ type: m.type, ref: Number(m.ref), role: m.role || '' })),
      tags: tagsOf(r),
    });
  }
  return out;
}

export function mergeOsm(parsedList) {
  const nodes = new Map();
  const ways = new Map();
  const relations = new Map();
  const upsert = (map, e) => {
    const prev = map.get(e.id);
    if (!prev || e.version > prev.version) map.set(e.id, e);
  };
  for (const p of parsedList) {
    p.nodes.forEach((e) => upsert(nodes, e));
    p.ways.forEach((e) => upsert(ways, e));
    p.relations.forEach((e) => upsert(relations, e));
  }
  return { nodes, ways, relations };
}
