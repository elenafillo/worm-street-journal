import { SUPABASE_URL, serviceHeaders, jsonBody } from "./_supabase.js";

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
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/articles?select=*&order=created_at.desc`,
          { headers: serviceHeaders() }
        );
        return res.status(200).json(await r.json());
      }

      case "hide": {
        await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${params.id}`, {
          method: "PATCH",
          headers: serviceHeaders(),
          body: JSON.stringify({ hidden: params.hidden }),
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
