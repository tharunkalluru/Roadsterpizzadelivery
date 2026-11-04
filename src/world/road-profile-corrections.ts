import type { RoadEdge, XZ } from './types';
import correctionData from './road-profile-corrections.json';

export interface ProfileInput {
  pts: XZ[]; elev: number[] | null; w: number; lanes: number; from: string | null; to: string | null;
  oneway: RoadEdge['oneway']; joinedPavement?: RoadEdge['joinedPavement'];
  laneEvidence?: RoadEdge['laneEvidence'] | null; sourceLaneIntervals?: RoadEdge['sourceLaneIntervals'] | null;
  sceneryWidth?: number | null; expressway?: RoadEdge['expressway'] | null;
  scenerySource?: RoadEdge['scenerySource'] | null;
}
export type RoadProfileStage='roadGrades'|'conditionedWorld';
export interface LocalGradeChangePolicy {
  road:string;sourcePolicySHA256:string;sourceClassificationSHA256:string;controlCount:number;
  protectedControlIndices:number[];existingHeightEnvelope:[number,number];
  controls:{index:number;modelArc:[number,number,number];maximumGradeChangePerMetre:number}[];
}
export interface VerifiedProfileCorrection {
  id:string;stage?:RoadProfileStage;expected:ProfileInput;elev:number[];
  limits?:{maxGrade?:number;gradeChangePerMetre?:number;sameLayerTolerance?:number;localGradeChange?:LocalGradeChangePolicy};
}
export interface VerifiedProfileData {
  version: number; sourceCoreSHA256: string; generatorInputSHA256: string;
  sourceRoadGeometryGeneration?: string;
  profiles: VerifiedProfileCorrection[];
  tileProfiles?: VerifiedProfileCorrection[];
  geometry?: import('./road-model-overlay').VerifiedRoadModel;
}
export const verifiedProfileData = correctionData as unknown as VerifiedProfileData;
export function roadProfileInput(e: RoadEdge): ProfileInput {
  return { pts: e.pts, elev: e.elev, w: e.w, lanes: e.lanes, from: e.from, to: e.to, oneway: e.oneway, joinedPavement: e.joinedPavement,
    laneEvidence:e.laneEvidence??null,sourceLaneIntervals:e.sourceLaneIntervals??null,sceneryWidth:e.sceneryWidth??null,expressway:e.expressway??null,scenerySource:e.scenerySource??null };
}
export function profileMatches(e: RoadEdge, expected: ProfileInput) {
  if (e.w !== expected.w || e.lanes !== expected.lanes || e.from !== expected.from || e.to !== expected.to || e.oneway !== expected.oneway ||
    e.pts.length !== expected.pts.length || (e.elev?.length ?? 0) !== (expected.elev?.length ?? 0) ||
    JSON.stringify(e.joinedPavement) !== JSON.stringify(expected.joinedPavement)) return false;
  for(const key of ['laneEvidence','sourceLaneIntervals','sceneryWidth','expressway','scenerySource'] as const)
    if(Object.prototype.hasOwnProperty.call(expected,key)&&JSON.stringify(e[key]??null)!==JSON.stringify(expected[key]??null))return false;
  for (let i = 0; i < e.pts.length; i++) if (e.pts[i][0] !== expected.pts[i][0] || e.pts[i][1] !== expected.pts[i][1] ||
    (e.elev?.[i] ?? 0) !== (expected.elev?.[i] ?? 0)) return false;
  return true;
}

/** Offline constrained profiles are already the final rendered linear mesh.
 * Exact input binding prevents applying them to changed or synthetic geometry. */
export function applyVerifiedRoadProfiles(roads: RoadEdge[],stage:RoadProfileStage='roadGrades',profiles:VerifiedProfileCorrection[]=verifiedProfileData.profiles) {
  const byId = new Map(profiles.filter(p=>(p.stage??'roadGrades')===stage).map(p => [p.id, p]));
  const applicable=roads.filter(e=>byId.has(e.id)),applied:string[]=[],reused:string[]=[],mismatched:string[]=[];
  const expected=(e:RoadEdge)=>{const p=byId.get(e.id)!;return p.elev.length===e.pts.length&&p.elev.every(Number.isFinite)&&profileMatches(e,p.expected);};
  const target=(e:RoadEdge)=>{const p=byId.get(e.id)!;return p.elev.length===e.pts.length&&p.elev.every(Number.isFinite)&&profileMatches(e,{...p.expected,elev:p.elev});};
  const allExpected=applicable.every(expected),allTarget=applicable.every(target);
  // A complete already-installed stage is idempotent. A mixture of old/new
  // controls, or one stale input, cannot partially install another stage.
  if(!allExpected&&!allTarget)mismatched.push(...applicable.map(e=>e.id));
  else if(allTarget&&!allExpected)reused.push(...applicable.map(e=>e.id));
  const result=!mismatched.length&&!reused.length?roads.map(e=>{const p=byId.get(e.id);if(!p)return e;applied.push(e.id);return{...e,elev:p.elev.slice()};}):roads;
  return { roads: applied.length?result:roads, report: { stage, applied, reused, mismatched, available: byId.size, sourceCoreSHA256: verifiedProfileData.sourceCoreSHA256, generatorInputSHA256: verifiedProfileData.generatorInputSHA256 } };
}

/** Detailed streets use offline-resampled source geometry installed by the
 * tile transport stage. Only reviewed elevations change here, identically in
 * their owner and compressed context copies; the core/cache stays separate. */
export function applyVerifiedRoadTileProfiles(roads:RoadEdge[],profiles:VerifiedProfileCorrection[]=verifiedProfileData.tileProfiles||[]) {
  const byId=new Map(profiles.map(p=>[p.id,p]));
  if(byId.size!==profiles.length||profiles.some(p=>p.stage!=='conditionedWorld'))return{roads,report:{applied:[]as string[],reused:[]as string[],mismatched:['tile-profile-inventory'],available:profiles.length}};
  const inputs=roads.map(e=>{const p=byId.get(e.id);return p&&(e as RoadEdge&{ctx?:number}).ctx&&e.lanes===undefined?{...e,lanes:p.expected.lanes}:e;});
  const result=applyVerifiedRoadProfiles(inputs,'conditionedWorld',profiles);
  if(result.report.mismatched.length||!result.report.applied.length)return{roads,report:result.report};
  const installed=new Map(result.roads.map(e=>[e.id,e]));
  return{roads:roads.map(e=>byId.has(e.id)?{...e,elev:installed.get(e.id)!.elev}:e),report:result.report};
}
