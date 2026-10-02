// ============================================================================
// /api/wexgm — the Worm Fed's exchange controls
// ============================================================================
// Password-gated with the SAME GM_PASSWORD as api/gm.js: one secret, one thing
// for you to remember at a party. Nothing new to add in the Vercel dashboard.
//
// Kept separate from api/gm.js on purpose — the newsroom moderates articles,
// this moves money. Mixing them would make a mis-tap expensive.

import { SUPABASE_URL, serviceHeaders, jsonBody, rest, rpc } from "./_supabase.js";
import { ADJECTIVES, PLACES, WORMS } from "../src/wex/wordlists.js";
import { OPENING_BELL, CLOSING_BELL } from "../src/wex/bell.js";

const GM_PASSWORD = process.env.GM_PASSWORD;

async function patch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `PATCH ${path} failed`);
  return data;
}

async function post(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `POST ${path} failed`);
  return data;
}

async function del(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE ${path} failed`);
}

/** Stories waiting for the Fed (see docs/archive/HELD_STORIES_brief.md), oldest first, each
 *  with the trading name of whoever filed it. Never fails the overview: a
 *  database without supabase/held.sql just has no held stories. */
async function heldStories() {
  try {
    const [stories, filers] = await Promise.all([
      rest("articles",
        "select=id,author_name,headline,body,image_url,press_company_id,created_at&held=eq.true&order=created_at.asc"),
      rest("article_filers", "select=article_id,trading_name"),
    ]);
    const filedBy = new Map(filers.map((f) => [f.article_id, f.trading_name]));
    return stories.map((s) => ({ ...s, filed_by: filedBy.get(s.id) || null }));
  } catch {
    return [];
  }
}

/** Settle a held story without a market move. The `held=eq.true` filter means
 *  a story someone already fired or spiked is left alone and reported. */
async function settleHeld(id, fields) {
  const rows = await patch(`articles?id=eq.${id}&held=eq.true`, { held: false, ...fields });
  return Array.isArray(rows) && rows.length > 0;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** A code no one holds yet. The unique index is the real guarantee; this just
 *  avoids handing back an obvious collision. */
async function freshCode() {
  for (let i = 0; i < 12; i++) {
    const code = `${pick(ADJECTIVES)}-${pick(PLACES)}-${pick(WORMS)}`;
    const hit = await rest("players", `select=id&code=eq.${code}`);
    if (!hit.length) return code;
  }
  throw new Error("Could not find a free code — is the roster enormous?");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = jsonBody(req);
  if (!payload) return res.status(400).json({ error: "Malformed request." });

  const { password, action, ...params } = payload;
  if (!password || password !== GM_PASSWORD) {
    return res.status(403).json({ error: "Wrong password, worm." });
  }

  try {
    switch (action) {
      // ------------------------------------------------------------------
      // Read
      // ------------------------------------------------------------------
      case "overview": {
        // Belt and braces for price drift — a pg_cron heartbeat is the real
        // clock (see supabase/drift.sql), this covers the night it stops.
        // Time-gated and idempotent, so a no-op on all but one poll per
        // interval, and it runs BEFORE the reads so the panel shows any prices
        // it just caused rather than lagging a poll behind them.
        await rpc("wex_drift", {});

        const [companies, state, board, events, held] = await Promise.all([
          rest("companies", "select=*&order=sort_order"),
          rest("market_state", "select=*&id=eq.1"),
          rest("leaderboard", "select=*&order=net_worth.desc"),
          rest("market_events", "select=*&order=created_at.desc&limit=8"),
          heldStories(),
        ]);
        return res.status(200).json({
          companies,
          market: state[0] || {},
          leaderboard: board,
          events,
          held,
        });
      }

      case "list_players": {
        // The only place codes are ever sent over the wire, and deliberately
        // so: this is how you look up a guest stuck at the door.
        const players = await rest(
          "players",
          "select=id,code,display_name,cash,starting_cash,is_claimed,is_gm&order=starting_cash.desc"
        );
        const [holdings, companies] = await Promise.all([
          rest("holdings", "select=player_id,company_id,shares&shares=neq.0"),
          rest("companies", "select=id,price"),
        ]);
        const priceOf = new Map(companies.map((c) => [c.id, Number(c.price)]));
        const heldValue = new Map();
        for (const h of holdings) {
          heldValue.set(
            h.player_id,
            (heldValue.get(h.player_id) || 0) + h.shares * (priceOf.get(h.company_id) || 0)
          );
        }
        return res.status(200).json(
          players.map((p) => {
            const net = Number(p.cash) + (heldValue.get(p.id) || 0);
            return {
              ...p,
              net_worth: net,
              pct_return: Number(p.starting_cash) > 0
                ? Math.round((net / Number(p.starting_cash) - 1) * 1000) / 10
                : null,
            };
          })
        );
      }

      // ------------------------------------------------------------------
      // Market
      // ------------------------------------------------------------------
      // Each ring also leaves a marker on the timeline (src/wex/bell.js), which
      // is how the charts tell a closed night from a quiet half hour. The
      // `is_open` filter makes a second tap — two tabs, a double-tap — change
      // nothing and so ring nothing.
      case "open_market": {
        const rows = await patch("market_state?id=eq.1&is_open=eq.false", {
          is_open: true, opened_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          // Restart the drift clock at the bell. Without this, a market that
          // sat closed overnight would drift five intervals in its first second
          // open and put a cliff on the chart before anyone had traded.
          last_drift_at: new Date().toISOString(),
        });
        if (Array.isArray(rows) && rows.length) {
          await post("market_events", { company_id: null, headline: OPENING_BELL, pct_change: 0 });
        }
        return res.status(200).json({ ok: true });
      }

      case "close_market": {
        const rows = await patch("market_state?id=eq.1&is_open=eq.true", {
          is_open: false, closed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        if (Array.isArray(rows) && rows.length) {
          await post("market_events", { company_id: null, headline: CLOSING_BELL, pct_change: 0 });
        }
        return res.status(200).json({ ok: true });
      }

      case "halt": {
        const target = params.company_id
          ? `companies?id=eq.${params.company_id}`
          : "companies?is_listed=eq.true";
        await patch(target, { is_halted: Boolean(params.halted) });
        return res.status(200).json({ ok: true });
      }

      case "fire_event": {
        // Three shapes, one action:
        //   no `moves`          the whole market, by `pct_change`
        //   one move            one company — the original wex_fire_event
        //   two to four moves   wex_fire_moves (supabase/events.sql)
        // One company deliberately stays on the old function, so single and
        // market-wide events keep working on a database without events.sql.
        const moves = Array.isArray(params.moves)
          ? params.moves.map((m) => ({ company_id: m.company_id, pct: Number(m.pct) }))
          : [];
        if (moves.length > 4) {
          return res.status(200).json({ ok: false, error: "Four companies at most — any more will not fit on the wall." });
        }
        // A held story to publish in the same transaction as the move.
        const articleId = params.article_id || null;
        const result = moves.length > 1
          ? await rpc("wex_fire_moves", { p_headline: params.headline, p_moves: moves, p_article_id: articleId })
          : await rpc("wex_fire_event", {
              p_company: moves[0]?.company_id || params.company_id || null,
              p_headline: params.headline,
              p_pct: moves.length ? moves[0].pct : Number(params.pct_change),
              p_article_id: articleId,
            });
        // PostgREST's own error, not the function's: the function is not there.
        if (result?.code === "PGRST202") {
          return res.status(200).json({
            ok: false,
            error: "Several-company events need supabase/events.sql — run it in the Supabase SQL editor first.",
          });
        }
        if (!result?.ok) {
          return res.status(200).json({ ok: false, error: result?.error || "Event failed." });
        }
        // Optionally put the same headline on the newspaper's ticker, so the
        // two wall panels tell one story.
        if (params.broadcast_wsj) {
          await post("events", {
            type: "breaking_news",
            payload: { message: params.headline },
          });
        }
        return res.status(200).json({
          ok: true, ...result,
          ...(result.published ? { note: "Fired, and the story is on the paper." } : {}),
        });
      }

      // The other two ways to settle a held story. (The third is fire_event
      // with an article_id, above.)
      case "publish_held":
        return res.status(200).json(await settleHeld(params.id, { hidden: false })
          ? { ok: true, note: "Published, no market move." }
          : { ok: false, error: "That story has already been dealt with." });

      case "spike_held":
        // Stays hidden: exactly what the newsroom's Hide does, so it can
        // still be shown from there if the Fed changes its mind.
        return res.status(200).json(await settleHeld(params.id, {})
          ? { ok: true, note: "Spiked. It will not run." }
          : { ok: false, error: "That story has already been dealt with." });

      // A note on the timeline, with no price consequence. The chart draws a
      // vertical rule for every market_events row, so this is how you mark
      // "the band started" or "Dave arrived" — the things that explain a jump
      // without having caused it.
      //
      // Deliberately NOT a new table: a marker is an event that moved prices by
      // nothing, and pct_change = 0 says exactly that. It also means markers
      // show up in Recent Events and can be deleted the same way.
      case "add_marker": {
        const headline = String(params.headline || "").trim();
        if (!headline) {
          return res.status(400).json({ error: "A marker needs something to say." });
        }
        await post("market_events", {
          company_id: params.company_id || null,
          headline,
          pct_change: 0,
        });
        if (params.broadcast_wsj) {
          await post("events", { type: "breaking_news", payload: { message: headline } });
        }
        return res.status(200).json({ ok: true, note: "Marked on the timeline." });
      }

      case "delete_event": {
        await del(`market_events?id=eq.${params.id}`);
        return res.status(200).json({ ok: true, note: "Taken off the timeline." });
      }

      // The weather dials. Guardrails are deliberately tight: these numbers
      // compound every interval on every company, so a fat finger on the spread
      // is the one setting here that can flatten the whole economy in minutes.
      case "set_drift": {
        const [cur] = await rest("market_state", "select=*&id=eq.1");
        const fields = {};
        if (params.enabled !== undefined) fields.drift_enabled = Boolean(params.enabled);

        // Merge over the current settings, because any of the three can be sent
        // on its own and the limits below depend on all of them together.
        const interval = params.interval_seconds !== undefined
          ? Math.round(Number(params.interval_seconds)) : Number(cur?.drift_interval_seconds ?? 300);
        const mean = params.mean !== undefined
          ? Number(params.mean) : Number(cur?.drift_mean ?? 0);
        const stddev = params.stddev !== undefined
          ? Number(params.stddev) : Number(cur?.drift_stddev ?? 1.5);

        if (!Number.isFinite(interval) || interval < 10 || interval > 3600) {
          return res.status(400).json({ error: "Drift every 10 seconds to an hour, no further." });
        }
        if (!Number.isFinite(mean) || !Number.isFinite(stddev) || stddev < 0) {
          return res.status(400).json({ error: "Those are not numbers a market can use." });
        }

        // The limits that matter are PER HOUR, not per tick, because these
        // compound. A 10% mean sounds mild and is catastrophic every ten
        // seconds: 360 ticks an hour takes a 100k share to about 4e64 — past
        // what numeric(16,2) can hold, so every subsequent trade would fail
        // with an overflow rather than anything legible. Volatility scales with
        // the square root of time, which is why the two are checked differently.
        const perHour = 3600 / interval;
        const meanPerHour = Math.abs(mean) * perHour;
        const spreadPerHour = stddev * Math.sqrt(perHour);

        if (meanPerHour > 60) {
          return res.status(400).json({
            error: `That is ${meanPerHour.toFixed(0)}% an hour of one-way drift. Keep it under 60 —`
                 + ` either soften the mean or slow the interval.`,
          });
        }
        if (spreadPerHour > 60) {
          return res.status(400).json({
            error: `That spread compounds to ${spreadPerHour.toFixed(0)}% an hour. Keep it under 60 —`
                 + ` a market that noisy stops being a market.`,
          });
        }

        fields.drift_interval_seconds = interval;
        fields.drift_mean = mean;
        fields.drift_stddev = stddev;

        // Switching drift ON restarts the clock, so it does not immediately
        // catch up for however long it happened to be off.
        if (fields.drift_enabled === true) fields.last_drift_at = new Date().toISOString();
        fields.updated_at = new Date().toISOString();

        await patch("market_state?id=eq.1", fields);
        return res.status(200).json({
          ok: true,
          note: `Weather set — about ${meanPerHour.toFixed(0)}% an hour of tide,`
              + ` ${spreadPerHour.toFixed(0)}% of chop.`,
        });
      }

      // For the dry run: skip the timer and drift once, now.
      case "drift_now":
        return res.status(200).json(await rpc("wex_drift", { p_force: true }));

      case "set_price": {
        const result = await rpc("wex_set_price", {
          p_company: params.company_id,
          p_price: Number(params.price),
        });
        return res.status(200).json(result?.ok ? { ok: true } : { ok: false, error: result?.error });
      }

      case "reset_market":
        return res.status(200).json(await rpc("wex_reset_market", {}));

      case "reset_all":
        return res.status(200).json(await rpc("wex_reset_all", {}));

      // ------------------------------------------------------------------
      // Companies
      // ------------------------------------------------------------------
      case "upsert_company": {
        const fields = {};
        for (const k of ["ticker", "name", "ceo_name", "blurb", "liquidity", "sort_order", "is_listed", "color"]) {
          if (params[k] !== undefined) fields[k] = params[k];
        }
        // The player who can file press releases for this company. "" from
        // the dropdown's "nobody" option means unlink.
        if (params.ceo_player_id !== undefined) fields.ceo_player_id = params.ceo_player_id || null;
        if (params.id) {
          // Changing open_price rebases the % change everyone sees, so it is
          // only settable deliberately, never as a side effect of a rename.
          if (params.open_price !== undefined) {
            fields.open_price = Number(params.open_price);
            fields.price = Number(params.open_price);
          }
          try {
            await patch(`companies?id=eq.${params.id}`, fields);
          } catch (err) {
            // One CEO, one company (supabase/held.sql). The dropdown already
            // hides taken players, so this is two tabs racing each other.
            if (String(err.message).includes("companies_ceo_player_id_key")) {
              return res.status(200).json({ ok: false, error: "That worm already runs another company." });
            }
            throw err;
          }
          return res.status(200).json({ ok: true });
        }
        const startPrice = Number(params.open_price || 100000);
        const created = await post("companies", {
          ...fields, price: startPrice, open_price: startPrice,
        });
        const row = Array.isArray(created) ? created[0] : created;
        await post("price_ticks", { company_id: row.id, price: startPrice, reason: "open" });
        return res.status(200).json({ ok: true, company: row });
      }

      case "delete_company": {
        await del(`companies?id=eq.${params.id}`);
        return res.status(200).json({ ok: true });
      }

      // ------------------------------------------------------------------
      // Players
      // ------------------------------------------------------------------
      case "add_player": {
        const code = await freshCode();
        const cash = Number(params.cash || 1500000);
        const created = await post("players", {
          code, cash, starting_cash: cash,
        });
        return res.status(200).json({ ok: true, player: Array.isArray(created) ? created[0] : created });
      }

      case "regenerate_code": {
        const code = await freshCode();
        await patch(`players?id=eq.${params.id}`, { code });
        return res.status(200).json({ ok: true, code });
      }

      case "set_cash": {
        const cash = Number(params.cash);
        if (!Number.isFinite(cash) || cash < 0) {
          return res.status(400).json({ error: "That is not an amount of WORMCOIN." });
        }
        // `also_starting` rebases their % return too — use it when correcting
        // a fortune that was wrong from the outset, not when handing out a
        // mid-game bonus you want the leaderboard to notice.
        const fields = params.also_starting ? { cash, starting_cash: cash } : { cash };
        await patch(`players?id=eq.${params.id}`, fields);
        return res.status(200).json({ ok: true });
      }

      case "unclaim_player": {
        await patch(`players?id=eq.${params.id}`, {
          display_name: null, is_claimed: false, claimed_at: null,
        });
        return res.status(200).json({ ok: true });
      }

      case "delete_player": {
        // trades reference players with ON DELETE SET NULL, so they would
        // survive as anonymous rows on the tape. Clear them first.
        await del(`trades?player_id=eq.${params.id}`);
        await del(`holdings?player_id=eq.${params.id}`);
        await del(`players?id=eq.${params.id}`);
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    console.error("[api/wexgm]", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
