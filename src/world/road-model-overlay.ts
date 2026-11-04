import type { CoreData, RoadEdge, StopTuple, XZ } from './types';
import type { TileZone } from './city';
import { profileMatches, verifiedProfileData, type ProfileInput, type VerifiedProfileCorrection } from './road-profile-corrections';
import { rebaseRoadStops } from './road-grades';
import { applyModeledRoadNodePositions, applyTileRoadNodeTransports, type ModeledRoadNodes, type TileRoadNodeTransport } from './road-node-transport';

export interface VerifiedModelRoad { id: string; expected: ProfileInput; model: ProfileInput; sourceArc: number[] }
export interface VerifiedRoadModel {
  sourceRoadGeometryGeneration?: string;
  sourceGradeModelSHA256: string; sourcePrototypeSHA256: string;
  conditionedInputSHA256?:string;
  sourceTileSupplementSHA256?: string; sourcePackSHA256?: Record<string, string>;
  supersedesRoadGradeProfileIds: string[];
  nodes: ModeledRoadNodes; roads: VerifiedModelRoad[]; tileRoads: TileRoadNodeTransport[];
  tileNodeSources?:Record<string,Record<string,XZ>>;
  producerMetadata?:{geometryEdits:string[];corridors:unknown[]};
}
export interface RoadModelReport { active: boolean; reused:boolean; available: number; applied: string[]; mismatched: string[]; nodes: string[]; movedStops: number; ambiguousStops: number }
const finiteXZ = (p: unknown): p is XZ => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const sameXZ = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;
const conditionedProfiles=()=>verifiedProfileData.profiles.filter(p=>p.stage==='conditionedWorld');
const stopCounts=(core:CoreData):[number,number,number]=>[core.food.length,core.theatres.length,core.drops.length];
function captureStops(core:CoreData,changed:readonly StopTuple[],prior:NonNullable<CoreData['roadModelState']>['stops']=[]) {
  const selected=new Set(changed),keys=new Set(prior.map(p=>`${p.kind}/${p.index}`)),records:NonNullable<CoreData['roadModelState']>['stops']=[];
  for(const kind of ['food','theatres','drops'] as const)core[kind].forEach((value,index)=>{
    const stop=kind==='drops'?value as StopTuple:(value as CoreData['food'][number]).stop;
    if(!selected.has(stop)&&!keys.has(`${kind}/${index}`))return;
    const poi=kind==='drops'?null:value as CoreData['food'][number];
    records.push({kind,index,value:[...stop],...(poi?{id:poi.id,tile:[...poi.tile] as [number,number]}:{})});
  });return records;
}
function matchingStops(core:CoreData,state:NonNullable<CoreData['roadModelState']>) {
  if(JSON.stringify(stopCounts(core))!==JSON.stringify(state.counts))return false;
  return state.stops.every(p=>{const value=core[p.kind][p.index];if(!value)return false;const poi=p.kind==='drops'?null:value as CoreData['food'][number],stop=poi?poi.stop:value as StopTuple;
    return JSON.stringify(stop)===JSON.stringify(p.value)&&(!poi||poi.id===p.id&&JSON.stringify(poi.tile)===JSON.stringify(p.tile));});
}
function matchesInstalled(core:CoreData,data:VerifiedRoadModel,stage:'modeled'|'conditioned',profiles:VerifiedProfileCorrection[]) {
  const byId=new Map(core.roads.map(e=>[e.id,e])),finals=new Map(profiles.map(p=>[p.id,p]));
  for(const p of data.roads){const e=byId.get(p.id),final=stage==='conditioned'?finals.get(p.id):undefined;
    if(!e||!profileMatches(e,final?{...final.expected,elev:final.elev}:p.model))return false;}
  if(stage==='conditioned')for(const p of profiles){const e=byId.get(p.id);if(!e||!profileMatches(e,{...p.expected,elev:p.elev}))return false;}
  for(const e of core.roads)for(const[node,index]of[[e.from,0],[e.to,e.pts.length-1]]as const)
    if(node&&data.nodes[node]&&!sameXZ(e.pts[index],data.nodes[node].after))return false;
  return Object.entries(data.nodes).every(([id,n])=>core.nodes[id]&&sameXZ(core.nodes[id],n.after));
}

/** Finalize the small persistent binding only after ordinary World/profile
 * conditioning. Structured-cloned conditioned cores retain exact recognition. */
export function markVerifiedRoadModelConditioned(core:CoreData,changedStops:readonly StopTuple[]=[],data:VerifiedRoadModel|undefined=verifiedProfileData.geometry,profiles=conditionedProfiles()) {
  const state=core.roadModelState;
  if(!data||!state||data.sourceRoadGeometryGeneration!==undefined&&data.sourceRoadGeometryGeneration!==core.sourceRoadGeometryGeneration||state.sourcePrototypeSHA256!==data.sourcePrototypeSHA256||!matchesInstalled(core,data,'conditioned',profiles))return false;
  state.stage='conditioned';state.stops=captureStops(core,changedStops,state.stops);state.counts=stopCounts(core);state.roadCount=core.roads.length;return true;
}

function validModelRoad(e: RoadEdge, p: VerifiedModelRoad, nodes: ModeledRoadNodes) {
  const m = p.model;
  if (!m || !profileMatches(e, p.expected) || m.from !== e.from || m.to !== e.to || m.oneway !== e.oneway ||
    !Array.isArray(m.pts) || m.pts.length < 2 || !m.pts.every(finiteXZ) ||
    m.elev !== null && (!Array.isArray(m.elev) || m.elev.length !== m.pts.length || !m.elev.every(Number.isFinite)) ||
    !Number.isFinite(m.w) || m.w <= 0 || !Number.isSafeInteger(m.lanes) || m.lanes < 1 ||
    !Array.isArray(p.sourceArc) || p.sourceArc.length !== m.pts.length || p.sourceArc.some((v, i) => !Number.isFinite(v) || v < 0 || i > 0 && v < p.sourceArc[i - 1])) return false;
  const scenery = m.scenerySource;
  if (scenery && (!Number.isFinite(scenery.width) || scenery.width <= 0 || !Array.isArray(scenery.pts) || scenery.pts.length < 2 || !scenery.pts.every(finiteXZ) ||
    scenery.elev !== null && (!Array.isArray(scenery.elev) || scenery.elev.length !== scenery.pts.length || !scenery.elev.every(Number.isFinite)))) return false;
  const width = m.joinedPavement;
  if (width && (!Number.isFinite(width.sourceWidth) || width.sourceWidth <= 0 || !Number.isFinite(width.originalWidth) || width.originalWidth < m.w ||
    width.physicalWidth !== undefined && (!Number.isFinite(width.physicalWidth) || width.physicalWidth < m.w || width.physicalWidth > width.originalWidth) ||
    !Number.isFinite(width.taper) || width.taper <= 0 || !Array.isArray(width.intervals) || width.intervals.some(q => !Array.isArray(q) || q.length !== 2 || q.some(v => !Number.isFinite(v)) || q[0] > q[1]))) return false;
  for (const [node, i, original] of [[e.from, 0, e.pts[0]], [e.to, m.pts.length - 1, e.pts[e.pts.length - 1]]] as const)
    if (!sameXZ(m.pts[i], node && nodes[node] ? nodes[node].after : original)) return false;
  const cumulative = [0];
  for (let i = 1; i < e.pts.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]));
  if (p.sourceArc[0] > 1e-7 || Math.abs(p.sourceArc[p.sourceArc.length - 1] - cumulative[cumulative.length - 1]) > 1e-5) return false;
  let segment = 1;
  for (let i = 0; i < m.pts.length; i++) {
    while (segment < cumulative.length - 1 && cumulative[segment] < p.sourceArc[i]) segment++;
    const a = e.pts[segment - 1], b = e.pts[segment], u = (p.sourceArc[i] - cumulative[segment - 1]) / (cumulative[segment] - cumulative[segment - 1] || 1);
    if (Math.hypot(m.pts[i][0] - a[0] - (b[0] - a[0]) * u, m.pts[i][1] - a[1] - (b[1] - a[1]) * u) > 5 + 1e-6) return false;
  }
  return true;
}

/** Exact source-bound modeled geometry is installed atomically before ordinary
 * World conditioning. Unknown/synthetic inputs retain their generic model. */
export function applyVerifiedRoadModel(core: CoreData, data: VerifiedRoadModel | undefined = verifiedProfileData.geometry, profiles=conditionedProfiles()) {
  const report: RoadModelReport = { active: false, reused:false, available: data?.roads?.length || 0, applied: [], mismatched: [], nodes: [], movedStops: 0, ambiguousStops: 0 };
  if (data?.sourceRoadGeometryGeneration !== undefined && data.sourceRoadGeometryGeneration !== core.sourceRoadGeometryGeneration) { report.mismatched.push('source-stage'); return report; }
  if (!data?.roads.length) return report;
  const state=core.roadModelState;
  if(state){
    if(state.sourcePrototypeSHA256===data.sourcePrototypeSHA256&&state.generatorInputSHA256===verifiedProfileData.generatorInputSHA256&&state.roadCount===core.roads.length&&
      matchingStops(core,state)&&matchesInstalled(core,data,state.stage,profiles)){report.active=true;report.reused=true;report.nodes=Object.keys(data.nodes);}
    else report.mismatched.push('prepared-model-binding');
    return report;
  }
  const source = new Map(core.roads.map(e => [e.id, e])), byId = new Map<string, VerifiedModelRoad>();
  for (const [id, node] of Object.entries(data.nodes)) if (!node || !finiteXZ(node.before) || !finiteXZ(node.after) || !finiteXZ(node.delta) ||
    Math.hypot(...node.delta) > 5 + 1e-6 || !sameXZ([node.before[0] + node.delta[0], node.before[1] + node.delta[1]], node.after) ||
    !core.nodes[id] || !sameXZ(core.nodes[id], node.before)) report.mismatched.push(`node:${id}`);
  for (const p of data.roads) {
    const e = source.get(p.id);
    if (byId.has(p.id) || !e || !validModelRoad(e, p, data.nodes)) report.mismatched.push(p.id);
    byId.set(p.id, p);
  }
  // Every incident core endpoint must agree, including unchanged roads. This
  // catches an incomplete modeled node field before any core object is changed.
  for (const e of core.roads) for (const [node, end] of [[e.from, 0], [e.to, -1]] as const) if (node && data.nodes[node]) {
    const model = byId.get(e.id)?.model || e, point = end ? model.pts[model.pts.length - 1] : model.pts[0];
    if (!sameXZ(point, data.nodes[node].after)) report.mismatched.push(`incident:${e.id}:${node}`);
  }
  if (report.mismatched.length) return report;
  const nodeResult = applyModeledRoadNodePositions(core.nodes, data.nodes);
  if (nodeResult.mismatched.length) { report.mismatched.push(...nodeResult.mismatched.map(id => `node:${id}`)); return report; }
  const original = core.roads, modeled = original.map(e => {
    const p = byId.get(e.id); if (!p) return e;
    const m = structuredClone(p.model); report.applied.push(e.id);
    return { ...e, ...m, joinedPavement: m.joinedPavement ?? undefined, scenerySource: m.scenerySource ?? undefined,
      sceneryWidth: m.sceneryWidth ?? undefined, sourceLaneIntervals: m.sourceLaneIntervals ?? undefined,
      laneEvidence: m.laneEvidence ?? undefined, expressway: m.expressway ?? undefined };
  });
  const stops = rebaseRoadStops(core, original, modeled, new Map(data.roads.map(p => [p.id, p.sourceArc])));
  core.roads = modeled; core.nodes = nodeResult.nodes;
  core.roadModelState={sourcePrototypeSHA256:data.sourcePrototypeSHA256,generatorInputSHA256:verifiedProfileData.generatorInputSHA256,stage:'modeled',roadCount:core.roads.length,counts:stopCounts(core),stops:captureStops(core,stops.changedStops)};
  report.nodes = nodeResult.applied; report.movedStops = stops.moved; report.ambiguousStops = stops.ambiguous; report.active = true;
  return report;
}

/** Called after final core patches, identically for each source owner/context
 * tile. The source packs and their node tables remain immutable. */
export function applyVerifiedRoadTileGeometry(zone: TileZone, data: VerifiedRoadModel | undefined = verifiedProfileData.geometry, profiles=conditionedProfiles()) {
  if (!data) return { zone, report: { applied: [] as string[], nodes: [] as string[], mismatched: [] as string[] } };
  const field={...data.nodes};
  for(const[id,before]of Object.entries(data.tileNodeSources?.[`${zone.i}_${zone.j}`]||{})){
    const node=field[id];if(!node||!finiteXZ(before))return{zone,report:{applied:[],nodes:[],mismatched:[`node-source:${id}`]}};
    const delta:XZ=[node.after[0]-before[0],node.after[1]-before[1]];
    if(Math.hypot(...delta)>5)return{zone,report:{applied:[],nodes:[],mismatched:[`node-source-bound:${id}`]}};
    field[id]={before,after:node.after,delta};
  }
  const roads = applyTileRoadNodeTransports(zone.roads, data.tileRoads), nodes = applyModeledRoadNodePositions(zone.nodes, field);
  const mismatched = [...roads.mismatched, ...nodes.mismatched.map(id => `node:${id}`)];
  const models=new Map(data.roads.map(p=>[p.id,p])),finals=new Map(profiles.map(p=>[p.id,p]));
  for(const e of roads.roads){
    const model=models.get(e.id),final=finals.get(e.id);
    if(model&&!profileMatches(e,final?{...final.expected,elev:final.elev}:model.model))mismatched.push(`core-patch:${e.id}`);
    for(const[node,index]of[[e.from,0],[e.to,e.pts.length-1]]as const)
      if(node&&data.nodes[node]&&!sameXZ(e.pts[index],data.nodes[node].after))mismatched.push(`incident:${e.id}:${node}`);
  }
  return { zone: mismatched.length ? zone : { ...zone, roads: roads.roads, nodes: nodes.nodes }, report: { applied: mismatched.length?[]:roads.applied, nodes: mismatched.length?[]:nodes.applied, mismatched } };
}
