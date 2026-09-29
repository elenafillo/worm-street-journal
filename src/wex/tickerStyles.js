// ============================================================
// #ticker styles — green phosphor on black
// ============================================================
// Everything prefixed `tkr-`, and nothing outside `.tkr` is touched: this is a
// dark screen in an app whose every other page is paper. The chart's own
// colours live in PixelChart.jsx (a canvas does not read CSS), and match these.
//
// Green and red mean up and down and nothing else; the three chart lines are
// cyan, magenta and yellow (TickerDash SLOT_COLORS) so they never read as a
// direction.

export const tickerStyles = `
  .tkr {
    --tkr-bg: #000;
    --tkr-fg: #33ff66;
    --tkr-dim: #1c6b30;
    --tkr-faint: #0d3a18;
    --tkr-text: #d8ffe0;
    --tkr-up: #33ff66;
    --tkr-down: #ff3b3b;
    --tkr-amber: #ffb000;

    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    /* An explicit column: left implicit, it is sized auto and grows to the
       tape's longest nowrap row, pushing everything off a phone screen. */
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.6em;
    padding: 0.8em 1em;
    overflow: hidden;
    background: var(--tkr-bg);
    color: var(--tkr-fg);
    font-family: 'VT323', ui-monospace, monospace;
    font-size: clamp(16px, 1.45vw, 40px);
    line-height: 1.1;
    text-shadow: 0 0 0.3em rgba(51, 255, 102, 0.45);
  }

  /* CRT: scanlines over everything, and a vignette under them. */
  .tkr::before,
  .tkr::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }
  .tkr::before {
    background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.6) 100%);
  }
  .tkr::after {
    background: repeating-linear-gradient(
      to bottom,
      transparent 0 2px,
      rgba(0, 0, 0, 0.3) 2px 3px
    );
  }

  /* ---- header ---------------------------------------------------------- */
  .tkr-head {
    display: flex;
    align-items: baseline;
    gap: 1.2em;
    font-size: 1.35em;
    border-bottom: 2px solid var(--tkr-dim);
    padding-bottom: 0.25em;
  }
  .tkr-title {
    background: var(--tkr-fg);
    color: var(--tkr-bg);
    padding: 0 0.35em;
    text-shadow: none;
    letter-spacing: 0.08em;
  }
  .tkr-status.open { color: var(--tkr-up); }
  .tkr-status.closed { color: var(--tkr-down); }
  .tkr-status.wait,
  .tkr-status.lost { color: var(--tkr-amber); animation: tkr-blink 1.06s steps(1) infinite; }
  .tkr-clock { margin-left: auto; color: var(--tkr-text); font-variant-numeric: tabular-nums; }
  .tkr-cursor { animation: tkr-blink 1.06s steps(1) infinite; margin-left: 0.1em; }

  /* ---- layout ------------------------------------------------------------ */
  .tkr-main {
    display: grid;
    grid-template-columns: minmax(0, 38fr) minmax(0, 62fr);
    gap: 1em;
    min-height: 0;
  }
  .tkr-left {
    display: flex;
    flex-direction: column;
    gap: 1em;
    min-height: 0;
  }
  .tkr-panel {
    border: 2px solid var(--tkr-dim);
    padding: 0.4em 0.6em;
    min-height: 0;
  }
  .tkr-label { color: var(--tkr-dim); margin-bottom: 0.3em; letter-spacing: 0.05em; }
  .tkr-empty { color: var(--tkr-dim); animation: tkr-blink 1.06s steps(1) infinite; }

  /* ---- quotes ---------------------------------------------------------- */
  .tkr-board { list-style: none; margin: 0; padding: 0; font-size: 1.25em; }
  .tkr-quote {
    display: grid;
    grid-template-columns: 0.6em 4.5ch 1fr 7ch;
    align-items: center;
    column-gap: 0.5em;
    padding: 0 0.2em;
    font-variant-numeric: tabular-nums;
    animation: tkr-flash 0.9s steps(1) 1;
  }
  .tkr-swatch { width: 0.6em; height: 0.6em; }
  .tkr-ticker { color: var(--tkr-text); }
  .tkr-price { text-align: right; color: var(--tkr-text); }
  .tkr-quote .tkr-move,
  .tkr-quote .tkr-tag { justify-self: end; }

  /* ---- the tape ------------------------------------------------------------ */
  .tkr-tape { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .tkr-feed {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow: hidden;
    /* Rows fall off the bottom into the dark rather than being cut mid-line. */
    -webkit-mask-image: linear-gradient(to bottom, #000 70%, transparent);
            mask-image: linear-gradient(to bottom, #000 70%, transparent);
  }
  .tkr-feed-row {
    display: flex;
    gap: 0.5em;
    white-space: nowrap;
    overflow: hidden;
    color: var(--tkr-text);
    animation: tkr-in 0.4s steps(4) 1;
  }
  .tkr-feed-row > * { flex: none; }
  .tkr-feed-row.drift { color: var(--tkr-dim); font-size: 0.9em; }
  .tkr-time { color: var(--tkr-dim); }
  .tkr-side.buy { color: var(--tkr-up); }
  .tkr-side.sell { color: var(--tkr-down); }
  .tkr-at { color: var(--tkr-dim); }
  .tkr-headline { color: var(--tkr-amber); }
  .tkr-drift-move { display: inline-flex; gap: 0.15em; }

  /* A row too long for the panel scrolls sideways (Scroller in TickerDash).
     Nothing is truncated: long names and headlines are read in full, in motion. */
  .tkr-feed-row > .tkr-scroll { flex: 1 1 auto; min-width: 0; overflow: hidden; }
  .tkr-scroll-track { display: inline-flex; gap: 4ch; }
  .tkr-scroll-copy { display: inline-flex; gap: 0.5em; flex: none; }
  .tkr-scroll-track.moving {
    /* A beat of stillness first, so the start of the row can be read. */
    animation: tkr-marquee var(--tkr-dur) linear 1.5s infinite;
    /* Its own compositor layer: the glide runs on the GPU, off the main
       thread, so a poll re-rendering the page cannot make it hitch. */
    will-change: transform;
  }
  @keyframes tkr-marquee {
    to { transform: translateX(calc(-1 * var(--tkr-dist))); }
  }

  .tkr-tag { padding: 0 0.3em; text-shadow: none; color: var(--tkr-bg); }
  .tkr-tag.news { background: var(--tkr-amber); animation: tkr-blink 1.06s steps(1) 6; }
  .tkr-tag.fed { background: var(--tkr-text); }
  .tkr-tag.drift { background: var(--tkr-faint); color: var(--tkr-dim); }
  .tkr-tag.halt { background: var(--tkr-down); animation: tkr-blink 1.06s steps(1) infinite; }

  .tkr-move.up { color: var(--tkr-up); }
  .tkr-move.down { color: var(--tkr-down); }
  .tkr-move.flat { color: var(--tkr-dim); }

  /* ---- the chart -------------------------------------------------------- */
  .tkr-right { display: flex; flex-direction: column; }
  .tkr-chart {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .tkr-canvas {
    display: block;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    image-rendering: pixelated;
    /* The phosphor bloom. Blurs the glow, never the pixels themselves. */
    filter: drop-shadow(0 0 3px rgba(120, 255, 170, 0.35));
  }

  /* ---- motion ------------------------------------------------------------ */
  @keyframes tkr-blink { 50% { opacity: 0; } }
  @keyframes tkr-in {
    from { opacity: 0; transform: translateX(-2ch); }
  }
  @keyframes tkr-flash {
    /* A solid block behind the row rather than true inverse video: the
       cells carry their own colours (the swatch, up/down), and inverting
       them all would make the move unreadable for the one second it matters. */
    0% { background: var(--tkr-dim); }
    100% { background: transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    .tkr *, .tkr *::before, .tkr *::after { animation: none !important; }
  }

  /* ---- a phone, or a narrow window: stack, and let it scroll ------------ */
  @media (max-width: 768px) {
    .tkr { overflow-y: auto; grid-template-rows: auto auto; font-size: 16px; padding: 0.8em 16px; }
    .tkr-head { flex-wrap: wrap; row-gap: 0.2em; font-size: 1.1em; }
    .tkr-main { grid-template-columns: minmax(0, 1fr); }
    .tkr-right { order: -1; height: 55vh; }
    .tkr-tape { max-height: 60vh; }
  }
`;
