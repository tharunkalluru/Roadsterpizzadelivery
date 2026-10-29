import test from 'node:test';import assert from 'node:assert/strict';import {roadNavigationCue,flightNavigationReadout} from '../../src/ui/flight-navigation';
test('central road directions describe actual route turns, not straight-line turns through buildings',()=>{
 const right=roadNavigationCue([[0,0,0],[0,0,-200],[100,0,-200]],300);assert.equal(right.hint,'Turn right');assert.equal(right.metres,200);
 assert.equal(roadNavigationCue([[0,0,0],[0,0,-200],[-100,0,-200]],300).hint,'Turn left');
 assert.equal(roadNavigationCue(undefined,800).hint,'Follow the map marker');
 const read=flightNavigationReadout({x:0,z:0,yaw:0,flying:false,target:{x:100,z:100,kind:'customer'},road:right});assert.equal(read!.distance,'200 m');assert.equal(read!.hint,'Turn right');
});
