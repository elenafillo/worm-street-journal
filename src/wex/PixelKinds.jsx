import { useMemo } from "react";
import { buildSeries } from "./chartSeries.js";
import { drawText, textWidth, GLYPH_H } from "./pixelFont.js";
import { formatWormcoin, pctChange } from "./format.js";
import { usePixelCanvas } from "./usePixelCanvas.js";

// ============================================================
// The pixel renderers of random mode, beside PixelChart
// ============================================================
//   PixelSparks  every company as a one-row sparkline
//   PixelBars    % vs open for every company, bars either side of zero
//   PixelNumber  one price, enormous
//
// Each is a `draw` function on usePixelCanvas, so it shares the chart's
// whole-device-pixel sizing and redraw loop. Here green and red DO carry the
// lines, because here they mean what they mean everywhere on this screen:
// up and down.

const BG = "#000";
const LABEL = "#34c759";
const TEXT = "#d8ffe0";
const DIM = "#1a5a2a";
const GRID = "#0d3a18";
const UP = "#33ff66";
const DOWN = "#ff3b3b";

const dirColor = (v) => (v > 0 ? UP : v < 0 ? DOWN : DIM);

function moveLabel(pct) {
  if (!Number.isFinite(pct)) return "";
  if (Math.abs(pct) < 0.05) return "0.0%";
  return `${pct > 0 ? "▲" : "▼"}${Math.abs(pct).toFixed(1)}%`;
}

function Canvas({ wrapRef, canvasRef, canvasStyle, label }) {
  return (
    <div className="tkr-chart" ref={wrapRef}>
      <canvas ref={canvasRef} className="tkr-canvas" style={canvasStyle} role="img" aria-label={label} />
    </div>
  );
}

// ---- sparks ------------------------------------------------------------------

/** As many rows as fit legibly. When not all do, the biggest movers stay. */
function fitRows(rows, H) {
  const fit = Math.max(1, Math.floor(H / (GLYPH_H + 2)));
  if (rows.length <= fit) return rows;
  return [...rows].sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0)).slice(0, fit);
}

function drawSparks(ctx, { rows: all }, { box }) {
  const { w: W, h: H } = box;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const rows = fitRows(all, H);
  if (!rows.length) return;

  const rowH = Math.floor(H / rows.length);
  const labelW = Math.max(...rows.map((r) => textWidth(r.ticker))) + 3;
  const moveW = Math.max(...rows.map((r) => textWidth(r.move))) + 2;
  const x0 = labelW;
  const x1 = W - moveW - 2;
  const span = Math.max(1, x1 - x0);

  rows.forEach((r, i) => {
    const top = i * rowH;
    const ty = top + Math.floor((rowH - GLYPH_H) / 2);
    drawText(ctx, r.ticker, 0, ty, TEXT);
    drawText(ctx, r.move, W - textWidth(r.move), ty, dirColor(r.pct));

    // Each row scaled to itself: this is shape, not a comparison of prices.
    const pts = r.points;
    if (pts.length < 2) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    const pad = 1;
    const inner = Math.max(1, rowH - 2 * pad - 1);
    const range = hi - lo || 1;
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const xOf = (t) => Math.round(x0 + ((t - t0) / (t1 - t0 || 1)) * span);
    const yOf = (v) => Math.round(top + pad + (hi === lo ? inner / 2 : ((hi - v) / range) * inner));

    ctx.fillStyle = GRID;
    for (let x = x0; x <= x1; x += 3) ctx.fillRect(x, top + rowH - 1, 1, 1);

    ctx.fillStyle = dirColor(pts[pts.length - 1].v - pts[0].v);
    let px = xOf(pts[0].t);
    let py = yOf(pts[0].v);
    for (let k = 1; k < pts.length; k++) {
      const nx = xOf(pts[k].t);
      const ny = yOf(pts[k].v);
      ctx.fillRect(Math.min(px, nx), py, Math.abs(nx - px) + 1, 1);
      if (ny !== py) ctx.fillRect(nx, Math.min(py, ny), 1, Math.abs(ny - py) + 1);
      px = nx;
      py = ny;
    }
  });
}

/** Every company as a sparkline over the last `hours`, coloured by its move. */
export function PixelSparks({ companies, ticks, t0, t1, scale }) {
  const rows = useMemo(() => {
    const series = buildSeries({ companies, ticks, t0, t1, yMode: "abs" });
    return series.map((s) => {
      const first = s.points[0]?.v;
      const last = s.points[s.points.length - 1]?.v;
      const pct = first ? (last / first - 1) * 100 : NaN;
      return { ticker: s.company.ticker || "?", points: s.points, pct, move: moveLabel(pct) };
    });
  }, [companies, ticks, t0, t1]);
  const inputs = useMemo(() => ({ rows }), [rows]);
  const { wrapRef, canvasRef, canvasStyle } = usePixelCanvas({ scale, inputs, draw: drawSparks, minW: 30, minH: 12 });
  return <Canvas wrapRef={wrapRef} canvasRef={canvasRef} canvasStyle={canvasStyle} label="Sparklines for every company" />;
}

// ---- bars ----------------------------------------------------------------------

function drawBars(ctx, { rows: all }, { box, blink }) {
  const { w: W, h: H } = box;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const rows = fitRows(all, H);
  if (!rows.length) return;

  const rowH = Math.max(GLYPH_H + 2, Math.floor(H / rows.length));
  const labelW = Math.max(...rows.map((r) => textWidth(r.ticker))) + 3;
  const moveW = Math.max(...rows.map((r) => textWidth(r.move))) + 3;
  const x0 = labelW;
  const x1 = W - moveW;
  const mid = Math.round((x0 + x1) / 2);
  const half = Math.max(1, Math.min(mid - x0, x1 - mid) - 1);
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pct) || 0));
  const barH = Math.max(1, rowH - 4);

  // The zero line: "where it opened".
  ctx.fillStyle = DIM;
  for (let y = 0; y < rows.length * rowH; y += 2) ctx.fillRect(mid, y, 1, 1);

  rows.forEach((r, i) => {
    const top = i * rowH;
    const ty = top + Math.floor((rowH - GLYPH_H) / 2);
    drawText(ctx, r.ticker, 0, ty, TEXT);
    drawText(ctx, r.move, W - textWidth(r.move), ty, dirColor(r.pct));
    const len = Math.round((Math.abs(r.pct || 0) / maxAbs) * half);
    if (!len) return;
    ctx.fillStyle = dirColor(r.pct);
    const by = top + Math.floor((rowH - barH) / 2);
    ctx.fillRect(r.pct > 0 ? mid + 1 : mid - len, by, len, barH);
    // The biggest mover's bar-end blinks.
    if (r.top && blink) {
      ctx.fillStyle = TEXT;
      ctx.fillRect(r.pct > 0 ? mid + len : mid - len - 1, by, 1, barH);
    }
  });
}

/** % vs open for every company, biggest mover first. */
export function PixelBars({ companies, scale }) {
  const rows = useMemo(() => {
    const out = companies
      .map((c) => {
        const pct = pctChange(c.price, c.open_price);
        return { ticker: c.ticker || "?", pct, move: moveLabel(pct) };
      })
      .sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0));
    if (out[0]) out[0].top = true;
    return out;
  }, [companies]);
  const inputs = useMemo(() => ({ rows }), [rows]);
  const { wrapRef, canvasRef, canvasStyle } = usePixelCanvas({ scale, inputs, draw: drawBars, minW: 30, minH: 12 });
  return <Canvas wrapRef={wrapRef} canvasRef={canvasRef} canvasStyle={canvasStyle} label="Every company's move since the open" />;
}

// ---- one big number ----------------------------------------------------------------

// What the percentage is measured against, spelled out: a bare "1.5%" under a
// price reads as nothing in particular. Longest that fits wins.
const SINCE = [" SINCE OPEN", " VS OPEN", ""];

function drawNumber(ctx, { ticker, price, pct }, { box, blink }) {
  const { w: W, h: H } = box;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const priceText = formatWormcoin(price);
  const move = moveLabel(pct);
  const GAP = 3;

  // The price, plus a one-glyph gap and a two-unit blinking cursor after it,
  // as large as the width allows...
  const priceUnits = textWidth(priceText) + 1 + 2;
  let size = Math.max(1, Math.floor((W - 4) / Math.max(1, priceUnits)));
  const smallOf = (sz) => Math.max(1, Math.floor(sz / 2));
  // ...then shrunk until the whole stack fits the height: ticker, price, move.
  // All three, always — the ticker is what makes the number mean anything.
  const stackH = (sz) => GLYPH_H * smallOf(sz) + GAP + GLYPH_H * sz + GAP + GLYPH_H * smallOf(sz);
  while (size > 1 && stackH(size) > H - 2) size--;
  const small = smallOf(size);

  // The move line: arrow and figure in up/down colour, then what it is against.
  const suffix = SINCE.find((sfx) => textWidth(move + sfx) * small <= W - 2) ?? "";
  const lineW = textWidth(move + suffix) * small;

  let y = Math.max(0, Math.floor((H - stackH(size)) / 2));
  drawText(ctx, ticker, Math.floor((W - textWidth(ticker) * small) / 2), y, LABEL, small);
  y += GLYPH_H * small + GAP;

  const px = Math.floor((W - priceUnits * size) / 2);
  drawText(ctx, priceText, px, y, TEXT, size);
  // The cursor is what blinks. The arrow never does: without it the move
  // reads as a bare number with no direction.
  if (blink) {
    ctx.fillStyle = LABEL;
    ctx.fillRect(px + (textWidth(priceText) + 1) * size, y, 2 * size, GLYPH_H * size);
  }
  y += GLYPH_H * size + GAP;

  const mx = Math.floor((W - lineW) / 2);
  drawText(ctx, move, mx, y, dirColor(pct), small);
  if (suffix) drawText(ctx, suffix, mx + (textWidth(move) + 1) * small, y, LABEL, small);
}

/** One company's price, as large as the window allows, with its move. */
export function PixelNumber({ company, scale }) {
  const inputs = useMemo(
    () => ({
      ticker: company?.ticker || "?",
      price: company?.price,
      pct: pctChange(company?.price, company?.open_price),
    }),
    [company?.ticker, company?.price, company?.open_price]
  );
  const { wrapRef, canvasRef, canvasStyle } = usePixelCanvas({ scale, inputs, draw: drawNumber, minW: 20, minH: 12 });
  return <Canvas wrapRef={wrapRef} canvasRef={canvasRef} canvasStyle={canvasStyle} label={`${inputs.ticker} ${formatWormcoin(inputs.price)}`} />;
}
