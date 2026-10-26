import assert from 'node:assert/strict';
import{Euler,Vector3}from'../game/node_modules/three/build/three.module.js';
import{rendererBox,prismIntersectsBox}from'./audit-obb-utils.mjs';
for(const opts of [{rx:0,ry:0},{rx:.2,ry:1.3},{rx:-.6,ry:2.6,rz:.15}]){
  const box=rendererBox(8,15,-30,4,2,40,opts);let i=0;
  for(const a of [-1,1])for(const b of [-1,1])for(const c of [-1,1]){const p=new Vector3(a*2,b,c*20).applyEuler(new Euler(opts.rx||0,opts.ry||0,opts.rz||0,'YXZ')).add(new Vector3(8,15,-30));assert.ok(p.distanceTo(new Vector3(...box.vertices[i++]))<1e-10);}
}
const pitch=rendererBox(0,15,0,4,1,20,{rx:-Math.atan(.5)});
assert.ok(pitch.bottom<12,'broad bounds overlap the lower building height');
assert.equal(prismIntersectsBox([[-1,7],[1,7],[0,9]],0,12,pitch),false,'a low building under the high end has no actual solid intersection');
assert.equal(prismIntersectsBox([[-1,-9],[1,-9],[0,-7]],0,12,pitch),true,'a building enters the low pitched end');
assert.equal(prismIntersectsBox([[10,-9],[12,-9],[11,-7]],0,30,pitch),false,'lateral separation is preserved');
const flat=rendererBox(0,10,0,4,2,20);assert.equal(prismIntersectsBox([[-1,-1],[1,-1],[0,1]],0,9,flat),false,'shared surface is not a volume overlap');
assert.equal(prismIntersectsBox([[-1,-1],[1,-1],[0,1]],0,10,flat),true);
console.log('PASS renderer EulerYXZ vertices and oriented-box/prism SAT, pitched high/low ends, lateral separation and shared-boundary cases');
