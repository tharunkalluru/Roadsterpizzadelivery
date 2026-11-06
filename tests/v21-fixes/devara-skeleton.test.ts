import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { devaraSkeletonGeometry } from '../../src/delivery/modules/devara-skeleton';

test('anatomical skeleton retains a complete, finite indexed human surface and usable neck contact', () => {
  const geometry = devaraSkeletonGeometry();
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  assert.equal(position.count, 19930); assert.equal(geometry.index!.count, 38994 * 3);
  assert.equal(normal.normalized, true);
  const box = geometry.boundingBox!;
  assert.ok(box.max.y > 1.70 && box.max.y < 1.80 && Math.abs(box.min.y) < .01);
  let neck = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    assert.ok(Number.isFinite(x + y + z));
    const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    assert.ok(length > .98 && length < 1.02);
    if (Math.abs(y - 1.52) < .035 && Math.hypot(x, z) < .1) neck++;
  }
  assert.ok(neck > 10, 'hands meet actual cervical bones instead of an empty proxy');
  for (const index of geometry.index!.array) assert.ok(index < position.count);
  geometry.dispose();
});

test('the modified anatomical model is reusable with the exact source and licence retained', () => {
  const base = 'public/delivery/scenes/devara-skeleton/';
  const glb = readFileSync(base + 'skeleton-v2.glb');
  const geometry = devaraSkeletonGeometry();
  assert.equal(createHash('sha256').update(glb).digest('hex'), geometry.userData.sourceGlbSha256);
  assert.equal(geometry.userData.license, 'CC-BY-SA-4.0');
  const credits = readFileSync('public/credits.html', 'utf8');
  assert.ok(credits.includes(base.slice(6) + 'skeleton-v2.glb'));
  assert.ok(credits.includes('Écorché by Charleeh'));
  assert.ok(readFileSync(base + 'LICENSE-CC-BY-SA-4.0.txt', 'utf8').includes('Attribution-ShareAlike 4.0 International'));
  geometry.dispose();
});
