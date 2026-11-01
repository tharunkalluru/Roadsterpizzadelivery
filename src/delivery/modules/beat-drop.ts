import { ModuleBase, numberParam, distanceXZ } from './base';
import type { SceneCharacter } from './character';
import * as THREE from 'three';

export class BeatDrop extends ModuleBase {
  private lastBeat = -1;
  private receiver:SceneCharacter|null=null;
  private catchReturn = 0;
  private stadiumLight: {position:{x:number;y:number;z:number};kind:'stadium'}|undefined;
  private focusPosition=new THREE.Vector3();
  private focusTarget=new THREE.Vector3();
  private stadiumFocus={position:this.focusPosition,target:this.focusTarget,context:'stationary-handoff' as const};
  private nearReceiver(radius:number){
    if(!this.ready||!this.params.useExistingStadium||!this.receiver?.group.visible||this.receiver.group.userData.characterRelease==='withheld')return false;
    const p=this.ctx.player();return !p.flying&&!p.descending&&!p.jumping&&Math.abs(p.y-this.target.y-.55)<.8&&distanceXZ(p,this.target)<=radius;
  }
  get sceneLamp(){return this.ready&&!!this.receiver?.group.visible&&this.receiver.group.userData.characterRelease!=='withheld'&&distanceXZ(this.ctx.player(),this.target)<100?this.stadiumLight:undefined;}
  get headlightGain(){return this.nearReceiver(6) ? .02 : undefined;}
  get intentionalStop(){return this.nearReceiver(6)&&Math.abs(this.ctx.player().speed)<=.8;}
  get hideWorldGuidance(){return this.charactersReady&&this.nearReceiver(6)&&Math.abs(this.ctx.player().speed)<=.75;}
  get cameraFocus(){
    if(!this.charactersReady||!this.nearReceiver(6)||Math.abs(this.ctx.player().speed)>.75)return undefined;
    const actor=this.receiver!.group.position;this.root.updateWorldMatrix(true,false);
    this.root.localToWorld(this.focusPosition.set(actor.x+1.8,1.7,actor.z+4.2));
    this.root.localToWorld(this.focusTarget.set(actor.x,1.1,actor.z));return this.stadiumFocus;
  }
  get sceneryPending(){return this.ready&&this.ended&&!!this.params.useExistingStadium&&distanceXZ(this.ctx.player(),this.target)<850;}
  protected build() {
    this.lastBeat = -1;this.receiver=null;this.catchReturn=0;this.stadiumLight=undefined;
    const tiny = this.params.theme === 'eega';
    if (tiny) {
      this.platform(9, 9, 0, '#656049');
      const insect=new THREE.Group();insect.name='delivery-character-eega';insect.position.y=1.8;this.root.add(insect);
      this.cylinder(0,0,0,.18,.35,'#EFC74C',insect);
      const wings=[-1,1].map(side=>{const wing=new THREE.Group();wing.position.set(side*.28,.05,0);insect.add(wing);this.box(0,0,0,.4,.04,.2,'#F2F4E5',wing);return wing;});
      const anchor=new THREE.Object3D();anchor.name='delivery-eega-catch-point';anchor.position.y=-.04;insect.add(anchor);
      this.receiver={group:insect,leftArm:wings[0],rightArm:wings[1],catchPoint:anchor,
        catchPose:amount=>{wings[0].rotation.z=-Math.min(1,amount)*.8;wings[1].rotation.z=Math.min(1,amount)*.8;}};
    } else if(this.params.useExistingStadium){
      // The city already owns Uppal's oval turf, wicket, stands and lights.
      // Only a delivery marker and the approved actor rig belong to this scene.
      // The marker is the car's landing spot, not the actor's body. Leave a
      // clear full-car footprint beside the player and the existing wicket.
      this.receiver=this.character('jersey',-3.4,0,-1);
      const light=this.params.stadiumLight as {x?:number;y?:number;z?:number}|undefined;
      if(light&&[light.x,light.y,light.z].every(v=>typeof v==='number'&&Number.isFinite(v)))this.stadiumLight={position:{x:light.x!,y:light.y!,z:light.z!},kind:'stadium'};
    } else {
      this.platform(74, 92, 0, '#2F7E50');
      this.box(0, .03, 0, 5.8, .08, 22, '#D7B58B');
      for (const z of [-10, 10]) for (const x of [-.45, 0, .45]) this.box(x, .55, z, .08, 1.1, .08, '#F5EEDC');
      for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
        this.box(side * (39 + row * 2), row * 1.2, 0, 3, 1.2, 84, row % 2 ? '#7496A9' : '#BBC8D0');
      }
      for (const x of [-37, 37]) for (const z of [-42, 42]) {
        this.box(x, 12, z, .6, 24, .6, '#A4B0BA');
        this.box(x, 24, z, 6, 3, .6, '#FFF0C4');
      }
      this.receiver=this.character('jersey',3,0,2); this.character('extra',-3,0,-8);
    }
    this.movement = this.params.useExistingStadium?{mode:'normal'}:{ mode: 'approach', center: { ...this.target }, radius: 120, altitude: this.target.y + 5 };
    this.status = { instruction: 'Wait for the green break between overs', canDrop: false, actionLabel: 'DROP' };
  }
  update(dt: number) {
    const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
    if(this.ready&&this.ended){
      this.receiver?.animate?.(step,'idle',1);
      if(this.catchReturn>0){this.catchReturn=Math.max(0,this.catchReturn-step);this.receiver?.catchPose(this.catchReturn/.45);}
      this.status.canDrop=false;return;
    }
    if (!this.tick(dt)) return;
    this.receiver?.animate?.(step,'idle',1);
    const period = numberParam(this.params, 'period', 6, 2, 12), phase = this.time % period / period;
    const start = numberParam(this.params, 'windowStart', .65, 0, .9), end = Math.max(start + .05, numberParam(this.params, 'windowEnd', .92, .1, 1));
    const ready = phase >= start && phase <= end;
    const beat = Math.floor(this.time / (period / 4));
    if (beat !== this.lastBeat) { this.lastBeat = beat; if (this.unlocked() && this.within(120, 80)) this.ctx.cue?.('beat'); }
    this.ring.material = this.mat(ready ? '#45E3D3' : '#FFB627');
    this.ring.scale.setScalar(ready ? 1.35 : 1);
    const radius = numberParam(this.params, 'radius', this.params.theme === 'eega' ? 4 : 12, 2, 24);
    const p=this.ctx.player(),grounded=!p.flying&&!p.descending&&!p.jumping&&Math.abs(p.y-this.target.y-.55)<.8&&Math.abs(p.speed)<3;
    const near=this.within(radius,this.params.useExistingStadium?1.3:10);
    this.status.canDrop = this.unlocked() && ready && near&&(!this.params.useExistingStadium||grounded);
    this.status.timing = { phase, start, end, ready };
    this.status.instruction = this.status.canDrop ? 'Break in play — drop now!' :this.params.useExistingStadium?(!near||!grounded?'Land beside the marked player on the stadium turf':'Wait for the green break between overs'):!near?'Hover above the glowing pitch marker':'Wait for the green break between overs';
    this.advanceHandoff(dt);
  }
  onDrop() {
    if (!this.unlocked() || this.ended || this.handoffPending) return;
    if (this.status.canDrop) this.beginHandoff(this.receiver,()=>{this.ring.visible=false;this.catchReturn=.45;this.done();}); else this.fail(this.within(numberParam(this.params, 'radius', 12), 10) ? 'Not between overs yet. Wait for green and retry.' : 'Move over the pitch marker first.');
  }
}
