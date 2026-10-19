// ============================================================
// #wex dashboard styles
// ============================================================
// Appended after wexStyles, so it inherits --ink / --paper / --rule / --muted
// and the --wex-up / --wex-down-bg tokens defined there.
//
// A PAPER SHEET, not a trading terminal. Same ground as the newspaper, same
// hairline rules: projected side by side, the two panels should read as a front
// page and a market page of one publication, because that is what they are.
//
// FLUID, not a fixed canvas. The broadsheet is a 1200×960 page resized with
// browser zoom; this one scrolls and reflows, because there is more here than
// fits a screen and shrinking it all to fit would make none of it readable.
// Every multi-column block is `auto-fit` + `minmax`, so a narrow desktop window
// and a phone get the same layout logic rather than a separate mobile case.

export const dashStyles = `
  .wexd-root {
    max-width: 1280px;
    margin: 0 auto;
    padding: 18px 16px 64px;
    background: var(--paper);
    color: var(--ink);
    min-height: 100vh;
  }

  /* ---------------- Masthead ---------------- */
  .wexd-masthead {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
    border-bottom: 4px double var(--rule);
    padding-bottom: 12px; margin-bottom: 14px;
  }
  .wexd-title {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 34px; font-weight: 900; line-height: 1;
    text-transform: uppercase; letter-spacing: 1px; margin: 0;
  }
  .wexd-sub {
    font-size: 11px; text-transform: uppercase; letter-spacing: 3px;
    color: var(--muted); margin-top: 6px;
  }
  .wexd-masthead-right {
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  }
  .wexd-stamp {
    font-size: 12px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; padding: 6px 12px; white-space: nowrap;
  }
  .wexd-drift {
    font-size: 10px; text-transform: uppercase; letter-spacing: 2px;
    color: var(--muted); white-space: nowrap;
  }
  .wexd-how-btn {
    background: none; border: 1px solid var(--rule); cursor: pointer;
    font-family: inherit; font-size: 11px; letter-spacing: 1px;
    padding: 8px 12px; min-height: 40px; color: var(--muted);
    white-space: nowrap;
  }
  .wexd-how-btn:hover { background: var(--paper-dark); color: var(--ink); }
  .wexd-stamp.open { color: var(--wex-up); background: var(--wex-up-bg); }
  .wexd-stamp.closed { color: var(--red); background: var(--wex-down-bg); }

  .wexd-error {
    padding: 10px 12px; margin-bottom: 12px; font-size: 12px;
    border-left: 4px solid var(--red); background: var(--wex-down-bg);
  }

  /* ---------------- Controls ----------------
     One row above everything they scope, never inside a card. */
  .wexd-controls {
    display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;
  }
  .wexd-segmented {
    display: flex; border: 1px solid var(--rule); background: var(--paper-dark);
  }
  .wexd-seg {
    padding: 9px 14px; min-height: 40px;
    font-family: inherit; font-size: 11px; letter-spacing: 1.5px;
    text-transform: uppercase; cursor: pointer; white-space: nowrap;
    background: none; border: none; color: var(--muted);
  }
  .wexd-seg + .wexd-seg { border-left: 1px solid var(--rule); }
  .wexd-seg.active { background: var(--ink); color: var(--paper); }

  /* ---------------- Cards & sections ---------------- */
  .wexd-card {
    border: 1px solid var(--rule); background: var(--paper);
    padding: 14px; margin-bottom: 20px;
  }
  .wexd-section {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 13px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 3px; color: var(--muted);
    border-bottom: 1px solid var(--rule);
    padding-bottom: 6px; margin: 26px 0 14px;
  }
  .wexd-empty { padding: 22px 4px; color: var(--muted); font-size: 13px; text-align: center; }
  .wexd-hint { font-size: 11px; color: var(--muted); margin-top: 10px; line-height: 1.6; }

  /* ---------------- Chart ---------------- */
  .wexd-chart-wrap { position: relative; width: 100%; }
  .wexd-chart { display: block; touch-action: pan-y; }

  /* Solid hairlines. Dashes would read as "threshold" when this is just a grid. */
  .wexd-grid { stroke: var(--rule); stroke-width: 1; opacity: 0.55; }
  .wexd-grid.zero { stroke: var(--muted); opacity: 1; }
  .wexd-axis { font-size: 11px; fill: var(--muted); font-family: inherit; }

  /* 3px, not the usual 2: a thin line on a white sheet loses to projector
     bloom and to whatever downscaling the room does to it. */
  .wexd-line {
    fill: none; stroke-width: 3;
    stroke-linejoin: round; stroke-linecap: round;
  }
  .wexd-line-label {
    font-size: 12px; font-weight: 800; font-family: inherit;
    letter-spacing: 0.5px;
  }

  /* Compressed dead air. Recessive — it is background, not a mark — but never
     invisible: the axis is squeezed there and the reader has to know. */
  .wexd-gap { fill: var(--paper-darker); opacity: 0.55; }
  .wexd-gap-label {
    font-size: 9px; fill: var(--muted); font-family: inherit;
    letter-spacing: 0.5px;
  }

  .wexd-event-rule { stroke: var(--muted); stroke-width: 1; opacity: 0.5; }
  .wexd-event-dot { fill: var(--ink); }
  .wexd-event-num { fill: var(--paper); font-size: 10px; font-weight: 700; font-family: inherit; }
  .wexd-crosshair { stroke: var(--ink); stroke-width: 1; opacity: 0.35; }

  /* The bell, in the masthead stamp's colours: the same green and red that say
     Open and Closed at the top of the page. */
  .wexd-bell-rule { stroke-width: 2; opacity: 0.7; }
  .wexd-bell-rule.open { stroke: var(--wex-up); }
  .wexd-bell-rule.close { stroke: var(--red); }
  .wexd-bell-label {
    font-size: 10px; font-weight: 700; font-family: inherit;
    text-transform: uppercase; letter-spacing: 1px;
  }
  .wexd-bell-label.open { fill: var(--wex-up); }
  .wexd-bell-label.close { fill: var(--red); }

  .wexd-tooltip {
    position: absolute; pointer-events: none;
    background: var(--paper); border: 1px solid var(--rule);
    padding: 8px 10px; font-size: 11px; min-width: 130px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.10);
  }
  .wexd-tooltip-time {
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
    color: var(--muted); margin-bottom: 5px;
  }
  .wexd-tooltip-row { display: flex; align-items: center; gap: 6px; line-height: 1.7; }
  .wexd-tooltip-ticker { font-weight: 700; flex: 1; }
  .wexd-tooltip-val { font-variant-numeric: tabular-nums; }

  .wexd-swatch {
    width: 10px; height: 10px; flex: 0 0 10px; border-radius: 2px; display: inline-block;
  }

  /* Numbered captions under the plot. Headlines printed beside their own rules
     overprint the moment two events land close together; a numbered list
     survives any width. */
  .wexd-event-list {
    list-style: none; margin: 10px 0 0; padding: 10px 0 0;
    border-top: 1px solid var(--rule);
    font-size: 12px;
  }
  .wexd-event-list li {
    display: flex; align-items: baseline; gap: 8px;
    padding: 3px 0; flex-wrap: wrap;
  }
  .wexd-event-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; flex: 0 0 16px; border-radius: 50%;
    background: var(--ink); color: var(--paper);
    font-size: 10px; font-weight: 700;
  }
  .wexd-event-time { color: var(--muted); font-variant-numeric: tabular-nums; }
  .wexd-event-head { font-weight: 600; }
  .wexd-event-pct { font-weight: 700; }
  .wexd-event-pct.up { color: var(--wex-up); }
  .wexd-event-pct.down { color: var(--red); }

  /* ---------------- Legend / company list ----------------
     The legend, the table view and the series toggle in one. Every swatch sits
     beside its ticker on purpose: three of the seven hues are below 3:1 on
     white, and the label is what makes them legible. */
  .wexd-legend {
    display: grid; gap: 1px;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    background: var(--rule);
    border: 1px solid var(--rule);
    margin-top: 16px;
  }
  .wexd-legend-item {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 11px 12px; min-height: 56px; width: 100%;
    background: var(--paper); border: none; cursor: pointer;
    font-family: inherit; color: var(--ink); text-align: left;
  }
  .wexd-legend-item:hover { background: var(--paper-dark); }
  .wexd-legend-item.off { opacity: 0.42; }
  .wexd-legend-item.halted { background: var(--wex-down-bg); }
  .wexd-legend-item .wexd-swatch { margin-top: 5px; width: 12px; height: 12px; flex-basis: 12px; }
  .wexd-legend-body { flex: 1; min-width: 0; }
  .wexd-legend-top, .wexd-legend-bottom {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  }
  .wexd-legend-ticker {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 19px; font-weight: 900; letter-spacing: 1px;
  }
  .wexd-legend-price { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .wexd-legend-name {
    font-size: 12px; color: var(--muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .wexd-legend-meta { display: block; font-size: 10.5px; color: var(--muted); margin-top: 4px; }
  .wexd-delta { font-size: 13px; font-weight: 700; white-space: nowrap; }
  .wexd-delta.up { color: var(--wex-up); }
  .wexd-delta.down { color: var(--red); }

  /* ---------------- Stat tiles ---------------- */
  .wexd-tiles {
    display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  }
  .wexd-tile {
    border: 1px solid var(--rule); padding: 13px 14px 15px; background: var(--paper);
  }
  /* The invested/cash meter earns the double width wherever there is room. */
  .wexd-tile.wide { grid-column: span 2; }
  .wexd-tile-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted);
  }
  .wexd-tile-value {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 38px; font-weight: 900; line-height: 1.05; margin-top: 4px;
  }
  .wexd-tile-value.up { color: var(--wex-up); }
  .wexd-tile-value.down { color: var(--red); }
  .wexd-of { font-size: 20px; color: var(--muted); font-weight: 700; }
  .wexd-tile-foot { font-size: 11px; color: var(--muted); margin-top: 6px; line-height: 1.5; }

  /* Two segments with a 2px gap of surface between them — not a border, and
     not a pie. */
  .wexd-meter { display: flex; gap: 2px; height: 10px; margin-top: 8px; }
  .wexd-meter-fill { background: var(--ink); min-width: 2px; }
  .wexd-meter-rest { flex: 1; min-width: 2px; background: var(--paper-darker); }

  /* ---------------- Leaderboards ---------------- */
  .wexd-boards {
    display: grid; gap: 20px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
  .wexd-board-title {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
    border-bottom: 2px solid var(--ink); padding-bottom: 6px; margin-bottom: 4px;
  }
  .wexd-standings { list-style: none; margin: 0; padding: 0; }
  .wexd-standings li {
    display: flex; align-items: baseline; gap: 10px;
    padding: 9px 0; border-bottom: 1px solid var(--paper-darker);
    font-size: 14px;
  }
  .wexd-standings li:last-child { border-bottom: none; }
  .wexd-rank {
    width: 20px; flex: 0 0 20px; color: var(--muted);
    font-size: 12px; font-variant-numeric: tabular-nums;
  }
  .wexd-who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wexd-amount { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .wexd-amount.up { color: var(--wex-up); }
  .wexd-amount.down { color: var(--red); }

  /* ---------------- Tape ---------------- */
  .wexd-tape { list-style: none; margin: 0; padding: 0; font-size: 13px; }
  .wexd-tape li {
    display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
    padding: 7px 0; border-bottom: 1px solid var(--paper-darker);
  }
  .wexd-tape li:last-child { border-bottom: none; }
  .wexd-tape-time { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .wexd-tape-who { font-weight: 700; }
  .wexd-tape-side.buy { color: var(--wex-up); }
  .wexd-tape-side.sell { color: var(--red); }
  .wexd-tape-price { color: var(--muted); margin-left: auto; font-variant-numeric: tabular-nums; }

  .wexd-foot {
    margin-top: 28px; padding-top: 14px; border-top: 1px solid var(--rule);
    font-size: 11px; color: var(--muted); line-height: 1.7;
  }

  /* ---------------- Narrow ----------------
     Almost nothing to do: every grid above is auto-fit, so a phone and a
     half-width desktop window both collapse on their own. These are the two
     things that do not fall out of the grid. */
  @media (max-width: 560px) {
    .wexd-root { padding: 14px 12px 48px; }
    .wexd-title { font-size: 26px; }
    /* One tile per row is too tall a column on a phone; two is readable, and
       the meter stops being special. */
    .wexd-tiles { grid-template-columns: repeat(2, 1fr); }
    .wexd-tile.wide { grid-column: span 2; }
    .wexd-tile-value { font-size: 28px; }
    .wexd-controls { gap: 8px; }
    .wexd-seg { padding: 9px 10px; letter-spacing: 1px; }
    /* Four time windows, not three. On a 320px phone the widest label would
       otherwise push the last button off the edge, so the group takes the row
       to itself and the four share it evenly. */
    .wexd-windows { flex: 1 1 100%; }
    .wexd-windows .wexd-seg { flex: 1; padding: 9px 4px; letter-spacing: 0.5px; }
  }
`;
