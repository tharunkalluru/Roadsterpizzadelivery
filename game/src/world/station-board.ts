import { metroLineColor } from './metro-geometry';

/** Plain data survives the city worker boundary; no canvas or material travels
 * with a tile. Missing source translations remain missing. */
export interface StationBoardContent {
  english: string;
  telugu?: string;
  lines: string[];
  kind: 'exterior' | 'platform';
}
export interface BoardRect { x: number; y: number; w: number; h: number }
export interface StationBoardLine { text: string; font: string; size: number; x: number; y: number; maxWidth: number; language: 'en' | 'te' }

const clean = (text: string) => text.replace(/\\u([0-9a-f]{4})/gi, (_, value) => String.fromCharCode(parseInt(value, 16))).normalize('NFC').replace(/\s+/g, ' ').trim();
export function stationBoardContent(english: string, telugu: string | null | undefined, lines: readonly string[] | undefined, kind: StationBoardContent['kind']): StationBoardContent {
  const te = typeof telugu === 'string' ? clean(telugu) : '';
  return { english: clean(english).toUpperCase(), ...(/[\u0c00-\u0c7f]/.test(te) ? { telugu: te } : {}),
    lines: ['red', 'blue', 'green'].filter(line => lines?.includes(line)), kind };
}

export function stationBoardKey(board: StationBoardContent, width: number, height: number) {
  return JSON.stringify([board.kind, board.english, board.telugu ?? '', board.lines, width, height]);
}

/** Use only a proportional content rectangle inside a padded atlas slot. The
 * physical quad and its sampled texture region therefore have the SAME aspect
 * ratio, including the half-texel sampling inset. No stretched letterforms. */
export function stationBoardRegion(slot: BoardRect, physicalWidth: number, physicalHeight: number, scale: number) {
  const aspect = physicalWidth / physicalHeight, padding = 4 * scale;
  let w = slot.w - padding * 2, h = w / aspect;
  if (h > slot.h - padding * 2) { h = slot.h - padding * 2; w = h * aspect; }
  const paint = { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h) / 2, w, h };
  const inset = .5 / Math.min(w, h);
  const sample = { x: paint.x + w * inset, y: paint.y + h * inset, w: w * (1 - inset * 2), h: h * (1 - inset * 2) };
  return { paint, sample };
}

/** Fitting uses the actual browser font metrics, without truncation or canvas
 * horizontal scaling. Exported layout also gives tests a measurable contract. */
export function stationBoardLayout(g: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>, board: StationBoardContent, rect: BoardRect): StationBoardLine[] {
  const pad = rect.h * .055, icon = Math.min(rect.h * .47, rect.w * .115);
  const left = rect.x + pad * 2 + icon, right = rect.x + rect.w - pad;
  const maxWidth = Math.max(1, right - left), x = (left + right) / 2;
  const font = (language: 'en' | 'te', size: number) => language === 'te'
    ? `700 ${size}px "Noto Sans Telugu", sans-serif` : `700 ${size}px Arial, Helvetica, sans-serif`;
  const fit = (text: string, language: 'en' | 'te', maximum: number, y: number): StationBoardLine => {
    let size = Math.max(1, Math.floor(maximum)); g.font = font(language, size);
    while (g.measureText(text).width > maxWidth && size > 1) { size--; g.font = font(language, size); }
    return { text, language, size, font: font(language, size), x, y: rect.y + rect.h * y, maxWidth };
  };
  return board.telugu
    ? [fit(board.english, 'en', rect.h * .39, .255), fit(board.telugu, 'te', rect.h * .31, .595)]
    : [fit(board.english, 'en', rect.h * .52, .425)];
}

export function paintStationBoard(g: CanvasRenderingContext2D, board: StationBoardContent, rect: BoardRect) {
  const { x, y, w, h } = rect;
  g.fillStyle = '#f6f4e9'; g.fillRect(x, y, w, h);
  // A restrained consistent HMR identity; corridor color lives in the footer.
  g.fillStyle = '#173b66'; g.fillRect(x + h * .018, y + h * .018, w - h * .036, h * .80);
  const icon = Math.min(h * .47, w * .115), ix = x + h * .055 + icon / 2, iy = y + h * .405;
  g.fillStyle = '#fff9e9'; g.beginPath(); g.arc(ix, iy, icon / 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#173b66'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.floor(icon * .63)}px Arial, Helvetica, sans-serif`; g.fillText('M', ix, iy + icon * .025);
  g.fillStyle = '#fff9e9';
  for (const line of stationBoardLayout(g, board, rect)) { g.font = line.font; g.fillText(line.text, line.x, line.y); }
  const lines = board.lines.length ? board.lines : ['metro'];
  for (let i = 0; i < lines.length; i++) {
    const id = lines[i], width = w / lines.length, bx = x + i * width;
    g.fillStyle = metroLineColor(id, '#d8d4bd'); g.fillRect(bx, y + h * .84, width, h * .16);
    g.fillStyle = id === 'green' || id === 'metro' ? '#071b10' : '#fff9e9';
    const label = id === 'metro' ? 'HYDERABAD METRO' : `${id.toUpperCase()} LINE`;
    let size = Math.max(1, Math.floor(h * .112)); g.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    while (g.measureText(label).width > width - h * .08 && size > 1) { size--; g.font = `700 ${size}px Arial, Helvetica, sans-serif`; }
    g.fillText(label, bx + width / 2, y + h * .923);
  }
}
