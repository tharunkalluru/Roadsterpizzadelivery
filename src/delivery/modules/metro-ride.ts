import * as THREE from 'three';
import { ModuleBase, distanceXZ } from './base';
import type { SceneCharacter } from './character';
import { railRoofAt, type MovingRailBody } from '../../game/moving-rail';
import type { DeliveryPlayer, DeliveryPoint, ModuleStoryFrame } from './types';
import type { MetroStationDwell } from '../../game/metro';
import { METRO_PLATFORM_OFFSET, METRO_TRACK_OFFSET, METRO_DOOR_SIDE_OFFSET } from '../../world/metro-geometry';
import { supportedMetroHandoffParking,METRO_DELIVERY_WALK_DISTANCE } from '../metro-platform';
import { nearestActualMetroPlatformLamp } from '../../world/metro-platform-lamps';
import { segmentHitsVehicle } from '../../game/spatial-safety';
import { stepStoryPose } from '../systems/story-director';

const trainId = (id:string) => id.slice(0,id.lastIndexOf(':'));
type Door={x:number;y:number;z:number;hx:number;hz:number};
interface PlatformExit {door:Door;outward:{x:number;z:number};parking:DeliveryPoint&{hx:number;hz:number};shot:{along:number;outward:number}}
/** Uses the city's existing train and real station door frames. No replacement
 * metro, fake station, or direct-flight shortcut can satisfy the ride gate. */
export class MetroRide extends ModuleBase {
  private phase:'boarding'|'riding'|'exiting'|'handoff'='boarding';
  private boarded=''; private startStation=''; private departed=false; private unavailableStation='';
  private referenceCoach='';
  private last:{x:number;z:number}|null=null; private travelled=0; private exitTime=0;
  private catchReturn=0;
  private platformLamp:{position:{x:number;y:number;z:number};kind:'metro-platform'}|undefined;
  private focusPosition=new THREE.Vector3();private focusTarget=new THREE.Vector3();
  private platformFocus={position:this.focusPosition,target:this.focusTarget,context:'stationary-handoff' as const};
  private group=new THREE.Group(); private actors:SceneCharacter[]=[];
  private door={x:0,y:0,z:0,hx:0,hz:1}; private outward={x:1,z:0};
  private focusAlong=3.3;private focusOutward=1.4;
  private exitPreparation:{stop:MetroStationDwell;body:MovingRailBody;origin:DeliveryPlayer;steps:Generator<undefined,PlatformExit|null|undefined>}|undefined;
  get storyArrivalReady(){
    if(!this.ready||!this.ctx.automaticStories)return false;
    const eligible=this.ctx.existingTrain?.(),id=this.boarded||(eligible?trainId(eligible.id):'');
    return !!id&&!!this.ctx.metroService?.().bodies.some(b=>trainId(b.id)===id&&this.aboard(b));
  }
  override get story():ModuleStoryFrame|undefined{
    if(!this.ready||!this.ctx.automaticStories)return undefined;
    const service=this.ctx.metroService?.(),body=service?.bodies.find(b=>b.id===this.referenceCoach);
    // Only update() can establish riding, after aboard() verifies a genuine
    // grounded landing on the marked real rake. Proximity never boards it.
    if(this.phase==='boarding')return undefined;
    const p=this.ctx.player();
    if(this.phase==='riding')return body?{entry:this.aboard(body),point:{x:body.x,y:body.roof+.55,z:body.z},
      landing:{point:{x:p.x,y:(railRoofAt(body,p.x,p.z)??body.roof)+.55,z:p.z},radius:3.15},
      yaw:Math.atan2(-body.hx,-body.hz),maxSpeed:4,verticalSpeed:3}:undefined;
    return this.platformStory(this.target,this.ctx.player(),this.door,this.outward,body);
  }
  private platformStory(target:DeliveryPoint,p:Pick<DeliveryPlayer,'x'|'y'|'z'|'yaw'>,door:typeof this.door,outward:typeof this.outward,body?:MovingRailBody):ModuleStoryFrame{
    const point={...target,y:target.y+.55};
    // Leave the real roof laterally before lowering to the platform. A
    // diagonal roof-to-platform chord would pass through the coach side.
    const across=(p.x-point.x)*outward.x+(p.z-point.z)*outward.z;
    if(p.y>point.y+.8&&Math.abs(across)>.35)point.y=Math.max(p.y,body?.roof!==undefined?body.roof+.55:p.y);
    return {entry:true,point,yaw:Math.atan2(-door.hx,-door.hz),maxSpeed:4,verticalSpeed:2.5};
  }
  private parkedNearGroup(){return this.charactersReady&&this.group.visible&&this.actors.every(actor=>actor.group.userData.characterRelease!=='withheld')&&this.intentionalStop&&Math.abs(this.ctx.player().speed)<=.75;}
  private watchingExit(){
    if(!this.ready||this.phase!=='exiting'||!this.charactersReady||!this.group.visible||this.actors.some(actor=>actor.group.userData.characterRelease==='withheld'))return false;
    const p=this.ctx.player();return !p.flying&&!p.descending&&!p.jumping&&Math.abs(p.speed)<=.75&&this.within(30,6);
  }
  get sceneLamp(){
    if(!this.ready||!this.group.visible||!this.platformLamp)return undefined;
    const p=this.ctx.player();return distanceXZ(p,this.target)<50&&Math.abs(p.y-this.target.y-.55)<4?this.platformLamp:undefined;
  }
  get headlightGain(){return this.parkedNearGroup()||this.watchingExit() ? .02 : undefined;}
  get hideWorldGuidance(){return this.parkedNearGroup()||this.watchingExit();}
  get cameraFocus(){
    const exiting=this.watchingExit();if(!this.parkedNearGroup()&&!exiting)return undefined;
    // Stay inside the real outer guard. A front camera outside that wall sees
    // only concrete; a track-side camera is hidden by the arriving train.
    const x=this.door.x+this.outward.x*METRO_DELIVERY_WALK_DISTANCE,z=this.door.z+this.outward.z*METRO_DELIVERY_WALK_DISTANCE;
    // Reserve the host camera's .35m collision radius even where an offset
    // platform bends closer to its guard; never rely on the near plane alone.
    // Use the platform's length for a wider four-person shot. Moving outward
    // instead would put the camera through the guard; the previous 1.4m shot
    // also cropped the lawyer and looked steeply down at the group.
    this.focusPosition.set(x+this.outward.x*this.focusOutward+this.door.hx*this.focusAlong,this.door.y+1.65,z+this.outward.z*this.focusOutward+this.door.hz*this.focusAlong);
    let ax=0,az=0;for(const actor of this.actors){ax+=actor.group.position.x;az+=actor.group.position.z;}
    this.focusTarget.set(this.ctx.destination.x+ax/4,this.door.y+1.05,this.ctx.destination.z+az/4);
    return this.platformFocus;
  }
  get sceneryPending(){return this.ready&&this.ended&&distanceXZ(this.ctx.player(),this.target)<850;}
  get intentionalStop(){
    if(!this.ready||this.phase!=='handoff'||!this.group.visible)return false;
    const p=this.ctx.player();return !p.flying&&!p.descending&&!p.jumping&&this.within(7,2)&&Math.abs(p.speed)<=.8;
  }
  protected build(){
    this.phase='boarding';this.boarded='';this.startStation='';this.departed=false;this.referenceCoach='';this.unavailableStation='';
    this.last=null;this.travelled=0;this.exitTime=0;this.catchReturn=0;this.platformLamp=undefined;
    this.focusAlong=3.3;this.focusOutward=1.4;
    this.exitPreparation=undefined;
    this.group=new THREE.Group();this.group.name='vakeel-platform-group';this.root.add(this.group);
    this.actors=['vakeelSaab','vakeelWoman1','vakeelWoman2','vakeelWoman3'].map((style,i)=>this.character(style,i*.7,0,0,false,this.group));
    this.group.visible=false;this.ring.visible=false;
    this.status={instruction:'Land on a metro roof and ride to its next station',actionLabel:'DELIVER',canDrop:false};
    this.movement={mode:'normal'};
  }
  private aboard(body:MovingRailBody){
    const p=this.ctx.player();
    if(p.flying||p.descending||p.jumping)return false;
    if(p.railSupportId!==undefined&&p.railSupportId!==body.id)return false;
    if(p.verticalSpeed!==undefined&&Math.abs(p.verticalSpeed)>.1)return false;
    const roof=railRoofAt(body,p.x,p.z);
    return roof!==null&&Math.abs(p.y-roof-.55)<=.2;
  }
  update(dt:number){
    if(this.ready&&this.ended){
      // The train can depart while the completed passengers remain on their
      // actual platform. Keep only idle animation; never restart ride targets
      // or emit delivery events from a background scene.
      this.root.visible=this.sceneryPending;
      const elapsed=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
      this.actors.forEach(actor=>actor.animate?.(elapsed,'idle'));
      if(this.catchReturn>0){this.catchReturn=Math.max(0,this.catchReturn-elapsed);this.actors[0]?.catchPose(this.catchReturn/.45);}
      return;
    }
    if(!this.tick(dt))return;
    // Continue only this cached, cold station plan. Keep the real roof story
    // active until it is complete; no partial bay or passenger scene is used.
    if(this.exitPreparation){this.advanceExitPreparation();return;}
    const service=this.ctx.metroService?.(),p=this.ctx.player();
    // The next real station can be kilometres from the initial boarding point.
    // Visibility follows the live ride/handoff target, not the setup location.
    this.root.visible=distanceXZ(p,this.target)<850;
    const bodies=service?.bodies??[],dwells=service?.dwells??[];
    if(this.phase==='boarding'||this.phase==='riding'){
      const eligible=this.phase==='boarding'?this.ctx.existingTrain?.():null;
      const aboard=bodies.find(b=>(this.boarded?trainId(b.id)===this.boarded:!!eligible&&trainId(b.id)===trainId(eligible.id))&&this.aboard(b));
      if(this.phase==='boarding'&&aboard&&this.unlocked()){
        this.boarded=trainId(aboard.id);this.referenceCoach=aboard.id;this.phase='riding';this.last={x:aboard.x,z:aboard.z};
        this.startStation=dwells.find(d=>d.trainId===this.boarded)?.stationId??'';
        this.departed=!this.startStation;this.travelled=0;
      }
      const selected=this.boarded?bodies.find(b=>b.id===this.referenceCoach):eligible;
      if(selected){
        this.setTarget({x:selected.x,y:selected.roof,z:selected.z,label:'Metro roof · Ride to next station'});
        if(this.last&&this.phase==='riding')this.travelled+=Math.hypot(selected.x-this.last.x,selected.z-this.last.z);
        this.last={x:selected.x,z:selected.z};
      }
      if(this.phase==='boarding')this.status.instruction=selected?'Land on the marked departing metro and ride to its next station':'Waiting for a departing metro service';
      if(this.phase==='riding'){
        const stop=dwells.find(d=>d.trainId===this.boarded);
        if(!stop){this.departed=true;this.unavailableStation='';}
        // A fall before arrival requires reboarding. Riding distance alone
        // cannot unlock a delivery while the player waits on the ground.
        if(!aboard||!selected||trainId(aboard.id)!==this.boarded){
          this.phase='boarding';this.boarded='';this.referenceCoach='';this.travelled=0;this.last=null;
          this.status.instruction='Reboard a metro roof to continue';return;
        }
        if(stop&&this.departed&&this.travelled>60&&stop.stationId!==this.startStation&&stop.stationId!==this.unavailableStation&&selected)this.beginExit(stop,aboard);
        else this.status.instruction='Stay on the roof until the next station';
      }
      this.status.canDrop=false;return;
    }
    if(this.phase==='exiting'){
      this.exitTime+=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
      this.actors.forEach((actor,i)=>{
        const t=Math.max(0,Math.min(1,(this.exitTime-i*.4)/2));
        actor.animate?.(dt,t>0&&t<1?'walk':'idle',t>0&&t<1?(METRO_DELIVERY_WALK_DISTANCE-.1)/2:0);
        const lateral=(i-1.5)*.65;
        actor.group.position.set(this.door.x-this.ctx.destination.x+this.outward.x*(.1+(METRO_DELIVERY_WALK_DISTANCE-.1)*t)+this.door.hx*lateral,
          this.door.y-this.ctx.destination.y,
          this.door.z-this.ctx.destination.z+this.outward.z*(.1+(METRO_DELIVERY_WALK_DISTANCE-.1)*t)+this.door.hz*lateral);
        actor.group.rotation.y=Math.atan2(this.outward.x,this.outward.z);
      });
      this.status.instruction='Passengers are stepping onto the platform';
      if(this.exitTime>=3.4){this.phase='handoff';this.ring.visible=true;}
    }
    if(this.phase==='handoff'){
      this.actors.forEach(actor=>actor.animate?.(dt,'idle'));
      this.status.canDrop=this.unlocked()&&this.within(7,2)&&Math.abs(p.speed)<3&&!p.flying&&!p.descending&&!p.jumping;
      this.status.instruction=this.status.canDrop?'Hand over the pizza at the platform':'Park along the marked platform, then hand over';
      this.status.actionLabel='HAND OVER';this.advanceHandoff(dt);
    }
  }
  private *clearPlatformApproach(door:typeof this.door,outward:typeof this.outward,parking:DeliveryPoint,body:MovingRailBody):Generator<undefined,boolean|undefined>{
    const clear=this.ctx.storyPoseClear;if(!clear)return true;
    const final={...parking,y:parking.y+.55,yaw:Math.atan2(-door.hx,-door.hz)},endClear=clear(final);
    yield;
    if(endClear!==true)return endClear;
    let pose={...this.ctx.player()};
    // At most18s of the actual bounded StoryDirector motion, checked once for
    // each real candidate. This also covers the turn and lateral roof exit,
    // which a final supported rectangle alone cannot make obstruction-free.
    for(let frame=0;frame<=360;frame++){
      const poseClear=clear(pose);yield;if(poseClear!==true)return poseClear;
      if(Math.hypot(pose.x-final.x,pose.y-final.y,pose.z-final.z)<.01&&Math.abs(Math.atan2(Math.sin(pose.yaw-final.yaw),Math.cos(pose.yaw-final.yaw)))<.01)return true;
      const next=stepStoryPose(pose,this.platformStory(parking,pose,door,outward,body),.05);
      if(!next)return false;pose={...pose,...next};
    }
    return false;
  }
  private *clearPlatformShot(door:typeof this.door,outward:typeof this.outward,parking:DeliveryPoint):Generator<undefined,{along:number;outward:number}|null|undefined>{
    if(!this.ctx.cameraPathClear)return{along:3.3,outward:1.4};
    const car={...parking,hx:door.hx,hz:door.hz,size:[2.3,1.75,4.8]};
    // The old positive-along shot intersected Ameerpet's upper interchange
    // pier. Keep a bounded eye-level strip inside the existing platform and
    // check the whole passenger row at both ends of its real door exit.
    for(const across of [1.4,1.1,1.8])for(const along of [3.3,-3.3,4.3,-4.3]){
      const eye={x:door.x+outward.x*(METRO_DELIVERY_WALK_DISTANCE+across)+door.hx*along,
        y:door.y+1.65,z:door.z+outward.z*(METRO_DELIVERY_WALK_DISTANCE+across)+door.hz*along};
      let clear=true;
      for(const walk of [.1,METRO_DELIVERY_WALK_DISTANCE]){
        const center={x:door.x+outward.x*walk,y:door.y+1.05,z:door.z+outward.z*walk};
        const centerClear=this.ctx.cameraPathClear(center,eye);
        yield;
        if(centerClear===undefined)return undefined;
        if(!centerClear){clear=false;break;}
        // The real low track guard can hide legs while passengers are still
        // inside the doorway. Require their faces then, and the full standing
        // row once they have actually stepped onto the handoff platform.
        for(const lateral of [-.975,-.325,.325,.975])for(const height of walk<1?[1.8]:[.8,1.8]){
          const actor={x:center.x+door.hx*lateral,y:door.y+height,z:center.z+door.hz*lateral};
          const actorClear=this.ctx.cameraPathClear(actor,eye);
          yield;
          if(actorClear===undefined)return undefined;
          if(!actorClear||segmentHitsVehicle(eye,actor,car,.1)){clear=false;break;}
        }
        if(!clear)break;
      }
      if(clear)return{along,outward:across};
    }
    return null;
  }
  private *preparePlatformExit(stop:MetroStationDwell,body:MovingRailBody):Generator<undefined,PlatformExit|null|undefined>{
    for(const door of [...stop.doors].sort((a,b)=>distanceXZ(a,body)-distanceXZ(b,body))){
      const dx=door.x-body.x,dz=door.z-body.z;
      const side=Math.sign(-dx*door.hz+dz*door.hx)||stop.platformSide;
      const outward={x:-door.hz*side,z:door.hx*side};
      const parking=stop.platform?supportedMetroHandoffParking(stop.platform,door,outward):{
        x:door.x+outward.x*(METRO_PLATFORM_OFFSET-METRO_TRACK_OFFSET-METRO_DOOR_SIDE_OFFSET)-door.hx*4.8,
        y:door.y,z:door.z+outward.z*(METRO_PLATFORM_OFFSET-METRO_TRACK_OFFSET-METRO_DOOR_SIDE_OFFSET)-door.hz*4.8,hx:door.hx,hz:door.hz,
      };
      yield;
      // Try the next existing door when a bench or curved pad seam prevents a
      // full car fit here. Never manufacture a platform or an airborne bay.
      if(!parking)continue;
      const approach=yield* this.clearPlatformApproach(door,outward,parking,body);
      if(approach===undefined)return;
      if(!approach)continue;
      const shot=yield* this.clearPlatformShot(door,outward,parking);
      // A pending tile is not immutable bad geometry: retry this same actual
      // dwell after streaming, instead of blacklisting the whole station.
      if(shot===undefined)return;
      if(!shot)continue;
      return{door,outward,parking,shot};
    }
    return null;
  }
  private beginExit(stop:MetroStationDwell,body:MovingRailBody){
    if(!stop.doors.length)return;
    this.exitPreparation={stop,body:{...body,previous:{...body.previous}},origin:{...this.ctx.player()},steps:this.preparePlatformExit(stop,body)};
    this.advanceExitPreparation();
  }
  private advanceExitPreparation(){
    const prep=this.exitPreparation;if(!prep)return;
    const p=this.ctx.player(),service=this.ctx.metroService?.(),currentBody=service?.bodies.find(b=>b.id===prep.body.id);
    if(Math.hypot(p.x-prep.origin.x,p.y-prep.origin.y,p.z-prep.origin.z)>.15||
      Math.abs(Math.atan2(Math.sin(p.yaw-prep.origin.yaw),Math.cos(p.yaw-prep.origin.yaw)))>.08||
      service&&(!service.dwells.some(stop=>stop.trainId===prep.stop.trainId&&stop.stationId===prep.stop.stationId)||!currentBody||Math.hypot(currentBody.x-prep.body.x,currentBody.y-prep.body.y,currentBody.z-prep.body.z)>.05)){
      this.exitPreparation=undefined;return;
    }
    const deadline=performance.now()+1.5;
    // Each yielded operation is one real parking/volume/camera check. This
    // bounds active-frame work without resetting or repeating prior searches.
    for(let checks=0;checks<4;checks++){
      const step=prep.steps.next();
      if(!step.done){if(performance.now()>=deadline)return;continue;}
      this.exitPreparation=undefined;
      if(step.value===null)this.unavailableStation=prep.stop.stationId;
      if(!step.value)return;
      const {door,outward,parking,shot}=step.value;
      this.focusAlong=shot.along;this.focusOutward=shot.outward;
      this.outward=outward;this.door={...door};
      const fixture=prep.stop.platform?nearestActualMetroPlatformLamp(prep.stop.platform,door,outward,{x:door.x+outward.x*METRO_DELIVERY_WALK_DISTANCE,z:door.z+outward.z*METRO_DELIVERY_WALK_DISTANCE}):null;
      this.platformLamp=fixture?{position:fixture.position,kind:'metro-platform'}:undefined;
      this.phase='exiting';this.exitTime=0;this.group.visible=true;
      this.actors.forEach((actor,i)=>{const along=(i-1.5)*.65;actor.group.position.set(door.x-this.ctx.destination.x+outward.x*.1+door.hx*along,door.y-this.ctx.destination.y,door.z-this.ctx.destination.z+outward.z*.1+door.hz*along);actor.group.rotation.y=Math.atan2(outward.x,outward.z);});
      this.setTarget({...parking,label:'Metro platform · Handoff'});
      // A wide circular marker spills over this narrow pad. Show an aligned,
      // car-sized oval within the actual supported bay instead.
      this.ring.scale.set(.43,.9,1);this.ring.rotation.set(-Math.PI/2,Math.atan2(parking.hx,parking.hz),0,'YXZ');
      this.status.canDrop=false;return;
    }
  }
  onDrop(){
    if(!this.unlocked()||this.ended||this.handoffPending)return;
    if(this.phase!=='handoff'||!this.status.canDrop){this.fail('Ride the metro to the next station, then approach the platform.');return;}
    this.beginHandoff(this.actors[0]??null,()=>{this.catchReturn=.45;this.done();});
  }
  protected override done(){
    if(!this.ended&&this.unlocked())this.ring.visible=false;
    super.done();
  }
  teardown(){
    this.exitPreparation=undefined;
    this.actors=[];this.boarded='';this.referenceCoach='';this.last=null;this.travelled=0;this.catchReturn=0;this.unavailableStation='';this.platformLamp=undefined;
    super.teardown();
  }
}
