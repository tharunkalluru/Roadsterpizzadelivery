export interface LosslessAsset {
  path: string; storagePath: string; contentType: string;
  identityBytes: number; gzipBytes: number; sha256: string; gzipSha256: string;
}
export const LOSSLESS_ASSET_PREFIX = '/_lossless-assets/';

function representation(header: string | null): 'gzip' | 'identity' | null {
  if (!header?.trim()) return 'identity';
  const weights = new Map<string, number>();
  for (const part of header.split(',')) {
    const [rawCoding, ...params] = part.trim().toLowerCase().split(';');
    const coding = rawCoding.trim();
    if (!coding) continue;
    const quality = params.find(p => p.trim().startsWith('q='));
    const raw = quality === undefined ? '1' : quality.trim().slice(2).trim();
    const q = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw) ? Number(raw) : 0;
    weights.set(coding, Math.min(weights.get(coding) ?? 1, q));
  }
  const gzip = weights.get('gzip') ?? weights.get('*') ?? 0;
  const identity = weights.get('identity') ?? (weights.get('*') === 0 ? 0 : 1);
  if (gzip > 0 && gzip >= identity) return 'gzip';
  return identity > 0 ? 'identity' : gzip > 0 ? 'gzip' : null;
}
function errorResponse(request: Request, status: number, message: string) {
  const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', vary: 'Accept-Encoding' });
  if (status === 405) headers.set('allow', 'GET, HEAD');
  return new Response(request.method === 'HEAD' ? null : message, { status, headers, encodeBody: 'manual' });
}
const etagMatches = (header: string | null, etag: string) => header?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag) ?? false;

/** Exact build-generated whitelist only. Large bodies are passed through or
 * native-stream decoded; no model/city payload is buffered in Worker memory. */
export async function losslessAssetResponse(request: Request, assets: Pick<Fetcher, 'fetch'>, manifest: ReadonlyMap<string, LosslessAsset>): Promise<Response | null> {
  const url = new URL(request.url), entry = manifest.get(url.pathname);
  if (!entry) return url.pathname.startsWith(LOSSLESS_ASSET_PREFIX) ? errorResponse(request, 404, 'Not found') : null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return errorResponse(request, 405, 'Method not allowed');
  // Cloudflare normalizes the incoming header to br,gzip. Negotiate against
  // its retained original value so identity and q=0 clients remain valid.
  const clientEncoding = request.cf?.clientAcceptEncoding;
  const encoding = representation(typeof clientEncoding === 'string' || clientEncoding === null ? clientEncoding : request.headers.get('accept-encoding'));
  if (!encoding) return errorResponse(request, 406, 'No acceptable asset encoding');
  const etag = encoding === 'gzip' ? `"sha256-${entry.gzipSha256}-gzip"` : `"sha256-${entry.sha256}-identity"`;
  const unchanged = etagMatches(request.headers.get('if-none-match'), etag);
  const storageURL = new URL(request.url); storageURL.pathname = entry.storagePath; storageURL.search = '';
  const requestHeaders = new Headers(request.headers);
  for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) requestHeaders.delete(name);
  requestHeaders.set('accept-encoding', 'identity');
  let stored: Response;
  try { stored = await assets.fetch(new Request(storageURL, { method: request.method === 'HEAD' || unchanged ? 'HEAD' : 'GET', headers: requestHeaders })); }
  catch { return errorResponse(request, 503, 'Asset temporarily unavailable'); }
  const length = stored.headers.get('content-length'), sourceEncoding = stored.headers.get('content-encoding');
  if (stored.status !== 200 || stored.headers.get('content-type')?.toLowerCase().includes('text/html') ||
    sourceEncoding && sourceEncoding.toLowerCase() !== 'identity' || length !== null && Number(length) !== entry.gzipBytes ||
    request.method !== 'HEAD' && !unchanged && !stored.body) {
    await stored.body?.cancel().catch(() => {});
    return errorResponse(request, 503, 'Asset temporarily unavailable');
  }
  const headers = new Headers(stored.headers);
  for (const name of ['content-length', 'content-range', 'last-modified', 'content-encoding']) headers.delete(name);
  const cachePolicy = stored.headers.get('cache-control') ?? '';
  headers.set('content-type', entry.contentType);
  headers.set('cache-control', /\bno-store\b/i.test(cachePolicy) ? 'no-store' : `${/\bprivate\b/i.test(cachePolicy) ? 'private' : 'public'}, max-age=0, must-revalidate`);
  const vary = headers.get('vary'); headers.set('vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
  headers.set('etag', etag); headers.set('accept-ranges', 'none'); headers.set('x-content-type-options', 'nosniff');
  if (encoding === 'gzip') headers.set('content-encoding', 'gzip');
  if (unchanged) return new Response(null, { status: 304, headers, encodeBody: 'manual' });
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers, encodeBody: 'manual' });
  // Byte ranges are deliberately ignored: return a complete representation,
  // never an encoded partial slice labelled as decoded GLB/JSON coordinates.
  const body = encoding === 'gzip' ? stored.body : stored.body!.pipeThrough(new DecompressionStream('gzip'));
  return new Response(body, { status: 200, headers, encodeBody: 'manual' });
}
