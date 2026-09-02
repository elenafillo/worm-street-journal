# Worm Street — Project Handoff

## What It Is
A weekend party game — **Worm Street** (worms + Wall Street). The centrepiece is a projected wall display showing two live panels: a stock exchange (WEX) and a newspaper (Worm Street Journal). Guests interact via their phones.

**Stack:** React + Vite · Supabase (Postgres + Storage) · Vercel

---

## What's Built

**Both panels now exist.** The newspaper (WSJ) is complete and deployed. The
exchange (WEX) has a working database, guest API, phone dashboard and GM tooling;
the public wall dashboard at `/#wex` is the one thing left. See
[WEX_plan.md](WEX_plan.md) for its status table and design notes.

### Worm Street Journal (WSJ)

`src/App.jsx` holds the newspaper screens and the router. Shared pieces were
pulled out when WEX arrived: `src/lib/supabase.js` (the PostgREST client),
`src/lib/config.js` (`DISPLAY_STYLE`, `PARTY_THURSDAY`, `BREAKING_DURATION_MS`)
and `api/_supabase.js` (service-role headers, shared by every handler).

Two other `.jsx` files sit alongside it. Both are **untracked, kept locally for reference only, and imported by nothing** — Vite never bundles them:
- `src/App_old.jsx` — the previous version of the app.
- `src/App_broadsheet.jsx` — an early broadsheet-only prototype. Contains a hardcoded `GM_PASSWORD` on line 8, from before auth moved server-side into `api/gm.js`. Untracked precisely so that stays out of the repo — don't re-add it.

| Route | URL | What it does |
|---|---|---|
| Broadsheet | `/#broadsheet` | Fixed-canvas newspaper front page — **default landing page** (see below) · nav **WSJ** |
| Feed | `/#display` | Vertical article feed, auto-refreshes every 4s, alternates image left/right — tab hidden from nav for now |
| Exchange | `/#trade` | Guest phone dashboard: three-word gate, portfolio, buy/sell · nav **WEX**, becoming **TRADE** in phase 6 |
| Submit | `/#submit` | Guest article form with optional image upload (≤5MB) · nav **FILE** |
| GM Panel | `/#gm` | Password-gated moderation: hide/delete articles, headline toggle, fire BREAKING NEWS banner · nav **FED** |
| WEX dashboard | `/#wex` | Public wall panel projected beside the broadsheet: price chart, legend, market health, leaderboards, tape. Scrolls; reflows to one column on a phone · nav **WEX**. Params: `?window=15m\|1h\|all`, `?y=pct\|abs`, `?only=ANL,MLC` |
| Price board | `/#board` | **Planned (phase 7, optional)** — seven enormous price rows + sparklines. Off-nav, like Feed. |

Nav labels are deliberately short words so the bar fits one phone line without
wrapping. There is no separate brand element — **WSJ** is the broadsheet link.
Phase 6 takes it to five: **WSJ · WEX · TRADE · FILE · FED**, with WEX moving to
the new dashboard and TRADE taking over the phone screen it used to point at.

### Data model (Supabase)
- `articles` — `id, author_name, headline, body, image_url, hidden, can_be_headline, article_type, scheduled_at, created_at`
  - `article_type`: `'article'` (default) | `'notice'` | `'entertainment'`
  - `scheduled_at`: TIMESTAMPTZ, only set for `entertainment` rows; used for ordering and auto-expiry
- `events` — `id, type, payload, created_at` (used for breaking news signals; types: `breaking_news`, `clear_breaking`)
- Storage bucket: `wsj-images` (public)
- RLS: enabled on both tables. Public anon role has SELECT and INSERT only — no UPDATE or DELETE. All GM mutations go through a Vercel serverless function (`api/gm.js`) using the service role key, which bypasses RLS.

### Notable implementation details
- **GM panel security** — password is checked server-side in `api/gm.js` (Vercel serverless function). The GM password and Supabase service role key live in Vercel env vars and are never sent to the browser. The frontend only holds the anon key (public by design).
- **Submission code** — guest article submission is gated by a code field in the form. On submit, the frontend POSTs to `api/submit.js` (Vercel serverless function) which checks the code against `SUBMISSION_CODE` env var before inserting into Supabase using the service role key. The code never touches the client bundle. Supabase RLS has INSERT removed from the anon role on `articles`, so direct API calls without the code are also blocked. To change the code, update `SUBMISSION_CODE` in the Vercel dashboard (and `.env.local` for local dev).
- **No real-time websockets** — `supabase.subscribe()` is a `setInterval` polling every 4 seconds. Works fine for the party; upgrade to Supabase Realtime channels if you want true push.
- **Price drift ("the weather")** — every `drift_interval_seconds`, each listed company's price is multiplied by `(1 + d/100)` where `d` is a normal draw with an economy-wide mean and standard deviation. All four dials live in `market_state` and are set from GM → WEX → Exchange → The Weather, with presets (Gentle swell / Choppy / Slow bleed / Bull run / Storm). **Off by default.** Its point is that buy pressure alone only pushes prices up, so without it the ranking freezes once everyone is invested and holding is never a decision; a negative mean is what makes cash worth holding.
  - **Driven by `pg_cron`**, which is free on Supabase — enable it under Database → Extensions; [supabase/drift.sql](supabase/drift.sql) schedules the job. It fires `select wex_drift();` **every minute, unconditionally**: the job is dumb on purpose, because all the conditions live in the function, which returns immediately unless drift is on, the market is open, and a full interval has elapsed. So the GM weather switch governs everything and the schedule never needs touching. A one-minute heartbeat serves any interval — four calls in five cost a single cheap SELECT.
  - `wex_drift()` is also idempotent and time-gated, which is what lets it be called from the two paths already polling during a party — `/api/wexgm` `overview` and `/api/wex` `portfolio` — as belt and braces for the night cron stops. Both are service-role; it is **not** granted to anon.
  - ⚠️ **Ring the closing bell at the end of the night.** A real scheduler runs whether or not anyone is in the room — drift used to stop by itself when the last screen closed, and no longer does. Left open overnight with the weather on, you return to several hundred intervals of drift. `wex_drift()` checks `is_open`, so closing the exchange is the whole fix.
  - Deliberately **not** called from `execute_trade` — that is the one piece of concurrency-critical SQL in the project, and drift would make every trade contend on the `market_state` row. Not worth re-testing for a few seconds of freshness the GM poll already gives.
  - Halted companies sit it out, nothing drifts while the market is closed, and opening the market restarts the clock so an overnight closure doesn't cause a catch-up cliff. Catch-up is capped at 5 intervals.
  - **Limits are per hour, not per tick**, because these compound: a 10% mean sounds mild and every 10 seconds takes a 100k share past `numeric(16,2)`, after which *every trade* fails on overflow. `api/wexgm.js` caps tide and chop at ~60%/hour (volatility scaling as √t), and `wex_drift()` carries a hard 1e12 price ceiling in case someone edits `market_state` by hand.
- **The WEX polling split** — `/#trade` reads **prices** straight from Supabase with the anon key (5s), and only calls `/api/wex` for **cash and holdings** (45s, plus an immediate refresh when the bell rings, which also catches a reset). Prices change constantly and are anon-readable; cash and holdings are RLS-denied and change only when that guest trades — and the trade response already carries them. This matters because every `/api/wex` call is a Vercel serverless invocation: the old 5s portfolio poll was ~12 invocations per phone per minute, or roughly 1.7M for 80 guests over three days. It is now ~1.3. Net worth is added up client-side from server-supplied cash, shares and prices — display only; the leaderboard that decides who wins is still computed in SQL.
- Breaking news ticker works on both Feed and Broadsheet. Auto-clears after 5 minutes (controlled by `BREAKING_DURATION_MS` constant at top of file) or when GM manually clears. The GM panel shows the currently live banner text and a live countdown to when it will auto-clear.
- Image upload goes directly to Supabase Storage via `fetch`; returns a public URL stored on the article row.
- Two visual styles: **Classic** (Playfair + UnifrakturMaguntia, sepia paper) and **Modern** (clean sans-serif, white background, bold type, red accent). Switched via `DISPLAY_STYLE` constant at top of file — **currently set to `"modern"`**.
- Hash routing — query params must be parsed from `window.location.hash`, not `window.location.search`.
- **Notices & Entertainment** — `article_type` determines routing: `'article'` → main feed & broadsheet columns; `'notice'` → sidebar Notices section; `'entertainment'` → sidebar Entertainment section. Notices/events never appear in the main feed or broadsheet hero. `can_be_headline` is set `false` on insert for non-articles so they can't enter the random hero rotation.
- **Party dates** — `PARTY_THURSDAY` constant at top of file (ISO date string). Update this before each event — **currently set to `2026-11-26`**. The submit form's day buttons (THU/FRI/SAT/SUN) derive their actual dates from it. Entertainment event timestamps are constructed in the guest's local timezone.
- **Event expiry** — filtering is client-side: events with `scheduled_at` more than 1 hour in the past are hidden from the broadsheet. No DB changes needed; they naturally reappear if someone sets a future date.

### Broadsheet (`/#broadsheet`)
Fixed 1200×960px canvas centred on a dark background. Use browser zoom (Ctrl+/−) to fit the projected screen — the layout never reflows **on desktop**. On mobile (≤768px) it automatically reflows into a scrollable single-column layout (see below).

Two modes controlled via URL params:
- **`?mode=recent`** (default) — most recent article is the hero, next 3 fill the secondary row
- **`?mode=random&speed=N`** — hero rotates randomly through headline-eligible articles every N seconds (min 5, default 15)

**Desktop layout:**
- Full-width masthead
- Left (~80%): large hero article (headline + square image + full body) above a 3-column secondary row (each with square image + headline + excerpt)
- Right sidebar (~20%): "Notices & Entertainment" — two sections:
  - **Notices**: up to 4 most recent, no time, always visible until GM hides
  - **Entertainment**: up to 6 events sorted soonest first, auto-removed client-side 1h after `scheduled_at`

**Mobile layout (≤768px, CSS `@media` only — no JSX changes):**
- Masthead → hero (full-width image above text) → secondary articles as stacked image-left/text-right cards → Notices & Entertainment section at the bottom
- Implemented via a single `@media (max-width: 768px)` block at the end of the `styles` string; uses CSS grid on `.broadsheet-secondary-item` to keep image pinned left without a JSX wrapper

GM controls the `can_be_headline` toggle per article (visible in `/#gm`). Only articles with `can_be_headline = true` (the default) enter the random rotation hero pool.

---

## TODO

Working list. WEX has its own detailed plan and status table in
[WEX_plan.md](WEX_plan.md) — this is the whole-project view.

### Blocking the party
- [ ] **Name the seven companies** — currently placeholders (ANL, MLC, CST, BUR, SLM, CMP, SEG) all at 100,000 ⌀. Real names, tickers, and which attendee fronts each. GM panel → WEX → Companies.
- [ ] **Update `PARTY_THURSDAY`** in [src/lib/config.js](src/lib/config.js) — currently `2026-11-26`.
- [x] ~~**WEX dashboard (`/#wex`)** — built.~~ Price chart, legend, market-health tiles, both leaderboards, trade tape, on a light paper sheet like the newspaper. Scrolls rather than fitting a fixed canvas. Two things still open:
  - [ ] **Run [supabase/dashboard.sql](supabase/dashboard.sql)** in the SQL editor. Adds `companies.color` and the `market_health` / `company_stats` aggregate views — the only way a public page can show cash-vs-invested, volume and holder counts without giving anon `players` / `holdings` / `trades`. Until it runs, the page works but the six stat tiles stay blank and say so.
  - [ ] **Look at it in a browser** — `npm run dev`, then `/#wex`. Nothing has been visually verified: no headless browser was available when it was built. Check the chart at a narrow window, the legend toggles, the hover tooltip, and it side by side with `/#broadsheet`.
- [ ] **Price board (`/#board`)** — phase 7, optional. Seven enormous rows with sparklines and the OPEN/CLOSED stamp, for a second screen. Kept separate from the dashboard on purpose: the two are read from different distances, and merging them shrinks both ([WEX_plan.md §8](WEX_plan.md)).
- [ ] Print the code cards and decide who gets which fortune at the door.
- [ ] **QR code to `/#trade`** — how guests actually reach the exchange on their phones.
- [x] ~~**WEX phase 5** — `api/wexgm.js` + WEX admin~~ ✓ Done. `/#gm` splits into two desks: **WSJ · The Newsroom** and **WEX · The Exchange**.

### Should do
- [x] ~~Shorten nav labels to WSJ / WEX / FILE / FED~~ ✓ Done — fits one phone line; the standalone brand became the broadsheet link.
- [ ] **Re-paste [supabase/smoke_test.sql](supabase/smoke_test.sql)** — check 5 had a wrong assertion (spread is exactly 1,080 ⌀, not <1,000). Test-only.
- [ ] **`price_ticks` growth** — a row per trade. Handled for now by client-side bucketing plus incremental fetching in the dashboard's data hook ([WEX_plan.md §8.4](WEX_plan.md)), which keeps the payload flat however long a session runs. Server-side `wex_price_series` only if that stops being true.
- [ ] **Surface `also_starting` on set-cash** — the API already supports rebasing a player's `starting_cash` alongside their cash (for correcting a fortune that was wrong from the start, as opposed to a mid-game bonus that *should* show up in their % return). Not yet exposed as a checkbox in the Players tab.
- [ ] **End-of-party results export** — a "final standings" snapshot before you reset, so the winner is recorded and the newspaper can report it. Right now a reset erases the evidence.
- [ ] **Test the GM panel on a phone** — it was built desktop-first, on the assumption you run it from a laptop. If you plan to GM from your pocket, it needs a pass.
- [ ] **Remove the "PRICE: 1 WORMCOIN" text** — two occurrences in [src/App.jsx](src/App.jsx) (feed masthead and broadsheet masthead).
- [ ] **9 pre-existing lint errors** in `App.jsx` and the two untracked variants — all `react-hooks/set-state-in-effect`. Predate WEX; `npm run lint` has never been clean. New WEX files are clean.
- [ ] Point a domain / share a QR code with guests.

### Nice-to-have
- [ ] **Print button on the broadsheet** — saves the current display as an image. Paired with an "Extra, extra" button in the GM panel that captures the display and runs the old-school spinning-newspaper TV effect. Needs a capture library (e.g. `html-to-image`); nothing installed yet.
- [ ] **Accent colour per box type** — vary the accent for article vs notice vs event. Right now `article_type` only drives routing and text labels; notices and events share `.sidebar-notice`.
- [ ] **Ticker tag on articles** — link a story to a WEX stock. Now possible: `companies.ticker` exists.
- [ ] **CEO press releases** — a CEO files a story that moves their own share price. Schema is ready (`companies.ceo_player_id`); would add `article_type='press_release'` going through GM approval.
- [ ] Article image moderation in the GM panel (preview before showing).
- [ ] Sound effect when the BREAKING banner fires.
- [ ] **Short selling** — deferred from WEX v0. `holdings.shares` is already signed and `trades.side` is a text check, so no migration is needed.
- [x] ~~**Price drift** — a cron nudging prices between trades~~ ✓ Done, without a cron. See the note above and [supabase/drift.sql](supabase/drift.sql).
- [ ] **Event deck** — pre-written GM cards (dirt scandal −10%, etc). See WEX_plan.md §5; marked *maybe*.
- [x] ~~Party-code gate on `/#submit`~~ ✓ Done
- [x] ~~Deploy to Vercel~~ ✓ Done — https://worm-street-journal.vercel.app

---

## Dev Setup

```bash
npm install
npm run dev               # localhost:5173 — the whole app, including /api/* routes
npm run dev -- --host     # same, but also exposes on local network — open the Network URL on your phone to test mobile layouts
vercel dev                # localhost:3000 — the real Vercel runtime; useful as a cross-check
```

`npm run dev` now serves `api/*.js` too, via a small dev-only plugin in
[vite.config.js](vite.config.js), so the GM panel and WEX work on :5173 with no
second process. `vercel dev` still works and is the more faithful runtime, but
on Node 24 / Windows it prints a libuv assertion (`UV_HANDLE_CLOSING`) on
startup and is easier to knock over.

One gotcha when testing endpoints by hand on Windows: PowerShell strips double
quotes when passing arguments to `curl.exe`, and `Set-Content -Encoding utf8`
adds a BOM — both produce a bogus "malformed JSON" 400 that looks like a server
bug. Write the body with `[System.IO.File]::WriteAllText(...)` and pass it as
`--data "@file.json"`.

Supabase project is already live and connected. No local Supabase needed.

Env vars for local dev live in `.env.local` (git-ignored). For production, the same vars are set in the Vercel dashboard under Project → Settings → Environment Variables.
