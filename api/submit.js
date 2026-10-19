import { SUPABASE_URL, serviceHeaders, jsonBody, rest, normaliseCode } from "./_supabase.js";

// Filing a story. See docs/archive/HELD_STORIES_brief.md.
//
// Every story needs the WEX code of a claimed player (`code`). That is the
// gate against strangers who find the link — it replaced the old shared
// SUBMISSION_CODE, which is no longer checked and can be deleted from the
// Vercel env vars. The filer's trading name is recorded in article_filers for
// the GM's eyes only; only the typed byline is ever printed.
//
//   An ordinary story   `held: true` keeps it off the paper until the GM
//                       approves it (from the Exchange tab, optionally with a
//                       market move).
//   A press release     `press: true`. Only from a company's CEO. Always held,
//                       and tagged with the CEO's company, which the server
//                       looks up itself: the page never gets to say which.

/** The claimed player behind a WEX code, or null. Unclaimed accounts have no
 *  trading name, so they count as nobody. */
async function playerFor(code) {
  const norm = normaliseCode(code);
  if (!norm) return null;
  const rows = await rest(
    "players",
    `select=id,display_name,is_claimed&code_norm=eq.${encodeURIComponent(norm)}`
  );
  const p = Array.isArray(rows) ? rows[0] : null;
  return p && p.is_claimed ? p : null;
}

/** The one listed company this player runs, or null (a unique index
 *  guarantees at most one). Same rule as `ceo_of` in /api/wex. */
async function companyRunBy(player) {
  const rows = await rest(
    "companies",
    `select=id&ceo_player_id=eq.${player.id}&is_listed=eq.true`
  );
  return Array.isArray(rows) && rows.length ? rows[0].id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // `payload`, not `body` — the article's own text field is called `body`.
  const payload = jsonBody(req);
  if (!payload) return res.status(400).json({ error: "Malformed request." });

  const { author_name, headline, body, image_url, article_type, scheduled_at, can_be_headline } = payload;
  const press = payload.press === true;

  try {
    // Looked up once, used for both the gate and the CEO check.
    const player = await playerFor(payload.code);
    if (!player) {
      return res.status(403).json({ error: "Log in to WEX to file a story.", needs_login: true });
    }

    const story = { author_name, headline, body, image_url, article_type, scheduled_at, can_be_headline };

    if (press) {
      const companyId = await companyRunBy(player);
      if (!companyId) {
        return res.status(403).json({ error: "Only a CEO can file a press release, worm." });
      }
      // A press release is an article in every other respect, so it lands in
      // the main feed and the broadsheet like one once approved.
      Object.assign(story, {
        article_type: "article", scheduled_at: null, can_be_headline: true,
        press_company_id: companyId,
      });
    }

    // Held = hidden as well, so every existing reader keeps skipping it, and
    // the "read articles" policy keeps it from anon entirely.
    if (press || payload.held === true) Object.assign(story, { held: true, hidden: true });

    const r = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify(story),
    });
    const data = await r.json();

    // Who filed it. Best effort: the story is already in, and losing the
    // GM's note of who wrote it is better than telling the guest it failed.
    const article = Array.isArray(data) ? data[0] : null;
    if (r.ok && article?.id) {
      try {
        const f = await fetch(`${SUPABASE_URL}/rest/v1/article_filers`, {
          method: "POST",
          headers: serviceHeaders(),
          body: JSON.stringify({
            article_id: article.id, player_id: player.id, trading_name: player.display_name,
          }),
        });
        if (!f.ok) console.error("[api/submit] filer not recorded:", await f.text());
      } catch (err) {
        console.error("[api/submit] filer not recorded:", err);
      }
    }

    // Unchanged shape: the form checks for an array whose first row has an id.
    return res.status(200).json(data);
  } catch (err) {
    console.error("[api/submit]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
