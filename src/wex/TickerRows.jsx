import { useEffect, useRef, useState } from "react";
import { formatWormcoin, hm } from "./format.js";

// ============================================================
// Tape rows and headlines — shared by the fixed ticker and random mode
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

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * When the event was announced, as a little LED clock: unlit "88:88"
 * segments behind the lit digits, and a blinking colon. An event from an
 * earlier day says which, underneath — "22:14" alone would claim tonight.
 */
function AnnouncedClock({ t }) {
  const d = new Date(t);
  const [h, m] = hm(t).split(":");
  const today = d.toDateString() === new Date().toDateString();
  return (
    <span className="rnd-clock" aria-label={`Announced at ${h}:${m}`}>
      <span className="rnd-clock-face">
        <span className="rnd-clock-ghost" aria-hidden="true">88:88</span>
        <span className="rnd-clock-time">
          {h}<span className="rnd-clock-colon">:</span>{m}
        </span>
      </span>
      {!today && <span className="rnd-clock-date">{`${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`}</span>}
    </span>
  );
}

/**
 * One market event, big: the NEWS window of random mode, and the news flash
 * on the fixed ticker. Sized to its window by container units (tickerStyles).
 */
export function HeadlineBody({ event, byId }) {
  if (!event) return null;
  const ticker = event.company_id ? byId.get(event.company_id)?.ticker || "?" : "MARKET";
  const pct = Number(event.pct_change);
  const t = event.t ?? new Date(event.created_at).getTime();
  return (
    <div className="rnd-headline">
      <div className="rnd-kicker">
        <span className="tkr-tag news">NEWS</span>
        <span>{ticker}</span>
        <Move pct={Number.isFinite(pct) && pct !== 0 ? pct : null} />
        <AnnouncedClock t={t} />
      </div>
      <div className="rnd-hl">{String(event.headline || "").toUpperCase()}</div>
    </div>
  );
}
