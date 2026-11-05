import type { ScriptLine } from '../core/types';
/** Fixed cinematic subtitles, independent of calls. Time advances only when the
 * owning story is active and its scene is ready. Pause never consumes a line. */
export class StoryDialogue {
 private lines:readonly ScriptLine[]=[];private index=0;private elapsed=0;private total=0;
 start(lines:readonly ScriptLine[]=[]){this.lines=lines;this.index=0;this.elapsed=0;this.total=0;}
 reset(){this.start();}
 get done(){return this.index>=this.lines.length;}
 get line(){return this.lines[this.index]??null;}
 update(dt:number,active:boolean){
  if(!active||this.done||!Number.isFinite(dt)||dt<=0)return;
  const step=Math.min(dt,.1);this.elapsed+=step;this.total+=step;
  const duration=Math.max(2.8,Math.min(8,1.2+this.line!.text.split(/\s+/).length*.29));
  if(this.elapsed>=duration){this.index++;this.elapsed=0;}
 }
 get speechEnvelope(){return this.line?.who==='customer'&&!this.line.speaker?(0.22+Math.abs(Math.sin(this.total*14))*.55):0;}
}
