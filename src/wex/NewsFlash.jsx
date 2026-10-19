import { useEffect, useRef, useState } from "react";
import PopWindow from "./PopWindow.jsx";
import { HeadlineBody } from "./TickerRows.jsx";
import { FLASH_BEATS, FLASH_WINDOW_MS, recentEvents } from "./tickerFeed.js";
import { CLOSE_MS } from "./popScheduler.js";

// ============================================================
// NewsFlash — the fixed ticker's headline pop-up
// ============================================================
// Every `everyMs`, if anything happened in the last three hours (`windowMs`), one event
// pops up in the middle of the screen: three seconds, off, two seconds, gone
// (FLASH_BEATS). Successive flashes walk through the recent events newest
// first, so a busy evening's headlines all get their turn.
//
// A NEW event does not wait for the next slot: it flashes as soon as the poll
// brings it in. The events already there when the page loads are not news —
// they get the first regular flash, a few seconds after load.
//
// The window is random mode's PopWindow, amber like a summoned one, with the
// same unfold and switch-off.

const FIRST_FLASH_MS = 4000;

function flashSize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < 768 || vh < 500;
  const grid = phone ? 16 : 32;
  const snap = (v) => Math.round(v / grid) * grid;
  return {
    grid,
    px: phone ? 2 : 4,
    w: phone ? Math.floor((vw - 2 * grid) / grid) * grid : snap(Math.min(vw * 0.5, 1000)),
    h: snap(Math.min(Math.max(vh * 0.3, 160), 340)),
  };
}

export default function NewsFlash({ events, byId, loaded, everyMs, windowMs = FLASH_WINDOW_MS }) {
  const [show, setShow] = useState(null); // { event, key, closing }
  const [size, setSize] = useState(flashSize);

  useEffect(() => {
    const onResize = () => setSize(flashSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Timers, the running flag and the rotation live in refs: they drive the
  // flash and nothing renders from them.
  const timers = useRef([]);
  const running = useRef(false);
  const turn = useRef(0);
  const eventsRef = useRef(events);
  const windowRef = useRef(windowMs);
  useEffect(() => {
    eventsRef.current = events;
    windowRef.current = windowMs;
  }, [events, windowMs]);

  const run = useRef(null);
  useEffect(() => {
    // Every beat is a timeout, the first included, so nothing sets state
    // synchronously from inside an effect.
    run.current = (event) => {
      if (running.current || !event) return;
      running.current = true;
      const at = (ms, fn) => timers.current.push(setTimeout(fn, ms));
      FLASH_BEATS.forEach((beat, i) => {
        at(beat.at, () =>
          setShow(beat.open
            ? { event, key: `${event.id}:${Date.now()}:${i}`, closing: false }
            : (s) => (s ? { ...s, closing: true } : s))
        );
      });
      const end = FLASH_BEATS[FLASH_BEATS.length - 1].at + CLOSE_MS;
      at(end, () => {
        setShow(null);
        running.current = false;
      });
    };
  }, []);

  const flashNext = () => {
    const recent = recentEvents(eventsRef.current, Date.now(), windowRef.current);
    if (!recent.length) return;
    run.current?.(recent[turn.current++ % recent.length]);
  };

  // The regular flash.
  useEffect(() => {
    if (!everyMs) return;
    const id = setInterval(flashNext, everyMs);
    return () => clearInterval(id);
  }, [everyMs]);

  // A new event flashes at once. The first time the data is in, everything
  // present is recorded as seen, and the first regular flash is brought
  // forward so a freshly loaded screen does not sit silent for minutes.
  const seen = useRef(null);
  useEffect(() => {
    if (!loaded || !everyMs) return;
    if (seen.current === null) {
      seen.current = new Set(events.map((e) => e.id));
      timers.current.push(setTimeout(flashNext, FIRST_FLASH_MS));
      return;
    }
    const fresh = events.filter((e) => !seen.current.has(e.id));
    for (const e of events) seen.current.add(e.id);
    if (fresh.length) {
      const newest = recentEvents(fresh, Date.now())[0];
      if (newest) run.current?.(newest);
    }
  }, [events, loaded, everyMs]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!show) return null;
  const win = {
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    z: 1,
    summoned: true,
    closingAt: show.closing ? 1 : null,
    title: "NEWS.TXT",
  };
  return (
    <div className="tkr-flash" style={{ "--rnd-grid": `${size.grid}px`, "--rnd-px": `${size.px}px` }}>
      <div className="tkr-flash-box" style={{ width: size.w, height: size.h }}>
        <PopWindow key={show.key} win={win}>
          <HeadlineBody event={show.event} byId={byId} />
        </PopWindow>
      </div>
    </div>
  );
}
