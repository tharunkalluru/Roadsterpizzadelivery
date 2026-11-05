import type { LevelConfig } from '../core/types';
import { campaignRequiredFacts, campaignScenario, campaignCompletionKind, campaignAutomaticCompletionFact } from './campaign-scenarios';

export type CampaignQAInput = 'drive' | 'steer' | 'brake' | 'reverse' | 'fly' | 'jump' | 'handoff' | 'map' | 'pause';
export interface CampaignQASnapshot {
  x: number; y: number; z: number; yaw: number; speed: number;
  flying: boolean; descending: boolean; jumping: boolean;
  placementRevision: number; support: string | null;
  action: string; ready: boolean; instruction: string;
}
export interface CampaignQAAssistance { kind: string; at: number; levelId: string | null }
export interface CampaignQAObserverFailure { context:string;message:string;at:number;levelId:string|null;occurrences:number }
export interface CampaignQAAttempt {
  levelId: string; attempt: number; startedAt: number; completedAt: number | null;
  pickup: { carrierId: string; jumping: boolean; at: number } | null;
  inputs: { kind: CampaignQAInput; source: string; at: number }[];
  facts: string[];
  assistance: CampaignQAAssistance[];
  samples: ({ at: number } & CampaignQASnapshot)[];
  evidence: string[];
  visualReviews: { check: string; evidence: string; at: number }[];
  notes: string[];
}
export interface CampaignQAArtDecision { characterId: string; allowed: boolean; status: string }
export interface CampaignQAStoryObservation {
  levelId: string | null;
  phase: 'driving' | 'playing' | 'viewing' | 'transition';
  captured: boolean; controllerState: string;
  modulePresent: boolean; charactersReady: boolean; sceneVisible: boolean;
  /** Attached render-enabled carton bounds intersect the actual camera;
   * human review is still required for pixel visibility and occlusion. */
  visiblePizzaTransfer: boolean; paused: boolean;
  actorInView?:boolean;visiblePizzaPlacement?:boolean;overtakeCompleted?:boolean;pizzaRetained?:boolean;
  pauseVisible: boolean; nextVisible: boolean; gameplayVisible: boolean;
  /** The ordinary lake surface must be seen before automatic descent. */
  atDiveSurface?: boolean; submerged?: boolean;
}
export interface CampaignQANextObservation {
  loading: boolean; relocating: boolean; oldSceneReleased: boolean;
  nextLevelId: string | null; paused: boolean; choosing: boolean;
  x: number; y: number; z: number; placementRevision: number;
  onRoad: boolean; surface: string;
}
export interface CampaignQAMetadata {
  mode: 'full-campaign' | 'isolated-scene';
  layout: 'desktop' | 'touch-layout';
  environment: string;
  timebase?: 'active-gameplay' | 'wall-clock';
  initialCompletedIds?: readonly string[];
  runId?: string;
  /** Unpublished art may be inspected, but never counts as campaign approval. */
  artPreview?: { id:string;characterId:string;descriptor:string;glbSha256:string;rigSha256:string } |
    { id:'scene-candidates-v1';assets:{id:string;characterId:string;descriptor:string;glbSha256:string;rigSha256:string}[] };
}

/** Evidence accounting only. This class cannot move a player, emit a game
 * event, approve an actor, unlock a level or call a delivery's onDrop method. */
export class CampaignQARecorder {
  private attempts: CampaignQAAttempt[] = [];
  private current: CampaignQAAttempt | null = null;
  private assistance: CampaignQAAssistance[] = [];
  private observerFailures:CampaignQAObserverFailure[]=[];
  private observerFailureCount=0;
  private pointerTypes = new Set<string>();
  private baselinePlacement: number | null = null;
  private lastHandoff = -Infinity;
  private lastInput = new Map<string, number>();
  private initial: string[];
  private viewingSince: number | null = null;
  private lastStory: CampaignQAStoryObservation | null = null;
  private sawDiveSurface = false;
  private pendingNext: {attempt: CampaignQAAttempt; nextId: string; x:number; y:number; z:number; revision:number; destination:{x:number;z:number}; loading:boolean;
    placed?:{x:number;y:number;z:number}} | null = null;
  readonly runId: string;
  constructor(readonly levels: readonly LevelConfig[], readonly metadata: CampaignQAMetadata,
    private art: readonly CampaignQAArtDecision[] = [], private now: () => number = () => performance.now()) {
    this.initial = [...metadata.initialCompletedIds ?? []]; this.runId = metadata.runId ?? `campaign-qa-${Date.now().toString(36)}`;
  }
  get active() { return this.current; }
  begin(levelId: string) {
    if (!this.levels.some(level => level.id === levelId)) return;
    if(this.pendingNext)this.invalidateNext('next-transition-interrupted');
    const attempt: CampaignQAAttempt = { levelId, attempt: this.attempts.filter(item => item.levelId === levelId).length + 1,
      startedAt: this.now(), completedAt: null, pickup: null, inputs: [], facts: [], assistance: [], samples: [], evidence: [], visualReviews: [], notes: [] };
    this.attempts.push(attempt); this.current = attempt; this.lastHandoff = -Infinity; this.lastInput.clear();
    this.viewingSince=null;this.lastStory=null;this.sawDiveSurface=false;
  }
  picked(carrierId: string, jumping: boolean) {
    if (!this.current || !carrierId || this.current.pickup) return;
    this.current.pickup = { carrierId, jumping, at: this.now() };
    if (jumping) this.fact('jump-grab');
  }
  input(kind: CampaignQAInput, source: string, trusted: boolean) {
    if (!trusted) return;
    if (source !== 'keyboard') this.pointerTypes.add(source || 'unknown');
    if (!this.current) return;
    const now = this.now(), key = kind + ':' + source;
    if (now - (this.lastInput.get(key) ?? -Infinity) < 100) return;
    this.lastInput.set(key, now);
    this.current.inputs.push({ kind, source, at: now });
    if (this.current.inputs.length > 300) this.current.inputs.splice(0, 50);
    if (kind === 'handoff') this.lastHandoff = now;
    if (kind === 'handoff' && this.current.samples.at(-1)?.action === 'DIVE') this.fact('dive-action');
  }
  fact(name: string) { if (this.current && !this.current.facts.includes(name)) this.current.facts.push(name); }
  private automaticAttempt(levelId=this.current?.levelId){
    return !!this.current&&levelId===this.current.levelId&&this.levels.some(level=>level.id===levelId&&level.callMode==='NONE');
  }
  /** Passive snapshots come from the real director, module and computed HUD.
   * A completed controller event does not supply any of these observations. */
  observeStory(observation:CampaignQAStoryObservation){
    if(!this.automaticAttempt(observation.levelId))return;
    this.lastStory={...observation};
    const scene=observation.captured&&observation.modulePresent&&observation.charactersReady&&observation.sceneVisible&&
      (!campaignScenario(observation.levelId??'')?.requiresVisibleActor||observation.actorInView===true);
    if(scene&&observation.phase==='playing'&&['SETPIECE','REVEAL'].includes(observation.controllerState)){
      this.fact('story-captured');
      if(observation.visiblePizzaTransfer&&campaignCompletionKind(observation.levelId!)==='handoff')this.fact('physical-pizza-transfer');
      if(observation.visiblePizzaPlacement&&campaignCompletionKind(observation.levelId!)==='placement')this.fact('physical-pizza-placement');
      if(observation.overtakeCompleted&&campaignCompletionKind(observation.levelId!)==='overtake')this.fact('player-overtook-bus');
      if(observation.pizzaRetained&&campaignCompletionKind(observation.levelId!)==='overtake')this.fact('pizza-retained');
      if(observation.atDiveSurface)this.sawDiveSurface=true;
      if(this.sawDiveSurface&&observation.submerged)this.fact('automatic-dive');
    }
    if(scene&&!observation.paused&&observation.gameplayVisible)this.fact('story-controls-visible');
    if(scene&&!observation.paused&&observation.phase==='playing'&&observation.nextVisible)this.fact('story-next-before-completion');
    if(observation.phase==='viewing'&&this.current!.completedAt!==null&&!observation.paused&&!scene)this.fact('story-scene-lost');
    const held=scene&&observation.phase==='viewing'&&observation.controllerState==='LEVEL_COMPLETE'&&
      this.current!.completedAt!==null&&this.current!.facts.includes(campaignAutomaticCompletionFact(observation.levelId!))&&!observation.paused&&
      observation.pauseVisible&&observation.nextVisible&&!observation.gameplayVisible;
    if(!held){this.viewingSince=null;return;}
    this.viewingSince??=this.now();
    if(this.now()-this.viewingSince>=1000)this.fact('story-viewing-hold');
  }
  /** Only the distinct, matching physical setpiece event in the captured scene
   * can certify the automatic handoff. levelComplete alone remains insufficient. */
  setpieceFinished(levelId:string,observation:CampaignQAStoryObservation){
    if(!this.automaticAttempt(levelId)||observation.levelId!==levelId||observation.phase!=='playing'||
      !observation.captured||observation.controllerState!=='REVEAL'||!observation.modulePresent||
      !observation.charactersReady||!observation.sceneVisible||!this.current!.facts.includes('story-captured')||
      (campaignScenario(levelId)?.requiresVisibleActor&&observation.actorInView!==true))return false;
    const kind=campaignCompletionKind(levelId),facts=this.current!.facts;
    if(kind==='handoff'&&!facts.includes('physical-pizza-transfer')||kind==='placement'&&!facts.includes('physical-pizza-placement')||kind==='overtake'&&(!facts.includes('player-overtook-bus')||!facts.includes('pizza-retained')))return false;
    this.fact(campaignAutomaticCompletionFact(levelId));return true;
  }
  /** Called only by a trusted click on the actual visible Next button. The
   * intended next identity comes from the controller, so explicit replays work. */
  requestNext(nextLevelId:string|null,pose:{x:number;y:number;z:number;placementRevision:number},trusted:boolean){
    const last=this.lastStory;
    if(!trusted||!this.automaticAttempt()||this.current!.completedAt===null||!last||last.phase!=='viewing'||
      !last.captured||last.paused||!last.nextVisible||last.gameplayVisible||!this.current!.facts.includes('story-viewing-hold')||
      ![pose.x,pose.y,pose.z,pose.placementRevision].every(Number.isFinite)||!Number.isSafeInteger(pose.placementRevision))return false;
    if(nextLevelId===null){this.fact('final-next-requested');return true;}
    const next=this.levels.find(level=>level.id===nextLevelId);if(!next)return false;
    this.fact('next-requested');
    this.pendingNext={attempt:this.current!,nextId:next.id,x:pose.x,y:pose.y,z:pose.z,revision:pose.placementRevision,
      destination:{x:next.destination.x,z:next.destination.z},loading:false};return true;
  }
  observeNext(observation:CampaignQANextObservation){
    const next=this.pendingNext;if(!next||![observation.x,observation.y,observation.z,observation.placementRevision].every(Number.isFinite))return;
    if(next.attempt!==this.current){this.invalidateNext('next-transition-interrupted');return;}
    // Normal Game.relocate calls placeNear once, which calls Player.place
    // once. Extra placements (including a loading retry) cannot be hidden in
    // one clean Next transaction, and old-scene motion invalidates its proof.
    if(!Number.isSafeInteger(observation.placementRevision)||observation.placementRevision<next.revision||observation.placementRevision>next.revision+1){
      this.invalidateNext('next-unexpected-placement-count');return;
    }
    if(observation.placementRevision===next.revision&&(next.placed||Math.hypot(observation.x-next.x,observation.y-next.y,observation.z-next.z)>.1)){
      this.invalidateNext('next-unexpected-old-scene-motion');return;
    }
    const fact=(name:string)=>{if(!next.attempt.facts.includes(name))next.attempt.facts.push(name);};
    if(observation.loading&&observation.relocating&&observation.paused&&observation.choosing&&observation.oldSceneReleased&&
      observation.nextLevelId===next.nextId&&observation.placementRevision===next.revision&&Math.hypot(observation.x-next.x,observation.y-next.y,observation.z-next.z)<=.1){
      next.loading=true;fact('next-loading');fact('direct-next-transition');
    }
    if(observation.placementRevision===next.revision+1){
      if(!next.loading||this.baselinePlacement!==next.revision){this.invalidateNext('next-placement-without-clean-loading');return;}
      if(next.placed&&Math.hypot(observation.x-next.placed.x,observation.y-next.placed.y,observation.z-next.placed.z)>.1){
        this.invalidateNext('next-unexpected-prepared-road-motion');return;
      }
      if(observation.oldSceneReleased&&observation.nextLevelId===next.nextId&&observation.onRoad&&observation.surface==='road'&&
        Math.hypot(observation.x-next.destination.x,observation.z-next.destination.z)<=4000)
        next.placed??={x:observation.x,y:observation.y,z:observation.z};
    }
    if(next.loading&&!observation.loading&&!observation.relocating&&!observation.paused&&!observation.choosing&&
      observation.oldSceneReleased&&observation.nextLevelId===next.nextId&&observation.placementRevision===next.revision+1&&
      observation.onRoad&&observation.surface==='road'&&Math.hypot(observation.x-next.destination.x,observation.z-next.destination.z)<=4000){
      fact('next-road-ready');this.baselinePlacement=observation.placementRevision;this.pendingNext=null;
    }
  }
  private invalidateNext(kind:string){
    const next=this.pendingNext;if(!next)return;
    if(!next.attempt.facts.includes('next-transition-invalid'))next.attempt.facts.push('next-transition-invalid');
    const event={kind,at:this.now(),levelId:next.attempt.levelId};this.assistance.push(event);next.attempt.assistance.push(event);
    this.pendingNext=null;
  }
  sample(snapshot: CampaignQASnapshot) {
    if (![snapshot.x, snapshot.y, snapshot.z, snapshot.yaw, snapshot.speed, snapshot.placementRevision].every(Number.isFinite)) return;
    // Initial normal world placement is not test assistance. Once an order
    // begins, every later relocation remains visible in the evidence.
    if (!this.current) { this.baselinePlacement = snapshot.placementRevision; return; }
    if (this.baselinePlacement === null) this.baselinePlacement = snapshot.placementRevision;
    else if (snapshot.placementRevision !== this.baselinePlacement&&!(this.pendingNext?.attempt===this.current&&this.pendingNext.loading&&
      this.pendingNext.placed&&snapshot.placementRevision===this.pendingNext.revision+1&&
      Math.hypot(snapshot.x-this.pendingNext.placed.x,snapshot.y-this.pendingNext.placed.y,snapshot.z-this.pendingNext.placed.z)<=.1)) {
      this.noteAssistance('player-relocated'); this.baselinePlacement = snapshot.placementRevision;
    }
    const at=this.now(),last=this.current.samples.at(-1);
    // Observer polling can continue while the active simulation clock is
    // paused. Identical paused samples must not evict the actual driving/catch
    // evidence from the bounded buffer. A real state change still records.
    if(last?.at===at&&Object.entries(snapshot).every(([key,value])=>(last as any)[key]===value))return;
    this.current.samples.push({ ...snapshot, at });
    if (this.current.samples.length > 240) this.current.samples.splice(0, 40);
    if (!snapshot.flying && !snapshot.descending && !snapshot.jumping && snapshot.ready) this.fact('grounded-arrival');
  }
  complete(levelId: string) {
    if (!this.current || this.current.levelId !== levelId || this.current.completedAt !== null) return;
    this.current.completedAt = this.now();
    if (this.now() - this.lastHandoff <= 15000) this.fact('manual-handoff');
    if (!this.current.pickup) this.noteAssistance('pickup-not-observed');
  }
  noteAssistance(kind: string) {
    const event = { kind, at: this.now(), levelId: this.current?.levelId ?? null };
    this.assistance.push(event); this.current?.assistance.push(event);
  }
  /** A passive instrumentation failure invalidates this run permanently. It
   * must remain reportable without throwing back into synchronous gameplay. */
  observerFailed(context:string,error:unknown){
    let message='Unknown observer failure';try{message=String(error instanceof Error?error.message:error).slice(0,1500);}catch{/* Preserve a safe explicit failure if message access or conversion itself fails. */}
    context=context.slice(0,150);
    const levelId=this.current?.levelId??null;
    const prior=this.observerFailures.find(failure=>failure.context===context&&failure.message===message&&failure.levelId===levelId);
    this.observerFailureCount++;
    if(prior){prior.occurrences++;return;}
    let at=0;try{const time=this.now();if(Number.isFinite(time))at=time;}catch{/* Failure accounting cannot interrupt gameplay. */}
    // Bound distinct diagnostics while retaining a permanent total/failure bit.
    if(this.observerFailures.length<64)this.observerFailures.push({context,message,at,levelId,occurrences:1});
  }
  note(text: string) { if (this.current && text.trim()) this.current.notes.push(text.trim().slice(0, 2000)); }
  evidence(path: string) { if (this.current && path.trim() && !this.current.evidence.includes(path.trim())) this.current.evidence.push(path.trim().slice(0, 1500)); }
  /** Explicit visual review is separate from telemetry and independent actor
   * release. An evidence path by itself never confirms a visual check. */
  reviewVisualCheck(check: string, evidence: string) {
    if (!this.current || !evidence.trim() || !campaignScenario(this.current.levelId)?.visualChecks.includes(check)) return false;
    if (!this.current.visualReviews.some(review => review.check === check)) this.current.visualReviews.push({ check, evidence: evidence.trim().slice(0, 1500), at: this.now() });
    return true;
  }
  updateArt(decisions: readonly CampaignQAArtDecision[]) { this.art = decisions; }
  /** Cheap HUD counters; the bounded but larger evidence export is built only
   * on explicit request, never copied on every observation tick. */
  summary() {
    let completed = 0;
    for (const level of this.levels) if (this.attempts.some(attempt => attempt.levelId === level.id && attempt.completedAt !== null)) completed++;
    return { completed, total: this.levels.length, trustedTouchObserved: this.pointerTypes.has('touch'),
      activeLevel: this.current ? this.levels.find(level => level.id === this.current!.levelId)?.level ?? null : null,
      facts: this.current?.facts.length ?? 0,observerHealthy:this.observerFailureCount===0,
      observerFailureCount:this.observerFailureCount,lastObserverFailure:this.observerFailures.at(-1)??null };
  }
  report() {
    const rows = this.levels.map(level => {
      const scenario = campaignScenario(level.id), all = this.attempts.filter(attempt => attempt.levelId === level.id), attempt = [...all].reverse().find(attempt => attempt.completedAt !== null) ?? all.at(-1);
      const facts = new Set(attempt?.facts ?? []), required = campaignRequiredFacts(level,level.id===this.levels.at(-1)?.id);
      const missingFacts = required.filter(fact => !facts.has(fact));
      const missingPhysicalFacts = missingFacts.filter(fact => !fact.startsWith('authored-'));
      const missingArt = (scenario?.artIds ?? []).filter(id => !this.art.some(decision => decision.characterId === id && decision.allowed));
      const missingVisualChecks = (scenario?.visualChecks ?? []).filter(check => !attempt?.visualReviews.some(review => review.check === check));
      const observerFailures=this.observerFailures.filter(failure=>failure.levelId===null||failure.levelId===level.id);
      const storyViolations=level.callMode==='NONE'?[
        ...(facts.has('story-controls-visible')?['Gameplay controls were visible during a captured story.']:[]),
        ...(facts.has('story-next-before-completion')?['Next was visible before the physical handoff completed.']:[]),
        ...(facts.has('story-scene-lost')?['The completed scene or prepared characters disappeared during viewing.']:[]),
        ...(facts.has('next-transition-invalid')?['Next included interrupted preparation, unexpected motion or extra placements.']:[])]:[];
      return { level: level.level, id: level.id, workflow:level.callMode==='NONE'?'automatic-story':'manual-call',requiredFacts:required,
        configuredScenario: !!scenario, completed: attempt?.completedAt !== null && !!attempt,observerFailures:observerFailures.map(failure=>({...failure})),
        naturalJumpPickup: !!attempt?.pickup?.jumping, manualHandoff: facts.has('manual-handoff'),automaticHandoff:facts.has('automatic-handoff'),automaticPlacement:facts.has('automatic-placement'),automaticOvertake:facts.has('automatic-overtake'),storyViolations,
        assistance: attempt?.assistance.map(event => event.kind) ?? [], missingPhysicalFacts, missingFacts, missingArt, missingVisualChecks,
        observedSceneMechanics: !observerFailures.length&&!!attempt && attempt.completedAt !== null && !missingPhysicalFacts.length && !!scenario,
        allScenarioEvidence: !observerFailures.length&&!this.metadata.artPreview && !!attempt && attempt.completedAt !== null && !missingFacts.length && !missingArt.length && !missingVisualChecks.length && !storyViolations.length && !!scenario };
    });
    const allCompleted = rows.every(row => row.completed), naturalPickupAll = rows.every(row => row.naturalJumpPickup), noAssistance = !this.assistance.length && !this.initial.length;
    const observerHealthy=this.observerFailureCount===0;
    const allScenarioEvidence = observerHealthy&&rows.every(row => row.allScenarioEvidence);
    return { schemaVersion: 3, runId: this.runId, metadata: { ...this.metadata, initialCompletedIds: [...this.initial] },
      observationLimits:{carton:'Attached scene, enabled material/layer and gameplay-camera frustum bounds only; pixel visibility and occlusion require explicit human visual review.',actor:'Actor mesh attachment/render branch and geometry-frustum telemetry only; pose deformation, pixel visibility, occlusion and film likeness require independent visual review.'},
      inputEvidence: { pointerTypes: [...this.pointerTypes], trustedTouchObserved: this.pointerTypes.has('touch'),
        physicalHardwareVerified: false, note: 'Pointer type and layout do not establish physical hardware or mobile performance.' },
      expectedLevelIds: this.levels.map(level => level.id), rows, attempts: structuredClone(this.attempts), assistance: [...this.assistance],
      observer:{healthy:observerHealthy,failureCount:this.observerFailureCount,failures:this.observerFailures.map(failure=>({...failure}))},
      acceptance: { observerHealthy,allCompleted, naturalPickupAll, noAssistance, allScenarioEvidence, unreviewedArtPreview:!!this.metadata.artPreview,
        observedSceneMechanicsAll: observerHealthy&&rows.every(row => row.observedSceneMechanics),
        fullCampaignAccepted: observerHealthy&&!this.metadata.artPreview && this.metadata.mode === 'full-campaign' && allCompleted && naturalPickupAll && noAssistance && allScenarioEvidence,
        note: 'Completion events alone are not physical-scene, visual-likeness, true-touch or hardware acceptance.' } };
  }
}
