const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const finite = (v: unknown, max = 100000) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
const clean = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '';

export function validateReport(v: unknown) {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>, c = p.context as Record<string, unknown> | undefined;
  if (!uuid.test(String(p.id)) || !uuid.test(String(p.session)) || !c || typeof c !== 'object' || Array.isArray(c)) return null;
  const location = c.location as Record<string, unknown> | undefined;
  if (!location || !finite(location.x) || !finite(location.y) || !finite(location.z) || !finite(location.latitude, 90) || !finite(location.longitude, 180)) return null;
  const context = JSON.stringify(c);
  if (context.length > 48000 || !clean(c.build, 100)) return null;
  const screenshot = typeof p.screenshot === 'string' && /^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(p.screenshot) && p.screenshot.length <= 150000 ? p.screenshot : null;
  const road = c.road as Record<string, unknown> | undefined;
  return { id: String(p.id), session: String(p.session), context, screenshot, build: clean(c.build, 100),
    area: clean(c.area, 160), tile: clean(location.tile, 40), x: location.x as number, y: location.y as number, z: location.z as number,
    latitude: location.latitude as number, longitude: location.longitude as number, roadId: clean(road?.id, 120), road: clean(road?.name, 160),
    observations: Array.isArray(c.observations) ? c.observations.slice(0, 12).map(s => clean(s, 180)).join('; ') : 'Player reported this spot; cause requires review.' };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/bug-reports') {
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      return env.ASSETS.fetch(request);
    }
    // Collection is public; reading reports is owner-only through Sites Settings.
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
    if (Number(request.headers.get('content-length') || 0) > 210000) return json({ error: 'Report too large' }, 413);
    let body: unknown;
    try {
      const reader = request.body?.getReader(); if (!reader) return json({ error: 'Missing report' }, 400);
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.byteLength; if (size > 210000) { await reader.cancel(); return json({ error: 'Report too large' }, 413); } chunks.push(r.value); }
      const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return json({ error: 'Invalid JSON' }, 400); }
    const report = validateReport(body); if (!report) return json({ error: 'Invalid report' }, 400);
    if (!env.DB) return json({ error: 'Reporting unavailable; keep this report for retry' }, 503);
    try {
      const existing = await env.DB.prepare('SELECT id FROM bug_reports WHERE id = ?').bind(report.id).first<{ id: string }>();
      if (existing) return json({ id: report.id, saved: true });
      const now = new Date(), cutoff = new Date(now.getTime() - 60000).toISOString();
      // Admission and insertion share one SQLite statement, so concurrent
      // requests cannot all observe the same pre-insert session count.
      const inserted = await env.DB.prepare('INSERT INTO bug_reports (id,received_at,session_id,build_id,area,tile,world_x,world_y,world_z,game_latitude,game_longitude,road_id,road_name,observations,context_json,game_screenshot_jpeg) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM bug_reports WHERE session_id = ? AND received_at > ?) < 5 ON CONFLICT(id) DO NOTHING RETURNING id')
        .bind(report.id, now.toISOString(), report.session, report.build, report.area, report.tile, report.x, report.y, report.z, report.latitude, report.longitude, report.roadId, report.road, report.observations, report.context, report.screenshot, report.session, cutoff).first<{ id: string }>();
      if (inserted) return json({ id: report.id, saved: true }, 201);
      // A concurrent retry may have inserted this UUID after the first read.
      const duplicate = await env.DB.prepare('SELECT id FROM bug_reports WHERE id = ?').bind(report.id).first<{ id: string }>();
      return duplicate ? json({ id: report.id, saved: true }) : json({ error: 'Please retry in a minute' }, 429);
    } catch { console.error('bug_report_store_failed'); return json({ error: 'Could not save; keep this report for retry' }, 503); }
  },
} satisfies ExportedHandler<Env>;
