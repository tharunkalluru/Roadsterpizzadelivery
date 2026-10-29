import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileHudLayout, hudTransientLayout, type HudRect } from '../../src/ui/hud-layout';
import { flightNavigationLayout } from '../../src/ui/flight-navigation';

const overlaps=(a:HudRect,b:HudRect,gap=0)=>a.left<b.left+b.width+gap&&a.left+a.width+gap>b.left&&a.top<b.top+b.height+gap&&a.top+a.height+gap>b.top;
for(const touch of [true,false])test(`${touch?'touch':'desktop'} notices and rescue never occupy the fixed navigation lane`,()=>{
  for(const [width,height,left=18,rightInset=18,bottom=18]of[[568,320],[640,280],[667,375],[800,360],[844,390,59,59,21],[1280,720]]){
    const header=54,controls=mobileHudLayout(width,height,62,106,left,rightInset,bottom),narrow=touch&&width<600;
    const map=touch?controls.map:{left:width-rightInset-168,top:112,width:168,height:168};
    const railEnd=touch&&!narrow?controls.rightSteer.left+controls.rightSteer.width:left+142;
    const right=touch&&!narrow?Math.min(map.left,controls.brake.left):map.left;
    const navigation=flightNavigationLayout(width,height,header,0,{left,top:62,width:railEnd-left,height:0},{...map,left:right},touch?narrow?controls.leftSteer.top+4:controls.brake.top:height-76,narrow?44:48);
    assert.ok(navigation,`${width}×${height}`);
    const controlsAndMap=[map,...(touch?[controls.leftSteer,controls.rightSteer,controls.brake,controls.gas,controls.fly,controls.jump,controls.speed]:[])];
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
      assert.equal(navigation!.top,62);
    }
  }
});
