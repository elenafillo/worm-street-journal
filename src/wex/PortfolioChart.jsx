import { useId, useRef, useState, useEffect, useMemo } from "react";
import { formatWormcoin, timeLabel } from "./format.js";
import {
  stepPath, buildTimeScale, downsample, bucketChanges, niceTicks, px,
} from "./chartSeries.js";

// ============================================================
// One worm's own charts
// ============================================================
// A sibling of PriceChart, not a reuse of it: that one draws seven companies in
// percent-since-open with a legend, direct labels and a hover crosshair. This
// draws one guest's fortune, on a phone, for someone holding a drink. Sharing
// the maths (buildTimeScale, downsample, bucketChanges) and not the component is
// the right split — the axis compression in particular is what stops an
// overnight hold from eating two thirds of the width.
//
// Two modes, and they are deliberately different SHAPES, not the same shape
// twice:
//
//   "wealth"  a line against the fortune you started with. Where you stand.
//   "bars"    what you made or lost in each slice of the window. When it
//             happened.
//
// The second is the one that earns its place. Cumulative P&L is identically
// net worth minus starting cash — it is the line above, redrawn a bit lower,
// and a chart that repeats its neighbour is a chart nobody reads. The histogram
// answers the question the line cannot: was tonight one good hour and six flat
// ones, or a slow steady climb?
//
// No hover readout, deliberately. The target device has no pointer, and the
// numbers a tooltip would carry are printed under the chart instead, where they
// are always visible.

const PAD = { top: 10, right: 8, bottom: 18, left: 48 };

/** "+2.5M" / "−400" — an axis on a diverging scale must carry its signs. */
function signedAxis(v) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${formatWormcoin(Math.abs(v))}`;
}

export default function PortfolioChart({
  samples,
  t0,
  t1,
  mode = "wealth",       // "wealth" | "bars"
  pick = (s) => s.wealth,
  baseline = 0,          // wealth mode only
  baselineLabel = "",
  height = 160,
}) {
  const uid = useId().replace(/:/g, "");
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    if (!width || !samples.length) return null;

    const plotW = Math.max(10, width - PAD.left - PAD.right);
    const plotH = Math.max(10, height - PAD.top - PAD.bottom);
    const scale = buildTimeScale({ times: samples.map((s) => s.t), t0, t1 });
    const points = samples.map((s) => ({ t: s.t, v: pick(s) }));

    const xOfChart = (c) => PAD.left + (c / scale.total) * plotW;
    const gapBands = scale.gaps.map((g) => ({
      key: g.a,
      x: xOfChart(g.ca),
      w: Math.max(2, ((g.cb - g.ca) / scale.total) * plotW),
    }));

    const frame = { plotW, plotH, scale, gapBands, span: t1 - t0, xOfChart };

    if (mode === "bars") {
      // About one bar per seven pixels — wide enough to have a colour on a
      // phone, narrow enough that a long evening still reads as a rhythm rather
      // than as six blocks. Clamped so neither extreme of screen goes silly.
      const count = Math.max(10, Math.min(64, Math.floor(plotW / 7)));
      const bars = bucketChanges(points, scale.toChart, scale.total, count);

      // Symmetric around zero, so a green bar and a red bar of the same height
      // are the same amount of money. An autoscaled diverging axis is a lie
      // told with a straight face.
      let m = 0;
      for (const b of bars) m = Math.max(m, Math.abs(b.delta));
      const hi = (m || 1) * 1.15;

      const yOf = (v) => PAD.top + (1 - (v + hi) / (2 * hi)) * plotH;
      const yZero = yOf(0);
      const slot = plotW / count;
      const barW = Math.max(1, slot - Math.min(2, slot * 0.3));

      return {
        ...frame, lo: -hi, hi, yOf, yZero, barW, slot,
        bars: bars.filter((b) => b.delta !== 0).map((b) => ({
          i: b.i,
          up: b.delta > 0,
          x: xOfChart(b.ca) + (slot - barW) / 2,
          y: b.delta > 0 ? yOf(b.delta) : yZero,
          // A move too small to see still gets a hairline: a bar that vanishes
          // reads as a quiet slice, and those are different things.
          h: Math.max(1, Math.abs(yOf(b.delta) - yZero)),
        })),
        // Sums to the change across the whole window, by construction.
        total: bars.reduce((sum, b) => sum + b.delta, 0),
      };
    }

    // ---- wealth: a line against a baseline --------------------------------
    // The domain always contains the baseline. Without that, a fortune that has
    // only ever gone up autoscales to its own range and the "started with" rule
    // falls off the bottom — taking with it the only thing that makes the
    // height of the line mean anything.
    let lo = baseline;
    let hi = baseline;
    for (const p of points) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
    // A flat line needs a domain anyway. Two percent of the baseline is enough
    // to put it in the middle of the plot rather than on an edge.
    const span = hi - lo || Math.max(1, Math.abs(baseline) * 0.02);
    lo -= span * 0.12;
    hi += span * 0.12;

    const yOf = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;
    const yBase = yOf(baseline);

    // Same reasoning as PriceChart: thin to what the screen can resolve, about
    // a bucket every three pixels, and ignore excursions under a pixel tall.
    const thin = downsample(points, scale.toChart, scale.total, {
      target: Math.max(30, Math.round(plotW / 3)),
      epsilon: ((hi - lo) / plotH) * 1.2,
    });
    const xy = thin.map((p) => ({ x: xOfChart(scale.toChart(p.t)), y: yOf(p.v) }));
    const d = stepPath(xy);
    const last = points[points.length - 1].v;

    return {
      ...frame, lo, hi, yOf, yBase, d, baselineLabel,
      // Closed down to the baseline and back, built from the same `d` so the
      // fill and the line can never disagree by a pixel.
      area: xy.length
        ? `${d} L ${px(xy[xy.length - 1].x)} ${px(yBase)} L ${px(xy[0].x)} ${px(yBase)} Z`
        : "",
      dir: last > baseline ? "up" : last < baseline ? "down" : "",
    };
  }, [width, height, samples, t0, t1, mode, pick, baseline, baselineLabel]);

  const bars = mode === "bars";

  return (
    <div className="wexf-chart-wrap" ref={wrapRef}>
      {model && (
        <svg
          className="wexf-chart"
          width={width}
          height={height}
          role="img"
          aria-label={bars ? "Profit and loss in each slice of time" : "Net worth over time"}
        >
          {/* Dead air, compressed and shown as compressed — the market is shut
              for most of a party, and drawing those hours to scale would leave
              the evening as a sliver. */}
          {model.gapBands.map((g) => (
            <rect key={g.key} className="wexf-gap" x={g.x} y={PAD.top} width={g.w} height={model.plotH} />
          ))}

          {niceTicks(model.lo, model.hi, 3).map((v, i) => (
            <g key={i}>
              <line className="wexf-grid" x1={PAD.left} x2={PAD.left + model.plotW}
                    y1={model.yOf(v)} y2={model.yOf(v)} />
              <text className="wexf-axis" x={PAD.left - 6} y={model.yOf(v) + 3} textAnchor="end">
                {bars ? signedAxis(v) : formatWormcoin(v)}
              </text>
            </g>
          ))}

          {bars ? (
            <>
              {model.bars.map((b) => (
                <rect
                  key={b.i}
                  className={`wexf-bar ${b.up ? "up" : "down"}`}
                  x={b.x} y={b.y} width={model.barW} height={b.h}
                />
              ))}
              {/* Drawn over the bars: break-even is the reference every bar is
                  measured from, so it must not be buried under them. */}
              <line className="wexf-baseline" x1={PAD.left} x2={PAD.left + model.plotW}
                    y1={model.yZero} y2={model.yZero} />
            </>
          ) : (
            <>
              {/* The fill, split at the baseline so a fortune that crossed it is
                  green above and red below rather than one colour throughout. */}
              <defs>
                <clipPath id={`${uid}-up`}>
                  <rect x={PAD.left} y={PAD.top} width={model.plotW}
                        height={Math.max(0, model.yBase - PAD.top)} />
                </clipPath>
                <clipPath id={`${uid}-down`}>
                  <rect x={PAD.left} y={model.yBase} width={model.plotW}
                        height={Math.max(0, PAD.top + model.plotH - model.yBase)} />
                </clipPath>
              </defs>
              <path className="wexf-area up" d={model.area} clipPath={`url(#${uid}-up)`} />
              <path className="wexf-area down" d={model.area} clipPath={`url(#${uid}-down)`} />

              {/* Dashed, unlike the gridlines, because it IS a threshold: above
                  it you are ahead, below it you are behind. */}
              <line className="wexf-baseline" x1={PAD.left} x2={PAD.left + model.plotW}
                    y1={model.yBase} y2={model.yBase} />
              {baselineLabel && (
                <text className="wexf-baseline-label" x={PAD.left + model.plotW}
                      y={model.yBase - 4} textAnchor="end">
                  {baselineLabel}
                </text>
              )}

              <path className={`wexf-line main ${model.dir}`} d={model.d} />
            </>
          )}

          {[0, 1].map((f) => {
            const t = model.scale.fromChart(model.scale.total * f);
            return (
              <text key={f} className="wexf-axis"
                    x={PAD.left + model.plotW * f} y={height - 5}
                    textAnchor={f === 0 ? "start" : "end"}>
                {timeLabel(t, model.span)}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}
