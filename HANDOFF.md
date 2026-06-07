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
- `articles` — `id, author_name, headline, body, image_url, hidden, can_be_headline, article_type, scheduled_at, created_at`
  - `article_type`: `'article'` (default) | `'notice'` | `'entertainment'`
  - `scheduled_at`: TIMESTAMPTZ, only set for `entertainment` rows; used for ordering and auto-expiry
- `events` — `id, type, payload, created_at` (used for breaking news signals; types: `breaking_news`, `clear_breaking`)
- Storage bucket: `wsj-images` (public)
- RLS: enabled on both tables. Public anon role has SELECT and INSERT only — no UPDATE or DELETE. All GM mutations go through a Vercel serverless function (`api/gm.js`) using the service role key, which bypasses RLS.

### Notable implementation details
- **GM panel security** — password is checked server-side in `api/gm.js` (Vercel serverless function). The GM password and Supabase service role key live in Vercel env vars and are never sent to the browser. The frontend only holds the anon key (public by design).
- **No real-time websockets** — `supabase.subscribe()` is a `setInterval` polling every 4 seconds. Works fine for the party; upgrade to Supabase Realtime channels if you want true push.
- Breaking news ticker works on both Feed and Broadsheet. Auto-clears after 10 minutes or when GM manually clears.
- Image upload goes directly to Supabase Storage via `fetch`; returns a public URL stored on the article row.
- Two visual styles: **Classic** (Playfair + UnifrakturMaguntia, sepia paper) and **Modern** (clean sans-serif, white background, bold type, red accent). Switched via `DISPLAY_STYLE` constant at top of file.
- Hash routing — query params must be parsed from `window.location.hash`, not `window.location.search`.
- **Notices & Entertainment** — `article_type` determines routing: `'article'` → main feed & broadsheet columns; `'notice'` → sidebar Notices section; `'entertainment'` → sidebar Entertainment section. Notices/events never appear in the main feed or broadsheet hero. `can_be_headline` is set `false` on insert for non-articles so they can't enter the random hero rotation.
- **Party dates** — `PARTY_THURSDAY` constant at top of file (ISO date string). Update this before each event. The submit form's day buttons (THU/FRI/SAT/SUN) derive their actual dates from it. Entertainment event timestamps are constructed in the guest's local timezone.
- **Event expiry** — filtering is client-side: events with `scheduled_at` more than 1 hour in the past are hidden from the broadsheet. No DB changes needed; they naturally reappear if someone sets a future date.

### Broadsheet (`/#broadsheet`)
Fixed 1200×960px canvas centred on a dark background. Use browser zoom (Ctrl+/−) to fit the projected screen — the layout never reflows.

Two modes controlled via URL params:
- **`?mode=recent`** (default) — most recent article is the hero, next 3 fill the secondary row
- **`?mode=random&speed=N`** — hero rotates randomly through headline-eligible articles every N seconds (min 5, default 15)

Layout:
- Full-width masthead
- Left (~80%): large hero article (headline + square image + full body) above a 3-column secondary row (each with square image + headline + excerpt)
- Right sidebar (~20%): "Notices & Entertainment" — two sections:
  - **Notices**: up to 4 most recent, no time, always visible until GM hides
  - **Entertainment**: up to 6 events sorted soonest first, auto-removed client-side 1h after `scheduled_at`

GM controls the `can_be_headline` toggle per article (visible in `/#gm`). Only articles with `can_be_headline = true` (the default) enter the random rotation hero pool.

---

## Todo

### Display the banner text under the banner box in the GM panel

### Make a mobile-friendly display

### Add a "print" button to broadsheet that saves the current display as an image
Also, add a "Extra, extra" button to the GM panel, which captures the current display as an image and does the spinning effect from old-school TV.


---

## What's Not Built Yet

### WEX — Worm Exchange (deferred, WSJ is current focus)
- Player registration (name → portfolio)
- Stock listings (fictional worm companies)
- Buy / sell / short interface on phones
- Live stock price board on the wall
- Price movement logic (time-based decay? GM-triggered events?)

### Deployment
- ~~Deploy to Vercel~~ ✓ Done — live at worm-street-journal.vercel.app
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
npm run dev        # runs on localhost:5173 — guest-facing routes only
vercel dev         # runs on localhost:3000 — use this to test the GM panel (api/gm.js)
```

Supabase project is already live and connected. No local Supabase needed.

Env vars for local dev live in `.env.local` (git-ignored). For production, the same vars are set in the Vercel dashboard under Project → Settings → Environment Variables.
