import { SUPABASE_URL, serviceHeaders, jsonBody, rest } from "./_supabase.js";

const GM_PASSWORD = process.env.GM_PASSWORD;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const body = jsonBody(req);
  if (!body) return res.status(400).json({ error: "Malformed request." });

  const { password, action, ...params } = body;

  if (!password || password !== GM_PASSWORD) {
    return res.status(403).json({ error: "Wrong password, worm." });
  }

  try {
    switch (action) {
      case "fetch_articles": {
        // Each article gains two GM-only fields: `filed_by`, the trading name
        // of whoever filed it (article_filers — anon can never read that
        // table), and `press_ticker` for a press release. Merged here rather
        // than embedded, so the newsroom still loads if either lookup fails.
        const [articles, filers, companies] = await Promise.all([
          rest("articles", "select=*&order=created_at.desc"),
          rest("article_filers", "select=article_id,trading_name").catch(() => []),
          rest("companies", "select=id,ticker").catch(() => []),
        ]);
        const filedBy = new Map(filers.map((f) => [f.article_id, f.trading_name]));
        const tickerOf = new Map(companies.map((c) => [c.id, c.ticker]));
        return res.status(200).json(articles.map((a) => ({
          ...a,
          filed_by: filedBy.get(a.id) || null,
          press_ticker: a.press_company_id ? tickerOf.get(a.press_company_id) || "?" : null,
        })));
      }

      case "hide": {
        // Showing a held story publishes it without a market move, so it is
        // no longer waiting for approval either. Hiding leaves `held` alone.
        const fields = params.hidden ? { hidden: true } : { hidden: false, held: false };
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${params.id}`, {
          method: "PATCH",
          headers: serviceHeaders(),
          body: JSON.stringify(fields),
        });
        return res.status(200).json({ ok: true });
      }

      case "delete": {
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${params.id}`, {
          method: "DELETE",
          headers: serviceHeaders(),
        });
        return res.status(200).json({ ok: true });
      }

      case "headline": {
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${params.id}`, {
          method: "PATCH",
          headers: serviceHeaders(),
          body: JSON.stringify({ can_be_headline: params.can_be_headline }),
        });
        return res.status(200).json({ ok: true });
      }

      case "trigger_breaking": {
        await fetch(`${SUPABASE_URL}/rest/v1/events`, {
          method: "POST",
          headers: serviceHeaders(),
          body: JSON.stringify({ type: "breaking_news", payload: { message: params.message } }),
        });
        return res.status(200).json({ ok: true });
      }

      case "clear_breaking": {
        await fetch(`${SUPABASE_URL}/rest/v1/events`, {
          method: "POST",
          headers: serviceHeaders(),
          body: JSON.stringify({ type: "clear_breaking", payload: {} }),
        });
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ error: "Unknown action" });
    }
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
}
