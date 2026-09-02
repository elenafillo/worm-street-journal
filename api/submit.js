import { SUPABASE_URL, serviceHeaders, jsonBody } from "./_supabase.js";

const SUBMISSION_CODE = process.env.SUBMISSION_CODE;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // `payload`, not `body` — the article's own text field is called `body`.
  const payload = jsonBody(req);
  if (!payload) return res.status(400).json({ error: "Malformed request." });

  const { submission_code, author_name, headline, body, image_url, article_type, scheduled_at, can_be_headline } = payload;

  if (!submission_code || submission_code !== SUBMISSION_CODE) {
    return res.status(403).json({ error: "Wrong submission code." });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({ author_name, headline, body, image_url, article_type, scheduled_at, can_be_headline }),
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
}
