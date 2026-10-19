// ============================================================
// One worm's fortune, reconstructed
// ============================================================
// WHY THERE IS NO TABLE FOR THIS
//
// Nothing in the schema records what anyone was worth an hour ago, and nothing
// needs to. A player's cash and share counts change at exactly one kind of
// moment — a trade — and `trades` is a complete ledger of those. Prices change
// at exactly one kind of moment too, and `price_ticks` is a complete record of
// those. Between them the entire history of every fortune is recoverable
// exactly, with no snapshot table, no cron job, and no row written per player
// per minute for a party that lasts three days.
//
// The alternative — a `net_worth_snapshots` table on a schedule — would cost
// eighty players × a row a minute × three days = 350,000 rows to reproduce
// something the ledger already implies, at a resolution WORSE than this (which
// has a point at every price move, not every minute).
//
// Pure, like chartSeries.js: no React, no DOM, and `now` is always passed in.

/** Cash moves by exactly ±total — see execute_trade(); there is no fee. */
const cashDelta = (tr) => (tr.side === "buy" ? -Number(tr.total) : Number(tr.total));

/** Shares move by exactly ±shares, in the same sign convention as `holdings`. */
const shareDelta = (tr) => (tr.side === "buy" ? Number(tr.shares) : -Number(tr.shares));

/**
 * Wind the ledger backwards from the position we know — the one the API just
 * handed us — to the state before the first trade.
 *
 * Backwards rather than forwards from `starting_cash` because backwards is the
 * version that cannot drift: it is anchored to the authoritative current cash
 * and holdings, so the right-hand end of the chart always agrees with the
 * number in the header, whatever happened earlier.
 *
 * `exact` reports whether the unwind landed where it should have — every share
 * accounted for and the cash back at the opening fortune. It normally does. It
 * will not if the GM has used "set cash" on this player (api/wexgm.js), or if
 * the ledger came back capped. The wealth line is still exact in that case; the
 * realised/unrealised SPLIT is the part that needs a clean starting point, so
 * callers use this to decide whether to stand behind it.
 */
export function unwindToOrigin({ trades = [], cashNow, holdingsNow = [], startingCash }) {
  let cash = Number(cashNow) || 0;
  const shares = new Map();
  for (const h of holdingsNow) shares.set(h.company_id, Number(h.shares) || 0);

  for (const tr of trades) {
    cash -= cashDelta(tr);
    shares.set(tr.company_id, (shares.get(tr.company_id) || 0) - shareDelta(tr));
  }

  const flat = [...shares.values()].every((n) => n === 0);
  // Cash is numeric(16,2), so a cent of slack absorbs float noise from the
  // hundreds of additions above without hiding a real discrepancy.
  const balanced = Math.abs(cash - (Number(startingCash) || 0)) < 0.01;

  return { cash, shares, exact: flat && balanced };
}

/**
 * Replay the whole history into a sample per moment.
 *
 * Each sample carries the full decomposition, because the two charts want
 * different cuts of it and replaying twice would be silly:
 *
 *   wealth      cash + what the holdings are worth right now. The headline.
 *   realised    profit actually banked, by selling. A step: it moves only at a
 *               sale and never moves again afterwards.
 *   unrealised  profit on paper — what the holdings are worth minus what they
 *               cost. This is the part that moves while you sleep.
 *   pnl         realised + unrealised, which is identically wealth − starting
 *               cash. Worth checking on paper once: cash = start + sales −
 *               purchases, and the two definitions collapse into each other.
 *
 * The split is the whole reason the P&L chart is not just the wealth chart
 * shifted down. It answers the question the wealth curve cannot: how much of
 * this is money you have actually made, and how much is a position that could
 * still turn around before the bell?
 *
 * Cost basis is AVERAGE, not FIFO. FIFO is what a broker would do; average cost
 * is what someone at a party means by "what did those cost me", and it does not
 * require keeping a queue of lots per company.
 */
export function buildFortune({
  trades = [],          // ascending, [{ company_id, side, shares, total, t }]
  ticks = [],           // ascending, [{ company_id, price, t }]
  companies = [],       // current rows, for live prices at the right edge
  cashNow,
  holdingsNow = [],
  startingCash,
  t0,
  t1,
}) {
  const origin = unwindToOrigin({ trades, cashNow, holdingsNow, startingCash });

  const price = new Map();    // company_id -> the last price seen
  const shares = new Map(origin.shares);
  const cost = new Map();     // company_id -> cost basis of the shares still held
  let cash = origin.cash;
  let realised = 0;

  // Seed from opening prices so that a company with no tick yet is valued at
  // something rather than at zero. Every real history begins with a batch of
  // `reason = 'open'` ticks at exactly these prices, so this is only ever the
  // value for the instant before them.
  for (const c of companies) {
    price.set(c.id, Number(c.open_price ?? c.price) || 0);
  }
  // A position that predates the ledger we hold — only reachable when `exact`
  // is false — is given a cost basis at that same opening price, so the split
  // starts the guest at zero rather than inventing a windfall for them.
  for (const [id, n] of shares) {
    if (n) cost.set(id, n * (price.get(id) || 0));
  }

  // One list in time order. `kind` breaks ties so the ordering is stable, but
  // it deliberately does not matter what it decides: samples are emitted per
  // DISTINCT TIMESTAMP, after every event at that timestamp has been applied.
  // That is not tidiness — a market-wide GM event writes seven ticks in the
  // same microsecond, and a sample taken between two of them would show a
  // portfolio priced half at the old market and half at the new.
  const events = [];
  for (const k of ticks) {
    events.push({ t: k.t, kind: 0, company_id: k.company_id, price: Number(k.price) });
  }
  for (const tr of trades) events.push({ t: tr.t, kind: 1, tr });
  events.sort((a, b) => a.t - b.t || a.kind - b.kind);

  function apply(e) {
    if (e.kind === 0) {
      price.set(e.company_id, e.price);
      return;
    }
    const { company_id: id, side } = e.tr;
    const n = Number(e.tr.shares) || 0;
    const total = Number(e.tr.total) || 0;
    const have = shares.get(id) || 0;

    if (side === "buy") {
      shares.set(id, have + n);
      cost.set(id, (cost.get(id) || 0) + total);
      cash -= total;
    } else {
      const unit = have > 0 ? (cost.get(id) || 0) / have : 0;
      const released = unit * Math.min(n, have);
      realised += total - released;
      cost.set(id, Math.max(0, (cost.get(id) || 0) - released));
      shares.set(id, have - n);
      cash += total;
    }
  }

  const samples = [];

  function sample(t) {
    let held = 0;
    let basis = 0;
    for (const [id, n] of shares) {
      if (!n) continue;
      held += n * (price.get(id) || 0);
      basis += cost.get(id) || 0;
    }
    const unrealised = held - basis;
    const row = {
      t, cash, held,
      wealth: cash + held,
      realised,
      unrealised,
      pnl: realised + unrealised,
    };
    // A trade landing exactly on t0 or t1 would otherwise leave two samples at
    // the same instant, one of them pre-trade. The later state is the true one.
    if (samples.length && samples[samples.length - 1].t === t) {
      samples[samples.length - 1] = row;
    } else {
      samples.push(row);
    }
  }

  let i = 0;
  // Everything before the window still shapes the state; it is just not drawn.
  while (i < events.length && events[i].t < t0) apply(events[i++]);

  // The carry-in point, for the same reason buildSeries has one: a guest who
  // has not traded in the last fifteen minutes must not vanish from their own
  // chart. A flat line reads correctly as "nothing happened"; nothing at all
  // reads as broken.
  sample(t0);

  while (i < events.length && events[i].t <= t1) {
    const at = events[i].t;
    while (i < events.length && events[i].t === at) apply(events[i++]);
    sample(at);
  }

  // The right edge at LIVE prices. usePrices polls companies every five seconds
  // and the tick history more slowly, so this is the fresher number — and it is
  // the one already printed in the header, which the line must agree with.
  for (const c of companies) price.set(c.id, Number(c.price) || price.get(c.id) || 0);
  sample(t1);

  const open = samples[0];
  const close = samples[samples.length - 1];

  return {
    samples,
    open,
    close,
    exact: origin.exact,
    startingCash: Number(startingCash) || 0,
    // What the window itself is worth, for the readout above the chart. Not
    // close.pnl − open.pnl by accident: over "15 min" the interesting number is
    // what changed in those fifteen minutes, not lifetime profit.
    change: close.wealth - open.wealth,
    changePct: open.wealth ? (close.wealth / open.wealth - 1) * 100 : null,
  };
}
