// ============================================================
// Ticker maths — the feed and the rotating chart slots
// ============================================================
// The pure part of #ticker, kept out of the component so it can be exercised
// with plain node, the same way chartSeries.js is. Nothing here touches React,
// the DOM or the clock: randomness is passed in as `rng`.

// Drift writes one tick per company in a single statement, so a run's ticks
// share a timestamp to within milliseconds. Two seconds is generous without
// ever merging two separate runs, which are a minute apart.
const DRIFT_RUN_MS = 2000;

// The smallest move the tape can show: it prints one decimal, so anything under
// this reads "0.0%". Drift only writes a tick when the price really changed,
// but 30 ⌀ on a 100k stock is a change — just not one worth a slot on the wall.
const MIN_VISIBLE_PCT = 0.05;

/** Percent move from one price to another, or null when either is missing. */
function pctMove(from, to) {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return (b / a - 1) * 100;
}

/**
 * Everything that has happened on the exchange, newest first, as one list.
 *
 *   trade  from `trade_tape` — who, which way, how many, and how far it moved
 *          the stock. The move needs `price_before` / `price_after`, which the
 *          view gains in supabase/ticker.sql; until that has run it is null
 *          and the row simply shows no move.
 *   news   from `market_events` — the GM's headlines. Their `gm_event` ticks
 *          are NOT listed separately: the headline already says what moved and
 *          by how much, and a market-wide event would otherwise add seven rows.
 *   set    a `gm_set` tick — the Fed setting a price by hand.
 *   drift  every `drift` tick from one run, collapsed into a single row.
 *          The weather moves every company every minute; one row each would
 *          bury the trades, which are the part anyone is watching for.
 *
 * `ticks` are the useMarketData rows ({ id, company_id, price, reason, t }), in
 * any order. A move is measured against the previous tick for the SAME company,
 * so the whole history is walked even though only the newest rows are kept.
 */
export function buildFeed({ tape = [], ticks = [], events = [], companies = [], limit = 40 }) {
  const tickerOf = new Map(companies.map((c) => [c.id, c.ticker]));
  const rows = [];

  for (const tr of tape) {
    rows.push({
      key: `trade:${tr.id}`,
      kind: "trade",
      t: new Date(tr.created_at).getTime(),
      who: tr.display_name || "A WORM",
      side: tr.side,
      shares: Number(tr.shares),
      ticker: tr.ticker,
      price: Number(tr.exec_price),
      pct: pctMove(tr.price_before, tr.price_after),
    });
  }

  for (const ev of events) {
    rows.push({
      key: `news:${ev.id}`,
      kind: "news",
      t: ev.t ?? new Date(ev.created_at).getTime(),
      headline: ev.headline,
      ticker: ev.company_id ? tickerOf.get(ev.company_id) || "?" : "MKT",
      pct: Number.isFinite(Number(ev.pct_change)) ? Number(ev.pct_change) : null,
    });
  }

  const sorted = [...ticks].sort((a, b) => a.t - b.t || a.id - b.id);
  const lastPrice = new Map();
  let drift = null;

  for (const tk of sorted) {
    const prev = lastPrice.get(tk.company_id);
    lastPrice.set(tk.company_id, tk.price);
    // The first tick we hold for a company has nothing to be measured against.
    if (prev === undefined) continue;

    const ticker = tickerOf.get(tk.company_id);
    if (!ticker) continue; // delisted since — not on the board, not in the feed
    const pct = pctMove(prev, tk.price);

    if (tk.reason === "drift") {
      // Too small to print is left out — and a run with nothing visible in it
      // gets no row at all, since the row is only opened by its first move.
      if (pct === null || Math.abs(pct) < MIN_VISIBLE_PCT) continue;
      if (!drift || tk.t - drift.t > DRIFT_RUN_MS) {
        drift = { key: `drift:${tk.id}`, kind: "drift", t: tk.t, moves: [] };
        rows.push(drift);
      }
      drift.moves.push({ ticker, pct });
    } else if (tk.reason === "gm_set") {
      rows.push({ key: `set:${tk.id}`, kind: "set", t: tk.t, ticker, price: tk.price, pct });
    }
  }

  // Biggest mover first within a drift run: on a narrow screen the row scrolls,
  // and the part you see before it does should be the part worth seeing.
  for (const r of rows) {
    if (r.kind === "drift") r.moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }

  rows.sort((a, b) => b.t - a.t);
  return rows.slice(0, limit);
}

// ============================================================
// The chart slots
// ============================================================
// Three FIXED positions, each with its own line colour, and a pointer to the
// one that goes next. Swapping one position at a time — rather than shifting
// the list along — means a company keeps its colour for as long as it is on
// the chart. Round-robin replacement is the same as "the one that has been up
// longest goes", with no timestamps to keep.
//
//   { ids: [a, b, c], next: 0 }

function pickFrom(pool, exclude, rng) {
  const options = pool.filter((id) => !exclude.includes(id));
  if (!options.length) return null;
  return options[Math.floor(rng() * options.length) % options.length];
}

/** Fill `count` slots with distinct random companies from `pool` (ids). */
export function pickSlots(pool, count = 3, rng = Math.random) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = pickFrom(pool, ids, rng);
    if (id === null) break;
    ids.push(id);
  }
  return { ids, next: 0 };
}

/**
 * Swap out the slot whose turn it is for a company not currently shown.
 * With no company left over — three or fewer listed — nothing changes.
 */
export function nextSlots(slots, pool, rng = Math.random) {
  if (!slots.ids.length) return slots;
  const i = slots.next % slots.ids.length;
  const id = pickFrom(pool, slots.ids, rng);
  if (id === null) return slots;
  const ids = [...slots.ids];
  ids[i] = id;
  return { ids, next: (i + 1) % ids.length };
}

/**
 * Keep the slots honest when the company list changes underneath them: drop
 * anything delisted, refill empty positions, and leave everything else — and
 * its colour — exactly where it was. Returns the SAME object when nothing
 * needed fixing, so a React state setter can bail out.
 */
export function repairSlots(slots, pool, count = 3, rng = Math.random) {
  const want = Math.min(count, pool.length);
  const kept = slots.ids.map((id) => (pool.includes(id) ? id : null));
  while (kept.length < want) kept.push(null);
  const trimmed = kept.slice(0, want);

  if (trimmed.length === slots.ids.length && trimmed.every((id, i) => id === slots.ids[i])) {
    return slots;
  }
  const ids = [...trimmed];
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === null) ids[i] = pickFrom(pool, ids.filter(Boolean), rng);
  }
  return { ids, next: want ? slots.next % want : 0 };
}

// ============================================================
// The news flash on the fixed ticker
// ============================================================
// Any market event from the last three hours comes back, every few minutes,
// as a window in the middle of the screen: in for three seconds, out, in
// again for two, gone. Fixed beats rather than a random schedule, so it reads
// as a signal — a phone buzzing twice — not as decoration.

export const FLASH_WINDOW_MS = 3 * 3_600_000;

/** The beats of one flash, ms from its start. Closing takes CLOSE_MS more. */
export const FLASH_BEATS = [
  { at: 0, open: true },
  { at: 3000, open: false },
  { at: 3900, open: true },
  { at: 5900, open: false },
];

/** Events worth flashing at `now`: the last `windowMs`, newest first. */
export function recentEvents(events, now, windowMs = FLASH_WINDOW_MS) {
  return events
    .map((e) => ({ ...e, t: e.t ?? new Date(e.created_at).getTime() }))
    .filter((e) => e.t <= now && now - e.t <= windowMs)
    .sort((a, b) => b.t - a.t);
}
