import { useCallback, useEffect, useMemo, useRef } from "react";
import { buildSeries, buildTimeScale, downsample, yDomain, spreadLabels } from "./chartSeries.js";
import { drawText, textWidth, GLYPH_H } from "./pixelFont.js";
import { formatWormcoin } from "./format.js";
import { usePixelCanvas } from "./usePixelCanvas.js";

// ============================================================
// PixelChart — a price chart on a genuinely low-resolution canvas
// ============================================================
// The #ticker chart, and the building block for the pop-up windows of the
// later random mode. The canvas holds a quarter-resolution drawing buffer and
// CSS stretches it back up with `image-rendering: pixelated`, so the pixels
// are real rather than a filter over a sharp chart.
//
// Everything is drawn with integer `fillRect`s — the step lines as horizontal
// and vertical runs, the labels from pixelFont.js — so nothing is ever
// anti-aliased and every mark sits on the same grid.
//
// The series maths is chartSeries.js, unchanged: carry-in at the left edge,
// the live price at the right, dead air squeezed out of the time axis.
//
// Two y-axes, chosen by `yMode`:
//   "pct"  percent vs open — three stocks on one fair scale, whatever they cost
//   "abs"  the share price itself, in ⌀ — what a guest actually pays

const BG = "#000";
const GRID = "#0d3a18";
const ZERO = "#23703a";
const AXIS = "#1c6b30";
const LABEL = "#34c759";
const DIM = "#1a5a2a";
const UP = "#33ff66";
const DOWN = "#ff3b3b";

const REVEAL_MS = 1200; // a line swapped in draws itself left to right

/** A round step giving about four gridlines across `span` (percent or ⌀). */
function gridStep(span) {
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

function pctText(v, step) {
  const n = Math.abs(v) < 1e-9 ? 0 : v;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(step < 1 ? 1 : 0)}%`;
}

function moveText(v) {
  if (!Number.isFinite(v)) return { text: "", color: DIM };
  if (Math.abs(v) < 0.05) return { text: "0.0%", color: DIM };
  return { text: `${v > 0 ? "▲" : "▼"}${Math.abs(v).toFixed(1)}%`, color: v > 0 ? UP : DOWN };
}

const hh = (t) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * The vertical domain. Percent mode is chartSeries' yDomain as-is. Price mode
 * gets one extra rule, kept here so #wex is untouched: the range spans at
 * least a tenth of the price, so three quiet stocks are not autoscaled into a
 * fake crash by a 30 ⌀ wobble.
 */
function domainFor(series, yMode) {
  const d = yDomain(series, yMode);
  if (yMode !== "abs") return d;
  const minSpan = d.hi * 0.1;
  if (d.hi - d.lo >= minSpan) return d;
  const mid = (d.hi + d.lo) / 2;
  return { lo: Math.max(0, mid - minSpan / 2), hi: mid + minSpan / 2 };
}

/** One frame of the chart, into a buffer already sized to `box`. */
function draw(ctx, inputs, { box, now, blink }) {
  const { series, time, colors, t0, t1, yMode, axes, legend, reveals, revealMs } = inputs;
  const abs = yMode === "abs";
  const W = box.w;
  const H = box.h;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  if (!series.length) {
    const msg = "NO SIGNAL";
    if (blink) drawText(ctx, msg, (W - textWidth(msg)) / 2, (H - GLYPH_H) / 2, LABEL);
    return;
  }

  // ---- layout --------------------------------------------------------
  const { lo, hi } = domainFor(series, yMode);
  const step = gridStep(hi - lo);
  const gridVals = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) gridVals.push(v);
  const gridLabels = gridVals.map((v) => (abs ? formatWormcoin(v) : pctText(v, step)));

  // Without axes the plot runs to the edges: the sparklines of random mode.
  const top = legend ? GLYPH_H + 6 : 2; // legend row above the plot
  const bottom = axes ? H - GLYPH_H - 5 : H - 3; // hour labels below it
  const leftW = axes ? Math.max(...gridLabels.map(textWidth), 0) + 4 : 1;
  const rightW = axes
    ? Math.max(...series.map((s) => textWidth(s.company.ticker || "")), 0) + 6
    : 3;
  const x0 = leftW;
  const x1 = W - rightW;
  const plotW = Math.max(1, x1 - x0);
  const plotH = Math.max(1, bottom - top);
  const yOf = (v) => Math.round(top + ((hi - v) / (hi - lo || 1)) * plotH);
  const xOf = (t) => Math.round(x0 + (time.toChart(t) / time.total) * plotW);

  // ---- squeezed gaps: a sparse checker, so elided time is never hidden --
  // A gap that IS the window — a market closed for all of it — squeezes
  // nothing relative to anything, so there is nothing to flag.
  ctx.fillStyle = GRID;
  for (const g of time.gaps) {
    const ga = Math.round(x0 + (g.ca / time.total) * plotW);
    const gb = Math.round(x0 + (g.cb / time.total) * plotW);
    if (gb - ga > plotW * 0.9) continue;
    for (let y = top; y <= bottom; y += 2) {
      for (let x = ga + (y % 4 ? 1 : 0); x <= gb; x += 2) ctx.fillRect(x, y, 1, 1);
    }
  }

  // ---- gridlines, y labels, axis lines and hour marks ----------------
  if (axes) drawAxes();
  function drawAxes() {
    gridVals.forEach((v, i) => {
      const y = yOf(v);
      // Zero only means something on the percent axis: "where it opened".
      ctx.fillStyle = !abs && Math.abs(v) < 1e-9 ? ZERO : GRID;
      for (let x = x0; x <= x1; x += 3) ctx.fillRect(x, y, 1, 1);
      const label = gridLabels[i];
      drawText(ctx, label, leftW - 3 - textWidth(label), y - 3, LABEL);
    });

    ctx.fillStyle = AXIS;
    ctx.fillRect(x0 - 1, top, 1, plotH + 1);
    ctx.fillRect(x0 - 1, bottom + 1, plotW + 2, 1);

    // ---- hour marks -----------------------------------------------------
    let lastEnd = -Infinity;
    const firstHour = Math.ceil(t0 / 3_600_000) * 3_600_000;
    for (let t = firstHour; t < t1; t += 3_600_000) {
      const x = xOf(t);
      ctx.fillStyle = AXIS;
      ctx.fillRect(x, bottom + 2, 1, 2);
      const label = hh(t);
      const w = textWidth(label);
      const lx = x - Math.floor(w / 2);
      if (lx > lastEnd + 4 && lx >= 0 && lx + w <= W) {
        drawText(ctx, label, lx, bottom + 4, DIM);
        lastEnd = lx + w;
      }
    }
  }

  // ---- the lines --------------------------------------------------------
  const epsilon = (hi - lo) / plotH; // a bucket thinner than a pixel is flat
  const ends = [];
  series.forEach((s, i) => {
    const color = colors[i] || LABEL;
    const pts = downsample(s.points, time.toChart, time.total, { target: plotW, epsilon });
    if (!pts.length) return;

    const started = reveals.current.get(s.company.id) ?? 0;
    const progress = Math.min(1, (now - started) / revealMs);
    const clipX = x0 + Math.floor(progress * (plotW + 1));

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, clipX + 1, H);
    ctx.clip();
    ctx.fillStyle = color;
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
    ctx.restore();

    // The pen, while it is still drawing.
    if (progress < 1) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(clipX - 1, top, 2, plotH);
    } else {
      ends.push({ key: i, y: py, v: pts[pts.length - 1].v, color });
    }
  });

  // ---- the live end: a blinking cursor, and each line's ticker ----------
  for (const e of ends) {
    if (blink) {
      ctx.fillStyle = e.color;
      ctx.fillRect(x1 - 1, e.y - 1, 3, 3);
    }
  }
  if (legend) drawLegend();
  if (!axes) return;
  const placed = spreadLabels(
    ends.map((e) => ({ key: e.key, y: e.y - 3 })),
    { top, bottom: bottom - GLYPH_H + 1, gap: GLYPH_H + 2 }
  );
  for (const p of placed) {
    const s = series[p.key];
    drawText(ctx, s.company.ticker || "?", x1 + 4, p.y, colors[p.key] || LABEL);
  }

  function drawLegend() {
    // ---- legend: swatch, ticker and move vs open for each line -----------
    // On a narrow chart the moves go before any ticker does: the board beside
    // the chart carries the numbers; only the chart says which line is which.
    // In price mode the legend carries the price, coloured by its direction
    // since the open — green and red still mean only up and down.
    const entries = series.map((s, i) => {
      const last = s.points[s.points.length - 1]?.v;
      let move = moveText(last);
      if (abs) {
        const open = Number(s.company.open_price);
        const dir = open && Number.isFinite(last) ? last - open : 0;
        move = {
          text: Number.isFinite(last) ? formatWormcoin(last) : "",
          color: dir > 0 ? UP : dir < 0 ? DOWN : DIM,
        };
      }
      return { i, tick: s.company.ticker || "?", move };
    });
    const fullW = entries.reduce(
      (sum, e) => sum + 7 + textWidth(e.tick) + 4 + textWidth(e.move.text) + 10, 0);
    const compact = x0 + fullW > W;
    let lx = x0;
    entries.forEach(({ i, tick, move: full }) => {
      const color = colors[i] || LABEL;
      const move = compact ? { text: "", color: DIM } : full;
      const w = 7 + textWidth(tick) + 4 + textWidth(move.text);
      if (lx + w > W) return;
      ctx.fillStyle = color;
      ctx.fillRect(lx, 1, 5, 5);
      drawText(ctx, tick, lx + 7, 0, color);
      drawText(ctx, move.text, lx + 7 + textWidth(tick) + 4, 0, move.color);
      lx += w + 10;
    });
  }
}

/**
 * @param companies  the companies to draw, in slot order
 * @param colors     one line colour per company, same order
 * @param ticks      useMarketData ticks — every company's, for the time axis
 * @param t0, t1     the window, ms
 * @param scale      screen pixels per chart pixel (before devicePixelRatio);
 *                   null picks one from the width
 * @param yMode      "pct" (percent vs open) or "abs" (share price in ⌀)
 * @param axes       gridlines, y labels, hour marks, end labels
 * @param legend     the swatch + ticker + price row along the top
 * @param revealMs   how long a new line takes to draw itself in
 */
export default function PixelChart({
  companies, colors, ticks, t0, t1, scale = null, yMode = "pct",
  axes = true, legend = true, revealMs = REVEAL_MS,
}) {
  const series = useMemo(
    () => buildSeries({ companies, ticks, t0, t1, yMode }),
    [companies, ticks, t0, t1, yMode]
  );
  const time = useMemo(
    () => buildTimeScale({ times: ticks.map((tk) => tk.t), t0, t1 }),
    [ticks, t0, t1]
  );

  // When each company first appeared on this chart, for the draw-in. Passed
  // to draw() as the ref itself, read only inside the animation frame.
  const reveals = useRef(new Map());
  useEffect(() => {
    const now = performance.now();
    const seen = reveals.current;
    const ids = new Set(companies.map((c) => c.id));
    for (const id of ids) if (!seen.has(id)) seen.set(id, now);
    for (const id of [...seen.keys()]) if (!ids.has(id)) seen.delete(id);
  }, [companies]);

  const inputs = useMemo(
    () => ({ series, time, colors, t0, t1, yMode, axes, legend, reveals, revealMs }),
    [series, time, colors, t0, t1, yMode, axes, legend, revealMs]
  );
  const animating = useCallback(
    (now) => [...reveals.current.values()].some((s) => now - s < revealMs),
    [revealMs]
  );
  const { wrapRef, canvasRef, canvasStyle } = usePixelCanvas({
    scale, inputs, draw, animating,
    minW: axes ? 40 : 12,
    minH: axes ? 30 : 8,
  });

  return (
    <div className="tkr-chart" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="tkr-canvas"
        style={canvasStyle}
        aria-label={`Price chart, last ${Math.round((t1 - t0) / 3_600_000)} hours: ${companies
          .map((c) => c.ticker)
          .join(", ")}`}
        role="img"
      />
    </div>
  );
}
