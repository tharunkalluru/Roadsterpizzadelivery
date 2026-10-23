// Packs are gzip JSON served as *.pack.wasm (the test host serves only standard web types; .wasm is passed through byte for byte).
export async function fetchPack<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  let text: string;
  if (head[0] === 0x1f && head[1] === 0x8b) text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  else text = new TextDecoder().decode(buf);            // already decoded by the server
  return JSON.parse(text);
}
