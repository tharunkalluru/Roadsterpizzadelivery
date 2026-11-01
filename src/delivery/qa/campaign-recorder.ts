import type { LevelConfig } from '../core/types';
import { campaignScenario } from './campaign-scenarios';

export type CampaignQAInput = 'drive' | 'steer' | 'brake' | 'reverse' | 'fly' | 'jump' | 'handoff' | 'map' | 'pause';
export interface CampaignQASnapshot {
  x: number; y: number; z: number; yaw: number; speed: number;
  flying: boolean; descending: boolean; jumping: boolean;
  placementRevision: number; support: string | null;
  action: string; ready: boolean; instruction: string;
}
export interface CampaignQAAssistance { kind: string; at: number; levelId: string | null }
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
  private pointerTypes = new Set<string>();
  private baselinePlacement: number | null = null;
  private lastHandoff = -Infinity;
  private lastInput = new Map<string, number>();
  private initial: string[];
  readonly runId: string;
  constructor(readonly levels: readonly LevelConfig[], readonly metadata: CampaignQAMetadata,
    private art: readonly CampaignQAArtDecision[] = [], private now: () => number = () => performance.now()) {
    this.initial = [...metadata.initialCompletedIds ?? []]; this.runId = metadata.runId ?? `campaign-qa-${Date.now().toString(36)}`;
  }
  get active() { return this.current; }
  begin(levelId: string) {
    if (!this.levels.some(level => level.id === levelId)) return;
    const attempt: CampaignQAAttempt = { levelId, attempt: this.attempts.filter(item => item.levelId === levelId).length + 1,
      startedAt: this.now(), completedAt: null, pickup: null, inputs: [], facts: [], assistance: [], samples: [], evidence: [], visualReviews: [], notes: [] };
    this.attempts.push(attempt); this.current = attempt; this.lastHandoff = -Infinity; this.lastInput.clear();
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
  sample(snapshot: CampaignQASnapshot) {
    if (![snapshot.x, snapshot.y, snapshot.z, snapshot.yaw, snapshot.speed, snapshot.placementRevision].every(Number.isFinite)) return;
    // Initial normal world placement is not test assistance. Once an order
    // begins, every later relocation remains visible in the evidence.
    if (!this.current) { this.baselinePlacement = snapshot.placementRevision; return; }
    if (this.baselinePlacement === null) this.baselinePlacement = snapshot.placementRevision;
    else if (snapshot.placementRevision !== this.baselinePlacement) {
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
      facts: this.current?.facts.length ?? 0 };
  }
  report() {
    const rows = this.levels.map(level => {
      const scenario = campaignScenario(level.id), all = this.attempts.filter(attempt => attempt.levelId === level.id), attempt = [...all].reverse().find(attempt => attempt.completedAt !== null) ?? all.at(-1);
      const facts = new Set(attempt?.facts ?? []), required = scenario?.requiredFacts ?? [];
      const missingFacts = required.filter(fact => !facts.has(fact));
      const missingPhysicalFacts = missingFacts.filter(fact => !fact.startsWith('authored-'));
      const missingArt = (scenario?.artIds ?? []).filter(id => !this.art.some(decision => decision.characterId === id && decision.allowed));
      const missingVisualChecks = (scenario?.visualChecks ?? []).filter(check => !attempt?.visualReviews.some(review => review.check === check));
      return { level: level.level, id: level.id, configuredScenario: !!scenario, completed: attempt?.completedAt !== null && !!attempt,
        naturalJumpPickup: !!attempt?.pickup?.jumping, manualHandoff: facts.has('manual-handoff'),
        assistance: attempt?.assistance.map(event => event.kind) ?? [], missingPhysicalFacts, missingFacts, missingArt, missingVisualChecks,
        observedSceneMechanics: !!attempt && attempt.completedAt !== null && !missingPhysicalFacts.length && !!scenario,
        allScenarioEvidence: !this.metadata.artPreview && !!attempt && attempt.completedAt !== null && !missingFacts.length && !missingArt.length && !missingVisualChecks.length && !!scenario };
    });
    const allCompleted = rows.every(row => row.completed), naturalPickupAll = rows.every(row => row.naturalJumpPickup), noAssistance = !this.assistance.length && !this.initial.length;
    const allScenarioEvidence = rows.every(row => row.allScenarioEvidence);
    return { schemaVersion: 2, runId: this.runId, metadata: { ...this.metadata, initialCompletedIds: [...this.initial] },
      inputEvidence: { pointerTypes: [...this.pointerTypes], trustedTouchObserved: this.pointerTypes.has('touch'),
        physicalHardwareVerified: false, note: 'Pointer type and layout do not establish physical hardware or mobile performance.' },
      expectedLevelIds: this.levels.map(level => level.id), rows, attempts: structuredClone(this.attempts), assistance: [...this.assistance],
      acceptance: { allCompleted, naturalPickupAll, noAssistance, allScenarioEvidence, unreviewedArtPreview:!!this.metadata.artPreview,
        observedSceneMechanicsAll: rows.every(row => row.observedSceneMechanics),
        fullCampaignAccepted: !this.metadata.artPreview && this.metadata.mode === 'full-campaign' && allCompleted && naturalPickupAll && noAssistance && allScenarioEvidence,
        note: 'Completion events alone are not physical-scene, visual-likeness, true-touch or hardware acceptance.' } };
  }
}
