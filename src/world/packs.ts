// Packs are gzip JSON served as *.pack.wasm (the test host serves only standard web types; .wasm is passed through byte for byte).
export async function fetchPack<T = any>(url: string): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error('The city download timed out. Check your connection and try again.')); }, 15000);
  });
  const download = async () => {
    let res: Response, buf: ArrayBuffer;
    try {
      res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = await res.arrayBuffer();
    } catch {
      throw new Error('Could not download city data. Check your connection and try again.');
    }
    try {
      const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
      let text: string;
      if (head[0] === 0x1f && head[1] === 0x8b) text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      else text = new TextDecoder().decode(buf);            // already decoded by the server
      return JSON.parse(text) as T;
    } catch {
      throw new Error('City data could not be decoded. Please try again.');
    }
  };
  try { return await Promise.race([download(), timedOut]); }
  finally { if (timeout !== undefined) clearTimeout(timeout); }
}
