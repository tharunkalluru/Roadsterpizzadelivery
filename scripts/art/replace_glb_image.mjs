#!/usr/bin/env node
/** Replace one explicitly named material's embedded PNG after native UV work.
 * Re-packs that image at its original slot, avoiding an unused duplicate atlas
 * download. Every geometry/animation/other-image bufferView is byte-verified.
 * All outputs are new and unreviewed; no release manifest is modified.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const args = new Map(); for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
for (const key of ['--input', '--rig', '--material', '--image', '--uv-proof', '--output']) if (!args.get(key)) throw new Error(`Missing ${key}.`);
const source = resolve(args.get('--input')), output = resolve(args.get('--output'));
if (!output.endsWith('.glb') || source === output) throw new Error('Use a new GLB output.');
const sibling = suffix => output.slice(0, -4) + suffix;
for (const path of [output, sibling('.rig.json'), sibling('.production.json')]) { try { await access(path); throw new Error(`Refusing to overwrite ${path}.`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
const bytes = await readFile(source), png = await readFile(args.get('--image'));
if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Expected the native UV-authoring PNG.');
const uv = JSON.parse(await readFile(args.get('--uv-proof'), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
if (uv.outputImageSha256 !== sha(png) || uv.sourceGuidePixelsEdited !== false || uv.geometryOrAnimationEdited !== false) throw new Error('UV evidence does not describe this exact local image authoring.');
const jsonSize = bytes.readUInt32LE(12), model = JSON.parse(bytes.subarray(20, 20 + jsonSize)), original = structuredClone(model);
const matches = model.materials.map((material, index) => ({ material, index })).filter(entry => entry.material.name === args.get('--material'));
if (matches.length !== 1) throw new Error('An exact unique authored material is required.');
const texture = matches[0].material.pbrMetallicRoughness?.baseColorTexture?.index;
const imageIndex = model.textures?.[texture]?.source, image = model.images?.[imageIndex];
if (!image || image.mimeType !== 'image/png' || image.bufferView === undefined) throw new Error('Material does not use a single embedded PNG.');
const viewIndex = image.bufferView, view = model.bufferViews[viewIndex], offset = view.byteOffset ?? 0, oldSpan = Math.ceil(view.byteLength / 4) * 4;
if (view.buffer !== 0 || model.buffers.length !== 1 || model.buffers[0].uri) throw new Error('Expected one self-contained GLB buffer.');
for (let index = 0; index < model.bufferViews.length; index++) {
  if (index === viewIndex) continue;
  const other = model.bufferViews[index], start = other.byteOffset ?? 0, end = start + other.byteLength;
  if (start < offset + oldSpan && end > offset) throw new Error('Embedded image shares a buffer region with other authored data.');
}
const originalBinary = bytes.subarray(28 + jsonSize), pngPad = Buffer.alloc((4 - png.length % 4) % 4);
const binary = Buffer.concat([originalBinary.subarray(0, offset), png, pngPad, originalBinary.subarray(offset + oldSpan)]);
const delta = png.length + pngPad.length - oldSpan;
for (let index = 0; index < model.bufferViews.length; index++) {
  const item = model.bufferViews[index];
  if (index === viewIndex) item.byteLength = png.length;
  else if ((item.byteOffset ?? 0) >= offset + oldSpan) item.byteOffset += delta;
}
model.buffers[0].byteLength += delta;
for (let index = 0; index < model.bufferViews.length; index++) {
  if (index === viewIndex) continue;
  const before = original.bufferViews[index], after = model.bufferViews[index];
  if (!originalBinary.subarray(before.byteOffset ?? 0, (before.byteOffset ?? 0) + before.byteLength).equals(binary.subarray(after.byteOffset ?? 0, (after.byteOffset ?? 0) + after.byteLength))) throw new Error(`Unrelated authored bufferView ${index} changed.`);
}
for (const key of ['nodes','meshes','materials','textures','images','samplers','animations','accessors','skins','scenes']) if (JSON.stringify(model[key]) !== JSON.stringify(original[key])) throw new Error(`Unexpected authored ${key} change.`);
const encoded = Buffer.from(JSON.stringify(model)), pad = Buffer.alloc((4 - encoded.length % 4) % 4, 32), result = Buffer.alloc(28 + encoded.length + pad.length + binary.length);
result.writeUInt32LE(0x46546c67,0); result.writeUInt32LE(2,4); result.writeUInt32LE(result.length,8);
result.writeUInt32LE(encoded.length + pad.length,12); result.writeUInt32LE(0x4e4f534a,16); encoded.copy(result,20); pad.copy(result,20 + encoded.length);
const binHeader = 20 + encoded.length + pad.length; result.writeUInt32LE(binary.length, binHeader); result.writeUInt32LE(0x004e4942, binHeader + 4); binary.copy(result, binHeader + 8);
const contract = JSON.parse(await readFile(args.get('--rig'), 'utf8'));
const suffix = args.get('--id-suffix') ?? 'native-uv-correction-v1';
if (!/^[a-z0-9-]+$/.test(suffix)) throw new Error('Use an explicit simple native-UV contract suffix.');
contract.id += '-' + suffix;
await writeFile(output, result); await writeFile(sibling('.rig.json'), JSON.stringify(contract,null,2));
await writeFile(sibling('.production.json'), JSON.stringify({ status:'UNREVIEWED local costume correction; exact exported angles and actual gameplay still require independent review', source,
  sourceGlbSha256:sha(bytes), outputGlbSha256:sha(result), material:matches[0].material.name, imageIndex, replacedPngSha256:sha(png),
  uvProofSha256:sha(await readFile(args.get('--uv-proof'))), uvEvidence:uv, sourceBytes:bytes.length, outputBytes:result.length, unusedOldAtlasRetained:false,
  exactPreserved:['all geometry buffers','all animation buffers/clips','all nodes and catch parent','all skins','all material assignments','all other images','JapaneseBook'], verifiedUnrelatedBufferViews:model.bufferViews.length - 1,
  scriptSha256:sha(await readFile(new URL(import.meta.url))) },null,2));
console.log(JSON.stringify({ output, sha256:sha(result), sourceBytes:bytes.length, outputBytes:result.length }));
