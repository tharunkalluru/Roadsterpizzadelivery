import * as THREE from 'three';
import { ModuleBase, numberParam } from './base';
import type { SceneCharacter } from './character';

export class Underwater extends ModuleBase {
  private pizza!: THREE.Mesh;
  private throwTime = -1;
  private throwFrom = new THREE.Vector3();
  private bubbles: THREE.Mesh[] = [];
  private surface=false;
  private emerged=0;
  private announced=false;
  private swimmer!:SceneCharacter;
  private ripples:THREE.Mesh[]=[];
  protected build() {
    this.surface=this.params.scene==='surfaceEmergence';
    if(this.surface){this.buildSurface();return;}
    const depth = numberParam(this.params, 'depth', 4, 2, 12), d = this.ctx.destination;
    this.throwTime = -1; this.bubbles = [];
    this.setTarget({ x: d.x, y: d.y - depth, z: d.z, label: d.label });
    this.ring.position.y = -depth + .1;
    this.box(0, -depth - 1.5, 0, 28, 1, 28, '#265657');
    this.person(0, -depth - 1, 0, '#DF783F');
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(this.own(new THREE.SphereGeometry(.13 + i % 3 * .06, 6, 4)), this.mat('#77D7DB'));
      mesh.position.set(Math.sin(i * 2.3) * 6, -depth + i % 4, Math.cos(i * 2.3) * 6); this.root.add(mesh); this.bubbles.push(mesh);
    }
    this.pizza = this.box(0, 0, 0, 1.2, .25, 1.2, '#FFB627'); this.pizza.visible = false;
    this.movement = { mode: 'underwater', center: { ...d }, radius: numberParam(this.params, 'approachRadius', 60, 20, 120), depth };
    this.status = { instruction: 'Dive to the glowing underwater marker', canDrop: false, actionLabel: 'THROW' };
  }
  update(dt: number) {
    if(this.surface){this.updateSurface(dt);return;}
    if (!this.tick(dt)) return;
    const depth = numberParam(this.params, 'depth', 4, 2, 12), p = this.ctx.player();
    for (let i = 0; i < this.bubbles.length; i++) this.bubbles[i].position.y = -depth + (this.time * .65 + i * .4) % (depth + 1);
    if (this.throwTime >= 0) {
      this.throwTime += Math.max(0, Math.min(dt, .1));
      const t = Math.min(1, this.throwTime / .7), d = this.ctx.destination;
      this.pizza.position.set(this.throwFrom.x + (this.target.x - this.throwFrom.x) * t - d.x,
        this.throwFrom.y + (this.target.y - this.throwFrom.y) * t + Math.sin(t * Math.PI) * 2 - d.y,
        this.throwFrom.z + (this.target.z - this.throwFrom.z) * t - d.z);
      this.pizza.rotation.set(t * Math.PI * 4, 0, t * Math.PI * 2);
      if (t === 1) { this.pizza.visible = false; this.done(); }
      return;
    }
    this.status.canDrop = this.unlocked() && this.within(numberParam(this.params, 'throwRange', 12, 4, 25), 4) && p.y < this.ctx.destination.y - 1;
    this.status.instruction = this.status.canDrop ? 'Singamalai! Throw the pizza' : 'Dive to the glowing underwater marker';
  }
  onDrop() {
    if(this.surface){this.throwSurface();return;}
    if (!this.unlocked() || this.ended || this.throwTime >= 0) return;
    if (!this.status.canDrop) { this.fail('Get closer underwater, then throw again.'); return; }
    const p = this.ctx.player(); this.throwFrom.set(p.x, p.y, p.z); this.throwTime = 0; this.pizza.visible = true;
    this.status.canDrop = false; this.status.instruction = 'Pizza away!'; this.ctx.cue?.('throw');
  }
  private buildSurface(){
    this.emerged=0;this.announced=false;this.throwTime=-1;this.ripples=[];
    const d=this.ctx.destination;
    this.setTarget({...d,y:d.y+.4});this.ring.position.y=.07;
    this.swimmer=this.character('simhadri',0,-4,0);this.swimmer.group.visible=false;
    for(let i=0;i<3;i++){
      const ripple=new THREE.Mesh(this.own(new THREE.RingGeometry(.92,1,32)),this.mat(i%2?'#B6DAD2':'#6AB7B7'));
      ripple.rotation.x=-Math.PI/2;ripple.position.y=.035+i*.008;this.root.add(ripple);this.ripples.push(ripple);
    }
    this.pizza=this.box(0,0,0,1,.18,1,'#F3B544');this.pizza.visible=false;
    this.movement={mode:'approach',center:{...d},radius:numberParam(this.params,'approachRadius',60,20,120),altitude:d.y+.45};
    this.status={instruction:'Float near the lake marker and call',canDrop:false,actionLabel:'THROW'};
  }
  private updateSurface(dt:number){
    if(!this.tick(dt))return;const elapsed=Math.max(0,Math.min(.1,dt)),d=this.ctx.destination,p=this.ctx.player();
    for(let i=0;i<this.ripples.length;i++){const phase=(this.time*.4+i/3)%1;this.ripples[i].scale.setScalar(1.6+phase*4);}
    if(this.unlocked())this.emerged=Math.min(1,this.emerged+elapsed/1.8);
    this.swimmer.group.visible=this.emerged>0;
    const ease=this.emerged*this.emerged*(3-2*this.emerged);
    this.swimmer.group.position.y=-4+3.35*ease+(this.emerged===1?Math.sin(this.time*1.8)*.04:0);
    this.swimmer.group.rotation.y=Math.atan2(p.x-d.x,p.z-d.z);
    if(this.emerged>=.65&&!this.announced){this.announced=true;this.ctx.sceneEvent?.('characterEmerged',{character:'simhadri'});}
    if(this.throwTime>=0){
      this.throwTime+=elapsed;const t=Math.min(1,this.throwTime/.85),yaw=this.swimmer.group.rotation.y;
      const hands=new THREE.Vector3(Math.sin(yaw)*.55,.8,Math.cos(yaw)*.55);
      this.pizza.position.set(this.throwFrom.x-d.x+(hands.x-(this.throwFrom.x-d.x))*t,
        this.throwFrom.y-d.y+(hands.y-(this.throwFrom.y-d.y))*t+Math.sin(t*Math.PI)*1.5,
        this.throwFrom.z-d.z+(hands.z-(this.throwFrom.z-d.z))*t);
      this.pizza.rotation.set(t<1?t*Math.PI*2:0,yaw,0);
      this.swimmer.catchPose(Math.min(1,this.throwTime*2.2));this.status.canDrop=false;
      this.status.instruction=t<1?'Singamalai! Pizza away!':'Caught it!';
      if(this.throwTime>=1.4)this.done();return;
    }
    this.status.canDrop=this.unlocked()&&this.emerged===1&&this.within(numberParam(this.params,'throwRange',12,4,25),2.2)&&p.y>=d.y-1.1&&Math.abs(p.speed)<10;
    this.status.instruction=!this.unlocked()?'Call from the lake surface':this.emerged<1?'Someone is rising from the lake…':this.status.canDrop?'Singamalai! Throw the pizza to his hands':'Float closer on the surface and slow down';
  }
  private throwSurface(){
    if(!this.unlocked()||this.ended||this.throwTime>=0)return;
    if(!this.status.canDrop){this.fail('Stay near the water surface, wait for him to emerge, then throw.');return;}
    const p=this.ctx.player();this.throwFrom.set(p.x,p.y+.5,p.z);this.throwTime=0;this.pizza.visible=true;this.status.canDrop=false;
    this.ctx.sceneEvent?.('catchStarted',{character:'simhadri'});this.ctx.cue?.('throw');
  }
}
