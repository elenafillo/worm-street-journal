// ============================================================
// The bell — when the exchange opened and closed
// ============================================================
// market_state only remembers the LAST bell of each kind, so on its own a chart
// cannot tell last night's close from a quiet half hour: both are a stretch with
// no ticks. So every ring of the bell also writes a marker to market_events
// (api/wexgm.js), and the charts read the history back from those.
//
// A bell is a marker like any other — no company, no move — told apart by its
// headline. Not a new column: a database that has never run a migration still
// gets bells, and the tape, the GM's Recent Events and the news flash already
// know how to show a marker.
//
// Shared with api/wexgm.js, which writes these exact headlines. Pure: no React,
// no DOM, no clock.

export const OPENING_BELL = "Opening bell";
export const CLOSING_BELL = "Closing bell";

// How close a market_state stamp and a bell marker must be to be the same ring.
// The API writes both in one request, a few hundred milliseconds apart.
const SAME_RING_MS = 2 * 60_000;

/** "open", "close", or null for any event that is not a bell. */
export function bellKind(ev) {
  if (!ev || ev.company_id || Number(ev.pct_change)) return null;
  if (Array.isArray(ev.moves) && ev.moves.length) return null;
  if (ev.headline === OPENING_BELL) return "open";
  if (ev.headline === CLOSING_BELL) return "close";
  return null;
}

/**
 * Every bell we know of, oldest first, as `[{ t, kind }]`.
 *
 * The markers are the history. market_state fills in the latest ring when its
 * marker is missing: one rung before this shipped, or deleted from Recent
 * Events, or past the newest-40 the wall loads.
 */
export function bellsFrom(events = [], market = {}) {
  const bells = [];
  for (const ev of events) {
    const kind = bellKind(ev);
    if (kind) bells.push({ t: ev.t ?? new Date(ev.created_at).getTime(), kind });
  }

  const latest = market.is_open
    ? { kind: "open", at: market.opened_at }
    : { kind: "close", at: market.closed_at };
  const t = latest.at ? new Date(latest.at).getTime() : NaN;
  if (Number.isFinite(t) && !bells.some((b) => b.kind === latest.kind && Math.abs(b.t - t) < SAME_RING_MS)) {
    bells.push({ t, kind: latest.kind });
  }

  return bells.sort((a, b) => a.t - b.t);
}

/**
 * The stretches the exchange was shut, as `[{ a, b }]`: each close to the next
 * open, the last one running to `end` if the market has not reopened. An open
 * with no close before it starts nothing — whatever came before it is unknown.
 */
export function closedSpans(bells, end) {
  const spans = [];
  let from = null;
  for (const b of bells) {
    if (b.kind === "close" && from === null) from = b.t;
    else if (b.kind === "open" && from !== null) {
      spans.push({ a: from, b: b.t });
      from = null;
    }
  }
  if (from !== null && end > from) spans.push({ a: from, b: end });
  return spans;
}
