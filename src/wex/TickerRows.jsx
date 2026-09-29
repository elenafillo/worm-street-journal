import { useEffect, useRef, useState } from "react";
import { formatWormcoin, hm } from "./format.js";

// ============================================================
// Tape rows — shared by the fixed ticker and random mode's TAPE window
// ============================================================

export function Move({ pct }) {
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
export function Scroller({ children, always = false }) {
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
export function FeedRow({ row }) {
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
