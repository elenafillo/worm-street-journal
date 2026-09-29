import { useEffect, useMemo, useRef, useState } from "react";
import { useMarketData } from "./useMarketData.js";
import PixelChart from "./PixelChart.jsx";
import { buildFeed, pickSlots, nextSlots, repairSlots } from "./tickerFeed.js";
import { formatWormcoin, pctChange } from "./format.js";
import { hashParams, numberParam } from "./hashParams.js";

// ============================================================
// #ticker — the exchange as an 80s trading terminal
// ============================================================
// A third wall screen beside #wex (the dashboard) and #board (the planned
// price board): black, green, pixelated. Nothing to click, so it is off the
// nav and draws no nav bar — point a projector at it and walk away.
//
//   left   every listed company's price, then the tape: trades, the Fed's
//          headlines and price sets, and the drift, newest first
//   right  a 6-hour chart of three companies. Every `rotate` seconds one of
//          them is swapped for a company not on screen, one slot at a time,
//          so each company keeps its colour for as long as it is up
//
// Link params, all optional:  #ticker?rotate=90&px=4&hours=6&y=abs
//   rotate  seconds between swaps           (default 90)
//   px      screen pixels per chart pixel   (default: 4 on a wall, 2 on a
//           phone — bigger is chunkier)
//   hours   width of the chart window       (default 6)
//   y       abs = share price in ⌀ (default) · pct = percent vs open
//
// Same data as #wex, from the same hook: anon-readable tables only.

// The three chart lines. Deliberately NOT green or red — on this screen those
// mean up and down and nothing else.
const SLOT_COLORS = ["#00e5ff", "#ff3df2", "#ffe600"];

const pad2 = (n) => String(n).padStart(2, "0");
const hm = (t) => {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const hms = (t) => `${hm(t)}:${pad2(new Date(t).getSeconds())}`;

function Move({ pct }) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.05) return <span className="tkr-move flat">0.0%</span>;
  return (
    <span className={`tkr-move ${pct > 0 ? "up" : "down"}`}>
      {pct > 0 ? "▲" : "▼"}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// Marquee speed for scrolling tape rows. A smooth glide, not stepped: 3px
// jumps at this speed were only ~12 a second — read as stutter, not as retro —
// and on a 125%-scaled screen each jump landed on a different device pixel.
const SCROLL_PX_PER_S = 45;

/**
 * Its children on one line — scrolling sideways, forever, if they do not fit.
 *
 * A row that fits stays still; only an overflowing one moves, so a quiet tape
 * is calm and the eye goes to the rows with more to say. `always` scrolls it
 * regardless — the drift rows, which are the weather: always moving. The content is drawn
 * twice, one gap apart, and the pair slides left by exactly one copy and a gap:
 * the second copy lands where the first began, and the loop has no seam.
 *
 * Measured with a ResizeObserver, which also fires once on observe — so a row
 * starts scrolling as soon as it mounts, and stops if the window widens.
 */
function Scroller({ children, always = false }) {
  const outer = useRef(null);
  const track = useRef(null);
  const copy = useRef(null);
  const [dist, setDist] = useState(0);

  useEffect(() => {
    const o = outer.current;
    const c = copy.current;
    if (!o || !c) return;
    const ro = new ResizeObserver(() => {
      if (!always && c.offsetWidth <= o.clientWidth + 1) { setDist(0); return; }
      const gap = parseFloat(getComputedStyle(track.current).columnGap) || 0;
      setDist(Math.round(c.offsetWidth + gap));
    });
    ro.observe(o);
    ro.observe(c);
    return () => ro.disconnect();
  }, [always]);

  const style = dist
    ? {
        "--tkr-dist": `${dist}px`,
        "--tkr-dur": `${(dist / SCROLL_PX_PER_S).toFixed(2)}s`,
      }
    : undefined;

  return (
    <span className="tkr-scroll" ref={outer}>
      <span className={`tkr-scroll-track${dist ? " moving" : ""}`} ref={track} style={style}>
        <span className="tkr-scroll-copy" ref={copy}>{children}</span>
        {dist > 0 && <span className="tkr-scroll-copy" aria-hidden="true">{children}</span>}
      </span>
    </span>
  );
}

// The time, and the tag saying what kind of row it is, stay put; the rest
// scrolls if it has to.
function FeedRow({ row }) {
  const time = <span className="tkr-time">{hm(row.t)}</span>;
  switch (row.kind) {
    case "trade":
      return (
        <li className="tkr-feed-row">
          {time}
          <Scroller>
            <span className="tkr-who">{String(row.who).toUpperCase()}</span>
            <span className={`tkr-side ${row.side}`}>{row.side === "buy" ? "BUY" : "SELL"}</span>
            <span className="tkr-what">{row.shares} {row.ticker}</span>
            <span className="tkr-at">@{formatWormcoin(row.price)}</span>
            <Move pct={row.pct} />
          </Scroller>
        </li>
      );
    case "news":
      return (
        <li className="tkr-feed-row news">
          {time}
          <span className="tkr-tag news">NEWS</span>
          <Scroller>
            <span className="tkr-what">{row.ticker}</span>
            <Move pct={row.pct} />
            <span className="tkr-headline">{String(row.headline || "").toUpperCase()}</span>
          </Scroller>
        </li>
      );
    case "set":
      return (
        <li className="tkr-feed-row">
          {time}
          <span className="tkr-tag fed">FED</span>
          <Scroller>
            <span className="tkr-what">{row.ticker} → {formatWormcoin(row.price)}</span>
            <Move pct={row.pct} />
          </Scroller>
        </li>
      );
    case "drift":
      return (
        <li className="tkr-feed-row drift">
          {time}
          <span className="tkr-tag drift">DRIFT</span>
          <Scroller always>
            {row.moves.map((m) => (
              <span key={m.ticker} className="tkr-drift-move">
                {m.ticker}<Move pct={m.pct} />
              </span>
            ))}
          </Scroller>
        </li>
      );
    default:
      return null;
  }
}

export default function TickerDash() {
  const { companies, market, ticks, events, tape, loaded, error } = useMarketData();

  const params = useMemo(() => hashParams(), []);
  const rotateMs = numberParam(params, "rotate", 90, 5, 3600) * 1000;
  const scale = params.has("px") ? numberParam(params, "px", 4, 1, 12) : null; // null = fit
  const hours = numberParam(params, "hours", 6, 0.25, 72);
  // Share price by default; `?y=pct` brings back the percent-vs-open chart.
  const yMode = params.get("y") === "pct" ? "pct" : "abs";

  // One clock for the header and the right edge of the chart.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- the three chart slots ---------------------------------------------
  const pool = useMemo(() => companies.map((c) => c.id), [companies]);
  const poolRef = useRef(pool);
  const [slots, setSlots] = useState({ ids: [], next: 0 });

  // Fill the slots on first load, and mend them if a company is delisted —
  // adjusted during render, React's pattern for state that follows a prop.
  // repairSlots hands back the same object when nothing changed, so on the
  // three-second poll this is a no-op and never loops.
  if (pool.length) {
    const mended = slots.ids.length ? repairSlots(slots, pool) : pickSlots(pool);
    if (mended !== slots) setSlots(mended);
  }
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  // The rotation reads the pool from a ref: with `pool` as a dependency the
  // interval would restart on every poll and, at anything over three seconds,
  // never fire.
  useEffect(() => {
    const id = setInterval(() => setSlots((s) => nextSlots(s, poolRef.current)), rotateMs);
    return () => clearInterval(id);
  }, [rotateMs]);

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const onChart = slots.ids
    .map((id, i) => ({ company: byId.get(id), color: SLOT_COLORS[i % SLOT_COLORS.length] }))
    .filter((x) => x.company);
  const chartCompanies = onChart.map((x) => x.company);
  const chartColors = onChart.map((x) => x.color);
  const colorOnChart = new Map(onChart.map((x) => [x.company.id, x.color]));

  const feed = useMemo(
    () => buildFeed({ tape, ticks, events, companies }),
    [tape, ticks, events, companies]
  );

  const status = !loaded ? "wait" : market.is_open ? "open" : "closed";
  const statusText = { wait: "CONNECTING", open: "MARKET OPEN", closed: "MARKET CLOSED" }[status];

  return (
    <div className="tkr">
      <header className="tkr-head">
        <span className="tkr-title">WORM STREET EXCHANGE</span>
        <span className={`tkr-status ${status}`}>{statusText}</span>
        {error && <span className="tkr-status lost">SIGNAL LOST</span>}
        <span className="tkr-clock">
          {hms(now)}<span className="tkr-cursor" aria-hidden="true">█</span>
        </span>
      </header>

      <main className="tkr-main">
        <section className="tkr-left">
          <div className="tkr-panel tkr-quotes">
            <div className="tkr-label">&gt; QUOTES</div>
            <ul className="tkr-board">
              {companies.map((c) => {
                const swatch = colorOnChart.get(c.id);
                return (
                  <li key={c.id}>
                    {/* Keyed on the price: a new price remounts the row, and
                        remounting replays the inverse-video flash. */}
                    <div key={String(c.price)} className="tkr-quote">
                      <span className="tkr-swatch" style={swatch ? { background: swatch } : undefined} />
                      <span className="tkr-ticker" style={swatch ? { color: swatch } : undefined}>
                        {c.ticker}
                      </span>
                      <span className="tkr-price">{formatWormcoin(c.price)}</span>
                      {c.is_halted
                        ? <span className="tkr-tag halt">HALT</span>
                        : <Move pct={pctChange(c.price, c.open_price)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="tkr-panel tkr-tape">
            <div className="tkr-label">&gt; TAPE</div>
            {loaded && !feed.length && <div className="tkr-empty">NO TRADES YET_</div>}
            <ul className="tkr-feed">
              {feed.map((row) => <FeedRow key={row.key} row={row} />)}
            </ul>
          </div>
        </section>

        <section className="tkr-panel tkr-right">
          <div className="tkr-label">
            &gt; LAST {hours}H · {yMode === "abs" ? "SHARE PRICE ⌀" : "% VS OPEN"}
          </div>
          <PixelChart
            companies={chartCompanies}
            colors={chartColors}
            ticks={ticks}
            t0={now - hours * 3_600_000}
            t1={now}
            scale={scale}
            yMode={yMode}
          />
        </section>
      </main>
    </div>
  );
}
