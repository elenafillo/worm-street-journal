import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase.js";

// ============================================================
// Everything the public dashboard reads, in one hook
// ============================================================
// One hook so the chart, the tiles and the leaderboards never disagree about
// what time it is — and so the price board at #board can import it unchanged
// when it gets built.
//
// This talks to PostgREST directly with the anon key, exactly as the broadsheet
// reads `articles`. It can only reach what anon may read: the market tables,
// the two leaderboard views, and the two aggregate views from
// supabase/dashboard.sql. It must never gain a write path.

const FAST_MS = 3000;   // prices and the tape — the things that move
const SLOW_MS = 6000;   // standings and aggregates — no reason to match a price

// The most ticks we will ever hold. Seven companies across a long party is a
// few thousand rows; this is a ceiling, not an expectation.
const TICK_CAP = 6000;

// PostgREST answers with at most `max-rows` rows per request — 1000 on Supabase
// — and it does NOT complain when you ask for more: `limit=6000` comes back as
// a silent 1000 with `Content-Range: 0-999/*`. That is worth spelling out
// because it cost us a chart. The "Session" view starts at the oldest tick the
// browser holds, so a single capped request quietly turned "the whole session"
// into "the last thousand ticks" — about thirteen hours of a market that had
// been open for thirty-five, with nothing on screen to say so.
const PAGE_MAX = 1000;

const TICK_COLUMNS = "id,company_id,price,reason,created_at";

/**
 * The whole tick history, oldest first, in pages.
 *
 * Paged by KEYSET (`id < lowest seen`) rather than by offset. Offset paging
 * would be a bug here: ticks are being inserted at the head of `id.desc` while
 * we walk, so every insert between two pages shifts the window and hands back a
 * row we already have — or skips one we do not. Ids are a bigserial and only
 * ever grow, so a keyset cursor is stable no matter what the market does
 * mid-fetch.
 *
 * Runs once, at mount. Every poll after it is the incremental `id > last` query.
 */
async function fetchTickHistory(cap) {
  const pages = [];
  let held = 0;
  let before = null;

  while (held < cap) {
    const want = Math.min(PAGE_MAX, cap - held);
    const page = await supabase.query("price_ticks", {
      select: TICK_COLUMNS,
      order: "id.desc",
      limit: want,
      ...(before === null ? {} : { params: { id: `lt.${before}` } }),
    });
    if (!Array.isArray(page) || !page.length) break;

    pages.push(page);
    held += page.length;

    // A short page is the beginning of history; a full one might not be.
    if (page.length < want) break;
    before = page[page.length - 1].id;
  }

  // Newest-first pages of newest-first rows: flatten, then flip the lot once.
  return pages.flat().reverse();
}

/**
 * Price ticks arrive incrementally.
 *
 * The naive version re-fetches the whole history every three seconds, which is
 * fine at 8pm and dies at 11. Instead: one full load, then poll for rows newer
 * than the highest id seen and append.
 *
 * Filtering on `id` rather than `created_at` is deliberate. Two ticks written
 * in the same microsecond — a market-wide event writes seven at once — would
 * make a `created_at=gt.` filter drop rows. `id` is a bigserial and cannot tie.
 */
function tickRow(r) {
  return {
    id: Number(r.id),
    company_id: r.company_id,
    price: Number(r.price),
    reason: r.reason,
    t: new Date(r.created_at).getTime(),
  };
}

/**
 * A reset makes every earlier tick a lie — prices went back to their opening
 * values and the chart would otherwise draw a cliff joining the two sessions.
 * Keep only from the last reset onwards, inclusive: those rows ARE the new
 * baseline.
 */
function trimAtReset(ticks) {
  let cut = -1;
  for (let i = ticks.length - 1; i >= 0; i--) {
    if (ticks[i].reason === "reset") { cut = i; break; }
  }
  if (cut < 0) return ticks;
  // Every company's reset tick is written in the same statement, so walk back
  // over the whole batch rather than cutting mid-way through it.
  let start = cut;
  while (start > 0 && ticks[start - 1].reason === "reset") start--;
  return ticks.slice(start);
}

/**
 * Just the prices and whether the bell has rung — for the guest phone.
 *
 * WHY THIS EXISTS, and it is not a micro-optimisation: `#trade` used to get its
 * prices by polling /api/wex every five seconds, and every one of those polls
 * is a Vercel serverless invocation. Eighty phones over a three-day party is
 * something like 1.7 million invocations, which is orders of magnitude past a
 * Hobby plan. Prices and market state are anon-readable, so a phone can read
 * them from PostgREST directly, exactly as the wall does — no function, no
 * invocation, no quota.
 *
 * What is left on /api/wex is what genuinely cannot leave the server: the
 * player's cash and holdings (RLS-denied to anon), and trades themselves. Those
 * change only when the guest acts, so they poll slowly. See WexTrade.jsx.
 */
export function usePrices(intervalMs = 5000) {
  const [companies, setCompanies] = useState([]);
  const [market, setMarket] = useState({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cos, state] = await Promise.all([
        supabase.query("companies", { select: "*", order: "sort_order" }),
        supabase.query("market_state", { select: "*" }),
      ]);
      if (Array.isArray(cos)) setCompanies(cos.filter((c) => c.is_listed));
      if (Array.isArray(state) && state[0]) setMarket(state[0]);
    } catch {
      // Hold the last good prices. A phone that blanks on one dropped poll at a
      // party with bad wifi is worse than one showing figures a few seconds old.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (alive) setLoaded(true);
    })();

    const visible = () => document.visibilityState === "visible";
    const id = setInterval(() => { if (visible()) load(); }, intervalMs);
    const onVisible = () => { if (visible()) load(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, intervalMs]);

  return { companies, market, loaded };
}

/**
 * Just the price-tick history — for the phone's own fortune charts.
 *
 * LAZY ON PURPOSE. The wall wants ticks the moment it loads; a guest's phone
 * only wants them if that guest opens the charts, and by the third day of a
 * party the history is a few thousand rows. Downloading that to eighty phones
 * that may never scroll to it is exactly the kind of thing this codebase has
 * spent its effort avoiding. So nothing happens until `enabled` goes true, and
 * the expensive paged load runs once per session however often the panel is
 * folded and unfolded after that.
 *
 * Polls slowly. The right edge of the chart is drawn from live company prices,
 * which usePrices already refreshes every five seconds — these rows are the
 * HISTORY, and history a few seconds late is still history.
 */
export function useTicks(enabled = false, intervalMs = 15000) {
  const [ticks, setTicks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const lastTickId = useRef(0);

  const poll = useCallback(async (full) => {
    try {
      const rows = full
        ? await fetchTickHistory(TICK_CAP)
        : await supabase.query("price_ticks", {
            select: TICK_COLUMNS,
            order: "id.asc",
            limit: PAGE_MAX,
            params: { id: `gt.${lastTickId.current}` },
          });
      if (!Array.isArray(rows) || !rows.length) return;

      const mapped = rows.map(tickRow);
      lastTickId.current = Math.max(lastTickId.current, ...mapped.map((r) => r.id));
      setTicks((prev) => {
        const merged = full ? mapped : [...prev, ...mapped];
        const trimmed = trimAtReset(merged);
        return trimmed.length > TICK_CAP ? trimmed.slice(-TICK_CAP) : trimmed;
      });
    } catch {
      // Hold the history we already have. A chart that empties itself because
      // one poll failed on party wifi is worse than one a few seconds stale.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      // `lastTickId` is the record of having loaded at all, and it survives the
      // panel being closed and reopened — so that only ever costs the cheap
      // incremental query, never the full walk again.
      await poll(lastTickId.current === 0);
      if (alive) setLoaded(true);
    })();

    const visible = () => document.visibilityState === "visible";
    const id = setInterval(() => { if (visible()) poll(false); }, intervalMs);
    const onVisible = () => { if (visible()) poll(false); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, poll]);

  return { ticks, loaded };
}

/**
 * @param slow  poll the standings and aggregate views as well (default true).
 *              The #ticker screens read neither, and at three wall screens for
 *              a three-day party the unused polls are about 15% of the egress.
 */
export function useMarketData({ slow = true } = {}) {
  const [companies, setCompanies] = useState([]);
  const [market, setMarket] = useState({});
  const [ticks, setTicks] = useState([]);
  const [events, setEvents] = useState([]);
  const [tape, setTape] = useState([]);
  const [board, setBoard] = useState([]);
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  // Highest tick id seen. A ref, not state: it changes on every poll and
  // nothing renders from it.
  const lastTickId = useRef(0);

  const loadFast = useCallback(async (full) => {
    try {
      // Both branches come back OLDEST FIRST. The full load walks backwards a
      // page at a time so that an over-long history gives us the most RECENT
      // TICK_CAP rows — ordering ascending with a limit would hand back the
      // oldest ones and draw a chart that stops hours ago.
      const tickLoad = full
        ? fetchTickHistory(TICK_CAP)
        : supabase.query("price_ticks", {
            select: TICK_COLUMNS,
            order: "id.asc",
            limit: PAGE_MAX,
            params: { id: `gt.${lastTickId.current}` },
          });

      const [cos, state, newTicks, evts, tp] = await Promise.all([
        // `select=*` rather than a column list on purpose: naming `color`
        // explicitly makes the whole request 400 until supabase/dashboard.sql
        // has been run, which would take the entire page down over a column
        // the chart has a fallback for. Seven rows — the width costs nothing.
        supabase.query("companies", { select: "*", order: "sort_order" }),
        supabase.query("market_state", { select: "*" }),
        tickLoad,
        supabase.query("market_events", {
          select: "id,company_id,headline,pct_change,created_at",
          order: "created_at.desc", limit: 40,
        }),
        supabase.query("trade_tape", { select: "*" }),
      ]);

      if (!Array.isArray(cos)) throw new Error(cos?.message || "companies unreadable");

      setCompanies(cos.filter((c) => c.is_listed));
      if (Array.isArray(state) && state[0]) setMarket(state[0]);
      if (Array.isArray(evts)) setEvents(evts.map((e) => ({ ...e, t: new Date(e.created_at).getTime() })));
      if (Array.isArray(tp)) setTape(tp);

      if (Array.isArray(newTicks) && newTicks.length) {
        const rows = newTicks.map(tickRow);
        lastTickId.current = Math.max(lastTickId.current, ...rows.map((r) => r.id));

        setTicks((prev) => {
          const merged = full ? rows : [...prev, ...rows];
          const trimmed = trimAtReset(merged);
          return trimmed.length > TICK_CAP ? trimmed.slice(-TICK_CAP) : trimmed;
        });
      }

      setError("");
    } catch (err) {
      // Keep whatever is on screen. A projected panel that blanks on one failed
      // poll is worse than one showing figures three seconds out of date.
      setError(err?.message || "The exchange is not answering.");
    }
  }, []);

  const loadSlow = useCallback(async () => {
    try {
      const [lb, hp, st] = await Promise.all([
        supabase.query("leaderboard", { select: "*", order: "net_worth.desc" }),
        supabase.query("market_health", { select: "*" }),
        supabase.query("company_stats", { select: "*" }),
      ]);
      if (Array.isArray(lb)) setBoard(lb);
      if (Array.isArray(hp) && hp[0]) setHealth(hp[0]);
      if (Array.isArray(st)) setStats(st);
    } catch {
      // Same reasoning as above — hold the last good standings.
    }
  }, []);

  // First load, then two polls at different rates. Both stop dead while the tab
  // is hidden, and catch up the moment it comes back.
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([loadFast(true), slow ? loadSlow() : null]);
      if (alive) setLoaded(true);
    })();

    const visible = () => document.visibilityState === "visible";
    const fast = setInterval(() => { if (visible()) loadFast(false); }, FAST_MS);
    const slowId = slow ? setInterval(() => { if (visible()) loadSlow(); }, SLOW_MS) : 0;

    function onVisible() {
      if (!visible()) return;
      loadFast(false);
      if (slow) loadSlow();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(fast);
      clearInterval(slowId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadFast, loadSlow, slow]);

  return { companies, market, ticks, events, tape, board, health, stats, loaded, error };
}
