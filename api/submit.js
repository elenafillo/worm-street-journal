import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUBMISSION_CODE = process.env.SUBMISSION_CODE;

function serviceHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { submission_code, author_name, headline, body, image_url, article_type, scheduled_at, can_be_headline } = req.body;

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
