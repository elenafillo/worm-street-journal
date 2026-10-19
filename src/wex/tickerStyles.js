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

  /* ---- the news flash (NewsFlash) ----------------------------------------
     A random-mode window in the middle of the screen: over the panels, under
     the scanlines (z-index 2 on .tkr::after), and never in the way of a click. */
  .tkr-flash {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .tkr-flash-box { position: relative; }

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
  /* ---- a phone, either way up, or any small window: stack and scroll ----
     Chart, then quotes, then the tape. Landscape counts: a sideways phone is
     wider than 768px but only ~390px tall, and the two-column wall layout
     squeezed the tape to nothing. */
  @media (max-width: 768px), (max-height: 500px) {
    .tkr { overflow-y: auto; grid-template-rows: auto auto; font-size: 16px; padding: 0.8em 16px; }
    .tkr-head { flex-wrap: wrap; row-gap: 0.2em; font-size: 1.1em; }
    .tkr-main { grid-template-columns: minmax(0, 1fr); }
    .tkr-right { order: -1; height: 55vh; }
    /* A real height, not a leftover: as the flexible last panel of a page
       that scrolls, it was otherwise given whatever was left — about two rows. */
    .tkr-tape { flex: none; height: 70vh; }
    /* On the wall every panel may shrink to fit one screen; here the page
       scrolls instead, so nothing should — the quotes were crushed to 17px. */
    .tkr-main, .tkr-left, .tkr-quotes { min-height: auto; flex-shrink: 0; }
  }
  @media (max-height: 500px) {
    .tkr-right { height: 85vh; }
  }

  /* ======================================================================
     Random mode (#ticker?mode=random) — TickerRandom, PopWindow
     ======================================================================
     --rnd-grid  the snap grid the scheduler places windows on (8 canvas px)
     --rnd-px    one canvas pixel, in CSS px — borders are exactly one      */
  .tkr.rnd {
    grid-template-rows: minmax(0, 1fr) auto;
    padding: 0;
    gap: 0;
  }
  .rnd-field {
    position: relative;
    overflow: hidden;
    /* Its own stacking context, under the scanlines (z-index 2 on .tkr::after)
       however high a window's z climbs. */
    z-index: 1;
    isolation: isolate;
    /* A faint dot at every grid crossing: the board the windows snap to. */
    background-image: radial-gradient(circle, var(--tkr-faint) 1.5px, transparent 2px);
    background-size: var(--rnd-grid) var(--rnd-grid);
    background-position: calc(var(--rnd-grid) / -2) calc(var(--rnd-grid) / -2);
  }

  .rnd-win {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background: var(--tkr-bg);
    border: var(--rnd-px) solid var(--tkr-dim);
    /* A hard pixel drop shadow, two steps deep — no blur anywhere. */
    box-shadow:
      var(--rnd-px) var(--rnd-px) 0 0 #000,
      calc(var(--rnd-px) * 2) calc(var(--rnd-px) * 2) 0 0 var(--tkr-faint);
    /* \`backwards\`, not \`both\`: once open, the clip-path must go, or it would
       clip the drop shadow for the window's whole life. */
    animation: rnd-open var(--rnd-open) steps(6) backwards;
  }
  .rnd-win.closing { animation: rnd-close var(--rnd-close) forwards; }
  .rnd-win.summoned { border-color: var(--tkr-amber); }

  /* A striped title bar with the name knocked out in a black box, like a
     1984 desktop. Exactly one grid cell tall with the border, so the body —
     and its canvas — starts on the grid. */
  .rnd-title {
    flex: none;
    height: calc(var(--rnd-grid) - var(--rnd-px));
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0 0.4em;
    overflow: hidden;
    white-space: nowrap;
    font-size: calc(var(--rnd-grid) * 0.7);
    line-height: 1;
    text-shadow: none;
    background: repeating-linear-gradient(
      to bottom,
      var(--tkr-dim) 0 var(--rnd-px),
      transparent var(--rnd-px) calc(var(--rnd-px) * 2)
    );
  }
  .rnd-title-name,
  .rnd-title-meta {
    background: var(--tkr-bg);
    color: var(--tkr-fg);
    padding: 0 0.35em;
  }
  .rnd-title-meta { color: var(--tkr-dim); }
  .rnd-title-box { margin-left: auto; color: var(--tkr-dim); background: var(--tkr-bg); padding: 0 0.2em; }
  .rnd-win.summoned .rnd-title {
    background: repeating-linear-gradient(
      to bottom,
      var(--tkr-amber) 0 var(--rnd-px),
      transparent var(--rnd-px) calc(var(--rnd-px) * 2)
    );
  }
  .rnd-win.summoned .rnd-title-name {
    color: var(--tkr-amber);
    animation: tkr-blink 1.06s steps(1) 4;
  }

  .rnd-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* The DOM windows size their text to the window, not the screen. */
    container-type: size;
  }

  /* HEADLINE */
  .rnd-headline {
    padding: 0.25em 0.5em;
    color: var(--tkr-amber);
    /* Sized by BOTH axes: by height alone, a long headline in a narrow
       window wrapped to a third line and lost it off the bottom. */
    font-size: clamp(14px, min(26cqh, 8cqw), 72px);
    line-height: 0.95;
    overflow: hidden;
  }
  /* A phone-width window: smaller type, so a long headline wraps onto more
     lines instead of running off the bottom. */
  @container (max-width: 480px) {
    .rnd-headline { font-size: clamp(13px, min(15cqh, 6.5cqw), 40px); line-height: 1.05; }
  }
  .rnd-kicker {
    display: flex;
    flex-wrap: wrap;   /* four moves and the clock do not fit one phone line */
    align-items: center;
    gap: 0.5em;
    font-size: max(11px, 0.45em);
    margin-bottom: 0.15em;
    color: var(--tkr-text);
  }

  .rnd-kicker-move { display: inline-flex; gap: 0.25em; }

  /* The announced-at clock, top right of a headline: an amber LED. */
  .rnd-clock {
    margin-left: auto;
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1em;
    text-shadow: none;
  }
  .rnd-clock-face {
    display: grid;
    padding: 0.05em 0.3em;
    font-size: 1.9em;
    line-height: 1;
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
    color: var(--tkr-amber);
    background: #140c00;
    border: 2px solid #5a3d00;
  }
  /* Lit digits over unlit ones, in the same grid cell. */
  .rnd-clock-ghost,
  .rnd-clock-time { grid-area: 1 / 1; }
  .rnd-clock-ghost { color: rgba(255, 176, 0, 0.12); }
  .rnd-clock-time { text-shadow: 0 0 0.25em rgba(255, 176, 0, 0.8); }
  .rnd-clock-colon { animation: tkr-blink 1.06s steps(1) infinite; }
  .rnd-clock-date { color: #8a6400; letter-spacing: 0.08em; }

  /* TAPE */
  .rnd-tape {
    list-style: none;
    margin: 0;
    padding: 0.3em 0.5em;
    /* Seven rows at 1.1 line-height, plus padding, inside the window. */
    font-size: clamp(11px, 10.5cqh, 32px);
    overflow: hidden;
  }

  .rnd-status {
    position: relative;
    z-index: 3; /* above the vignette, so it reads to the corners */
    display: flex;
    align-items: baseline;
    gap: 1.5em;
    padding: 0.25em 1em 0.35em;
    border-top: 2px solid var(--tkr-dim);
    color: var(--tkr-dim);
    white-space: nowrap;
    overflow: hidden;
  }
  .rnd-status-name { color: var(--tkr-fg); }

  /* Open: unfold from the centre in six chunky steps. */
  @keyframes rnd-open {
    from { clip-path: inset(50% 50% 50% 50%); }
    to   { clip-path: inset(0 0 0 0); }
  }
  /* Close: a CRT switching off — flare, squash to a bright line, then a dot. */
  @keyframes rnd-close {
    0%   { clip-path: inset(0 0 0 0); filter: none; animation-timing-function: steps(3); }
    45%  { clip-path: inset(calc(50% - var(--rnd-px)) 0 calc(50% - var(--rnd-px)) 0);
           filter: brightness(2.5); animation-timing-function: steps(3); }
    80%  { clip-path: inset(calc(50% - var(--rnd-px)) calc(50% - var(--rnd-px)));
           filter: brightness(3); animation-timing-function: steps(1); }
    100% { clip-path: inset(50% 50%); filter: brightness(3); }
  }

  @media (max-width: 768px), (max-height: 500px) {
    .tkr.rnd { overflow: hidden; padding: 0; font-size: 14px; grid-template-rows: minmax(0, 1fr) auto; }
    .rnd-status { gap: 0.8em; padding: 0.25em 16px 0.35em; }
    .rnd-status-name { display: none; }
  }
`;
