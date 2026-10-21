import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createHeroCar } from '../../src/art/hero';

vi.mock('../../src/art/textures', async () => {
  const { Texture } = await import('three');
  const sharedSprite = new Texture();
  return { getSoftSprite: () => sharedSprite, latinLabelTexture: () => new Texture() };
});

describe('delivery roadster presentation', () => {
  it.each(['low', 'standard', 'high'] as const)('keeps cargo, lights, steering and cold-gas flight functional at %s', (quality) => {
    const hero = createHeroCar(quality), root = hero.root;
    const cargo = root.getObjectByName('collected-pizza-box')!;
    expect(cargo.visible).toBe(false);
    hero.setCargoLoaded!(true); expect(cargo.visible).toBe(true);
    hero.setCargoLoaded!(false); expect(cargo.visible).toBe(false);
    expect(root.getObjectByName('courier')).toBeInstanceOf(THREE.Mesh);
    expect(root.getObjectByName('canopy')).toBeInstanceOf(THREE.Mesh);
    const paint = (root.getObjectByName('body') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(paint.color.r).toBeGreaterThan(.7); expect(paint.color.g).toBeGreaterThan(.7);

    const beam = root.getObjectByName('road-headlight-beam') as THREE.SpotLight;
    hero.setHeadlights!(true); expect(beam.intensity).toBeGreaterThan(0);
    hero.setHeadlights!(false); expect(beam.intensity).toBe(0);
    const brake = (root.getObjectByName('brake') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    hero.setBrakeLights(true); expect(brake.emissiveIntensity).toBeGreaterThan(2);
    hero.setBrakeLights(false); expect(brake.emissiveIntensity).toBeLessThan(1);
    const reverse = (root.getObjectByName('reverse') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    hero.setReverseLights(true); expect(reverse.emissiveIntensity).toBeGreaterThan(0);
    hero.setReverseLights(false); expect(reverse.emissiveIntensity).toBe(0);

    hero.setFlightContext!({ heightM: 1, verticalSpeed: 2, speedMps: 8, steerRad: .2, airborne: true });
    hero.setThruster(1); hero.animate(.1, 8, .2);
    expect(hero.wheels).toHaveLength(4);
    expect(hero.wheels[0].rotation.y).toBe(.2); expect(hero.wheels[1].rotation.y).toBe(.2);
    expect(hero.wheels[2].rotation.y).toBe(0); expect(hero.wheels[3].rotation.y).toBe(0);
    expect(hero.wheels[0].getObjectByName('spin')!.rotation.x).toBeLessThan(0);
    expect(root.getObjectByName('cold-gas-core')!.visible).toBe(true);
    expect(root.getObjectByName('active-rear-wing')!.position.y).toBeGreaterThan(.865);
    hero.setThruster(0); for (let i = 0; i < 120; i++) hero.animate(1 / 60, 0, 0);
    expect(root.getObjectByName('cold-gas-core')!.visible).toBe(false);
    hero.dispose();
  });

  it('keeps the shaded canopy within the low roof envelope without reflection textures', () => {
    const hero = createHeroCar('low');
    const canopy = hero.root.getObjectByName('canopy') as THREE.Mesh;
    const trim = hero.root.getObjectByName('trim') as THREE.Mesh;
    const courier = hero.root.getObjectByName('courier') as THREE.Mesh;
    canopy.geometry.computeBoundingBox(); trim.geometry.computeBoundingBox(); courier.geometry.computeBoundingBox();
    expect(canopy.geometry.boundingBox!.max.y).toBeLessThan(1.2);
    expect(trim.geometry.boundingBox!.max.y).toBeLessThan(1.21);
    expect(courier.geometry.boundingBox!.max.y + courier.position.y).toBeLessThan(canopy.geometry.boundingBox!.max.y);
    const glass=canopy.material as THREE.MeshStandardMaterial;
    expect(glass.side).toBe(THREE.FrontSide);
    expect(glass.vertexColors).toBe(true); expect(glass.transparent).toBe(true);
    expect(glass.map).toBeNull(); expect(glass.envMap).toBeNull();
    const position=canopy.geometry.getAttribute('position'),normal=canopy.geometry.getAttribute('normal'),colour=canopy.geometry.getAttribute('color');
    expect(colour.count).toBe(position.count); expect(colour.itemSize).toBe(4);
    const upperRear:number[]=[],lowerRear:number[]=[],frontAlpha:number[]=[],rearAlpha:number[]=[];
    for(let i=0;i<position.count;i++) {
      expect(colour.getW(i)).toBeGreaterThan(0); expect(colour.getW(i)).toBeLessThanOrEqual(1);
      if(normal.getZ(i)>.3) {
        rearAlpha.push(colour.getW(i));
        const value=(colour.getX(i)+colour.getY(i)+colour.getZ(i))/3;
        if(position.getY(i)>1.15) {
          upperRear.push(value);
          expect(colour.getZ(i)).toBeGreaterThan(colour.getX(i)); // sky reflected in the top of the glass
        }
        if(position.getY(i)<.88) {
          lowerRear.push(value);
          expect(colour.getX(i)).toBeGreaterThan(colour.getZ(i)); // restrained bronze lower edge
        }
      } else if(normal.getZ(i)<-.3)frontAlpha.push(colour.getW(i));
    }
    const average=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;
    expect(upperRear.length).toBeGreaterThan(0); expect(lowerRear.length).toBeGreaterThan(0);
    expect(average(upperRear)).toBeGreaterThan(average(lowerRear)*1.8);
    expect(average(frontAlpha)).toBeLessThan(average(rearAlpha)); // courier stays visible from the windscreen
    hero.dispose();
  });

  it('fires lift, accelerating rear and opposing yaw jets only in flight and reuses a fixed pool', () => {
    const hero = createHeroCar('low'), root = hero.root;
    const core = root.getObjectByName('cold-gas-core') as THREE.InstancedMesh;
    const vapor = root.getObjectByName('cold-gas-vapour') as THREE.InstancedMesh;
    const matrices = vapor.instanceMatrix.array, opacity = vapor.geometry.getAttribute('aOpacity').array;
    const effects = root.userData.coldGas as { nozzles: number; rearNozzles: number; particles: number; effectDrawCalls: number; jetGains: Float32Array };
    expect(effects).toMatchObject({ nozzles: 12, rearNozzles: 4, particles: 28, effectDrawCalls: 2 });
    expect(core.count).toBe(12); expect(vapor.count).toBe(28);
    const context = { heightM: 0, verticalSpeed: 0, speedMps: 0, steerRad: .2, airborne: false };
    hero.setFlightContext!(context); hero.setThruster(.9); hero.animate(.1, 0, .2);
    expect(core.visible).toBe(false); expect(vapor.visible).toBe(false);
    expect(effects.jetGains.every(gain => gain === 0)).toBe(true);

    context.heightM = 2; context.airborne = true; context.verticalSpeed = 2;
    hero.setFlightContext!(context); hero.animate(.1, 0, .2);
    expect(effects.jetGains.slice(0, 4).every(gain => gain === 0)).toBe(true); // no forward acceleration
    expect(effects.jetGains.slice(4, 8).every(gain => gain > 0)).toBe(true);
    expect(effects.jetGains[8]).toBeGreaterThan(0); expect(effects.jetGains[11]).toBeGreaterThan(0);
    expect(effects.jetGains[9]).toBe(0); expect(effects.jetGains[10]).toBe(0);
    hero.animate(.1, 1, .2);
    expect(effects.jetGains.slice(0, 4).every(gain => gain > 0)).toBe(true);
    for (let i = 0; i < 100; i++) hero.animate(1 / 60, 1, .2);
    expect(vapor.instanceMatrix.array).toBe(matrices);
    expect(vapor.geometry.getAttribute('aOpacity').array).toBe(opacity);
    expect(vapor.count).toBe(28);
    expect((core.material as THREE.Material).blending).toBe(THREE.NormalBlending);
    expect((core.material as THREE.Material).forceSinglePass).toBe(true);
    expect((vapor.material as THREE.Material).blending).toBe(THREE.NormalBlending);

    // Explicit grounded state wins even over an elevated surface or stale thruster intensity.
    context.airborne = false; hero.setFlightContext!(context); hero.animate(1 / 60, 1, .2);
    expect(core.visible).toBe(false); expect(vapor.visible).toBe(false);
    expect(effects.jetGains.every(gain => gain === 0)).toBe(true);
    hero.dispose();
  });

  it('bounds mobile geometry, shares wheels and disposes every owned resource once', () => {
    for (const quality of ['low', 'standard', 'high'] as const) {
      const hero = createHeroCar(quality), geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), instances = new Set<THREE.InstancedMesh>();
      let triangles = 0, meshCount = 0;
      hero.root.traverse(object => {
        if (object instanceof THREE.Mesh) {
          meshCount++;
          geometries.add(object.geometry);
          triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3 * (object instanceof THREE.InstancedMesh ? object.count : 1);
          if (object instanceof THREE.InstancedMesh) instances.add(object);
          for (const value of object.geometry.getAttribute('position').array) expect(Number.isFinite(value)).toBe(true);
        }
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      expect(triangles).toBeLessThan(quality === 'low' ? 4000 : quality === 'standard' ? 5000 : 12000);
      expect(meshCount).toBe(20); expect(materials.size).toBe(12); // contour/reflection polish adds no draws or materials
      const tyres = hero.wheels.map(wheel => wheel.getObjectByName('tyre') as THREE.Mesh);
      const rims = hero.wheels.map(wheel => wheel.getObjectByName('rim') as THREE.Mesh);
      expect(new Set(tyres.map(wheel => wheel.geometry)).size).toBe(1);
      expect(new Set(rims.map(wheel => wheel.geometry)).size).toBe(1);
      expect(tyres[0].scale.x).toBeLessThan(tyres[2].scale.x);
      if (quality !== 'high') expect([...materials].some(material => material instanceof THREE.MeshPhysicalMaterial)).toBe(false);
      const disposed = new Map<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh, number>();
      for (const resource of geometries) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
      for (const resource of materials) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
      for (const resource of instances) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
      hero.dispose();
      for (const resource of [...geometries, ...materials, ...instances]) expect(disposed.get(resource)).toBe(1);
    }
  });
});
