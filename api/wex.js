// ============================================================================
// /api/wex — the guest-facing exchange API
// ============================================================================
// Authentication is the player's three-word code. It is a bearer token: anyone
// holding it IS that player. That is the right trade-off for a party, and it
// is why `players` has no anon SELECT policy — a code must never be fetchable.
//
// Everything that touches money runs server-side. The client is only ever told
// results, never trusted to compute them. `trade` in particular delegates to
// the execute_trade() Postgres function so the whole read-check-write happens
// inside one transaction — see supabase/schema.sql for why that matters.

import { SUPABASE_URL, serviceHeaders, jsonBody, rest, rpc } from "./_supabase.js";

/** Same normalisation as players.code_norm in Postgres and normaliseCode() in the client. */
function normalise(code) {
  return String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Look a player up by their typed code. Returns null if there is no match. */
async function findPlayer(code) {
  const norm = normalise(code);
  if (!norm) return null;
  const rows = await rest(
    "players",
    `select=id,display_name,cash,starting_cash,is_claimed&code_norm=eq.${encodeURIComponent(norm)}`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/**
 * Everything a dashboard needs, in one round trip.
 *
 * Deliberately never includes `code` — the client already has it, and echoing
 * credentials back through the network is how they end up in a log somewhere.
 *
 * `holdings` is the part the phone actually polls for. Cash and share counts
 * live in RLS-denied tables, so they can only come from here — but they change
 * ONLY when the guest trades (in which case the trade response already carries
 * them) or when the Worm Fed intervenes. Prices, which change constantly, the
 * phone now reads straight from PostgREST instead. `companies` and `market` are
 * still returned so the first paint after the gate has figures immediately, and
 * so a trade response is self-contained.
 */
async function portfolioFor(player) {
  const [companies, holdings, state] = await Promise.all([
    // `liquidity` is included so the client can preview what a trade will cost
    // and how far it will move the price. Display only — the server recomputes.
    rest(
      "companies",
      "select=id,ticker,name,ceo_name,blurb,price,open_price,liquidity,is_halted&is_listed=eq.true&order=sort_order"
    ),
    rest("holdings", `select=company_id,shares&player_id=eq.${player.id}&shares=neq.0`),
    rest("market_state", "select=is_open,min_price,max_impact&id=eq.1"),
  ]);

  const held = new Map(
    (Array.isArray(holdings) ? holdings : []).map((h) => [h.company_id, h.shares])
  );

  const positions = (Array.isArray(companies) ? companies : []).map((c) => ({
    ...c,
    shares: held.get(c.id) || 0,
    value: (held.get(c.id) || 0) * Number(c.price),
  }));

  const cash = Number(player.cash);
  const netWorth = positions.reduce((sum, p) => sum + p.value, cash);
  const startingCash = Number(player.starting_cash);

  return {
    player: {
      id: player.id,
      display_name: player.display_name,
      cash,
      starting_cash: startingCash,
      net_worth: netWorth,
      pct_return: startingCash > 0
        ? Math.round(((netWorth / startingCash) - 1) * 1000) / 10
        : null,
    },
    holdings: Array.isArray(holdings) ? holdings : [],
    companies: positions,
    market: Array.isArray(state) && state[0] ? state[0] : { is_open: false },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const payload = jsonBody(req);
  if (!payload) return res.status(400).json({ error: "Malformed request." });

  const { action, code } = payload;

  try {
    // ----------------------------------------------------------------
    // Public reads — no code required. Used by the wall board and by the
    // gate before anyone has logged in.
    // ----------------------------------------------------------------
    if (action === "market") {
      const [companies, state] = await Promise.all([
        rest(
          "companies",
          "select=id,ticker,name,ceo_name,price,open_price,liquidity,is_halted&is_listed=eq.true&order=sort_order"
        ),
        rest("market_state", "select=is_open,max_impact&id=eq.1"),
      ]);
      return res.status(200).json({
        companies: Array.isArray(companies) ? companies : [],
        market: Array.isArray(state) && state[0] ? state[0] : { is_open: false },
      });
    }

    // ----------------------------------------------------------------
    // Everything below needs a valid code.
    // ----------------------------------------------------------------
    const player = await findPlayer(code);
    if (!player) {
      return res.status(403).json({ error: "Those are not your words, worm." });
    }

    switch (action) {
      // Claim an unclaimed account by putting a name to it.
      case "claim": {
        const name = String(payload.display_name || "").trim().slice(0, 40);
        if (!name) {
          return res.status(400).json({ error: "Every worm needs a name." });
        }
        if (player.is_claimed) {
          // Already taken — treat as a login rather than an error, so a guest
          // reopening the page mid-party is not stopped by a stale form.
          return res.status(200).json(await portfolioFor(player));
        }
        const updated = await fetch(
          `${SUPABASE_URL}/rest/v1/players?id=eq.${player.id}`,
          {
            method: "PATCH",
            headers: serviceHeaders(),
            body: JSON.stringify({
              display_name: name,
              is_claimed: true,
              claimed_at: new Date().toISOString(),
            }),
          }
        ).then((r) => r.json());

        const row = Array.isArray(updated) && updated[0] ? updated[0] : player;
        return res.status(200).json(await portfolioFor(row));
      }

      case "login":
      case "portfolio": {
        if (!player.is_claimed) {
          // The gate uses this to decide whether to ask for a name.
          return res.status(200).json({ needs_claim: true });
        }
        return res.status(200).json(await portfolioFor(player));
      }

      case "trade": {
        const shares = Math.floor(Number(payload.shares));
        if (!Number.isFinite(shares) || shares <= 0) {
          return res.status(400).json({ error: "Trade at least one share, worm." });
        }
        if (payload.side !== "buy" && payload.side !== "sell") {
          return res.status(400).json({ error: "That is not a kind of trade." });
        }
        if (!payload.company_id) {
          return res.status(400).json({ error: "Which company?" });
        }

        // One transaction: locks, validates, prices, writes the ledger.
        const result = await rpc("execute_trade", {
          p_code: code,
          p_company: payload.company_id,
          p_side: payload.side,
          p_shares: shares,
        });

        // A refusal from execute_trade is a normal outcome (closed market,
        // not enough cash), not a server fault — 200 with ok:false, so the
        // client can show the in-world message as-is.
        if (!result || result.ok !== true) {
          return res.status(200).json({
            ok: false,
            error: result?.error || result?.message || "The trade did not go through.",
          });
        }

        // Hand back the refreshed portfolio so the dashboard needs no second
        // round trip and cannot briefly display stale figures.
        const after = await findPlayer(code);
        return res.status(200).json({
          ok: true,
          trade: result,
          ...(await portfolioFor(after || player)),
        });
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    console.error("[api/wex]", err);
    return res.status(500).json({ error: "The exchange is having a moment." });
  }
}
