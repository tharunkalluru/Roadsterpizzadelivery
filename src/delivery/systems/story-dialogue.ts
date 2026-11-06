import type { LevelConfig, ScriptLine } from '../core/types';
import type { Sound } from '../../game/audio';

type DialoguePlayer = Pick<Sound, 'startDialogue' | 'stopDialogue' | 'dialoguePlayback'>;
const readingTime = (line: ScriptLine) => Math.max(2.8, Math.min(8, 1.2 + line.text.split(/\s+/).length * .29));

/** Recorded stories follow the audio clock, including stalls and pauses. Silent
 * stories and unavailable recordings use the original active-game subtitle clock. */
export class StoryDialogue {
 private lines: readonly ScriptLine[] = [];
 private index = 0;
 private elapsed = 0;
 private total = 0;
 private audio?: LevelConfig['storyAudio'];
 private player?: DialoguePlayer;
 private started = false;
 private voiceLevel = 0;
 private reaction = 0;
 private turn = 0;
 private lineEnds: readonly number[] = [];

 start(lines: readonly ScriptLine[] = [], audio?: LevelConfig['storyAudio'], player?: DialoguePlayer) {
  this.reset();
  this.lines = lines;
  this.reaction = !lines.length && !audio ? 1.4 : 0;
  if (!audio || !player) return;
  this.audio = audio;
  this.player = player;
  if (audio.lineEnds?.length === lines.length) this.lineEnds = audio.lineEnds;
  else {
   const weights = lines.map(readingTime);
   const sum = weights.reduce((a,b) => a + b, 0);
   let weight = 0;
   this.lineEnds = weights.map(value => (weight += value) / sum * audio.duration);
  }
 }

 reset() {
  if (this.started) this.player?.stopDialogue();
  this.audio = undefined;
  this.player = undefined;
  this.started = false;
  this.voiceLevel = this.turn = this.reaction = 0;
  this.lineEnds = [];
  this.lines = [];
  this.index = this.elapsed = this.total = 0;
 }

 get silentReaction(){return this.reaction>0;}
 get done() { return !this.audio && this.index >= this.lines.length; }
 get line() { return this.audio && !this.started ? null : this.lines[this.index] ?? null; }

 update(dt: number, active: boolean) {
  if (!active || !Number.isFinite(dt) || dt <= 0) return;
  if (this.reaction > 0) {
   this.reaction = Math.max(0, this.reaction - Math.min(.1,dt));
   this.total += Math.min(.1,dt);
  }
  if (this.done) return;
  if (this.audio && this.player) {
   if (!this.started) {
    this.started = true;
    this.player.startDialogue(this.audio.url);
   }
   const playback = this.player.dialoguePlayback;
   if (playback.status === 'ended') {
    this.index = this.lines.length;
    this.audio = undefined;
    return;
   }
   if (playback.status !== 'failed') {
    this.total = playback.position;
    this.voiceLevel = playback.speechLevel ?? 0;
    const turns = this.audio.speakers;
    while (turns && this.turn + 1 < turns.length && this.total >= turns[this.turn + 1].at) this.turn++;
    // Keep the final line until the recording itself ends, including its tail.
    while (this.index < this.lines.length - 1 && this.total >= this.lineEnds[this.index]) this.index++;
    return;
   }
   // Continue from the current subtitle if an audio download or decode fails.
   this.audio = undefined;
   this.elapsed = 0;
  }
  const line = this.line;
  if (!line) return;
  const step = Math.min(dt, .1);
  this.elapsed += step;
  this.total += step;
  if (this.elapsed >= readingTime(line)) { this.index++; this.elapsed = 0; }
 }

 get speaker() {
  if (this.audio?.speakers?.length) return this.started ? this.audio.speakers[this.turn].who : undefined;
  return this.line?.who;
 }
 get speechEnvelope() {
  if (this.reaction>0) return .14 + Math.abs(Math.sin(this.total * 9)) * .24;
  if (this.speaker !== 'customer') return 0;
  return this.audio ? this.voiceLevel : .22 + Math.abs(Math.sin(this.total * 14)) * .55;
 }
}
