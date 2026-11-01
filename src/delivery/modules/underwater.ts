import * as THREE from 'three';
import { ModuleBase, numberParam, heading } from './base';
import type { SceneCharacter } from './character';
import { devaraSkeletonGeometry } from './devara-skeleton';

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
  private devara=false;
  private diveStage:'surface'|'descending'|'submerged'|'placing'|'returning'='surface';
  private underwaterSet=new THREE.Group();
  private devaraActor:SceneCharacter|null=null;
  private placementTime=0;
  private diveLightSource=new THREE.Object3D();
  private diveLightRequest={position:new THREE.Vector3(),kind:'underwater' as const};
  get sceneLamp(){
    if(!this.ready||!this.devara||this.diveStage==='surface'||!this.underwaterSet.visible)return undefined;
    this.diveLightSource.updateWorldMatrix(true,false);this.diveLightRequest.position.setFromMatrixPosition(this.diveLightSource.matrixWorld);return this.diveLightRequest;
  }
  get hideWorldGuidance(){return this.devara&&this.diveStage!=='surface';}
  get headlightGain(){return this.ready&&this.devara&&this.diveStage!=='surface' ? .02 : 1;}
  get cameraFocus(){
    const p=this.ctx?.player();
    if(!p||!this.devara||!this.charactersReady||!['submerged','placing'].includes(this.diveStage)||Math.abs(p.speed)>.75)return undefined;
    const bed=-numberParam(this.params,'depth',6,4,10)-.55;
    this.underwaterSet.updateWorldMatrix(true,false);
    // Choose the side opposite the car: a close approach must not put the
    // camera inside its roof, or align the skull directly over Devara's face.
    const localPlayer=this.underwaterSet.worldToLocal(new THREE.Vector3(p.x,p.y,p.z));
    const position=this.underwaterSet.localToWorld(new THREE.Vector3(localPlayer.x>=-.3?-1.9:1.9,bed+1.7,2.6));
    const target=this.underwaterSet.localToWorld(new THREE.Vector3(.15,bed+1.05,.08));
    return {position,target};
  }
  protected build() {
    this.devara=this.params.scene==='devaraUnderwater';
    if(this.devara){this.buildDevara();return;}
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
    if(this.devara){this.updateDevara(dt);return;}
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
    if(this.devara){this.dropDevara();return;}
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
    this.swimmer.group.visible=this.charactersReady&&this.emerged>0;
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

  /** The lake entry is an explicit player action. Merely arriving must never
   * pull a freely flying car underwater or finish a delivery above the actor. */
  private buildDevara(){
    const depth=numberParam(this.params,'depth',6,4,10),d=this.ctx.destination;
    this.diveStage='surface';this.placementTime=0;this.announced=false;this.throwTime=-1;this.ripples=[];this.bubbles=[];
    this.underwaterSet=new THREE.Group();this.underwaterSet.name='delivery-devara-underwater-set';this.root.add(this.underwaterSet);this.underwaterSet.visible=false;
    this.setTarget({...d,y:d.y+.45});this.ring.position.y=.07;
    for(let i=0;i<3;i++){
      const ripple=new THREE.Mesh(this.own(new THREE.RingGeometry(1.8+i*.65,1.86+i*.65,40)),this.mat(i%2?'#B6DAD2':'#6AB7B7'));
      ripple.rotation.x=-Math.PI/2;ripple.position.y=.035+i*.008;this.root.add(ripple);this.ripples.push(ripple);
    }
    const bed=-depth-.55;
    this.box(0,bed-.22,0,30,.44,28,'#244E51',this.underwaterSet).name='delivery-devara-lakebed';
    // Underwater buoyancy controls the car's depth. A train-style solid slab
    // here would shove the still-floating car sideways as its tyres settle,
    // because it is deliberately not a grounded rail passenger.
    for(const [x,z,s]of [[-5,-2,1.4],[4,3,1.1],[-3,5,.7],[6,-4,1.6]] as const){
      const rock=new THREE.Mesh(this.own(new THREE.DodecahedronGeometry(s,0)),this.mat('#345E5E'));rock.position.set(x,bed+s*.35,z);rock.scale.y=.5;this.underwaterSet.add(rock);
    }
    this.devaraActor=this.character('devara',0,bed,-.12,false,this.underwaterSet);
    this.devaraActor.group.name='delivery-character-devara';
    // Keep this fixed neck grip during delivery. A normal two-hand catch would
    // release the skeleton and destroy the scene the player came to recognise.
    // The reviewed rig owns this pose. Re-rotating its bones here would
    // undo the real hand-to-neck contact authored for the tableau.
    this.devaraActor.animate?.(0,'idle');
    this.devaraActor.group.userData.scenePose='behind-skeleton-neck-grip';
    const skeleton=this.skeleton();skeleton.position.set(0,bed,.4);this.underwaterSet.add(skeleton);
    this.box(1.45,bed+.22,.65,.85,.44,.8,'#426F70',this.underwaterSet).name='delivery-devara-pizza-rest';
    // A small dive worklight makes the night tableau readable. It borrows a
    // fixed engine light slot rather than adding a light/shader variant.
    this.cylinder(-2.6,bed+.08,1.1,.16,.16,'#334F53',this.underwaterSet).name='delivery-dive-worklight-base';
    this.cylinder(-2.6,bed+.88,1.1,.018,1.6,'#3E575A',this.underwaterSet);
    this.box(-2.6,bed+1.75,1.1,.18,.12,.09,'#32464A',this.underwaterSet);
    this.box(-2.6,bed+1.75,1.048,.14,.08,.015,'#B9DDE1',this.underwaterSet).name='delivery-dive-worklight-lens';
    this.diveLightSource=new THREE.Object3D();this.diveLightSource.name='delivery-dive-worklight-source';this.diveLightSource.position.set(-2.6,bed+1.8,1.04);this.underwaterSet.add(this.diveLightSource);
    this.pizza=this.pizzaBox(this.underwaterSet);this.pizza.position.set(1.45,bed+.475,.65);this.pizza.name='delivery-devara-placed-pizza';this.pizza.visible=false;
    for(let i=0;i<10;i++){
      const bubble=new THREE.Mesh(this.own(new THREE.SphereGeometry(.055+i%3*.025,6,4)),this.mat('#75C4C5'));
      bubble.position.set(Math.sin(i*2.3)*3,-depth+(i%4)*.7,Math.cos(i*2.3)*3);this.underwaterSet.add(bubble);this.bubbles.push(bubble);
    }
    this.movement={mode:'approach',center:{...d},radius:numberParam(this.params,'approachRadius',60,20,120),altitude:d.y+.45};
    this.status={instruction:'Approach the lake marker, then dive',canDrop:false,actionLabel:'DIVE',progress:'Lake surface'};
  }

  /** Intact anatomical bones retain a real cervical surface for both hands.
   * The complete static prop is one opaque mesh with no per-frame work. */
  private skeleton(){
    const material=new THREE.MeshStandardMaterial({color:'#D0CDBE',roughness:.88,metalness:0});
    this.materials.set('devara-skeleton-anatomical',material);
    const mesh=new THREE.Mesh(this.own(devaraSkeletonGeometry()),material);
    mesh.name='delivery-devara-intact-skeleton';
    mesh.userData.anatomy=['skull','jaw','spine','ribcage','pelvis','arms','legs'];
    mesh.userData.sourceGlbSha256=mesh.geometry.userData.sourceGlbSha256;
    return mesh;
  }

  private updateDevara(dt:number){
    if(!this.tick(dt))return;
    const elapsed=Math.max(0,Math.min(.1,dt)),p=this.ctx.player(),d=this.ctx.destination,depth=numberParam(this.params,'depth',6,4,10);
    const radius=numberParam(this.params,'approachRadius',60,20,120);
    const horizontal=Math.hypot(p.x-d.x,p.z-d.z),underwaterY=d.y-depth;
    this.underwaterSet.visible=this.diveStage!=='surface'||p.y<d.y-.7;
    this.ring.visible=this.diveStage==='surface';
    for(let i=0;i<this.ripples.length;i++){this.ripples[i].visible=p.y>d.y-1;this.ripples[i].scale.setScalar(1+Math.sin(this.time*1.6+i)*.04);}
    for(let i=0;i<this.bubbles.length;i++)this.bubbles[i].position.y=-depth+(this.time*.4+i*.47)%(depth-.4);
    if(this.diveStage==='surface'){
      this.status.canDrop=this.unlocked()&&horizontal<=12&&Math.abs(p.y-(d.y+.45))<2&&Math.abs(p.speed)<8&&!p.jumping;
      this.status.actionLabel='DIVE';this.status.progress='Lake surface';
      this.status.instruction=this.status.canDrop?'Dive to the underwater delivery marker':'Approach the lake marker and slow down';return;
    }
    if(this.diveStage==='descending'){
      this.movement={mode:'underwater',center:{...d},radius,depth};
      this.status.canDrop=false;this.status.actionLabel='DIVING';this.status.instruction='Descending to the lakebed…';this.status.progress='Underwater approach';
      if(horizontal<radius&&Math.abs(p.y-underwaterY)<1){
        this.diveStage='submerged';
        if(!this.announced){this.announced=true;this.ctx.sceneEvent?.('characterEmerged',{character:'devara'});}
      }
    }
    if(this.diveStage==='submerged'){
      this.status.canDrop=this.unlocked()&&Math.hypot(p.x-this.target.x,p.z-this.target.z)<=numberParam(this.params,'throwRange',8,4,15)&&Math.abs(p.y-underwaterY)<1.3&&Math.abs(p.speed)<6;
      this.status.actionLabel='PLACE PIZZA';this.status.progress='Lakebed delivery';this.status.instruction=this.status.canDrop?'Place the pizza beside him':'Move alongside the underwater marker and slow down';
    }else if(this.diveStage==='placing'){
      this.placementTime+=elapsed;this.status.canDrop=false;this.status.instruction='Pizza delivered';
      if(this.placementTime>=.65){
        this.diveStage='returning';this.setTarget({...d,y:d.y+.45});this.movement={mode:'approach',center:{...d},radius,altitude:d.y+.45};
      }
    }
    if(this.diveStage==='returning'){
      this.status.canDrop=false;this.status.actionLabel='SURFACING';this.status.progress='Returning to the surface';this.status.instruction='Returning to the lake surface…';
      if(p.y>=d.y-.35&&horizontal<=radius)this.done();
    }
  }

  private dropDevara(){
    if(!this.unlocked()||this.ended||this.diveStage==='placing'||this.diveStage==='returning')return;
    if(!this.status.canDrop){this.fail(this.diveStage==='surface'?'Reach the lake marker and slow down before diving.':'Reach the underwater marker before placing the pizza.');return;}
    const d=this.ctx.destination,depth=numberParam(this.params,'depth',6,4,10);
    if(this.diveStage==='surface'){
      // Frame the tableau ahead of the arrival heading. Putting it at the
      // dive marker made the skeleton overlap the Roadster's roof and hid the
      // neck-grip pose behind the car in the normal mobile chase camera.
      const player=this.ctx.player(),forward=heading(player.yaw);
      this.underwaterSet.position.set(player.x-d.x+forward.x*6,0,player.z-d.z+forward.z*6);
      this.underwaterSet.rotation.y=Math.atan2(-forward.x,-forward.z);
      this.diveStage='descending';this.setTarget({...d,x:player.x+forward.x*6,z:player.z+forward.z*6,y:d.y-depth});this.movement={mode:'underwater',center:{...d},radius:numberParam(this.params,'approachRadius',60,20,120),depth};
      this.status.canDrop=false;this.status.actionLabel='DIVING';this.status.instruction='Descending to the lakebed…';return;
    }
    if(this.diveStage==='submerged'){
      this.diveStage='placing';this.placementTime=0;this.pizza.visible=true;this.status.canDrop=false;
      this.ctx.cue?.('throw');this.ctx.sceneEvent?.('catchStarted',{character:'devara'});
    }
  }

  teardown(){
    this.devaraActor=null;this.bubbles=[];this.ripples=[];this.diveStage='surface';this.placementTime=0;
    super.teardown();
  }
}
