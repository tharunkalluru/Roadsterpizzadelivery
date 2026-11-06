/** Navigation keeps a readable CSS-pixel weight at every minimap/DPR size. */
export const MINIMAP_NAVIGATION = { casing: '#071B25', route: '#42FFE3', player: '#FFD238', target: '#FF86C0' } as const;

export function strokeMinimapRoute(g: CanvasRenderingContext2D, points: readonly (readonly [number, number, number])[], worldScale: number, backingPerCss = 1) {
  if (points.length < 2 || !Number.isFinite(worldScale) || worldScale <= 0) return;
  const pixels = Number.isFinite(backingPerCss) && backingPerCss > 0 ? backingPerCss : 1;
  g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
  points.forEach((p, i) => i ? g.lineTo(p[0], p[2]) : g.moveTo(p[0], p[2]));
  g.strokeStyle = MINIMAP_NAVIGATION.casing; g.lineWidth = 6.5 * pixels / worldScale; g.stroke();
  g.strokeStyle = MINIMAP_NAVIGATION.route; g.lineWidth = 3.3 * pixels / worldScale; g.stroke();
}

export function drawMinimapPlayer(g: CanvasRenderingContext2D, width: number, backingPerCss = 1) {
  const pixels = Number.isFinite(backingPerCss) && backingPerCss > 0 ? backingPerCss : 1;
  g.save(); g.translate(width / 2, width / 2); g.scale(pixels, pixels);
  g.fillStyle = MINIMAP_NAVIGATION.player; g.strokeStyle = MINIMAP_NAVIGATION.casing;
  g.lineJoin = 'round'; g.lineWidth = 2.4; g.beginPath();
  g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
}
