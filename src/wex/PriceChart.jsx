import { useState, useRef, useEffect, useMemo } from "react";
import { formatWormcoin, formatPct, timeLabel } from "./format.js";
import { colorOf } from "./palette.js";
import {
  stepPath, buildSeries, niceTicks, yDomain, spreadLabels, buildTimeScale, downsample,
  windowStart,
} from "./chartSeries.js";

/** "8h", "45m" — how much time a compressed gap swallowed. */
function humanGap(ms) {
  const mins = Math.round(ms / 60_000);
  if (mins < 90) return `${mins}m`;
  const hours = ms / 3_600_000;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

// ============================================================
// The price chart
// ============================================================
// Hand-rolled inline SVG. No chart library is installed and none is needed: it
// is seven step lines and some hairlines, and rolling it means the thing looks
// like the rest of the paper instead of like a dashboard product.
//
// Sized in real pixels from a ResizeObserver rather than scaled by a viewBox,
// because the page scrolls and reflows — a viewBox that stretches would squash
// every label with it.

const PAD = { top: 18, right: 60, bottom: 28, left: 56 };

export default function PriceChart({
  companies,
  ticks,
  events = [],
  windowMs,          // a duration back from now; null = use `startAt` instead
  startAt = null,    // an absolute instant to start at; null = the oldest tick held
  yMode = "pct",
  hidden = {},       // { [companyId]: true }
  onToggleSeries,
  height = 380,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);

  // The right edge of the chart is "now", which keeps moving even between
  // polls — so the clock is state rather than a Date.now() read during render,
  // which would make the same props draw a different chart each time React
  // happened to re-render. Paused while the tab is hidden, like every other
  // timer in the app.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(
    () => companies.filter((c) => !hidden[c.id]),
    [companies, hidden]
  );

  const model = useMemo(() => {
    if (!width || !companies.length) return null;

    const earliest = ticks.length ? ticks[0].t : now - 60_000;
    const t0 = windowStart({ windowMs, startAt, earliest, now });
    const t1 = now;

    const series = buildSeries({ companies: visible, ticks, t0, t1, yMode });

    // Domain from the VISIBLE series only, so isolating two stocks actually
    // zooms in on them instead of leaving them flat inside everyone else's range.
    const { lo, hi } = yDomain(series, yMode);

    const plotW = Math.max(10, width - PAD.left - PAD.right);
    const plotH = Math.max(10, height - PAD.top - PAD.bottom);

    // A piecewise time axis, so an overnight close costs a narrow band rather
    // than a third of the chart. Events count as activity too — a marker left
    // at 3am should not be buried inside its own compressed gap.
    const scale = buildTimeScale({
      times: [...ticks.map((k) => k.t), ...events.map((e) => e.t)],
      t0, t1,
    });

    const xOf = (t) => PAD.left + (scale.toChart(t) / scale.total) * plotW;
    const yOf = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    // Colour comes from the company's own stored hue, indexed only as a
    // fallback — so hiding a series never repaints the survivors.
    // Thinning follows the display, not a magic constant: one bucket per ~4px,
    // and anything narrower than ~1.2px of vertical travel is not a spike worth
    // a point. A phone therefore draws fewer points than a projector, which is
    // exactly right — neither can show what it cannot resolve.
    const thinning = {
      target: Math.max(40, Math.round(plotW / 4)),
      epsilon: ((hi - lo) / plotH) * 1.2,
    };

    const indexOf = new Map(companies.map((c, i) => [c.id, i]));
    const drawn = series.map((s) => {
      const thinned = downsample(s.points, scale.toChart, scale.total, thinning);
      return {
        ...s,
        points: thinned,
        color: colorOf(s.company, indexOf.get(s.company.id) ?? 0),
        d: stepPath(thinned.map((p) => ({ x: xOf(p.t), y: yOf(p.v) }))),
        lastValue: s.points.length ? s.points[s.points.length - 1].v : 0,
      };
    });

    // Drawn as visible bands with the elided duration on them. Squeezing time
    // without saying so would make the axis a lie.
    const gapBands = scale.gaps.map((g) => ({
      key: g.a,
      x: PAD.left + (g.ca / scale.total) * plotW,
      w: Math.max(2, ((g.cb - g.ca) / scale.total) * plotW),
      label: humanGap(g.b - g.a),
    }));

    const labels = spreadLabels(
      drawn.map((s) => ({ s, y: yOf(s.lastValue) })),
      { top: PAD.top, bottom: PAD.top + plotH }
    );

    // Markers inside the window, numbered in the order they happened so the
    // caption list under the chart reads left to right.
    const marks = events
      .filter((e) => e.t >= t0 && e.t <= t1)
      .sort((a, b) => a.t - b.t)
      .slice(-6)
      .map((e, i) => ({ ...e, n: i + 1, x: xOf(e.t) }));

    return {
      t0, t1, span: t1 - t0,
      lo, hi, plotW, plotH, xOf, yOf, scale, drawn, labels, marks, gapBands,
    };
  }, [width, height, now, companies, visible, ticks, events, windowMs, startAt, yMode]);

  // ---- Hover: crosshair + tooltip -----------------------------------------
  // A projector has no pointer, but the same URL gets opened on a laptop, and
  // reading a crossover mid-party is exactly when you want this.
  function onMove(e) {
    if (!model) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PAD.left || x > PAD.left + model.plotW) { setHover(null); return; }
    // Through the piecewise scale, not a straight interpolation — otherwise the
    // tooltip reads a different time from the one under the cursor.
    const t = model.scale.fromChart(((x - PAD.left) / model.plotW) * model.scale.total);

    const readings = model.drawn.map((s) => {
      let v = s.points.length ? s.points[0].v : 0;
      for (const p of s.points) {
        if (p.t <= t) v = p.v; else break;
      }
      return { ticker: s.company.ticker, color: s.color, v };
    }).sort((a, b) => b.v - a.v);

    setHover({ x, t, readings });
  }

  const label = (v) =>
    yMode === "pct" ? formatPct(v) : formatWormcoin(v);

  return (
    <div className="wexd-chart-wrap" ref={wrapRef}>
      {model && (
        <svg
          className="wexd-chart"
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Price chart, ${visible.length} companies`}
        >
          {/* Dead air, drawn rather than hidden. Behind the grid and the lines
              so it reads as background, not as a mark. */}
          {model.gapBands.map((g) => (
            <g key={g.key}>
              <rect
                className="wexd-gap"
                x={g.x} y={PAD.top} width={g.w} height={model.plotH}
              />
              <text
                className="wexd-gap-label"
                x={g.x + g.w / 2} y={PAD.top + model.plotH - 5}
                textAnchor="middle"
              >
                {g.label}
              </text>
            </g>
          ))}

          {/* Gridlines — solid hairlines, one shade off the paper. Dashes read
              as "threshold" when this is just a grid. */}
          {niceTicks(model.lo, model.hi).map((v, i) => (
            <g key={i}>
              <line
                className={yMode === "pct" && Math.abs(v) < 1e-9 ? "wexd-grid zero" : "wexd-grid"}
                x1={PAD.left} x2={PAD.left + model.plotW}
                y1={model.yOf(v)} y2={model.yOf(v)}
              />
              <text
                className="wexd-axis" x={PAD.left - 8} y={model.yOf(v) + 4}
                textAnchor="end"
              >
                {label(v)}
              </text>
            </g>
          ))}

          {/* The zero line gets drawn last of the grid so it sits on top. */}
          {yMode === "pct" && model.lo < 0 && model.hi > 0 && (
            <line
              className="wexd-grid zero"
              x1={PAD.left} x2={PAD.left + model.plotW}
              y1={model.yOf(0)} y2={model.yOf(0)}
            />
          )}

          {/* Event markers */}
          {model.marks.map((m) => (
            <g key={m.id}>
              <line
                className="wexd-event-rule"
                x1={m.x} x2={m.x} y1={PAD.top} y2={PAD.top + model.plotH}
              />
              <circle className="wexd-event-dot" cx={m.x} cy={PAD.top - 1} r={8} />
              <text className="wexd-event-num" x={m.x} y={PAD.top + 3} textAnchor="middle">
                {m.n}
              </text>
            </g>
          ))}

          {/* The lines. 3px, not 2 — a thin line on a white sheet loses to
              projector bloom and to whatever the room does to it. */}
          {model.drawn.map((s) => (
            <path key={s.company.id} className="wexd-line" d={s.d} stroke={s.color} />
          ))}

          {/* Direct labels. NOT optional: three of the seven hues sit below 3:1
              contrast on white, and these are what make the palette legible. */}
          {model.labels.map(({ s, y }) => (
            <text
              key={s.company.id}
              className="wexd-line-label"
              x={PAD.left + model.plotW + 6}
              y={y + 4}
              fill={s.color}
            >
              {s.company.ticker}
            </text>
          ))}

          {/* Time axis — just the two ends and the middle. Read back through
              the scale, so a label always names the time actually under it. */}
          {[0, 0.5, 1].map((f) => {
            const t = model.scale.fromChart(model.scale.total * f);
            return (
              <text
                key={f}
                className="wexd-axis"
                x={PAD.left + model.plotW * f}
                y={height - 8}
                textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
              >
                {timeLabel(t, model.span)}
              </text>
            );
          })}

          {hover && (
            <line
              className="wexd-crosshair"
              x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + model.plotH}
            />
          )}
        </svg>
      )}

      {hover && model && (
        <div
          className="wexd-tooltip"
          style={{
            left: Math.min(Math.max(hover.x + 12, 8), Math.max(8, width - 150)),
            top: PAD.top,
          }}
        >
          <div className="wexd-tooltip-time">{timeLabel(hover.t, model.span)}</div>
          {hover.readings.map((r) => (
            <div key={r.ticker} className="wexd-tooltip-row">
              <span className="wexd-swatch" style={{ background: r.color }} />
              <span className="wexd-tooltip-ticker">{r.ticker}</span>
              <span className="wexd-tooltip-val">{label(r.v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* The numbered captions. Putting headlines beside their rules would
          overprint the moment two events land close together; a numbered list
          under the plot survives any width. */}
      {model && model.marks.length > 0 && (
        <ol className="wexd-event-list">
          {model.marks.map((m) => (
            <li key={m.id}>
              <span className="wexd-event-badge">{m.n}</span>
              <span className="wexd-event-time">{timeLabel(m.t, model.span)}</span>
              <span className="wexd-event-head">{m.headline}</span>
              {Number(m.pct_change) !== 0 && (
                <span className={`wexd-event-pct ${Number(m.pct_change) > 0 ? "up" : "down"}`}>
                  {formatPct(m.pct_change)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {onToggleSeries && companies.length > 0 && (
        <div className="wexd-hint">
          Tap a company below to isolate it. Colours stay with the company, so a
          line never changes hue when you hide another.
        </div>
      )}
    </div>
  );
}
