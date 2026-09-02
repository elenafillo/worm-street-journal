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
        const [companies, state, board, events] = await Promise.all([
          rest("companies", "select=*&order=sort_order"),
          rest("market_state", "select=*&id=eq.1"),
          rest("leaderboard", "select=*&order=net_worth.desc"),
          rest("market_events", "select=*&order=created_at.desc&limit=8"),
        ]);
        return res.status(200).json({
          companies,
          market: state[0] || {},
          leaderboard: board,
          events,
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
      case "open_market":
        await patch("market_state?id=eq.1", {
          is_open: true, opened_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        return res.status(200).json({ ok: true });

      case "close_market":
        await patch("market_state?id=eq.1", {
          is_open: false, closed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
        return res.status(200).json({ ok: true });

      case "halt": {
        const target = params.company_id
          ? `companies?id=eq.${params.company_id}`
          : "companies?is_listed=eq.true";
        await patch(target, { is_halted: Boolean(params.halted) });
        return res.status(200).json({ ok: true });
      }

      case "fire_event": {
        const result = await rpc("wex_fire_event", {
          p_company: params.company_id || null,
          p_headline: params.headline,
          p_pct: Number(params.pct_change),
        });
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
        return res.status(200).json({ ok: true, ...result });
      }

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
        if (params.id) {
          // Changing open_price rebases the % change everyone sees, so it is
          // only settable deliberately, never as a side effect of a rename.
          if (params.open_price !== undefined) {
            fields.open_price = Number(params.open_price);
            fields.price = Number(params.open_price);
          }
          await patch(`companies?id=eq.${params.id}`, fields);
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
