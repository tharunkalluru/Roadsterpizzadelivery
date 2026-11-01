import { ModuleBase } from '../../../src/delivery/modules/base';
import { createSceneCharacter, type CharacterStyle } from '../../../src/delivery/modules/character';

/** Historical procedural-art pose regressions only. These tests inspect the
 * rejected candidates, like the isolated art-review page, not release actors.
 * Node runs each test file in its own process. Never import this in game code. */
export function installLegacyCandidateActors() {
  (ModuleBase.prototype as any).character=function(style:CharacterStyle,x:number,y:number,z:number,seated=false,parent=this.root){
    const actor=createSceneCharacter(style,seated,{geometry:g=>this.own(g),material:(key,m)=>this.materials.set(`${key}:${this.materials.size}`,m)});
    actor.group.position.set(x,y,z);parent.add(actor.group);return actor;
  };
}
