// ============================================================
// Chart maths
// ============================================================
// The pure part of the price chart, kept out of the component so it can be
// exercised with plain node against real tick data — and so the price board's
// sparklines can build the same series from the same rules later.
//
// Nothing here touches React, the DOM, or the clock: `now` is always passed in.

// ============================================================
// The time windows every chart offers
// ============================================================
// Shared between the wall (#wex) and the phone (#trade) so the two screens
// cannot drift apart on what "Session" means. Two shapes of window:
//
//   `ms`    a duration back from now. "The last hour" means the last hour.
//   `since` an instant to start at:
//             "open"  — when the bell last rang (`market_state.opened_at`), so
//                       a fresh evening is not read through yesterday's prices.
//             "first" — the oldest tick held, which since the paged history
//                       load in useMarketData is the first tick ever written:
//                       activation, or the last reset.
//
// "Session" was previously `ms: null` and drew from the oldest tick HELD, with
// no relation to the session at all. The client only ever held the newest 1000
// ticks — PostgREST's page cap, silently applied — so on a market open for a
// day and a half it drew the last thirteen hours and called them the session.
export const CHART_WINDOWS = [
  { id: "15m", label: "15 min", ms: 15 * 60 * 1000 },
  { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { id: "session", label: "Session", ms: null, since: "open" },
  { id: "all", label: "All time", ms: null, since: "first" },
];

/**
 * A window id plus the market's opening time, resolved into the two props the
 * charts actually take. Falls back to the hour rather than throwing on an id
 * that came out of a URL.
 *
 * A market that has never been opened — or has been reset — has no `openedAt`.
 * "Since the bell" with no bell is best answered with everything there is,
 * which is what a null `startAt` means to a chart.
 */
export function resolveWindow(id, openedAt) {
  const win = CHART_WINDOWS.find((w) => w.id === id) ?? CHART_WINDOWS[1];
  return {
    win,
    windowMs: win.ms,
    startAt: win.since === "open" && openedAt ? new Date(openedAt).getTime() : null,
  };
}

/**
 * The left edge of a chart, from a window and the data behind it.
 *
 * A duration window is measured back from now. An instant window is used as
 * given — but never earlier than the oldest data held: a series has no value to
 * carry into a stretch that predates its own history, so the left of the plot
 * would fill with a flat line at TODAY'S figure. Empty is honest; a fabricated
 * flat line is not.
 *
 * Shared by the price chart and the fortune charts so a guest comparing their
 * phone to the wall is looking at the same left edge.
 */
export function windowStart({ windowMs, startAt, earliest, now }) {
  const anchor = startAt ? Math.max(startAt, earliest) : earliest;
  return windowMs ? now - windowMs : Math.min(anchor, now - 60_000);
}

/**
 * The right edge of a chart: now, unless the bell has closed the exchange.
 *
 * A closed market drew its lines on to the right as flat lines, as if trading
 * were still going on, and a market shut for longer than the window drew
 * nothing but those lines. So once it closes the chart stops at the close, and
 * "the last hour" means the last hour of trading.
 *
 * Not exactly at the close, though: the Fed can still fire an event or set a
 * price on a shut exchange, and a move with nowhere to be drawn would turn up as
 * an unexplained jump. `latest` is the newest tick or event held; the edge runs
 * on to it when it came after the close.
 *
 * A market that was never opened, or has been reset, has no `closed_at` and
 * keeps the moving edge.
 */
export function chartEnd({ market, now, latest = -Infinity }) {
  if (!market || market.is_open || !market.closed_at) return now;
  const closed = new Date(market.closed_at).getTime();
  if (!Number.isFinite(closed) || closed > now) return now;
  return Math.min(now, Math.max(closed, latest));
}

/** The newest moment in a tick list (oldest first, as every hook keeps it) and
 *  an event list, for chartEnd's `latest`. */
export function latestActivity(ticks = [], events = []) {
  let t = ticks.length ? ticks[ticks.length - 1].t : -Infinity;
  for (const e of events) if (e.t > t) t = e.t;
  return t;
}

/** Whether a chart drawn to `end` is showing a shut exchange — what the charts
 *  key their "closed" look on. Same test as chartEnd's. */
export function isClosed(market) {
  return Boolean(market && !market.is_open && market.closed_at);
}

/**
 * Prices change discretely, at trades. A step-after path is the honest shape;
 * a smoothed spline would invent movement that never happened.
 *
 * Coordinates are rounded to a tenth of a pixel. That sounds like a detail and
 * is worth about 4× the size of the whole chart: unrounded, a single point
 * serialises as `L 412.38472910384765 208.9174857392018` — seventy-odd bytes of
 * precision that no screen can show. Over three days of ticks it was the
 * difference between 170KB of path re-parsed every three seconds and 40KB.
 */
export const px = (n) => Math.round(n * 10) / 10;

export function stepPath(points) {
  if (!points.length) return "";
  let d = `M ${px(points[0].x)} ${px(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    const x = px(points[i].x);
    d += ` L ${x} ${px(points[i - 1].y)} L ${x} ${px(points[i].y)}`;
  }
  return d;
}

/**
 * Turn raw ticks into one series per company, in the chosen units.
 *
 * The subtle part is the CARRY-IN point. A company nobody has traded in the
 * last fifteen minutes has no ticks inside the window at all, and the naive
 * renderer draws it as nothing — the quiet stock silently vanishes from the
 * board. So if a company's first in-window tick is later than the window start,
 * prepend a point at the window start carrying its last price from BEFORE the
 * window. Every line then spans the full width, and a flat line reads correctly
 * as "nothing happened here" rather than as missing data.
 *
 * Ticks may arrive in any order; they are sorted per company by time here so
 * callers do not have to care.
 */
export function buildSeries({ companies, ticks, t0, t1, yMode }) {
  const byCompany = new Map(companies.map((c) => [c.id, []]));
  for (const tk of ticks) {
    const bucket = byCompany.get(tk.company_id);
    if (bucket) bucket.push(tk);
  }
  for (const bucket of byCompany.values()) bucket.sort((a, b) => a.t - b.t);

  return companies.map((c) => {
    const all = byCompany.get(c.id) || [];
    const open = Number(c.open_price) || 0;
    const toValue = (price) =>
      yMode === "pct" ? (open ? (Number(price) / open - 1) * 100 : 0) : Number(price);

    const inWindow = all.filter((t) => t.t >= t0 && t.t <= t1);

    let carried = null;
    for (let k = all.length - 1; k >= 0; k--) {
      if (all[k].t < t0) { carried = all[k]; break; }
    }

    const points = [];
    if (carried) {
      points.push({ t: t0, v: toValue(carried.price) });
    } else if (!inWindow.length) {
      // Never traded and never ticked — hold its current price flat, so the
      // company still appears on the chart instead of vanishing.
      points.push({ t: t0, v: toValue(c.price) });
    }
    for (const tk of inWindow) points.push({ t: tk.t, v: toValue(tk.price) });

    // The live price is fresher than the newest tick we happen to hold, so the
    // line always runs to the right edge at the number shown in the legend.
    points.push({ t: t1, v: toValue(c.price) });

    return { company: c, points };
  });
}

/**
 * A piecewise-linear time axis that squeezes dead air.
 *
 * The problem it solves: close the market at midnight and reopen at six, and a
 * whole-session chart spends a third of its width drawing a flat line through
 * an empty room. Over a three-day party there are two of those, and each
 * evening — the part anyone cares about — gets compressed into a sliver.
 *
 * So any stretch longer than `gapMs` in which NOTHING happened is drawn at a
 * fixed narrow width (`gapChartMs`) instead of its real duration. Inferring
 * dead time from the absence of ticks rather than from market_state is
 * deliberate: it needs no schema and no history table, and it does the right
 * thing for a lull, a dinner break and a closed market alike.
 *
 * The compression is always DRAWN — see the gap bands in PriceChart, which
 * label how much time was elided. A time axis that silently lies about
 * duration would be worse than the problem.
 *
 * Segments are cut at gap boundaries only, never per tick, so the returned
 * `toChart` stays a scan over a handful of entries rather than thousands.
 */
export function buildTimeScale({
  times, t0, t1,
  gapMs = 10 * 60_000,       // longer than this with no activity counts as dead
  gapChartMs = 3 * 60_000,   // ...and is drawn this wide, whatever its real length
}) {
  const span = Math.max(1, t1 - t0);
  const inside = times.filter((t) => t > t0 && t < t1).sort((a, b) => a - b);
  const marks = [t0, ...inside, t1];

  const gaps = [];
  for (let i = 1; i < marks.length; i++) {
    if (marks[i] - marks[i - 1] > gapMs) gaps.push([marks[i - 1], marks[i]]);
  }

  const segs = [];
  let cursor = t0;
  let chart = 0;
  for (const [ga, gb] of gaps) {
    if (ga > cursor) {
      segs.push({ a: cursor, b: ga, ca: chart, cb: chart + (ga - cursor), gap: false });
      chart += ga - cursor;
    }
    segs.push({ a: ga, b: gb, ca: chart, cb: chart + gapChartMs, gap: true });
    chart += gapChartMs;
    cursor = gb;
  }
  if (t1 > cursor || !segs.length) {
    const d = Math.max(1, t1 - cursor);
    segs.push({ a: cursor, b: cursor + d, ca: chart, cb: chart + d, gap: false });
    chart += d;
  }

  const total = chart || span;

  function toChart(t) {
    if (t <= t0) return 0;
    if (t >= t1) return total;
    for (const s of segs) {
      if (t <= s.b) {
        const w = s.b - s.a || 1;
        return s.ca + ((t - s.a) / w) * (s.cb - s.ca);
      }
    }
    return total;
  }

  function fromChart(c) {
    if (c <= 0) return t0;
    if (c >= total) return t1;
    for (const s of segs) {
      if (c <= s.cb) {
        const w = s.cb - s.ca || 1;
        return s.a + ((c - s.ca) / w) * (s.b - s.a);
      }
    }
    return t1;
  }

  return { toChart, fromChart, total, segments: segs, gaps: segs.filter((s) => s.gap) };
}

/**
 * Thin a series down to something an SVG path can carry.
 *
 * Eighty guests trading for three days is a few thousand ticks per company, and
 * a `d` attribute with a point each is both slow to re-parse every three
 * seconds and visually solid noise. Bucketing by CHART position rather than by
 * real time means the thinning follows what is actually on screen — a squeezed
 * overnight gap does not get its own buckets.
 *
 * Each bucket keeps its first, min, max and last points, in the order they
 * happened. Keeping only the last — the obvious version — silently swallows
 * spikes, which on a price chart is the one thing you must not lose: a crash
 * and recovery inside one bucket would vanish entirely.
 */
export function downsample(points, toChart, total, { target = 160, epsilon = 0 } = {}) {
  if (points.length <= target * 2) return points;

  const width = total / target || 1;
  const out = [];
  let bucket = null;
  let idx = -1;

  const push = (p) => {
    if (out[out.length - 1] !== p) out.push(p);
  };

  const flush = () => {
    if (!bucket) return;
    // A bucket whose whole vertical range is thinner than `epsilon` — set by
    // the caller to about a pixel — has no spike anyone could see, so its last
    // value alone carries it. Only genuinely visible excursions cost extra
    // points. Without this the thinning is governed by how noisy the data is
    // rather than by how much of it the screen can show.
    if (bucket.max.v - bucket.min.v <= epsilon) {
      push(bucket.last);
    } else {
      for (const p of [bucket.min, bucket.max, bucket.last].sort((a, b) => a.t - b.t)) push(p);
    }
    bucket = null;
  };

  for (const p of points) {
    const i = Math.floor(toChart(p.t) / width);
    if (i !== idx) { flush(); idx = i; }
    if (!bucket) bucket = { last: p, min: p, max: p };
    else {
      bucket.last = p;
      if (p.v < bucket.min.v) bucket.min = p;
      if (p.v > bucket.max.v) bucket.max = p;
    }
  }
  flush();

  // The very first and last points anchor the line to the edges of the plot;
  // bucketing can drop the first one when its bucket had a later extreme.
  if (out[0] !== points[0]) out.unshift(points[0]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

/**
 * Slice a running total into per-bucket CHANGES — the maths behind the P&L
 * histogram.
 *
 * Bucketed by CHART position rather than by real time, for the same reason
 * downsample() is: the time axis squeezes dead air, and bucketing by clock time
 * would hand a ten-hour overnight gap two hundred bars to share between four
 * pixels. (Those bars are all zero anyway — a gap is by definition a stretch in
 * which nothing ticked — but they would still crowd out the evening.)
 *
 * A bucket containing no points inherits the previous bucket's level, so its
 * change is zero. That is the honest reading of "nothing happened here", and it
 * is why the bars are computed from carried levels rather than from whatever
 * points happen to fall inside each slot.
 *
 * The first bucket measures from `points[0]`, which callers make the carry-in
 * sample at the window start — so the bars sum to exactly the change across the
 * window, with nothing falling down the gap at the left edge.
 */
export function bucketChanges(points, toChart, total, count) {
  if (points.length < 2 || count < 1) return [];

  const width = (total || 1) / count;
  const ends = new Array(count).fill(null);
  for (const p of points) {
    const i = Math.min(count - 1, Math.max(0, Math.floor(toChart(p.t) / width)));
    ends[i] = p.v;
  }

  const out = [];
  let prev = points[0].v;
  for (let i = 0; i < count; i++) {
    const end = ends[i] === null ? prev : ends[i];
    out.push({ i, ca: i * width, cb: (i + 1) * width, delta: end - prev });
    prev = end;
  }
  return out;
}

/** Evenly spaced axis values across a domain. */
export function niceTicks(lo, hi, count = 5) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(lo + ((hi - lo) * i) / (count - 1));
  return out;
}

/**
 * The vertical domain for a set of series.
 *
 * In percentage mode it always contains zero and spans at least ±5, so a quiet
 * market is not amplified into fake drama by autoscaling to a 0.3% wobble.
 */
export function yDomain(series, yMode) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }

  if (yMode === "pct") {
    lo = Math.min(lo, -5);
    hi = Math.max(hi, 5);
  }
  const span = hi - lo || 1;
  const padded = { lo: lo - span * 0.08, hi: hi + span * 0.08 };

  // A price cannot be negative, and after a crash to `min_price` the padding
  // would otherwise put a "-30.9k ⌀" label on the axis. Percentages have no
  // such floor — a stock genuinely can be down 60%.
  if (yMode !== "pct") padded.lo = Math.max(0, padded.lo);
  return padded;
}

/**
 * Spread right-edge labels so two stocks at the same price do not overprint:
 * push down through the list, then back up off the floor.
 * Mutates nothing — returns `[{ key, y }]` in input order.
 */
export function spreadLabels(entries, { top, bottom, gap = 15 }) {
  const sorted = entries.map((e) => ({ ...e })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y < gap) sorted[i].y = sorted[i - 1].y + gap;
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].y > bottom) sorted[i].y = bottom;
    if (i > 0 && sorted[i].y - sorted[i - 1].y < gap) sorted[i - 1].y = sorted[i].y - gap;
  }
  for (const e of sorted) if (e.y < top) e.y = top;
  return sorted;
}
