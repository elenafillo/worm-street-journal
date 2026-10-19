import { useEffect, useRef, useState } from "react";

// ============================================================
// usePixelCanvas — a low-resolution canvas and its redraw loop
// ============================================================
// Shared by every pixel renderer on #ticker (the chart, and the bars and big
// numbers of random mode), so each of them is only a `draw` function.
//
// It owns two things:
//
//   the buffer  sized in DEVICE pixels, with each canvas pixel a whole number
//               of them. On a 125%-scaled Windows screen a naive 4 CSS px is 5
//               device px, fine; but 3 CSS px is 3.75, and nearest-neighbour
//               scaling then draws some columns wider than others — the grid
//               visibly shimmers.
//   the loop    one requestAnimationFrame loop that redraws only when the
//               inputs change, the cursor blinks, or `animating(now)` says a
//               draw-in is under way. A canvas this small is cheap, but a wall
//               screen runs for three days.

export const BLINK_MS = 530;

/** No scale given: as chunky as the space allows while keeping the canvas a
 *  couple of hundred pixels wide — 4× on a wall, 2× on a phone. */
export function autoScale(cssWidth) {
  return Math.min(4, Math.max(2, Math.floor(cssWidth / 260)));
}

/**
 * @param scale      CSS pixels per canvas pixel, or null to pick from the width
 * @param inputs     everything `draw` reads; pass a new object when it changes
 * @param draw       (ctx, inputs, { box, now, blink }) => void
 * @param animating  optional (now) => bool — keep redrawing every frame
 * @param minW,minH  below this many canvas pixels, draw nothing
 * @returns { wrapRef, canvasRef, canvasStyle }
 */
export function usePixelCanvas({ scale = null, inputs, draw, animating, minW = 40, minH = 30 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0, dev: 1, dpr: 1 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      const dev = Math.max(1, Math.round((scale ?? autoScale(width)) * dpr));
      const w = Math.floor((width * dpr) / dev);
      const h = Math.floor((height * dpr) / dev);
      setBox((b) => (b.w === w && b.h === h && b.dev === dev && b.dpr === dpr ? b : { w, h, dev, dpr }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale]);

  // The latest of everything, read by the loop without restarting it.
  const frame = useRef(null);
  useEffect(() => {
    frame.current = { inputs, draw, animating, box };
  }, [inputs, draw, animating, box]);

  useEffect(() => {
    let raf = 0;
    let lastBlink = -1;
    let lastFrame = null;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const f = frame.current;
      const canvas = canvasRef.current;
      if (!f || !canvas || f.box.w < minW || f.box.h < minH) return;

      const now = performance.now();
      const blink = Math.floor(now / BLINK_MS) % 2;
      const busy = f.animating ? f.animating(now) : false;
      if (!busy && blink === lastBlink && lastFrame === f) return;
      lastBlink = blink;
      lastFrame = f;

      if (canvas.width !== f.box.w) canvas.width = f.box.w;
      if (canvas.height !== f.box.h) canvas.height = f.box.h;
      f.draw(canvas.getContext("2d"), f.inputs, { box: f.box, now, blink });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [minW, minH]);

  const canvasStyle = {
    width: `${(box.w * box.dev) / box.dpr}px`,
    height: `${(box.h * box.dev) / box.dpr}px`,
  };
  return { wrapRef, canvasRef, canvasStyle };
}
