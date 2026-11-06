import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryPizzaBoxGeometry, DELIVERY_PIZZA_BOX } from '../../src/delivery/modules/pizza-box';

test('the physical carton has a real palm-contact underside, readable opaque lid palette and one merged draw surface',()=>{
 const geometry=deliveryPizzaBoxGeometry();geometry.computeBoundingBox();const box=geometry.boundingBox!;
 assert.ok(Math.abs(box.min.y+DELIVERY_PIZZA_BOX.palmToCentre)<1e-8);
 assert.ok(Math.abs(box.max.x-box.min.x-.4)<1e-7&&Math.abs(box.max.z-box.min.z-.4)<1e-7);
 assert.ok(box.max.y<.037&&box.max.y>.035,'the lid seal is sub-millimetre relief above a7cm carton');
 assert.equal(geometry.groups.length,0);assert.equal(geometry.getAttribute('color').itemSize,3,'one opaque vertex-colour surface, not transparent layers');
 assert.equal(geometry.getAttribute('uv'),undefined,'no canvas or downloaded textures are needed');
 assert.ok(geometry.getAttribute('position').count<2000,'small physical prop stays bounded');
 const colors=geometry.getAttribute('color'),palette=new Set<string>();for(let i=0;i<colors.count;i++)palette.add([colors.getX(i),colors.getY(i),colors.getZ(i)].map(v=>v.toFixed(2)).join(','));
 assert.ok(palette.size>6,'carton, lid, seam and pizza seal remain visually distinct');geometry.dispose();
});
