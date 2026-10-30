import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileHudLayout, minimapSpeedBadgeLayout, hudTransientLayout, type HudRect } from '../../src/ui/hud-layout';
import { flightNavigationLayout } from '../../src/ui/flight-navigation';

const overlaps=(a:HudRect,b:HudRect,gap=0)=>a.left<b.left+b.width+gap&&a.left+a.width+gap>b.left&&a.top<b.top+b.height+gap&&a.top+a.height+gap>b.top;
for(const touch of [true,false])test(`${touch?'touch':'desktop'} notices and rescue never occupy the fixed navigation lane`,()=>{
  for(const [width,height,left=18,rightInset=18,bottom=18]of[[568,320],[600,320],[610,320],[618,320],[619,320],[640,280],[667,375],[800,360],[844,390,59,59,21],[1280,720]]){
    const header=54,controls=mobileHudLayout(width,height,62,106,left,rightInset,bottom);
    const map=touch?controls.map:{left:width-rightInset-168,top:112,width:168,height:168};
    const toolbar={left:width-rightInset-148,top:10,width:148,height:44};
    const navigation=flightNavigationLayout(width,height,header,0,{left,top:10,width:0,height:0},{...map,left:toolbar.left},touch?controls.leftSteer.top:height-76,height<=520?44:48);
    assert.ok(navigation,`${width}×${height}`);
    const controlsAndMap=[map,minimapSpeedBadgeLayout(map),...(touch?[controls.leftSteer,controls.rightSteer,controls.brake,controls.gas,controls.fly,controls.jump]:[]),...(controls.call?[controls.call]:[])];
    const badgeHeight=height<=520?28:36;
    const layout=hudTransientLayout(width,height,header,badgeHeight,navigation,controlsAndMap,left,rightInset,bottom);
    assert.ok(layout.area,`area fits ${width}×${height}`);assert.ok(layout.notice,`notice fits ${width}×${height}`);assert.ok(layout.rescue,`rescue fits ${width}×${height}`);
    assert.equal(layout.area!.height,badgeHeight);assert.ok(layout.area!.width<=180,'area is compact');
    const rectangles=[layout.area!,layout.notice!,layout.rescue!];
    for(const rectangle of rectangles){
      assert.equal(overlaps(rectangle,navigation!,7.9),false,`navigation clear of ${JSON.stringify(rectangle)} at${width}×${height}`);
      assert.ok(rectangle.left>=left&&rectangle.top>=header+8&&rectangle.left+rectangle.width<=width-rightInset&&rectangle.top+rectangle.height<=height-bottom);
      for(const obstacle of controlsAndMap)assert.equal(overlaps(rectangle,obstacle,7.9),false,`overlay does not cover map/controls at${width}×${height}`);
    }
    for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++)assert.equal(overlaps(rectangles[i],rectangles[j],7.9),false,'reserved overlays stay separate');
    // Showing, refreshing and expiring a message only changes visibility.
    for(const _state of ['hidden','area','toast','failure','rescue','all','expired']){
      assert.deepEqual(hudTransientLayout(width,height,header,badgeHeight,navigation,controlsAndMap,left,rightInset,bottom),layout);
      assert.equal(navigation!.top,10);
    }
  }
});

test('every supported touch width keeps a visible fixed navigation lane across short screens and notches',()=>{
  for(const height of[280,320,375])for(let width=568;width<=1280;width++){
    const profiles=[[18,18,18],[59,59,21]];
    for(const[left,rightInset,bottom]of profiles){
      const controls=mobileHudLayout(width,height,62,106,left,rightInset,bottom),map=controls.map;
      const toolbar={left:width-rightInset-148,top:10,width:148,height:44};
      const tasks={left,top:10,width:0,height:0};
      const navigation=flightNavigationLayout(width,height,54,0,tasks,{...map,left:toolbar.left},controls.leftSteer.top,44);
      const label=`${width}×${height} insets ${left}/${rightInset}/${bottom}`;
      assert.ok(navigation,`navigation remains visible at ${label}`);
      assert.equal(navigation!.top,10,`fixed header-relative top at ${label}`);
      assert.ok(navigation!.left>=left&&navigation!.left+navigation!.width<=width-rightInset,`safe horizontal bounds at ${label}`);
      for(const[name,obstacle]of Object.entries({map,leftSteer:controls.leftSteer,rightSteer:controls.rightSteer,brake:controls.brake,gas:controls.gas,fly:controls.fly,jump:controls.jump,speed:controls.speed})){
        assert.equal(overlaps(navigation!,obstacle),false,`navigation clears ${name} at ${label}`);
      }
      // Area appearance/expiry may not change navigation's physical slot.
      assert.deepEqual(flightNavigationLayout(width,height,54,120,tasks,{...map,left:toolbar.left},controls.leftSteer.top,44),navigation,`area visibility cannot move navigation at ${label}`);
    }
  }
});
