import { useEffect, useMemo, useRef, useState } from "react";
import { useMarketData } from "./useMarketData.js";
import PixelChart from "./PixelChart.jsx";
import TickerRandom from "./TickerRandom.jsx";
import NewsFlash from "./NewsFlash.jsx";
import { buildFeed, pickSlots, nextSlots, repairSlots } from "./tickerFeed.js";
import { formatWormcoin, pctChange, hms } from "./format.js";
import { Move, FeedRow } from "./TickerRows.jsx";
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
// Random mode is its own screen: #ticker?mode=random (TickerRandom.jsx).
//
// Link params, all optional:  #ticker?rotate=90&px=4&hours=6&y=abs
//   rotate  seconds between swaps           (default 90)
//   px      screen pixels per chart pixel   (default: 4 on a wall, 2 on a
//           phone — bigger is chunkier)
//   hours   width of the chart window       (default 6)
//   y       abs = share price in ⌀ (default) · pct = percent vs open
//   news    minutes between headline flashes (default 3; 0 turns them off).
//           Any market event from the last three hours pops up mid-screen:
//           three seconds, off, two seconds. A new one flashes at once.
//   newsage hours back an event still counts as news (default 3)
//
// Same data as #wex, from the same hook: anon-readable tables only.

// The three chart lines. Deliberately NOT green or red — on this screen those
// mean up and down and nothing else.
const SLOT_COLORS = ["#00e5ff", "#ff3df2", "#ffe600"];

/**
 * #ticker, or #ticker?mode=random. Read once at mount, like every other link
 * param on the wall screens: change the link, reload the page.
 */
export default function Ticker() {
  const [mode] = useState(() => hashParams().get("mode"));
  return mode === "random" ? <TickerRandom /> : <TickerFixed />;
}

function TickerFixed() {
  const { companies, market, ticks, events, tape, loaded, error } = useMarketData({ slow: false });

  const params = useMemo(() => hashParams(), []);
  const rotateMs = numberParam(params, "rotate", 90, 5, 3600) * 1000;
  const scale = params.has("px") ? numberParam(params, "px", 4, 1, 12) : null; // null = fit
  const hours = numberParam(params, "hours", 6, 0.25, 72);
  // Share price by default; `?y=pct` brings back the percent-vs-open chart.
  const yMode = params.get("y") === "pct" ? "pct" : "abs";
  const newsMs = numberParam(params, "news", 3, 0, 60) * 60_000;
  const newsAgeMs = numberParam(params, "newsage", 3, 0.1, 24 * 365) * 3_600_000;

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

      <NewsFlash events={events} byId={byId} loaded={loaded} everyMs={newsMs} windowMs={newsAgeMs} />
    </div>
  );
}
