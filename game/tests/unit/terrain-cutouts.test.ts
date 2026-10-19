import {describe,it,expect}from'vitest';
import * as THREE from'three';
import {makeFixtureCore}from'./fixture';
import {getAccessPits,setAccessPitsForChunk,removeAccessPitsForChunk,accessPitSurfaceAt,type AccessPit}from'../../src/world/accessPits';
import {MAX_TERRAIN_CUTOUTS,TerrainCutoutController,markTerrainMaterial,terrainCutoutContains}from'../../src/art/terrainCutouts';
import {RoadIndex}from'../../src/world/roadIndex';

const pit=(id='pit',x=-12,z=-300,yaw=.6):AccessPit=>{
  const p:AccessPit={id,centre:[x,z],yaw,widthM:1.6,depthM:2.2,poly:[],rimM:.16,floorM:-.5,ceilingM:1.2,stepCount:6,landingDepthM:.2,stairRunM:2,dimensionStatus:'provisional',verticalDropBasis:'authored_estimate_not_measured'};
  p.poly=[[-.8,-1.1],[.8,-1.1],[.8,1.1],[-.8,1.1]].map(([u,v])=>[x+Math.cos(yaw)*u+Math.sin(yaw)*v,z-Math.sin(yaw)*u+Math.cos(yaw)*v]);return p;
};
const world=(p:AccessPit,u:number,v:number)=>new THREE.Vector3(p.centre[0]+Math.cos(p.yaw)*u+Math.sin(p.yaw)*v,0,p.centre[1]-Math.sin(p.yaw)*u+Math.cos(p.yaw)*v);
type Shader=Parameters<THREE.Material['onBeforeCompile']>[0];
const compile=(material:THREE.Material,kind:'standard'|'basic'|'depth'|'distance'='standard')=>{
  const template=THREE.ShaderLib[kind],shader={vertexShader:template.vertexShader,fragmentShader:template.fragmentShader,uniforms:{}}as Shader;
  material.onBeforeCompile(shader,{}as THREE.WebGLRenderer);return shader;
};

describe('basement terrain excavation',()=>{
  it('discards the exact rotated physical pit at ground/footpath elevations, preserving its floor and surroundings',()=>{
    const core=makeFixtureCore(),p=pit();setAccessPitsForChunk(core,'cell',[p]);const roads=new RoadIndex(core);
    for(const u of [-1,-.6,0,.6,1])for(const v of [-1.3,-.8,0,.8,1.3]){
      const q=world(p,u,v),surface=accessPitSurfaceAt(core,q.x,q.z),inside=Math.abs(u)<.8&&Math.abs(v)<1.1;
      expect(terrainCutoutContains(p,q.x,0,q.z)).toBe(inside);expect(!!surface).toBe(inside);
      if(surface){expect(roads.groundHeight(q.x,q.z,null,0,1)).toBeCloseTo(surface.height);for(const y of [-.14,-.105,-.075,0,.16])expect(terrainCutoutContains(p,q.x,y,q.z)).toBe(true);}
      expect(terrainCutoutContains(p,q.x,p.floorM,q.z)).toBe(false);expect(terrainCutoutContains(p,q.x,2,q.z)).toBe(false);
    }
    const unchanged=roads.groundHeight(0,-300,'A1',0,1);expect(unchanged).toBe(0);removeAccessPitsForChunk(core,'cell');expect(roads.groundHeight(p.centre[0],p.centre[1],null,0,1)).toBe(0);
  });
  it('binds streamed terrain and shadow passes without changing cached materials or basement treads',()=>{
    const core=makeFixtureCore(),p=pit();setAccessPitsForChunk(core,'cell',[p]);
    const scene=new THREE.Scene(),previous=scene.onBeforeRender,base=markTerrainMaterial(new THREE.MeshStandardMaterial()),treadMaterial=new THREE.MeshStandardMaterial(),geometry=new THREE.PlaneGeometry(20,20);
    const terrain=new THREE.Mesh(geometry,base),treads=new THREE.Mesh(geometry,treadMaterial);terrain.castShadow=true;scene.add(terrain,treads);
    const originalCompile=base.onBeforeCompile,controller=new TerrainCutoutController(scene,core);controller.update(new THREE.Vector3(...[p.centre[0],0,p.centre[1]]));controller.bind(scene);
    expect(terrain.material).not.toBe(base);expect(treads.material).toBe(treadMaterial);expect(base.onBeforeCompile).toBe(originalCompile);
    for(const [material,kind]of [[terrain.material,'standard'],[terrain.customDepthMaterial!,'depth'],[terrain.customDistanceMaterial!,'distance']]as const){
      const shader=compile(material,kind);expect(shader.vertexShader).toContain('vAccessPitWorld=(modelMatrix*accessPitLocal).xyz');expect(shader.fragmentShader).toContain(')discard;');expect(shader.uniforms.uAccessPitCount.value).toBe(1);expect(shader.uniforms.uAccessPitPose.value[0].x).toBe(p.centre[0]);
    }
    // The ground plane follows the car. Its local hole position changes, its world-space opening does not.
    terrain.position.set(512,0,-512);terrain.updateMatrixWorld(true);const local=terrain.worldToLocal(world(p,0,0));expect(terrainCutoutContains(p,...terrain.localToWorld(local).toArray())).toBe(true);
    const streamed=new THREE.Mesh(geometry,base);scene.add(streamed);controller.bind(scene);expect(streamed.material).toBe(terrain.material);
    const lowBlob=markTerrainMaterial(new THREE.MeshBasicMaterial({transparent:true,opacity:.8})),blob=new THREE.Mesh(geometry,lowBlob);scene.add(blob);controller.bind(blob);expect(compile(blob.material,'basic').fragmentShader).toContain(')discard;');
    let traversals=0;const traverse=scene.traverse;scene.traverse=function(callback){traversals++;return traverse.call(this,callback);};
    const camera=new THREE.PerspectiveCamera();for(let i=0;i<120;i++){camera.position.set(p.centre[0]+i*.1,2,p.centre[1]);(scene.onBeforeRender as(...args:unknown[])=>void)({},scene,camera,null);}
    expect(traversals).toBe(0); // The frame/shadow hook only syncs bounded uniforms/materials, never the city scene.
    base.color.setHex(0x112233);base.roughness=.25;controller.bind(scene);expect((terrain.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x112233);expect((terrain.material as THREE.MeshStandardMaterial).roughness).toBe(.25);
    let clonedDisposed=0,baseDisposed=0;terrain.material.addEventListener('dispose',()=>clonedDisposed++);base.addEventListener('dispose',()=>baseDisposed++);
    controller.dispose();controller.dispose();expect(terrain.material).toBe(base);expect(streamed.material).toBe(base);expect(terrain.customDepthMaterial).toBeUndefined();expect(scene.onBeforeRender).toBe(previous);expect(clonedDisposed).toBe(1);expect(baseDisposed).toBe(0);
    geometry.dispose();base.dispose();treadMaterial.dispose();lowBlob.dispose();
  });
  it('updates after chunk unload/reload and isolates two views using the same base material',()=>{
    const a=makeFixtureCore(),b=makeFixtureCore(),pa=pit('a'),pb=pit('b',100,-800);setAccessPitsForChunk(a,'a',[pa]);setAccessPitsForChunk(b,'b',[pb]);
    const base=markTerrainMaterial(new THREE.MeshStandardMaterial()),geometry=new THREE.PlaneGeometry(1,1),sa=new THREE.Scene(),sb=new THREE.Scene(),ma=new THREE.Mesh(geometry,base),mb=new THREE.Mesh(geometry,base);sa.add(ma);sb.add(mb);
    const ca=new TerrainCutoutController(sa,a),cb=new TerrainCutoutController(sb,b);ca.update(new THREE.Vector3());cb.update(new THREE.Vector3());ca.bind(sa);cb.bind(sb);
    const shaderA=compile(ma.material),shaderB=compile(mb.material);expect(ma.material).not.toBe(mb.material);expect(shaderA.uniforms.uAccessPitPose).not.toBe(shaderB.uniforms.uAccessPitPose);
    removeAccessPitsForChunk(a,'a');ca.update(new THREE.Vector3());expect(shaderA.uniforms.uAccessPitCount.value).toBe(0);expect(shaderB.uniforms.uAccessPitCount.value).toBe(1);
    setAccessPitsForChunk(a,'a',[pit('new',-50,-100)]);ca.update(new THREE.Vector3());expect(shaderA.uniforms.uAccessPitPose.value[0].x).toBe(-50);expect(shaderB.uniforms.uAccessPitPose.value[0].x).toBe(100);
    ca.dispose();expect(mb.material).not.toBe(base);cb.dispose();geometry.dispose();base.dispose();
  });
  it('bounds shader uniforms to32 nearby loaded voids without changing source geometry',()=>{
    const core=makeFixtureCore(),pits=Array.from({length:40},(_,i)=>pit(`pit-${i}`,i*20,-100)),before=JSON.stringify(pits);setAccessPitsForChunk(core,'many',pits);
    const c=new TerrainCutoutController(new THREE.Scene(),core);c.update(new THREE.Vector3(780,0,-100));expect(c.uniforms.uAccessPitCount.value).toBe(MAX_TERRAIN_CUTOUTS);expect(c.uniforms.uAccessPitPose.value[0].x).toBe(780);expect(getAccessPits(core)).toHaveLength(40);expect(JSON.stringify(pits)).toBe(before);c.dispose();
  });
});
