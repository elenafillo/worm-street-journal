import { useEffect, useMemo, useRef, useState } from "react";
import { useMarketData } from "./useMarketData.js";
import PixelChart from "./PixelChart.jsx";
import { PixelSparks, PixelBars, PixelNumber } from "./PixelKinds.jsx";
import PopWindow from "./PopWindow.jsx";
import { FeedRow, HeadlineBody } from "./TickerRows.jsx";
import { buildFeed } from "./tickerFeed.js";
import { initialState, step, makeRng, revealMs, KINDS } from "./popScheduler.js";
import { hashParams, numberParam } from "./hashParams.js";
import { hms } from "./format.js";

// ============================================================
// #ticker?mode=random — the exchange as a busy 1985 desktop
// ============================================================
// Its own screen, random all the time. Pixel windows open over a black field,
// each with one readable view of the market, stay a while, and switch off.
// Most are ambient; a new headline or a big trade SUMMONS its own, on top.
// What opens, where and when is popScheduler.js — pure, and simulated there.
//
// Link params, all optional:
//   speed  tempo multiplier, 0.25–4        (default 1 — 2 is twice as frantic)
//   max    most windows open at once, 1–8  (default 5; a phone is capped at 3)
//   seed   a number: the same seed gives the same sequence of windows
//   only   one kind, for looking at it:  line trio sparks bars big headline tape
//   y      abs = share price (default) · pct = percent vs open, for the charts
//   px     screen pixels per canvas pixel  (default 4 on a wall, 2 on a phone)
//
// Load: exactly the fixed ticker's. One useMarketData() for the page, without
// the standings polls; windows never fetch anything of their own.

const STEP_MS = 250;

// One colour per LINE window, cycled by window id. Not green or red — here too
// those mean up and down only.
const LINE_COLORS = [["#00e5ff"], ["#ff3df2"], ["#ffe600"]];
const TRIO_COLORS = ["#00e5ff", "#ff3df2", "#ffe600"];

const hoursLabel = (h) => (h < 1 ? `${Math.round(h * 60)}M` : `${h}H`);

function ChartBody({ ids, byId, colors, ticks, now, hours, scale, yMode, speed }) {
  const cos = useMemo(() => ids.map((id) => byId.get(id)).filter(Boolean), [ids, byId]);
  return (
    <PixelChart
      companies={cos}
      colors={colors}
      ticks={ticks}
      t0={now - hours * 3_600_000}
      t1={now}
      scale={scale}
      yMode={yMode}
      revealMs={revealMs(speed)}
    />
  );
}

function WindowBody({ win, data, now, scale, yMode, speed }) {
  const { byId, companies, ticks, events, feed } = data;
  switch (win.kind) {
    case "line":
      return (
        <ChartBody ids={win.companyIds} byId={byId} colors={LINE_COLORS[win.id % 3]} ticks={ticks}
          now={now} hours={win.hours} scale={scale} yMode={yMode} speed={speed} />
      );
    case "trio":
      return (
        <ChartBody ids={win.companyIds} byId={byId} colors={TRIO_COLORS} ticks={ticks}
          now={now} hours={win.hours} scale={scale} yMode={yMode} speed={speed} />
      );
    case "sparks":
      return <PixelSparks companies={companies} ticks={ticks} t0={now - win.hours * 3_600_000} t1={now} scale={scale} />;
    case "bars":
      return <PixelBars companies={companies} scale={scale} />;
    case "big":
      return <PixelNumber company={byId.get(win.companyIds[0])} scale={scale} />;
    case "headline":
      return <HeadlineBody event={events.find((e) => e.id === win.eventId) || events[0]} byId={byId} />;
    case "tape":
      return (
        <ul className="rnd-tape">
          {feed.slice(0, 7).map((row) => <FeedRow key={row.key} row={row} />)}
        </ul>
      );
    default:
      return null;
  }
}

export default function TickerRandom() {
  const { companies, market, ticks, events, tape, loaded, error } = useMarketData({ slow: false });

  const params = useMemo(() => hashParams(), []);
  const speed = numberParam(params, "speed", 1, 0.25, 4);
  const maxParam = Math.round(numberParam(params, "max", 5, 1, 8));
  const only = KINDS[params.get("only")] ? params.get("only") : null;
  const yMode = params.get("y") === "pct" ? "pct" : "abs";
  const pxParam = params.has("px") ? numberParam(params, "px", 4, 1, 12) : null;
  const [rng] = useState(() =>
    makeRng(params.has("seed") ? Number(params.get("seed")) : Date.now() % 2_147_483_647)
  );

  // The field's size is the scheduler's viewport.
  const fieldRef = useRef(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      setViewport({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Chunkiness follows the SHORTER side: a sideways phone is wide but only
  // ~390px tall, and at 4× its windows had room for a few pixel rows each.
  const small = viewport.w > 0 && (viewport.w < 768 || viewport.h < 500);
  const scale = pxParam ?? (small ? 2 : 4);
  // Windows snap to this, so every window's canvas pixels share one grid.
  const grid = scale * 8;
  const max = small ? Math.min(3, maxParam) : maxParam;

  // One clock for every chart's right edge and the status bar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- the scheduler ------------------------------------------------------
  // The ref is the source of truth and the state is its mirror for rendering.
  // step() advances `rng`, so it must run exactly once per tick — never inside
  // a state updater, which React may call twice.
  const env = useMemo(
    () => ({ viewport, grid, speed, max, only, companies, events, tape }),
    [viewport, grid, speed, max, only, companies, events, tape]
  );
  const envRef = useRef(env);
  useEffect(() => {
    envRef.current = env;
  }, [env]);

  const schedRef = useRef(null);
  const [sched, setSched] = useState(initialState);
  useEffect(() => {
    const id = setInterval(() => {
      const e = envRef.current;
      if (!e.viewport.w || document.visibilityState !== "visible") return;
      schedRef.current = step(schedRef.current ?? initialState(), Date.now(), e, rng);
      setSched(schedRef.current);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [rng]);

  // ---- what the windows read ------------------------------------------------
  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const feed = useMemo(
    () => buildFeed({ tape, ticks, events, companies, limit: 12 }),
    [tape, ticks, events, companies]
  );
  const data = useMemo(
    () => ({ byId, companies, ticks, events, feed }),
    [byId, companies, ticks, events, feed]
  );

  const status = !loaded ? "wait" : market.is_open ? "open" : "closed";
  const statusText = { wait: "CONNECTING", open: "MARKET OPEN", closed: "MARKET CLOSED" }[status];

  return (
    <div className="tkr rnd">
      <div className="rnd-field" ref={fieldRef} style={{ "--rnd-grid": `${grid}px`, "--rnd-px": `${scale}px` }}>
        {sched.windows.map((w) => (
          <PopWindow key={w.id} win={w} meta={w.kind === "line" || w.kind === "sparks" ? hoursLabel(w.hours) : null}>
            <WindowBody win={w} data={data} now={now} scale={scale} yMode={yMode} speed={speed} />
          </PopWindow>
        ))}
      </div>
      <footer className="rnd-status">
        <span className="rnd-status-name">&gt; WORM STREET EXCHANGE · RANDOM ACCESS</span>
        <span className={`tkr-status ${status}`}>{statusText}</span>
        {error && <span className="tkr-status lost">SIGNAL LOST</span>}
        {speed !== 1 && <span>SPEED {speed}×</span>}
        <span className="tkr-clock">
          {hms(now)}<span className="tkr-cursor" aria-hidden="true">█</span>
        </span>
      </footer>
    </div>
  );
}
