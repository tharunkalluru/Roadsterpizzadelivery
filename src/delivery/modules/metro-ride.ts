import * as THREE from 'three';
import { ModuleBase, distanceXZ } from './base';
import type { SceneCharacter } from './character';
import type { MovingRailBody } from '../../game/moving-rail';
import type { MetroStationDwell } from '../../game/metro';
import { METRO_PLATFORM_OFFSET, METRO_TRACK_OFFSET, METRO_DOOR_SIDE_OFFSET } from '../../world/metro-geometry';
import { supportedMetroHandoffParking,METRO_DELIVERY_WALK_DISTANCE } from '../metro-platform';
import { nearestActualMetroPlatformLamp } from '../../world/metro-platform-lamps';

const trainId = (id:string) => id.slice(0,id.lastIndexOf(':'));
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
    this.focusPosition.set(x+this.outward.x*1.4-this.door.hx*.15,this.door.y+2.25,z+this.outward.z*1.4-this.door.hz*.15);
    if(exiting){
      let ax=0,az=0;for(const actor of this.actors){ax+=actor.group.position.x;az+=actor.group.position.z;}
      this.focusTarget.set(this.ctx.destination.x+ax/4,this.door.y+1.05,this.ctx.destination.z+az/4);
    }else this.focusTarget.set(x,this.door.y+1.05,z);
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
    this.group=new THREE.Group();this.group.name='vakeel-platform-group';this.root.add(this.group);
    this.actors=['vakeelSaab','vakeelWoman1','vakeelWoman2','vakeelWoman3'].map((style,i)=>this.character(style,i*.7,0,0,false,this.group));
    this.group.visible=false;this.ring.visible=false;
    this.status={instruction:'Land on a metro roof and ride to its next station',actionLabel:'DELIVER',canDrop:false};
    this.movement={mode:'normal'};
  }
  private aboard(body:MovingRailBody){
    const p=this.ctx.player(),dx=p.x-body.x,dz=p.z-body.z;
    return !p.flying&&!p.descending&&!p.jumping&&Math.abs(p.y-body.roof-.55)<.8&&
      Math.abs(dx*body.hx+dz*body.hz)<=body.halfLength+.5&&Math.abs(dx*body.hz-dz*body.hx)<=body.halfWidth+.4;
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
  private beginExit(stop:MetroStationDwell,body:MovingRailBody){
    if(!stop.doors.length)return;
    for(const door of [...stop.doors].sort((a,b)=>distanceXZ(a,body)-distanceXZ(b,body))){
      const dx=door.x-body.x,dz=door.z-body.z;
      const side=Math.sign(-dx*door.hz+dz*door.hx)||stop.platformSide;
      const outward={x:-door.hz*side,z:door.hx*side};
      const parking=stop.platform?supportedMetroHandoffParking(stop.platform,door,outward):{
        x:door.x+outward.x*(METRO_PLATFORM_OFFSET-METRO_TRACK_OFFSET-METRO_DOOR_SIDE_OFFSET)-door.hx*4.8,
        y:door.y,z:door.z+outward.z*(METRO_PLATFORM_OFFSET-METRO_TRACK_OFFSET-METRO_DOOR_SIDE_OFFSET)-door.hz*4.8,hx:door.hx,hz:door.hz,
      };
      // Try the next existing door when a bench or curved pad seam prevents a
      // full car fit here. Never manufacture a platform or an airborne bay.
      if(!parking)continue;
      this.outward=outward;this.door={...door};
      const fixture=stop.platform?nearestActualMetroPlatformLamp(stop.platform,door,outward,{x:door.x+outward.x*METRO_DELIVERY_WALK_DISTANCE,z:door.z+outward.z*METRO_DELIVERY_WALK_DISTANCE}):null;
      this.platformLamp=fixture?{position:fixture.position,kind:'metro-platform'}:undefined;
      this.phase='exiting';this.exitTime=0;this.group.visible=true;
      this.actors.forEach((actor,i)=>{const along=(i-1.5)*.65;actor.group.position.set(door.x-this.ctx.destination.x+outward.x*.1+door.hx*along,door.y-this.ctx.destination.y,door.z-this.ctx.destination.z+outward.z*.1+door.hz*along);actor.group.rotation.y=Math.atan2(outward.x,outward.z);});
      this.setTarget({...parking,label:'Metro platform · Handoff'});
      // A wide circular marker spills over this narrow pad. Show an aligned,
      // car-sized oval within the actual supported bay instead.
      this.ring.scale.set(.43,.9,1);this.ring.rotation.set(-Math.PI/2,Math.atan2(parking.hx,parking.hz),0,'YXZ');
      this.status.canDrop=false;return;
    }
    // The immutable geometry cannot become a better fit during this dwell.
    // Retry at the next actual station, not with nine polygon tests per frame.
    this.unavailableStation=stop.stationId;
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
    this.actors=[];this.boarded='';this.referenceCoach='';this.last=null;this.travelled=0;this.catchReturn=0;this.unavailableStation='';this.platformLamp=undefined;
    super.teardown();
  }
}
