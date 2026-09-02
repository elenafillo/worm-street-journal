// ============================================================
// WEX styles
// ============================================================
// Appended after the newspaper's stylesheet, so it inherits --ink / --paper /
// --red / --rule / --muted and the [data-style="modern"] overrides rather than
// hardcoding colours.
//
// Built MOBILE-FIRST, unlike the rest of the app: this screen lives on a phone
// held by someone with a drink in the other hand. Big targets, no hover.

export const wexStyles = `
  /* Up/down are the one place WEX steps outside the paper palette. Down reuses
     --red so it matches the newspaper's breaking-news accent. */
  :root {
    --wex-up: #1a6b32;
    --wex-up-bg: rgba(26, 107, 50, 0.10);
    --wex-down-bg: rgba(139, 26, 26, 0.10);
  }
  [data-style="modern"] {
    --wex-up: #067647;
    --wex-up-bg: rgba(6, 118, 71, 0.08);
    --wex-down-bg: rgba(215, 25, 32, 0.08);
  }

  .wex-root {
    max-width: 560px;
    margin: 0 auto;
    padding: 16px 14px 48px;
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
  }

  /* ---------------- Gate ---------------- */
  .wex-gate { padding-top: 32px; text-align: center; }
  .wex-gate-title {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 34px; font-weight: 900; text-transform: uppercase;
    letter-spacing: 2px; line-height: 1.05;
  }
  .wex-gate-sub {
    font-size: 13px; color: var(--muted); margin: 8px 0 28px;
    text-transform: uppercase; letter-spacing: 2px;
  }
  .wex-words { display: flex; flex-direction: column; gap: 10px; }
  .wex-word-input {
    width: 100%; padding: 16px 14px;
    font-size: 18px; font-family: inherit;
    text-align: center; letter-spacing: 1px;
    background: var(--paper-dark); color: var(--ink);
    border: 1px solid var(--rule); border-radius: 0;
    -webkit-appearance: none;
  }
  .wex-word-input:focus { outline: 2px solid var(--ink); outline-offset: -2px; }
  .wex-gate-hint { font-size: 12px; color: var(--muted); margin-top: 14px; }

  /* ---------------- Header ---------------- */
  .wex-header { border-bottom: 4px double var(--rule); padding-bottom: 14px; margin-bottom: 4px; }
  .wex-brand {
    font-size: 11px; text-transform: uppercase; letter-spacing: 3px;
    color: var(--muted); display: flex; justify-content: space-between; align-items: center;
  }
  .wex-name { font-weight: 700; color: var(--ink); }
  .wex-networth-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 2px;
    color: var(--muted); margin-top: 12px;
  }
  .wex-networth {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 46px; font-weight: 900; line-height: 1;
    display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  }
  .wex-return { font-size: 20px; font-weight: 700; }
  .wex-return.up { color: var(--wex-up); }
  .wex-return.down { color: var(--red); }
  .wex-cash { font-size: 13px; color: var(--muted); margin-top: 6px; }

  /* ---------------- Market status ---------------- */
  .wex-status {
    margin: 14px 0; padding: 10px 12px;
    font-size: 12px; text-transform: uppercase; letter-spacing: 2px;
    border-left: 4px solid var(--red); background: var(--wex-down-bg);
  }

  /* ---------------- Company list ---------------- */
  .wex-section-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 3px;
    color: var(--muted); margin: 20px 0 8px;
  }
  .wex-co {
    border-top: 1px solid var(--rule);
    padding: 12px 0;
  }
  .wex-co:last-of-type { border-bottom: 1px solid var(--rule); }
  .wex-co-head {
    display: grid; grid-template-columns: 1fr auto;
    gap: 10px; align-items: center; cursor: pointer;
    /* A whole row is the tap target, not just the text. */
    min-height: 52px;
  }
  .wex-co-ticker {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 22px; font-weight: 900; letter-spacing: 1px; line-height: 1.1;
  }
  .wex-co-name { font-size: 12px; color: var(--muted); }
  .wex-co-ceo { font-size: 11px; color: var(--muted); font-style: italic; }
  .wex-co-right { text-align: right; }
  .wex-co-price {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 22px; font-weight: 700; line-height: 1.1;
  }
  .wex-co-change { font-size: 13px; font-weight: 700; }
  .wex-co-change.up { color: var(--wex-up); }
  .wex-co-change.down { color: var(--red); }
  .wex-co-held {
    display: inline-block; margin-top: 6px; padding: 2px 8px;
    font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
    background: var(--paper-darker);
  }
  .wex-co.halted { opacity: 0.55; }

  /* ---------------- Trade panel ---------------- */
  .wex-trade { padding: 14px 0 4px; }
  .wex-qty { display: flex; align-items: stretch; gap: 8px; margin-bottom: 12px; }
  .wex-qty-btn {
    flex: 0 0 56px; font-size: 24px; font-weight: 700;
    background: var(--paper-dark); color: var(--ink);
    border: 1px solid var(--rule); cursor: pointer;
    font-family: inherit;
  }
  .wex-qty-btn:active { background: var(--paper-darker); }
  .wex-qty-btn:disabled { opacity: 0.4; cursor: default; }
  .wex-qty-val {
    /* min-width:0 is load-bearing. A flex item's default min-width:auto is the
       content-based minimum, and for type="number" that is the browser's own
       ~20-character field width — wide enough that the + button was pushed off
       a phone screen however small the flex-basis. */
    flex: 1; min-width: 0; text-align: center; padding: 14px 8px;
    font-size: 22px; font-weight: 700; font-family: inherit;
    background: var(--paper-dark); border: 1px solid var(--rule);
    color: var(--ink); -webkit-appearance: none;
  }
  .wex-max {
    background: none; border: none; padding: 6px 2px; cursor: pointer;
    font-family: inherit; font-size: 11px; letter-spacing: 2px;
    text-transform: uppercase; color: var(--muted); text-decoration: underline;
  }
  .wex-preview {
    font-size: 12px; color: var(--muted); line-height: 1.7;
    padding: 10px 12px; background: var(--paper-dark); margin-bottom: 12px;
  }
  .wex-preview strong { color: var(--ink); }
  .wex-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .wex-btn {
    padding: 16px 10px; font-family: inherit;
    font-size: 14px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 2px;
    border: 1px solid var(--rule); cursor: pointer;
    background: var(--paper-dark); color: var(--ink);
  }
  .wex-btn.buy { background: var(--wex-up); color: var(--paper); border-color: var(--wex-up); }
  .wex-btn.sell { background: var(--red); color: var(--paper); border-color: var(--red); }
  .wex-btn:disabled { opacity: 0.45; cursor: default; }

  /* ---------------- Messages ---------------- */
  .wex-toast {
    margin: 12px 0; padding: 12px;
    font-size: 13px; line-height: 1.5;
    border-left: 4px solid var(--ink); background: var(--paper-dark);
  }
  .wex-toast.good { border-left-color: var(--wex-up); background: var(--wex-up-bg); }
  .wex-toast.bad { border-left-color: var(--red); background: var(--wex-down-bg); }
  .wex-error {
    margin-top: 14px; padding: 12px; font-size: 13px;
    border-left: 4px solid var(--red); background: var(--wex-down-bg);
  }

  .wex-foot {
    margin-top: 32px; padding-top: 14px;
    border-top: 1px solid var(--rule);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; text-transform: uppercase; letter-spacing: 2px;
    color: var(--muted);
  }
  .wex-link {
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: inherit; font-size: 11px; letter-spacing: 2px;
    text-transform: uppercase; color: var(--muted); text-decoration: underline;
  }

  /* ---------------- How it works ----------------
     Shared by the gate, the trade desk and the dashboard dialog, so the three
     explanations cannot drift apart visually any more than they can textually. */
  .wex-how {
    margin-top: 28px; padding-top: 16px;
    border-top: 1px solid var(--rule);
    text-align: left;
  }
  .wex-how-heading {
    font-size: 11px; text-transform: uppercase; letter-spacing: 3px;
    color: var(--muted); margin-bottom: 10px;
  }
  .wex-how-list {
    margin: 0; padding-left: 20px;
    font-size: 13px; line-height: 1.65; color: var(--muted);
  }
  .wex-how-list li { margin-bottom: 9px; }
  .wex-how-list strong { color: var(--ink); font-weight: 700; }

  /* The desk version is folded shut — the desk is for trading. */
  .wex-how-details > summary {
    cursor: pointer; list-style: none;
    display: flex; align-items: center; gap: 8px;
    min-height: 40px;              /* a real tap target, not just the words */
  }
  .wex-how-details > summary::-webkit-details-marker { display: none; }
  .wex-how-details > summary::after { content: "＋"; font-size: 14px; }
  .wex-how-details[open] > summary::after { content: "－"; }

  /* ---------------- The dashboard explainer ---------------- */
  .wex-how-dialog {
    width: min(640px, calc(100vw - 32px));
    max-height: min(80vh, 760px);
    overflow-y: auto;
    padding: 22px 24px 26px;
    background: var(--paper); color: var(--ink);
    border: 1px solid var(--rule); border-top: 6px solid var(--ink);
  }
  .wex-how-dialog::backdrop { background: rgba(20, 17, 12, 0.55); }
  .wex-how-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; margin-bottom: 6px;
  }
  .wex-how-title {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 28px; font-weight: 900; line-height: 1.05;
    text-transform: uppercase; letter-spacing: 1px; margin: 0;
  }
  .wex-how-close {
    flex: 0 0 40px; width: 40px; height: 40px;
    font-size: 26px; line-height: 1; cursor: pointer;
    background: none; border: 1px solid var(--rule); color: var(--muted);
    font-family: inherit;
  }
  .wex-how-close:hover { background: var(--paper-dark); color: var(--ink); }
  .wex-how-section {
    font-size: 11px; text-transform: uppercase; letter-spacing: 3px;
    color: var(--muted); margin: 20px 0 10px;
    border-bottom: 1px solid var(--rule); padding-bottom: 5px;
  }
  .wex-how-defs { margin: 0; font-size: 13px; line-height: 1.6; }
  .wex-how-defs > div { margin-bottom: 9px; }
  .wex-how-defs dt { font-weight: 700; }
  .wex-how-defs dd { margin: 0; color: var(--muted); }
  .wex-how-foot {
    margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--rule);
    font-size: 12px; line-height: 1.6; color: var(--muted);
  }

  /* ---------------- GM: the two desks ---------------- */
  /* A hard split, not a tab row. The newsroom hides articles; the exchange
     crashes the economy. They should not be one mis-tap apart. */
  .gm-desk-switch {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
    margin: 4px 0 20px;
  }
  .gm-desk-btn {
    padding: 14px 10px; cursor: pointer; font-family: inherit;
    background: var(--paper-dark); color: var(--muted);
    border: 1px solid var(--rule);
    display: flex; flex-direction: column; gap: 3px; align-items: center;
  }
  .gm-desk-btn.active {
    background: var(--ink); color: var(--paper); border-color: var(--ink);
  }
  .gm-desk-name {
    font-family: 'Barlow Condensed', 'Playfair Display', serif;
    font-size: 24px; font-weight: 900; letter-spacing: 2px; line-height: 1;
  }
  .gm-desk-sub {
    font-size: 10px; text-transform: uppercase; letter-spacing: 2px;
  }

  /* ---------------- GM: WEX admin ---------------- */
  .wex-admin-tabs {
    display: flex; gap: 6px; margin-bottom: 16px;
    border-bottom: 1px solid var(--rule); padding-bottom: 10px; flex-wrap: wrap;
  }
  .wex-admin-tab {
    padding: 8px 14px; cursor: pointer; font-family: inherit;
    font-size: 11px; text-transform: uppercase; letter-spacing: 2px;
    background: none; color: var(--muted); border: 1px solid transparent;
  }
  .wex-admin-tab.active {
    color: var(--ink); border-color: var(--rule); background: var(--paper-dark);
  }
  .wex-admin-state {
    padding: 10px 12px; margin-bottom: 8px;
    font-size: 12px; text-transform: uppercase; letter-spacing: 2px;
    background: var(--paper-dark); border-left: 4px solid var(--rule);
  }
  .wex-admin-check {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; color: var(--muted); cursor: pointer;
  }
  .wex-admin-hint { font-size: 11px; color: var(--muted); margin-top: 6px; line-height: 1.6; }
  .wex-admin-mini {
    display: flex; flex-direction: column; gap: 2px;
    font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted);
  }
  .wex-admin-event {
    font-size: 12px; padding: 6px 0;
    border-bottom: 1px solid var(--paper-darker); color: var(--muted);
  }
  .wex-admin-event strong { color: var(--ink); }

  /* Roomier once there is space for it, but the phone case is the default. */
  @media (min-width: 560px) {
    .wex-root { padding: 24px 20px 64px; }
    .wex-words { flex-direction: row; }
    .wex-networth { font-size: 56px; }
  }
`;
