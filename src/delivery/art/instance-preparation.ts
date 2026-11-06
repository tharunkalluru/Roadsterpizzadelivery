import type { Group } from 'three';
interface Entry { root:Group; ready:boolean; pending:boolean; retryAt:number; visible:boolean }
export interface InstancePreparationDependencies {
  warm(root:Group,valid:()=>boolean):Promise<void>;
  now():number;
}

/** Exact independently skinned actors need their own small bone textures, even
 * when authored geometry and programs were prepared on the shared template.
 * Prepare one actor at a time before exposing it; failure retries in active
 * game time. This does not animate, reparent, dispose or replace actor assets.
 */
export class InstancePreparation {
  private entries:Entry[]=[];
  private active=false;
  private disposed=false;
  constructor(private dependencies:InstancePreparationDependencies){}
  get ready(){return !this.disposed&&this.entries.every(entry=>entry.ready);}
  add(root:Group){
    if(this.disposed||this.entries.some(entry=>entry.root===root))return;
    this.entries.push({root,ready:false,pending:false,retryAt:0,visible:root.visible});root.visible=false;this.tick();
  }
  tick(){
    if(this.disposed||this.active)return;
    const entry=this.entries.find(item=>!item.ready&&!item.pending&&this.dependencies.now()>=item.retryAt);if(!entry)return;
    entry.pending=true;this.active=true;
    const valid=()=>!this.disposed&&this.entries.includes(entry);
    void Promise.resolve().then(()=>{if(valid())return this.dependencies.warm(entry.root,valid);}).then(()=>{
      if(!valid())return;entry.ready=true;entry.pending=false;entry.root.visible=entry.visible;this.active=false;this.tick();
    },()=>{
      if(!valid())return;entry.pending=false;entry.retryAt=this.dependencies.now()+5;this.active=false;this.tick();
    });
  }
  dispose(){this.disposed=true;this.entries=[];this.active=false;}
}
