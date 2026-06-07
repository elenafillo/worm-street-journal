# Worm Street — Project Handoff

## What It Is
A weekend party game — **Worm Street** (worms + Wall Street). The centrepiece is a projected wall display showing two live panels: a stock exchange (WEX) and a newspaper (Worm Street Journal). Guests interact via their phones.

**Stack:** React + Vite · Supabase (Postgres + Storage) · Vercel

---

## What's Built: Worm Street Journal (WSJ)

Working file is `src/App_1905.jsx` (imported by `src/main.jsx` as `App.jsx` — keep in sync).

| Route | URL | What it does |
|---|---|---|
| Feed | `/#display` | Vertical article feed, auto-refreshes every 4s, alternates image left/right |
| Broadsheet | `/#broadsheet` | Fixed-canvas newspaper front page (see below) |
| Submit | `/#submit` | Guest article form with optional image upload (≤5MB) |
| GM Panel | `/#gm` | Password-gated moderation: hide/delete articles, headline toggle, fire BREAKING NEWS banner |

### Data model (Supabase)
- `articles` — `id, author_name, headline, body, image_url, hidden, can_be_headline, created_at`
- `events` — `id, type, payload, created_at` (used for breaking news signals; types: `breaking_news`, `clear_breaking`)
- Storage bucket: `wsj-images` (public)
- RLS: the tables have now RLS with insert/select public permissions.

### Notable implementation details
- **No real-time websockets** — `supabase.subscribe()` is a `setInterval` polling every 4 seconds. Works fine for the party; upgrade to Supabase Realtime channels if you want true push.
- Breaking news ticker works on both Feed and Broadsheet. Auto-clears after 10 minutes or when GM manually clears.
- Image upload goes directly to Supabase Storage via `fetch`; returns a public URL stored on the article row.
- Two visual styles: **Classic** (Playfair + UnifrakturMaguntia, sepia paper) and **Modern** (clean sans-serif, white background, bold type, red accent). Switched via `DISPLAY_STYLE` constant at top of file.
- Hash routing — query params must be parsed from `window.location.hash`, not `window.location.search`.

### Broadsheet (`/#broadsheet`)
Fixed 1200×960px canvas centred on a dark background. Use browser zoom (Ctrl+/−) to fit the projected screen — the layout never reflows.

Two modes controlled via URL params:
- **`?mode=recent`** (default) — most recent article is the hero, next 3 fill the secondary row
- **`?mode=random&speed=N`** — hero rotates randomly through headline-eligible articles every N seconds (min 5, default 15)

Layout:
- Full-width masthead
- Left (~80%): large hero article (headline + square image + full body) above a 3-column secondary row (each with square image + headline + excerpt)
- Right sidebar (~20%): "Notices & Entertainment" — placeholder for now

GM controls the `can_be_headline` toggle per article (visible in `/#gm`). Only articles with `can_be_headline = true` (the default) enter the random rotation hero pool.

---

## Known Issues / Things to Fix Before the Party

### 1. ~~Secrets are hardcoded~~ ✓ Done
Supabase URL, anon key, and GM password moved to env vars / private location.

### 2. ~~Test image upload end-to-end~~ ✓ Done
Image upload confirmed working. Storage bucket is `wsj-images`.

### 3. ~~WSJ visual style — classic vs modern~~ ✓ Done
Both styles implemented; toggle `DISPLAY_STYLE` constant.

### 4. ~~Broadsheet display route~~ ✓ Done
See above. `can_be_headline` column added to Supabase.

---

## Next Up (WSJ focus)

### 1. Security / RLS
Currently RLS is disabled on Supabase, meaning anyone with the anon key can read/write freely. Options:
- **Re-enable RLS with service-role key on the server side** — Vercel serverless function or Supabase Edge Function holds the `service_role` key; GM mutations route through it after password check.
- At minimum: party-code gate on `/#submit` so only guests with the code can file stories.
- Rate limiting on article submission (one per guest per N minutes).

### 2. Notices & Entertainment column
The sidebar on `/#broadsheet` is a placeholder. To build it out:
- Add `article_type TEXT DEFAULT 'article'` column to `articles` (`ALTER TABLE articles ADD COLUMN article_type TEXT DEFAULT 'article';`)
- Add a "Submit as Notice" toggle on `/#submit` — hides image field, caps body at ~160 chars
- Broadsheet sidebar renders notices filtered by `article_type = 'notice'`

---

## What's Not Built Yet

### WEX — Worm Exchange (deferred, WSJ is current focus)
- Player registration (name → portfolio)
- Stock listings (fictional worm companies)
- Buy / sell / short interface on phones
- Live stock price board on the wall
- Price movement logic (time-based decay? GM-triggered events?)

### Deployment
- Deploy to Vercel (Vite project — add env vars in Vercel dashboard)
- Point a domain / share QR code with guests

### Optional / nice-to-have
- Ticker tag on articles (links to a WEX stock once WEX exists)
- Article image moderation in GM panel (preview before showing)
- Sound effect when BREAKING banner fires
- Party-code gate on `/#submit`

---

## Dev Setup

```bash
npm install
npm run dev        # runs on localhost:5173
```

Supabase project is already live and connected. No local Supabase needed.
