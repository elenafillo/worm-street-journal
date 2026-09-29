import { OPEN_MS, CLOSE_MS } from "./popScheduler.js";

// ============================================================
// PopWindow — one window of random mode
// ============================================================
// A pixel-bordered frame with an inverse-video title bar, placed absolutely at
// the rectangle the scheduler chose. It unfolds from its centre when it
// mounts, and switches off like a CRT — to a line, then a dot — when the
// scheduler marks it closing. Both are chunky `steps()` animations in CSS
// (tickerStyles.js, `rnd-`); the durations come from the scheduler so the two
// can never disagree about when a window has gone.
//
// The close box is decoration: nothing on this screen is clickable.

export default function PopWindow({ win, meta, children }) {
  const cls = ["rnd-win", win.summoned ? "summoned" : "", win.closingAt ? "closing" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      style={{
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.z,
        "--rnd-open": `${OPEN_MS}ms`,
        "--rnd-close": `${CLOSE_MS}ms`,
      }}
    >
      <div className="rnd-title">
        <span className="rnd-title-name">{win.title}</span>
        {meta && <span className="rnd-title-meta">{meta}</span>}
        <span className="rnd-title-box" aria-hidden="true">■</span>
      </div>
      <div className="rnd-body">{children}</div>
    </div>
  );
}
