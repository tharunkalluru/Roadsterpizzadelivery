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
 private lineEnds: readonly number[] = [];

 start(lines: readonly ScriptLine[] = [], audio?: LevelConfig['storyAudio'], player?: DialoguePlayer) {
  this.reset();
  this.lines = lines;
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
  this.lineEnds = [];
  this.lines = [];
  this.index = this.elapsed = this.total = 0;
 }

 get done() { return !this.audio && this.index >= this.lines.length; }
 get line() { return this.audio && !this.started ? null : this.lines[this.index] ?? null; }

 update(dt: number, active: boolean) {
  if (!active || this.done || !Number.isFinite(dt) || dt <= 0) return;
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

 get speechEnvelope() {
  return this.line?.who === 'customer' && !this.line.speaker ? .22 + Math.abs(Math.sin(this.total * 14)) * .55 : 0;
 }
}
