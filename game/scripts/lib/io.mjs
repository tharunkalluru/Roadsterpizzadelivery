import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha256Buf = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sha256File = (file) => sha256Buf(fs.readFileSync(file));

/** write file (creating dirs); returns {sha256, bytes} */
export function writeOut(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = Buffer.from(text, 'utf8');
  fs.writeFileSync(file, buf);
  return { sha256: sha256Buf(buf), bytes: buf.length };
}

export const compact = (o) => JSON.stringify(o);
export const pretty = (o) => JSON.stringify(o, null, 2) + '\n';

export function slugify(s) {
  const base = String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base;
}

export const shortHash = (s, n = 6) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, n);
