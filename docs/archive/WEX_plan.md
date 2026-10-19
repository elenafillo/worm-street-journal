> **Archived 2026-10-02.** The build plan and status log for WEX, frozen as it was.
> Statuses, line links and some claims here are out of date. For how things work
> now, start at [docs/](../).

# WEX — The Worm Stock Exchange

> Working plan **and** status log. Updated as the build progresses.
> Companion to [HANDOFF.md](HANDOFF.md), which covers the newspaper side.

---

## Status

**Currently:** phases 0–5 done. Trading works end to end on real devices, and
`schema.sql` has been re-run — `wex_fire_event`, `wex_set_price`,
`wex_reset_market` and `wex_reset_all` are all installed, so firing events,
setting prices by hand and both resets now work from the GM panel.

Next: **phase 6, the WEX dashboard** — the public `#wex` panel projected beside
the newspaper. Full staged plan in [§8](#8-phase-6--the-wex-dashboard-wex),
which also settles dashboard-vs-board, the nav, and the light sheet.

| Phase | Work | Status |
|---|---|---|
| 0 | `supabase/schema.sql` + views + `execute_trade` + `seed.sql` + `smoke_test.sql` | ✅ run · 7 companies, 30 players loaded |
| 1 | Shared extraction (`src/lib/supabase.js`, `api/_supabase.js`) + router fix | ✅ done — build passes |
| 2 | `src/wex/wordlists.js` + `scripts/generate-players.mjs` → review → load | ✅ roster generated and loaded |
| 3 | `api/wex.js` — guest API | ✅ **19/19 end-to-end over HTTP** |
| 4 | `WexTrade.jsx` + `#trade` route + nav link | ✅ built, renders clean |
| 4.5 | Reset + GM SQL functions | ✅ installed and working |
| 5 | `api/wexgm.js` + WEX admin (Exchange / Companies / Players) | ✅ **18/18** |
| 6 | **The WEX dashboard** — public `#wex`: price chart, health, leaderboards, tape (§8) | ✅ `dashboard.sql` run, seen in a browser, committed |
| 6.5 | In-game explanations (gate · trade desk · wall dialog) | ✅ built |
| 6.6 | **Price drift** — the weather (§5.1) | ✅ installed and drifting · 🟡 re-run `drift.sql` to add the `pg_cron` heartbeat |
| 7 | **The price board** — `#board`, seven enormous rows + sparklines. Optional; §8 explains why it is its own screen | ⬜ not started |
| 7.5 | **The ticker** — `#ticker`, a dark 80s terminal: quotes + a scrolling tape on the left, a pixel-canvas 6h chart of three rotating companies on the right (§10) | ✅ built, committed, `ticker.sql` run |
| 7.6 | **The ticker's random mode** — `#ticker?mode=random`, pixel windows popping open and shut over a black field, each one a different view of the market (§10.2) | ✅ R1–R5 built, committed · 🟡 R6: tune on the wall |
| 8 | Dry run, tune `liquidity`, update HANDOFF.md | ⬜ not started |

### What has NOT been verified

Two limits on this machine, worth knowing before trusting anything below as
"tested":

1. **No `/api/*` route can be exercised locally.** `.env.local` here holds a
   41-character `SUPABASE_SERVICE_ROLE_KEY`, which is not a valid JWT. Fine in
   production, where Vercel holds the real one — but it means `add_marker`,
   `delete_event`, `set_drift` and `drift_now` have been read and reasoned
   about, never run.
2. ~~**No headless browser.**~~ Headless Chrome works here, driven over the
   DevTools protocol from a throwaway node script (not in the repo). `#ticker` was
   checked that way: screenshots at 1920 and 390 wide, plus measured layout and
   animation state. Chrome's one-shot `--screenshot` flag is **not** trustworthy
   for this app: it froze CSS animations and laid the phone view out wrong, so
   use a real page session instead. Feel, such as scroll smoothness, still needs
   your eyes.

What *is* machine-verified: `npm run build` and `npm run lint` clean on every
new file (the 9 remaining lint errors are pre-existing, in `App.jsx` and the two
ignored variants), the chart's pure maths against real tick data from the live
database, and the drift guardrails against a simulated four-hour evening. Those
live in `chartSeries.js` and the per-hour caps in `api/wexgm.js` precisely
because they can be exercised with plain node.

Phases 0–4 alone are a playable game.

### Waiting on you

All in the Supabase dashboard SQL Editor:
**https://supabase.com/dashboard/project/bliocisgoedlybzlfytk/sql/new**
Paste a file, Run (Ctrl+Enter), then open a new query tab for the next one.

1. [x] ~~schema.sql~~ · [x] ~~seed.sql~~ · [x] ~~players.seed.sql~~ — all loaded and verified
2. [x] ~~Re-run schema.sql~~ — the four `wex_*` functions are installed; events, set-price and both resets work
3. [x] ~~**`supabase/dashboard.sql`**~~ — `companies.color` and the two aggregate views are in.
4. [x] ~~**`supabase/drift.sql`**~~ — the weather dials and `wex_drift()` are in and drifting.
5. [ ] **Re-run [supabase/drift.sql](supabase/drift.sql)** — it has gained the `pg_cron` heartbeat
   (§3 of the file). Enable **pg_cron** under Database → Extensions first; the file guards on it
   and will skip the schedule with a notice if it is missing. Idempotent, and `cron.schedule()`
   upserts by name, so re-running cannot stack up duplicate jobs.
6. [ ] **Re-paste [supabase/smoke_test.sql](supabase/smoke_test.sql)** once — check 5 asserted the
   round-trip spread was under 1,000 ⌀; it is exactly 1,080 ⌀ (`q·p·x²/2`). The test was wrong,
   not the engine. Low priority: it only replaces the stored test function.
7. [x] ~~**[supabase/ticker.sql](supabase/ticker.sql)**~~ — `trade_tape` now returns `price_before` /
   `price_after`, so `#ticker` shows how far each trade moved its stock. Folded into `schema.sql`.
8. [ ] Edit the seven companies in the Table Editor — real names, tickers, CEO names, blurbs.
   Currently placeholders: ANL MLC CST BUR SLM CMP SEG, all at 100,000 ⌀.

Expect four `security_definer_view` warnings in Supabase's database linter, on
`leaderboard`, `trade_tape`, `market_health` and `company_stats`. All intentional;
see §7 and §8.1.

### Resetting between runs

You will run this more than once — solo test, then beta, then the party. Two levels,
both in [supabase/reset.sql](supabase/reset.sql) (functions defined in `schema.sql` §6):

| Call | Effect | Use when |
|---|---|---|
| `select wex_reset_market();` | Money, positions, prices back to start. Players **keep** names and stay logged in. | Between rounds with the same people |
| `select wex_reset_all();` | The above **plus** every account unclaimed — names cleared, phones logged out. | Before a new group plays |

Neither touches the roster: codes and starting fortunes survive, so printed cards stay valid.
To change who plays or how rich they are, re-run `generate-players.mjs` and load a fresh
`players.seed.sql`.

### Decisions log

| Decision | Why |
|---|---|
| Market-driven prices + GM events; ~~no random drift~~ | **Superseded.** Drift shipped — see §5.1. A `pg_cron` heartbeat every minute, against a function that is idempotent and time-gated so the GM keeps control of the interval |
| GM pre-generates codes, guest claims with a name | Lets you print cards and hand fortunes to specific people |
| Buy/sell only in v0 | `holdings.shares` is signed and `trades.side` is a free text check, so shorts need no migration |
| CEOs are flavour + schema hooks | `companies.ceo_player_id` exists from day one; press releases deferred |
| Unequal starting fortunes, Pareto-drawn | Inequality is the joke; ratio matters more than the floor |
| Two leaderboards (net worth + % return) | Absolute is the satire; % return keeps a poor player in the game |
| All figures in k/M | 100,000 ⌀ shares are only funny if they're readable on a projector |
| Event deck is a **maybe** | Per-company and market-wide price control is core regardless; the deck is presets |

---

## Context

`worm-street` is a weekend party game. The intended centrepiece is a projected wall display with **two** live panels: a newspaper (Worm Street Journal) and a stock exchange (WEX). Only the newspaper exists — [HANDOFF.md](HANDOFF.md) lists WEX under "What's not built".

This builds WEX v0: seven fictional worm companies, each fronted by a party attendee as CEO; guests unlock a personal trading dashboard on their phone with a unique three-word code; buying and selling actually moves prices; the GM ("Worm Fed") fires news events that spike or crash a stock; and a wall board shows the live market.

---

## Architecture at a glance

```
Guest phone   /#trade   → three-word gate → portfolio + buy/sell        nav TRADE
Wall display  /#wex     → price chart, market health, leaderboards, tape  nav WEX
Wall display  /#board   → 7 big price rows + sparklines (phase 7, optional; off-nav)
Wall display  /#ticker  → 80s terminal: quotes, tape, rotating pixel chart (off-nav, no nav bar)
GM            /#gm      → existing Newsroom tab + new Exchange / Companies / Players tabs

           POST /api/wex          (guest; code-authenticated)
           POST /api/wexgm        (GM; password-authenticated)
                    │  service-role key
                    ▼
           Supabase Postgres — trade executed inside one plpgsql transaction
```

**The single most important rule: no price, cash, or share balance is ever computed on the client.** `SUPABASE_ANON_KEY` is a hardcoded literal in the bundle ([src/App.jsx:7](src/App.jsx#L7)) — anyone can read it and hand-craft requests. Every mutation goes through a service-role serverless function, exactly as [api/submit.js](api/submit.js) and [api/gm.js](api/gm.js) already do.

---

## 1. Database schema

Lives in [supabase/schema.sql](supabase/schema.sql) — seven new tables, two views, RLS, grants and `execute_trade`, all idempotent so it can be re-run while iterating. The file also documents the existing `articles` / `events` tables, which previously existed only in the Supabase dashboard.

Key points:

- **`numeric(16,2)` throughout.** With shares at ~100,000 ⌀ and a bubble inflating net worths into the hundreds of millions, `numeric(12,2)` (max ~10 billion) sits closer to the edge than it should.
- **`players.code_norm`** is a stored generated column — the code stripped to letters and digits — so login tolerates any punctuation or casing, and two codes can never collide after normalisation.
- **`players.starting_cash` is per-player**, not a global constant. That single choice makes % return computable *and* lets "reset market" restore each player to their own fortune rather than a shared default.
- **`holdings.shares` is signed**, so short selling later needs no migration; v0 simply refuses to go negative.
- **`companies.liquidity` is denominated in shares**, not currency, so it does not scale with the absurd prices.

### RLS posture

| Table | anon SELECT | anon writes |
|---|---|---|
| `companies`, `price_ticks`, `market_events`, `market_state`, `leaderboard`, `trade_tape` | ✅ | ❌ |
| `players`, `holdings`, `trades` | ❌ **never** | ❌ |

`players` must stay unreadable by anon — **the code column is the only credential in the system.** Guests read their own portfolio only via `/api/wex`. The wall board reads companies/ticks/views directly from PostgREST, the same way [BroadsheetScreen](src/App.jsx#L1330) reads `articles`.

---

## 2. The price engine

All server-side. For `q` shares in a company at price `p` with liquidity `L`:

```
buy:   p_after = p * (1 + q/L)
sell:  p_after = max(min_price, p * (1 - q/L))
exec   = (p + p_after) / 2          -- midpoint fill
cost   = exec * q
guard  = q must be <= L * max_impact
```

Midpoint fill means splitting one big order into many small ones costs the same as the single order — no salami-slicing exploit. A buy immediately followed by an equal sell returns slightly less than you paid (`(1+x)(1−x) < 1`), a natural spread. That's a feature; the in-world copy calls it the exchange taking its cut in mulch.

GM events apply `price *= (1 + pct/100)`, floored at `min_price`, writing a `price_ticks` row with `reason='gm_event'`.

### Suggested numbers

| Dial | Value | Note |
|---|---|---|
| Share price at open | **100,000 ⌀** | all seven, so the board is legible |
| Poorest fortune | **1,500,000 ⌀** | ≈ 15 shares |
| Median fortune | **~2,700,000 ⌀** | ≈ 27 shares |
| Richest fortune | **25,000,000 ⌀** | ≈ 250 shares |
| `liquidity` | **800 shares** | the main tuning dial |
| `max_impact` | **0.25** | caps one trade at 200 shares |

Resulting feel: a median player going all-in on one stock moves it ~3%; six players ganging up move it ~20%; the whale deploying everything moves it ~30% across four capped trades, which reads on the board as "someone enormous is buying".

**On the floor being 1.5M rather than 400k:** with integer shares at 100,000 ⌀ each, a player holding 400k can buy exactly four shares — one lumpy decision and they're spectating. The inequality comes from the *ratio* (16× here, top to bottom), not from the floor being small, so lifting the floor keeps the satire and gives the poorest player ~15 shares to play with. If it still feels coarse at the dry run, raise all fortunes rather than dropping the share price.

**Balance note:** because buying pushes prices up, everyone's net worth inflates together, so once everyone is invested the ranking tends to freeze. Negative GM events are what restore the sell decision — see section 5.

### Concurrency

A trade is a read-check-write, and PostgREST cannot hold a transaction across HTTP requests. Two simultaneous buys would both read the old cash and price, and the second write would clobber the first — a guest double-tapping "Buy" gets twice the shares for one payment. So the whole trade is one `execute_trade` plpgsql function using `select … for update`, called by `api/wex.js` via `POST /rest/v1/rpc/execute_trade`.

This is the one piece of real SQL in the project and it's worth it: it makes the scoreboard trustworthy, which is the whole game.

---

## 3. Three-word codes and the wealth roster

### Wordlists — `src/wex/wordlists.js`

Three lists of 32 (≈32k combinations), shared by the setup script and the GM panel. Pattern: **adjective · place · worm**.

No near-homophones across lists, so a code read aloud across a noisy room stays unambiguous.

**No autocomplete on the gate** — guests type the words. Input is normalised (lowercase, strip non-alphanumerics) so "Damp Tunnel Clitellum", "damp-tunnel-clitellum" and "DAMPTUNNELCLITELLUM" all resolve, but a genuine misspelling won't. The fallback is the GM Players tab, which lists every code: someone stuck at the door gets looked up.

Codes are bearer tokens — anyone holding one *is* that player. Right trade-off for a party; the mitigations that matter are the RLS rule (codes are never fetchable) and a GM "regenerate code" button for a guest who loses theirs or gets pranked.

### Roster script — `scripts/generate-players.mjs`

```
node scripts/generate-players.mjs --count 30 --floor 1500000 --ceiling 25000000 --alpha 1.2
```

Draws each fortune from a **Pareto** distribution — `x = floor / U^(1/α)`, clamped at the ceiling, rounded to two significant figures so cards read cleanly (`2,700,000 ⌀`, not `2,713,884 ⌀`). Pareto rather than uniform because real wealth is Pareto-distributed: a couple of obscene fortunes, a middle, and a long poor tail, with no hand-tuned tiers. `--alpha` is the cruelty dial — lower is more unequal.

It emits three things:
1. A **table to stdout** to eyeball.
2. A **summary line** — richest/poorest ratio and top-3 share of total. If it prints *"the top 3 worms hold 61% of all WORMCOIN"*, that's both a sanity check and a free front-page headline.
3. **`supabase/players.seed.sql`**, **git-ignored** — INSERTs you open, adjust by hand, and paste into the SQL editor.
   Ignored rather than tracked because it holds live three-word codes, and a code *is* whoever holds it.
   `players` has no anon SELECT policy for precisely that reason, so committing the same codes would only
   move the credential behind a different lock — and git history is forever. Nothing reads the file at
   runtime; once it is pasted, the database is the source of truth, and the GM Players tab can
   **Copy roster CSV** to reprint cards.

Re-running before you've loaded it is free; the file is the reviewable artifact.

Two things the script deliberately doesn't own: **late arrivals** get a one-off "+ Add player" button in the GM Players tab (running Node at 11pm with a drink in hand is not a plan), and **cards** get a "Copy roster as CSV" button for mail-merge.

### Claim flow

Enter code → if `is_claimed` is false, prompt for display name and claim → dashboard. If already claimed, straight to the dashboard. The client stores the code in `localStorage` under `wex_code` and auto-logs-in on return. **This is the repo's first use of localStorage.**

---

## 4. Code changes

### Shared extraction (first — small, mechanical, unblocks everything)

| File | Change |
|---|---|
| `src/lib/supabase.js` **(new)** | Move the config constants and the `supabase` wrapper verbatim out of [src/App.jsx:6-82](src/App.jsx#L6-L82). |
| `api/_supabase.js` **(new)** | Export `serviceHeaders()` + `SUPABASE_URL`, currently duplicated in [api/gm.js:8](api/gm.js#L8) and [api/submit.js:8](api/submit.js#L8). The `_` prefix keeps Vercel from routing it. |
| [src/App.jsx](src/App.jsx) | Import instead of define; delete the moved block. |

### Router fix ([src/App.jsx:2021-2057](src/App.jsx#L2021-L2057))

The router matches `window.location.hash` **exactly**, so any hash carrying query params silently falls through to `broadsheet` — which is why [BroadsheetScreen](src/App.jsx#L1331) re-parses the hash itself. Before adding routes:

- match on `hash.split("?")[0]` so `#wex?speed=20` works;
- add a `hashchange` listener (browser back/forward is broken today);
- add cases for `wex` and `trade`.

Nav gets one new link, **"Exchange" → `#trade`**. `#wex` stays off-nav, like `#display` — it's a wall screen.
*(Amended in §8.3: the link shipped as "WEX", and in phase 6 it is relabelled
**TRADE** while **WEX** takes over `#wex`. Only `#board` stays off-nav.)*

### New module — `src/wex/`

| File | Contents |
|---|---|
| `wordlists.js` | The three lists; imported by the script and by `api/wexgm.js`. |
| `format.js` | `formatWormcoin()` — **k and M everywhere**: `< 1,000` raw, `1k–999k` one decimal (`104.1k ⌀`), `≥ 1M` two (`24.65M ⌀`). One decimal on the k scale means the smallest visible move is 100 ⌀; a single-share trade at `liquidity=800` shifts a 100k stock by ~125 ⌀, so it still registers. Finer movement is carried by the sparkline, not the number. |
| `wexStyles.js` | WEX CSS as a template literal using the existing `--ink / --paper / --red / --rule / --muted` tokens, plus a matching `[data-style="modern"]` override block ([src/App.jsx:552-745](src/App.jsx#L552-L745) is the pattern). Appended as `<style>{styles}{wexStyles}</style>` — the existing 1050-line stylesheet is untouched. |
| `wexApi.js` | Thin `fetch` wrappers, mirroring `gmAction()` at [src/App.jsx:1838](src/App.jsx#L1838). |
| `WexTrade.jsx` | `#trade` — guest phone dashboard. |
| `WexBoard.jsx` | `#board` — the big price board. Phase 7, optional; §8 explains why it stayed a separate screen. |
| `WexAdmin.jsx` | The three new GM tabs, rendered inside the existing `GMPanel`. |
| `WexDash.jsx` + `PriceChart.jsx` + `useMarketData.js` + `dashStyles.js` | `#wex` — the public dashboard, projected beside the WSJ. Phase 6, planned in §8. |

### `WexTrade.jsx` — guest phone dashboard (`#trade`)

Gate → dashboard: net worth, % return and both ranks at the top, cash, holdings with per-position P&L, then the seven companies (ticker, name, CEO, price, % vs open). Tap a company → trade sheet with a quantity stepper, a live "this will cost ~X ⌀ and move the price to ~Y" preview, and Buy / Sell.

**Mobile-first** — the rest of the app is desktop-first with a single `max-width: 768px` block ([src/App.jsx:1056](src/App.jsx#L1056)). Big tap targets, no hover-dependent affordances.

The cost preview is client-side for display only; the server recomputes and is authoritative. If the fill differs because someone traded first, show the actual fill — "filled at 104.1k ⌀, not 102.0k ⌀" is good drama.

Disable the button while a trade is in flight — party wifi is flaky and double-taps are the likeliest bug. Poll only while `document.visibilityState === "visible"` so pocketed phones stop hammering Supabase.

### `WexBoard.jsx` — the price board (now `#board`, phase 7)

> Still the plan, with two amendments from §8: the route is `#board`, not `#wex`
> (which is the dashboard), and the sheet stays **light** — the dark backdrop
> below refers to the surround outside the canvas, as on the broadsheet, not to
> the board itself. The leaderboards and tape live on the dashboard; this screen
> is prices and nothing else.

Reuse the broadsheet's projection approach: a fixed 1200×960 canvas inside `.broadsheet-scale-wrapper` on a dark backdrop, resized by browser zoom ([src/App.jsx:758-766](src/App.jsx#L758-L766)). Masthead ("WORM STOCK EXCHANGE · WORMHILL"), seven big rows with ticker / company / CEO / price / % change / an SVG sparkline from `price_ticks` (inline `<polyline>` — no chart library, and none is needed), the two leaderboards stacked in a side column, and a scrolling trade tape along the bottom.

The tape can reuse the existing `.breaking-ticker` marquee ([src/App.jsx:1174-1207](src/App.jsx#L1174-L1207)), which already measures a segment and repeats it via CSS custom properties. A big OPEN / CLOSED / HALTED stamp reads at projector distance. Green/red for up/down is the one place to step outside the existing palette; keep `--red` for down so it matches the newspaper's accent.

### GM dashboard — extend the existing `#gm`

Turn [GMPanel](src/App.jsx#L1812) into a tabbed shell behind the one existing password prompt. Tab 1 "Newsroom" is the current article moderation, moved as-is. Then:

- **Exchange** — open/close market · fire event (company or market-wide, headline, ± %) · halt/unhalt · set a price manually · **reset market** (restore `open_price`, wipe trades/holdings, restore each player's own `starting_cash`). The event form gets a checkbox *"also broadcast on the WSJ ticker"* which additionally inserts a `breaking_news` row into the existing `events` table, so the newspaper panel reacts — that's the moment the two wall panels become one show.
- **Companies** — edit the seven: ticker, name, CEO name, blurb, starting price, liquidity, listed/halted.
- **Players** — table of code / name / starting cash / cash / net worth / % return / claimed, with regenerate-code, adjust-cash, "+ Add player", "Copy roster as CSV".

### `api/wex.js` (guest) and `api/wexgm.js` (GM)

Both follow the existing handler shape: POST-only, `switch (action)`, service-role `fetch` to PostgREST, 403 on bad credential.

- `api/wex.js`: `login`, `claim`, `portfolio`, `trade`. Every one takes `code`; `trade` delegates to the `execute_trade` RPC. 403 idiom copied from [api/submit.js:22](api/submit.js#L22) with in-world copy ("Those are not your words, worm.").
- `api/wexgm.js`: `list_players`, `add_player`, `regenerate_code`, `set_cash`, `delete_player`, `list_companies`, `upsert_company`, `set_price`, `fire_event`, `halt`, `open_market`, `close_market`, `reset_market`. Reuses the existing `GM_PASSWORD` — no new secret, nothing to add in Vercel.

Vercel Hobby allows 12 serverless functions; this takes the project to 4.

---

## 5. MAYBE — the event deck

**Not committed. Build phases 0–7 first, then decide at the dry run.**

Already core and not dependent on this section: `fire_event` takes a `company_id`, and passing `null` makes it market-wide. The GM can move one company or the whole economy, up or down, by any percentage, with a free-text headline and an optional WSJ ticker broadcast. Everything below is *presets on top of that* — convenience, not capability.

The proposal: an `event_deck` table seeded in `seed.sql`, rendered in the Exchange tab as one-tap cards. Tap a card → pick a target company (or market-wide) → fire.

```sql
create table event_deck (
  id         serial primary key,
  headline   text not null,
  pct_change numeric not null,
  scope      text not null default 'company',  -- 'company' | 'market'
  sort_order integer default 0
);
```

A table rather than hardcoded constants, for the same reason `liquidity` is a column: you'll want to rewrite a card at 10pm because something funnier happened, and that shouldn't need a deploy. Editing the deck in v0 means editing rows in the Supabase dashboard.

Starter cards:

| Headline | Δ | Scope |
|---|---|---|
| DIRT SCANDAL | −10% | company |
| CEO SEEN ABOVE GROUND | −8% | company |
| PREDATORY BIRD SIGHTED | −25% | company |
| WORM FED OPENS PROBE | −18% | company |
| SOIL pH CRISIS | −12% | company |
| RECORD CASTINGS | +12% | company |
| MERGER RUMOURS | +15% | company |
| COMPOST BOOM | +20% | company |
| THE GREAT DROUGHT | −20% | market |
| RAIN AT LAST | +15% | market |
| THE GREAT UNEARTHING | −50% | market |

**One design note for your back pocket.** With buy-only pressure and no drift, prices only go up, so there's never a reason to sell and the ranking freezes once everyone is invested. Negative cards restore the sell decision, and a big market-wide one late in the night is the only moment where *timing* beats *starting capital* — which matters when a 25M whale sits on top of the board. A multiplicative drop leaves the relative ranking of the fully-invested untouched and doesn't touch cash at all, so it rewards exactly one thing: having sold in time. No scripted runbook needed — firing `THE GREAT UNEARTHING` when it feels right does the same job. Worth knowing *why* the card is there so you can judge the moment.

---

## 5.1 Price drift — the weather

**Shipped.** [supabase/drift.sql](supabase/drift.sql), the Weather panel in the
GM Exchange tab, and a `◈ Drifting` mark on the wall.

Every `drift_interval_seconds`, each listed company is multiplied by
`(1 + d/100)` where `d` is a normal draw (Box-Muller) with an economy-wide mean
and standard deviation. Four dials, all in `market_state`, all set from the GM
panel: on/off, interval, mean, spread. **Off by default** — turning the weather
on should be a decision, not something a migration starts doing.

**Why it earns its place.** §5's design note says it out loud: with buy-only
pressure prices only go up, so once everyone is invested the ranking freezes and
there is never a reason to sell. Event cards restore that decision in bursts;
drift restores it continuously. A *negative* mean is the specific thing that
makes holding cash a real choice rather than a wasted turn.

### The clock

**`pg_cron`, every minute.** It is free on Supabase — enable it under Database →
Extensions and [supabase/drift.sql](supabase/drift.sql) schedules the job.

> Earlier drafts of this plan asserted no scheduler was available and designed
> around it. That was wrong: `pg_cron` is not a paid tier. The design survived
> the correction unchanged, because the thing that made it work without a
> scheduler — being idempotent and time-gated — is also what lets a fixed
> one-minute heartbeat serve a GM-adjustable interval.

The job is **dumb on purpose**: `select wex_drift();`, unconditionally, forever.
Every condition lives in the function, which returns immediately unless drift is
enabled, the market is open, and a full interval has elapsed. So the weather
switch in the GM panel governs everything and the schedule is never touched. A
one-minute heartbeat against a five-minute interval means four calls in five
return `'not yet'` after a single cheap SELECT — no lock taken.

Because it is idempotent, the same function is *also* called from the two things
already polling all party, as insurance for the night cron stops:

| Caller | Covers |
|---|---|
| `pg_cron` | **the real clock** — runs with every screen shut |
| `/api/wexgm` `overview` | the GM panel, open on your laptop all night |
| `/api/wex` `portfolio` | any guest phone with the trade screen open |

Both API paths hold the service-role key. **Not granted to anon** — it writes
prices, and anon never gets a write path however well guarded. **Not called from
`execute_trade`** either: that is the one concurrency-critical function in the
project and drift would make every trade contend on the `market_state` row, for
a few seconds of freshness the heartbeat already provides.

### The thing a real scheduler changes

Drift used to stop on its own when the last screen closed. **It no longer does.**
Leave the exchange open overnight with the weather on and you return to several
hundred intervals of drift and a market nobody recognises.

`wex_drift()` checks `is_open`, so the fix is entirely procedural: **ring the
closing bell.** Worth putting in the run-of-show, and a good reason to close the
market between the dry run and the party rather than leaving it up.

The 5-interval catch-up cap was insurance against a poll-driven system putting a
cliff on the chart after a quiet stretch. With a real clock it should never fire
— if it does, cron has stopped and that is worth knowing.

### The trap: these numbers compound

The first version validated mean and spread **per tick**, which is wrong and was
caught by simulating a four-hour evening. A 10% mean sounds mild; every ten
seconds it is 360 ticks an hour and takes a 100,000 ⌀ share to about **1e64** —
past what `numeric(16,2)` holds, after which not just drift but *every
subsequent trade* fails on overflow.

So the limits are **per hour**, with volatility scaling as √t because that is
how volatility accumulates:

```
|mean| × (3600/interval)        ≤ 60      -- tide
stddev × √(3600/interval)       ≤ 60      -- chop
```

`wex_drift()` additionally carries a hard 1e12 price ceiling, because
`market_state` is editable by hand in the Supabase table editor and the API
guardrail is not the only way in.

### The presets, over a four-hour evening

Simulated from a 100,000 ⌀ open, 4,000 trials each:

| Preset | Interval | Mean | σ | Median | p10 → p90 |
|---|---|---|---|---|---|
| Gentle swell | 5 min | 0% | 1.5% | 99k | 87k → 114k |
| Choppy | 3 min | 0% | 4% | 94k | 59k → 145k |
| Slow bleed | 5 min | −1% | 2% | 61k | 51k → 73k |
| Bull run | 5 min | +1.5% | 2% | 202k | 170k → 240k |
| Storm | 2 min | 0% | 9% | 62k | 17k → 214k |

Halted companies sit the weather out — a halt that failed to hold a price still
would look broken. Nothing drifts while the market is closed, and opening the
market restarts the clock so an overnight closure cannot cause a catch-up cliff.
Catch-up is capped at 5 intervals regardless.

The guest-facing rule about drift is **conditional on `drift_enabled`**
(`DRIFT_RULE` in [src/wex/rules.js](src/wex/rules.js)): it is the one rule the
Worm Fed can switch off mid-evening, and a rule that is false is worse than one
that is missing.

---

## 6. Things to keep in mind

1. **Never trust the client.** The anon key is public, so prices, cash and holdings only ever change inside `execute_trade` / `api/wexgm.js`.
2. **`players` must have no anon SELECT policy.** One wrong RLS policy dumps every guest's code to anyone who opens devtools.
3. **Polling load.** No realtime — `supabase.subscribe` is a 4-second `setInterval` ([src/App.jsx:78-81](src/App.jsx#L78-L81)). Thirty phones plus a wall is ~28k requests/hour. Wall at 3s, phones at 5s, paused on hidden tabs.
   **Amended:** the constraint that actually bites is not Supabase requests but *Vercel serverless invocations*, because only `/api/*` calls cost one. `#trade` therefore polls prices from PostgREST directly (5s, free) and `/api/wex` only for cash and holdings (45s). See `usePrices()` in [src/wex/useMarketData.js](src/wex/useMarketData.js) and the header comment in [src/wex/WexTrade.jsx](src/wex/WexTrade.jsx). Any new screen should follow the same rule: **anon-readable data comes from PostgREST; the API is for things RLS denies, and for writes.**
4. **The hash router silently swallows query params** — fix before relying on `#wex?...`.
5. **Big numbers need formatting discipline.** Every figure through `formatWormcoin()`, phones included. An unseparated `24600000` on a projector is unreadable and stops being funny.
6. **Tune at the party, not in code.** `min_price` and `max_impact` live in `market_state`, `liquidity` per company, `starting_cash` per player. Resist adding constants next to `PARTY_THURSDAY`.
7. **Do a full dry run** with two browsers and the reset button. The failure to find early is the concurrency one.
8. `src/App_old.jsx` and `src/App_broadsheet.jsx` stay untracked (one contains a hardcoded password) but are still linted by `npm run lint`. New WEX files don't touch them.
9. **Deferred, but schema-ready:** short selling (signed `holdings.shares`, extensible `trades.side`), ~~price drift~~ (shipped — §5.1), CEO press releases (`companies.ceo_player_id` + a future `article_type='press_release'` inserted into `articles` with `hidden=true` for GM approval, surfacing in the existing newsroom tab).

---

## 7. Supabase setup — what's manual

**Nothing to create at project level.** The project (`bliocisgoedlybzlfytk`), the anon key, the service-role key, and the three env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GM_PASSWORD`) are already in place and working — `api/gm.js` proves it in production. WEX adds **no new secrets** and needs no changes in the Vercel dashboard.

Phase 0 is: open the **SQL Editor**, paste [supabase/schema.sql](supabase/schema.sql), run. Then paste [supabase/seed.sql](supabase/seed.sql), run. No clicking through the Table Editor.

Five things that bite if missed — all handled inside that SQL, listed so you can verify them:

1. **RLS is OFF by default on tables created via SQL.** (The Table Editor UI enables it for you; the SQL editor does not.) Every table gets an explicit `alter table … enable row level security`. Skip it and anon can PATCH `players.cash` with the key sitting in the JS bundle.
2. **For `players`, `holdings`, `trades`, "no policy" is the correct final state** — RLS on, zero policies, which denies everything. That's the design, not an omission. The service-role key bypasses RLS, which is how the API still reaches them.
3. **`leaderboard` and `trade_tape` are deliberately security-definer views.** That's what lets them read `players` while anon cannot. Supabase's linter flags this as `security_definer_view` — **expected, don't "fix" it**; `security_invoker` would return empty results forever.
4. **`execute_trade` is `security definer` with `set search_path = public`.** Definer so it can write the locked-down tables; pinned search_path because the linter rightly flags mutable ones.
5. **Explicit grants.** Supabase's default privileges usually cover this, but that depends on project age and prior tinkering. The SQL states them outright.

Then verify — one `curl` with the anon key against `players` must return no rows, and one against `leaderboard` must return rows. That pair is the whole security model.

The only genuine data entry is afterwards: edit the seven placeholder companies in the Table Editor, and paste the generated `players.seed.sql` once the fortunes look right.

---

## 8. Phase 6 — the WEX dashboard (`#wex`)

> This section was originally written for a **Dashboard tab inside the GM panel**.
> It is now a **public route projected on the wall beside the broadsheet**. The
> original design notes are kept below from §8.8 as background; §8.0–8.7 are the
> plan to build against.

### One screen or two? — the question, answered

The board (seven prices, big) and the dashboard (a chart and what the economy is
doing) read the same six tables. So: one screen or two?

**Option A — merge them.** One route, chart-led, with the seven prices as a rail
down the side. One build, one URL, one thing to point a projector at, no
duplicated leaderboard.

**Option B — keep them separate.** `#wex` is the dashboard; a later `#board` is
the pure price board.

**Chosen: B.** The argument for merging is that they share their data. The
argument against — the one that wins — is that they are read from **different
distances**. A price board is read from across the room by someone holding a
drink: seven rows, enormous type, one number each. A dashboard is read by
someone standing near it working out whether to sell: seven overlapping lines, a
percentage axis, four stat tiles. Merged, the shared canvas has to serve both,
and everything on it gets smaller — which is precisely the failure mode when the
panel is already sharing a wall with the broadsheet and may end up at 50% zoom.

Two more things fall out of B that are worth having:

- The board never needs interaction, so it can be projected and forgotten. The
  dashboard *does* — window buttons, series isolation — so it wants to also live
  on the laptop, where you can click it.
- The cost of the split is small. **The data layer is one hook either way**
  (§8.4), and the chart is one component either way. What actually doubles is a
  layout and a stylesheet, and the board's layout is the simple one.

So the split is:

| Route | Nav | What it is | When |
|---|---|---|---|
| `#wex` | **WEX** | **The dashboard.** Price chart with axis/window/series controls, market-health tiles, both leaderboards, trade tape. The screen you project beside the WSJ. | Phase 6 — this section |
| `#trade` | **TRADE** | The guest phone dashboard. Unchanged; it just gets its own nav label instead of borrowing "WEX". | ✅ built |
| `#board` | off-nav | **The price board.** Seven enormous rows — ticker, company, CEO, price, %Δ, sparkline — plus the OPEN/CLOSED stamp. No analysis. For a second screen, or the far wall. | Phase 7, optional |

Phase 7 is genuinely optional: the dashboard already carries the prices, so the
board is what you add if you get a second projector or decide the room wants a
big dumb ticker. Build phase 6 first regardless.

### The other thing that shapes everything below

**A public page may only show what `anon` can read.** The GM panel could read
anything; this cannot. `players`, `holdings` and `trades` are RLS-denied to anon
and **must stay that way** — the code column is the only credential in the
system. Three of the readouts in §8.8 therefore need new aggregate views. That is
stage 6a, and it is the only SQL in the phase.

### Settled

| Decision | Settled on | What it rules out |
|---|---|---|
| Board and dashboard | **Two screens** — see above | Merging into one chart-led panel; the merged version's price rail survives here only as a compact legend (§8.6) |
| Surface | **Light** — the same `--paper` sheet as the newspaper, on the same dark surround | A dark market-board look. The two panels are one show, and a white WEX sheet beside a white WSJ sheet reads as two pages of the same paper, which is the joke. It does put real obligations on the palette — see §8.5 |
| Nav | **Five labels: WSJ · WEX · TRADE · FILE · FED** | Keeping four with `#wex` off-nav. "WEX" stops pointing at the phone screen and starts pointing at the wall panel; "TRADE" takes over the phone screen |
| Guest visibility | **Everything is public**, aggregates included | Hiding cash-vs-invested from guests. Nothing here exposes an individual beyond what `leaderboard` already does, and the concentration number is funnier on the wall |

### 8.0 The stages

Each is independently shippable and leaves the app working.

| Stage | Work | Files |
|---|---|---|
| 6a | Aggregate views + `companies.color` | `supabase/dashboard.sql` **(new)**, then folded into `schema.sql` |
| 6b | Colour in the GM Companies tab | `api/wexgm.js`, `WexAdmin.jsx` |
| 6c | Route, nav relabel, read-only query filters | `src/App.jsx`, `src/lib/supabase.js` |
| 6d | Data layer — one hook, incremental ticks (shared with the phase-7 board) | `src/wex/useMarketData.js` **(new)** |
| 6e | The chart | `src/wex/PriceChart.jsx` **(new)** |
| 6f | Health tiles, leaderboards, tape | `src/wex/WexDash.jsx` **(new)** |
| 6g | Projection styles | `src/wex/dashStyles.js` **(new)** |

---

### 8.1 Stage 6a — what the panel is allowed to read

Everything the panel wants, and where it comes from:

| Readout | Source | anon? |
|---|---|---|
| Price lines, sparklines | `price_ticks` | ✅ |
| Current price, % vs open, halted | `companies` | ✅ |
| OPEN / CLOSED stamp | `market_state` | ✅ |
| Event markers on the timeline | `market_events` | ✅ |
| Both leaderboards | `leaderboard` | ✅ |
| Trade tape | `trade_tape` | ✅ |
| Top-3 share of all wealth | derived client-side from `leaderboard` | ✅ |
| **Cash vs invested, economy-wide** | `players.cash` + `holdings` | ❌ |
| **Volume / trade count** | `trades` | ❌ |
| **Shareholders per company** | `holdings` | ❌ |

The last three are the gap, and the fix is the same one that already lets the
wall show names: **two more security-definer aggregate views.** They expose
totals and counts, never a row about a person, and never a code.

```sql
-- ---------------------------------------------------------------------------
-- market_health — one row, the state of the whole economy
-- ---------------------------------------------------------------------------
-- Security-definer (the default) for the same reason as `leaderboard`: it reads
-- players and holdings, which anon cannot touch. It returns only aggregates —
-- there is no row here about any individual worm.
create or replace view market_health as
  with net as (
    select p.id,
           p.cash                               as cash,
           coalesce(sum(h.shares * c.price), 0) as invested
      from players p
      left join holdings  h on h.player_id = p.id
      left join companies c on c.id = h.company_id
     where p.is_claimed and not p.is_gm
     group by p.id
  )
  select count(*)                                        as players_in,
         (select count(*) from players where not is_gm)  as players_total,
         coalesce(sum(cash), 0)                          as total_cash,
         coalesce(sum(invested), 0)                      as total_invested,
         (select count(*) from trades)                   as trade_count,
         (select count(*) from trades
           where created_at > now() - interval '5 minutes') as trades_recent
    from net;

-- ---------------------------------------------------------------------------
-- company_stats — one row per company
-- ---------------------------------------------------------------------------
create or replace view company_stats as
  select c.id                          as company_id,
         c.ticker,
         coalesce(h.holders, 0)        as holders,
         coalesce(h.shares_held, 0)    as shares_held,
         coalesce(t.trade_count, 0)    as trade_count,
         coalesce(t.volume_shares, 0)  as volume_shares,
         coalesce(t.buys, 0)           as buys,
         coalesce(t.sells, 0)          as sells
    from companies c
    left join (
      select company_id, count(*) as holders, sum(shares) as shares_held
        from holdings where shares <> 0 group by company_id
    ) h on h.company_id = c.id
    left join (
      select company_id,
             count(*)                             as trade_count,
             sum(shares)                          as volume_shares,
             count(*) filter (where side = 'buy')  as buys,
             count(*) filter (where side = 'sell') as sells
        from trades group by company_id
    ) t on t.company_id = c.id;

grant select on market_health, company_stats to anon, service_role;
```

**And the colour column**, which blocks the chart:

```sql
alter table companies add column if not exists color text;

-- Backfilled once, in sort_order, from the palette in §8.5. Stored rather than
-- derived: colour follows the COMPANY, not its row number. Deriving it from
-- sort_order would repaint every line the moment you reorder the board or add
-- a company — which is exactly the thing that happens ten minutes before a
-- party, and it would make a reader who learned "SLM is violet" wrong.
with palette(i, hex) as (values
    (0, '#3987e5'), (1, '#d95926'), (2, '#199e70'), (3, '#c98500'),
    (4, '#d55181'), (5, '#008300'), (6, '#9085e9')),
     ranked as (
    select id, (row_number() over (order by sort_order, created_at) - 1) % 7 as i
      from companies)
update companies c
   set color = palette.hex
  from ranked join palette on palette.i = ranked.i
 where c.id = ranked.id
   and c.color is null;
```

Two notes for when you run it:

- Put this in a new `supabase/dashboard.sql`, run it, confirm, *then* fold it into
  `schema.sql` so the from-scratch rebuild stays complete. Don't edit
  `schema.sql` blind and re-run the whole thing mid-party.
- **Supabase's linter will now report four `security_definer_view` warnings**
  instead of two. Still expected, still deliberate, still do not "fix" with
  `security_invoker` — see §7.

### 8.2 Stage 6b — colour in the GM panel

Small and mechanical. `upsert_company` in [api/wexgm.js](api/wexgm.js) already
copies a whitelist of fields; add `"color"` to that array. `CompanyEditor` in
[WexAdmin.jsx](src/wex/WexAdmin.jsx#L243) gets a row of seven swatch buttons
(not a free colour picker — the palette is validated as a set, and a hand-picked
teal will quietly break the CVD separation the seven were chosen for).

### 8.3 Stage 6c — the route and the nav

The router already strips `?params` and listens for `hashchange`, so this is:

- `ROUTES` gains `"wex"`; render `<WexDash />`.
- **The nav goes to five labels.** The existing "WEX" entry currently points at
  `#trade`, which was always a slight lie; it now points at `#wex`, and `#trade`
  gets its own honest label:

  ```
  WSJ · WEX · TRADE · FILE · FED
  ```

  It still fits one phone line — five labels at 12px uppercase Inter with the
  existing `gap: 24px` and `padding: 0 24px` comes to roughly 290px, inside even
  a 320px viewport. If it ever looks tight, drop the gap to 18px before dropping
  a label. (Four labels was the old constraint *because* the fifth was a
  standalone brand element carrying no destination — this one is a destination.)
- URL params, parsed from the hash the way `BroadsheetScreen` does it:

| Param | Values | Default |
|---|---|---|
| `window` | `15m` · `1h` · `all` | `1h` |
| `y` | `pct` · `abs` | `pct` |
| `only` | comma-separated tickers, e.g. `ANL,MLC` | all seven |

`only=` matters more than it looks: it is how you pre-set the projector to two
stocks during a crash without touching the laptop.

**One supporting change** — [src/lib/supabase.js](src/lib/supabase.js) `query()`
takes only `select` / `order` / `limit`, and the tick fetch needs
`created_at=gt.…`. Add a passthrough:

```js
if (options.params) {
  for (const [k, v] of Object.entries(options.params)) params.append(k, v);
}
```

Read-only, no new mutation path — the rule at the top of that file still holds.

### 8.4 Stage 6d — the data layer (`useMarketData.js`)

One hook, so the chart, the tiles and (in phase 7) the board never disagree about
what time it is. This is the piece the split costs nothing on — both screens
import it unchanged. Four things it has to get right:

**Fetch ticks incrementally, not by window.** Re-pulling the whole history every
three seconds is the version of this that dies at 11pm. Fetch once from the
session start, then poll `created_at=gt.<newest seen>` and append. The payload
after the first request is a handful of rows regardless of how long the party
runs, which also defers the `wex_price_series` RPC indefinitely (§8.7).

**Detect a reset.** A tick arriving with `reason = 'reset'`, or
`market_state.opened_at` changing, means the old series is a lie — drop
everything and re-seed. Without this, a reset draws a cliff.

**Tiered polling.** Roughly 2–3 requests/second total, which is fine, but there
is no reason for the leaderboard to move as fast as a price:

| Every 3s | Every 6s |
|---|---|
| new `price_ticks`, `companies`, `market_state`, `trade_tape`, `market_events` | `leaderboard`, `market_health`, `company_stats` |

Pause both when `document.visibilityState === "hidden"`.

**Hold the previous render on refetch.** Never blank to a skeleton — a projected
panel that flickers every three seconds is unwatchable. Keep the last good data
and swap it in place.

### 8.5 Stage 6e — the chart

**Form:** multi-series step-after line, seven series, one y-axis. Inline SVG,
hand-rolled, no library — nothing is installed, the dataset is small, and the
same path builder feeds the rail's sparklines.

**Step, not spline.** Prices change discretely, at trades. A smoothed curve
invents movement that never happened.

**The bug to write down before you hit it: carry-in points.** A company nobody
has traded in the last fifteen minutes has *no ticks inside the window*, and the
naive renderer draws it as nothing — the quiet stock vanishes from the board.
For each company, if its first in-window tick is later than the window start,
prepend a synthetic point at the window start carrying its last price *before*
the window (falling back to `open_price`). Then extend every line to the right
edge at `companies.price`, which is always fresher than the newest tick.

**Downsampling:** bucket to about 200 points — `bucket = max(2s, window / 200)`,
keep the last tick per company per bucket. Client-side, derived from the
selected window. Server-side bucketing only if a session ever runs long enough
to matter.

**Axes.** `pct` (change since open) is the default: the moment two companies have
different opening prices, absolute ⌀ stops comparing anything. `abs` stays
available because it is the number guests see on their phones. **They are a
toggle, never both at once** — a dual-axis chart invents a correlation that isn't
in the data, and is the single most common way a chart like this goes wrong.

In `pct` mode: a solid zero rule, symmetric padded domain, and a **minimum
domain of ±5%** so a flat market doesn't get amplified into fake drama.

**Event markers.** `market_events` inside the window draws a hairline vertical
rule; label only the most recent three, at the top, or the axis becomes a fence.
Cause and effect legible for free — worth it.

**Labels and legend.** Direct-label each line at its right edge with the ticker —
never a number on every point. The legend rail (§8.6) is simultaneously the
legend *and* the table-view twin: swatch, ticker, price, %Δ. Identity is
therefore never carried by colour alone, which — see below — is not a nicety on
a light sheet. It is what makes the palette legal.

**Interaction.** A projector has no pointer, but you will also open this URL on
the laptop — so ship the crosshair + tooltip anyway. It costs nothing on the
wall and it is how you read a crossover during the party. Clicking a legend row
isolates that series; clicking again restores. Filtering **must not repaint the
survivors** — that is the whole reason colour is a stored column.

#### The palette

Seven hues, taken as a prefix of a validated categorical order and **checked with
a validator, not by eye**. The **paper column is the one to use** — the panel is
a light sheet, like the newspaper:

| Slot | Hue | On paper (use these) | Dark variant, if you ever flip |
|---|---|---|---|
| 1 | blue | `#2a78d6` | `#3987e5` |
| 2 | orange | `#eb6834` | `#d95926` |
| 3 | aqua | `#1baf7a` | `#199e70` |
| 4 | yellow | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#4a3aa7` | `#9085e9` |

Validated against both paper surfaces the app actually uses — `#ffffff` (modern,
current) and `#f2e8d5` (classic). Lightness band, chroma floor and normal-vision
separation (worst adjacent ΔE 19.6) all pass. **Two results carry obligations:**

- **Contrast.** On white, aqua (2.82), yellow (2.17) and magenta (2.69) sit below
  3:1; on the sepia paper, orange (2.63) joins them and yellow drops to 1.78.
  Below 3:1 the relief rule applies: those lines **must** carry visible labels,
  which they do — right-edge tickers plus the legend rail. Drop the labels and
  the palette becomes non-compliant, not just less pretty.
- **Yellow ↔ aqua under tritanopia** separate by only ΔE 5.8, under the ΔE 8
  target. Legal only with secondary encoding — again the labels. If those two end
  up as the night's rivalry stocks, give one of them the violet slot instead;
  reassigning is a single swatch click in the GM panel now that colour is stored.

Line weight is the other light-surface adjustment: **3px, not the usual 2px.** A
thin line on white loses to projector bloom and to whatever downscaling the room
does to it.

**Seven is the ceiling.** An eighth company does not get a generated eighth hue;
it goes in the legend rail without a line, or the chart facets. Cycling the
palette produces two lines nobody can tell apart under CVD.

**Green and red stay off the semantics.** Up/down keeps `▲` / `▼` glyphs plus
the status pair — good `#0ca30c`, critical `#d03b3b` — and lives only in the
numeric readouts, never on a line. Slot 6 *is* green; the arrow glyph and the
right-edge ticker are what stop it reading as "this company is up".

### 8.6 Stage 6f — the panel

**A paper sheet, not a trading terminal.** Same 1200×960 canvas as the
broadsheet, same `.broadsheet-scale-wrapper` on the same dark surround, same
`--paper` ground and `--rule` hairlines. Side by side they should read as two
pages of one newspaper — a front page and a market page — because that is what
they are. WEX earns its own identity from the masthead, the rules and the chart,
not from inverting the colour scheme.

```
┌───────────────────────────────────────────────────────────────┐
│ WORM STOCK EXCHANGE · WORMHILL          ● OPEN        21:47   │  60
├─────────────────────────────────────────┬─────────────────────┤
│  [15m][1h][all]              [%][⌀]     │ ▉ ANL  Annelid      │
│                                         │        104.1k ▲4.1% │
│   price chart                           │ ▉ MLC  Mulch        │
│   % since open · 3px step lines         │         98.2k ▼1.8% │ 560
│   event rules · right-edge tickers      │ …five more…         │
│                               840 × 560 │                     │
├─────────────────────────────────────────┴─────────────────────┤
│ INVESTED 68%▓▓▓▓▓▓░░ │ TOP 3 HOLD 61% │ ▲ CST +22% │ 47 TRADES│ 130
├───────────────────────────────┬───────────────────────────────┤
│ RICHEST WORMS      1 … 5      │ BEST RETURN        1 … 5      │ 150
├───────────────────────────────┴───────────────────────────────┤
│ ▸ MARGOT bought 12 ANL @ 104.1k ▸ DEV sold 3 MLC @ 98.2k ▸ …  │  56
└───────────────────────────────────────────────────────────────┘
```

- **The legend rail** (360px) is the legend, the table-view twin and the series
  toggle in one: swatch · ticker · name · price · %Δ with arrow. Deliberately
  *not* the big price board — that is phase 7's whole job, and duplicating it
  here at half size would give you the merged layout's problem back. Halted rows
  dim and carry a `HALTED` stamp so the panel explains itself when trading stops.
- **The health band** is four stat tiles, not four charts. Invested-vs-cash is a
  single two-segment meter with a 2px gap between segments — not a pie, and not
  two bars. It is the most useful number on the screen: if everyone is fully
  invested a crash will actually bite, and if everyone is sitting in cash an
  event barely registers. That is what tells you *when* to fire something.
- **Top-3 share** computed client-side from `leaderboard` — the same number
  `generate-players.mjs` prints at setup, now moving live. Free front-page
  headline for the newspaper next to it.
- **Leaderboards** are the two views, top five each. Five, not ten: at projector
  distance nobody reads position seven.
- **The tape** reuses `.breaking-ticker`, which already measures a segment and
  repeats it via CSS custom properties.
- **The window and axis controls** sit in one row above the plot, not inside it —
  and they scope the whole panel, not just the chart. On the wall they read as a
  status line; on the laptop they are the thing you click.

Type sizes assume you may end up projecting this at 50% zoom beside the
broadsheet on one wide screen — so nothing smaller than ~14px at 1× on the
canvas, hairline rules kept at 1px so they don't thicken into stripes, and the
hero figures in the same sans as everything else, at display size.

### 8.7 Deliberately not in v1

- **A rollup table (`price_ticks_5m`) as the plotted source.** Tempting, and the
  instinct behind it is right — resolution should follow the window. But it buys
  less than it looks. Render cost, which is the thing that actually degrades, is
  already fixed by client-side downsampling (§8.5), and that fix is needed
  whether or not a rollup exists: 3 days of 5-minute buckets is still ~2,000
  rows, which is still too many points for 800 pixels. Transfer cost, which the
  rollup would genuinely halve, is not the problem either — the tick fetch is
  incremental (§8.4), so a *running* page pulls a handful of rows and only a
  page-open pays for history. At ~400KB per open, a few hundred opens across a
  party is well inside the egress budget.

  **If it ever is worth building, two notes.** First, there are two ways to keep
  it current and the trigger is still the better one: an `after insert` trigger
  on `price_ticks` upserting `(company_id, date_trunc('5 min', created_at))` is
  always exactly up to date, where a `pg_cron` job — now that we know pg_cron is
  free on Supabase, see §5.1 — leaves a window where the rollup lags the raw
  ticks. Second, make it **additive**: raw ticks stay, the
  rollup is a second read path for wide windows only. `price_ticks` is the only
  record of what actually happened, and rounding it in place destroys the
  ledger to save bytes that are not scarce.

- **`wex_price_series` server-side bucketing.** Same reasoning: incremental tick
  fetching makes the payload flat regardless of session length, which was the
  only reason to build it.
- **Brush-to-zoom.** The three window buttons cover the real need, and a brush is
  fiddly on a trackpad with a drink in hand.
- **Auto-rotating panels.** Everything fits on one canvas. Rotation is what you
  add when it doesn't.
- **Per-player volume.** `company_stats` covers "which stock is the story"; "who
  is actually playing" is already visible in the GM Players tab, and putting
  individual trade counts on the wall changes how people play.

### 8.8 Original design notes (kept for background)

The material below predates the "public tab" decision. Where it conflicts with
§8.0–8.7, the stages above win.

#### The price graph

**The data already exists.** `price_ticks` gets a row on every trade, every GM
event, every manual set and every reset, each tagged with `reason`. Nothing new
needs recording — the history has been accumulating since the first trade.

**Rendering: hand-rolled inline SVG, no library.** Nothing is installed, the
dataset is small, the newspaper aesthetic is bespoke, and the wall board needs
sparklines from the same data — one `<polyline>` renderer serves both. Adding
Recharts or uPlot for this would be more weight than it saves.

**Use a step line, not a smooth curve.** Prices change discretely, at trades. An
explicit step-after path is the honest shape; a smoothed spline invents movement
that never happened.

**Per-company colour needs a schema change.** Add `companies.color text`, set in
the Companies tab. Deriving colour from `sort_order` instead would silently
reshuffle every series the moment a company is reordered or added — exactly the
sort of thing that happens ten minutes before a party. Pick seven that survive a
projector and both themes; the line, the legend swatch and the company's row on
the wall board then all use the same one.

**Interactive axis selection** — three controls, each earning its place:

| Control | Options | Why |
|---|---|---|
| Y axis | **% change since open** (default) · absolute ⌀ | While all seven open at 100,000 ⌀ the two are identical, but the moment opening prices differ only % compares fairly. Absolute stays available because it is what guests see on their phones. |
| X window | last 15 min · last hour · whole session | The whole session flattens the last ten minutes into noise; a short window is what you want during a crash. |
| Series | click a legend swatch to show/hide | Seven overlapping lines is soup. Isolating two or three is how you actually read a divergence. |

Brush-to-zoom is possible later but probably not worth it — the window buttons
cover the real need, and a brush is fiddly on a trackpad at a party.

> **Built, and it went further than this section anticipated.** Two things in
> [chartSeries.js](src/wex/chartSeries.js), both testable with plain node:
>
> **`buildTimeScale()` — a piecewise time axis that squeezes dead air.** Close
> the market at midnight and reopen at six and a session chart spends a third of
> its width on an empty room; across three days there are two of those and each
> evening becomes a sliver. Any stretch over 10 minutes with *nothing in it* is
> drawn 3 minutes wide instead of its real length. Dead time is inferred from
> the absence of ticks rather than from `market_state`, which needs no schema
> and treats a lull, a dinner break and a closed market alike. Measured on a
> simulated 3-day party: the active hours go from **33% to 99.6%** of the chart.
> The compression is always *drawn* — a shaded band labelled with the elided
> duration ("8h") — because an axis that silently lies about time would be worse
> than the problem. `fromChart()` is the inverse, so the hover tooltip and the
> axis labels read the time actually under the cursor.
>
> **`downsample()` — thinning by what the screen can resolve.** One bucket per
> ~4px of plot width, keeping each bucket's min, max and last so a crash-and-
> recovery inside one bucket cannot vanish (keeping only the last value is the
> obvious version and it swallows spikes). A bucket whose entire vertical range
> is under ~1.2px has no visible spike, so it collapses to a single point. On
> realistic drifting prices that thins 3,429 points to 553. The ceiling is
> `plotW/4 × 3 × series` and **does not grow with history** — ten times the
> ticks costs 1.7× the points, not 10×.
>
> One incidental fix worth more than either: `stepPath` rounds coordinates to a
> tenth of a pixel. Unrounded, one point serialises as
> `L 412.38472910384765 208.9174857392018`. That alone was 170KB → 59KB.

**Downsampling is the one real engineering concern.** Thirty guests trading for
three hours could produce a few thousand tick rows, and an SVG path with a point
per tick gets both slow and visually noisy. Two options:

- *Client-side* — fetch the window, keep the last price per N-second bucket.
  Simplest, but pulls every row over the wire.
- *Server-side* — a `wex_price_series(p_from timestamptz, p_bucket interval)`
  returning one row per company per bucket. More work, but the payload stays flat
  however long the party runs, and the wall board can reuse it.

Start client-side with a bucket derived from the selected window; move it
server-side only if a session actually gets long enough to matter.

#### Other elements considered

Roughly in order of how much each would tell you mid-party:

- **Cash vs invested, across the whole economy.** The single most useful number:
  if nearly everyone is fully invested, a crash will bite and the ranking will
  finally move; if everyone is sitting in cash, an event barely registers. This
  is what tells you *when* to fire something.
- **Both leaderboards** — net worth and % return, side by side, as on the wall.
- **Biggest movers** — largest % change since open, up and down.
- **Volume** — trades per company and per player. Shows who is actually playing,
  and which stock is the story of the night.
- **Shareholder count per company** — a stock with one holder behaves very
  differently from one with fifteen when news lands.
- **Wealth concentration over time** — the top-3 share that
  `generate-players.mjs` prints at setup, tracked live. Watching it move is the
  actual satire, and it is a free newspaper headline.
- **Recent trades tape** — the same feed the wall board shows, for context when a
  price jumps.

#### The three questions this section left open — now answered

| Question | Answer |
|---|---|
| GM-only, or on the wall? | **On the wall**, public, as its own route — and it absorbs the separate board rather than sitting beside it |
| Mark GM events on the timeline? | **Yes** — hairline rules from `market_events`, most recent three labelled (§8.5) |
| Do guests see any of it? | **All of it.** Nothing here exposes an individual beyond what `leaderboard` already does |

---

## 9. Verification

**`npm run dev` is not enough** — it serves the client only and every `/api/*` call 404s. Use `vercel dev` (port 3000) for anything touching WEX; `npm run dev -- --host` for phone testing against a deployed API.

1. **Schema/RLS:** `curl …/rest/v1/players?select=*` with the anon key → empty array or permission error, never rows. Repeat for `holdings` and `trades`. Then confirm `leaderboard` and `trade_tape` *do* return rows and carry no `code` column.
2. **Roster script:** run it, confirm the Pareto spread looks fun rather than cruel (check the top-3-share summary), fortunes rounded to 2 significant figures, re-running gives a different draw. Hand-edit one row and confirm it loads.
3. **API in isolation:** `curl -X POST localhost:3000/api/wex -d '{"action":"login","code":"damp-tunnel-wriggler"}'` → player JSON, no `code` echoed back. Bad code → 403. `trade` with the market closed → refusal; open it via `api/wexgm` → fills.
4. **Price math:** buy 24 shares at `liquidity=800` → `price_after ≈ price × 1.03`; a matching sell returns slightly less than the purchase cost; a trade above `max_impact` (>200 shares) is rejected; a poor player's max affordable buy is ~15 shares.
5. **Concurrency:** two simultaneous buys for the same player via `curl … & curl … &`. Cash must never go negative and both trades must chain off each other's price — the test that justifies the RPC.
6. **Numeric headroom and formatting:** scripted bubble until a net worth passes 100M ⌀; no overflow, and `formatWormcoin()` renders `840 ⌀`, `104.1k ⌀`, `1.5M ⌀`, `247.31M ⌀` sensibly, with no raw digit strings surviving on phone or board.
7. **End-to-end:** two browser profiles (one rich, one poor) + one GM tab + `#wex` on a third screen. Trade in both, watch the board and both leaderboards move within one poll cycle. Fire a company-scoped event and a market-wide one with "broadcast on WSJ ticker" checked — prices move, newspaper banner fires, halting blocks trading.
8. **Phone:** `#trade` on a real phone over `--host` — tap targets, code entry with autocorrect on, locked screen stops polling.
9. **Reset:** prices return to `open_price`, holdings clear, each player returns to their **own** `starting_cash`.
10. `npm run lint` clean.

### Phase 6 — the dashboard

11. **The new views are safe:** `curl …/rest/v1/market_health` and `…/company_stats` with the **anon** key → rows, and no column that names or identifies a player. Then re-run check 1 — `players` must still return nothing.
12. **Quiet stock:** trade six companies, leave the seventh alone for twenty minutes, set `?window=15m`. All seven lines must be drawn; the untouched one is a flat line at its last price, not a gap. This is the carry-in bug in §8.5 and it is the one that will actually happen.
13. **Reset mid-session:** fire `wex_reset_market()` with the dashboard open. The chart must clear and re-seed from the reset tick within one poll cycle, not draw a cliff.
14. **Event markers:** fire a market-wide event, confirm one rule appears on the timeline at the right moment, and that seven lines all step at it.
15. **Projector legibility:** open `#wex` and `#broadsheet` side by side at the zoom you will actually use. Read the legend rail, the leaderboards and the health band from across the room. If anything needs squinting it is too small, not too far. Check the three sub-3:1 hues (aqua, yellow, magenta) specifically — they are the ones the light sheet is hardest on, and their labels are what make them legal.
16. **Colour survives reordering:** change one company's `sort_order` in the GM panel. Every line must keep its hue.
17. **Poll behaviour:** leave the dashboard open for ten minutes with devtools on the network tab. Steady ~2–3 req/s, tick responses staying small rather than growing, no skeleton flash on refetch.
18. **Nav on a phone:** five labels on a 320px viewport, one line, no wrap.

---

## 10. The ticker (`#ticker`)

A third wall screen: the exchange as an 80s trading terminal. Green phosphor on
black, a real low-resolution canvas, scanlines. It sits beside `#wex` and the
planned `#board`, and changes neither. Nothing on it can be clicked, so it
draws no nav bar: point a projector at it and walk away.

### 10.1 What is built

| Part | Where | Notes |
|---|---|---|
| Page and rotation | `src/wex/TickerDash.jsx` | Quotes, tape and chart. Three chart **slots** with fixed colours (cyan, magenta, yellow). Every `rotate` seconds one slot, round-robin, gets a company not on screen, so a company keeps its colour while it is up |
| Tape and slot maths | `src/wex/tickerFeed.js` | Pure, node-checkable. `buildFeed` merges `trade_tape`, `market_events` and `price_ticks`. Each drift run collapses to one row; moves under 0.05% are dropped, since they would print as "0.0%". `gm_event` ticks are not listed, because the headline row already covers them |
| The chart | `src/wex/PixelChart.jsx` | A canvas at about ¼ resolution, scaled up with `image-rendering: pixelated`, drawn only with integer `fillRect`s. Reuses chartSeries.js unchanged. `yMode` is `abs` (share price, the default) or `pct` (vs open). Each chart pixel is a whole number of *device* pixels, so a 125%-scaled screen does not shimmer |
| Bitmap font | `src/wex/pixelFont.js` | 5×7, so canvas text sits on the same grid as the lines |
| Styles | `src/wex/tickerStyles.js` | All `tkr-` prefixed. Green and red mean up and down **only**; chart lines never use them |
| Link params | `src/wex/hashParams.js` | Shared with `#wex` now |
| SQL | `supabase/ticker.sql` | Two columns appended to `trade_tape`. Run and verified |

Link: `#ticker?rotate=90&px=4&hours=6&y=abs`. Every param is optional.
`y=pct` brings back the percent-vs-open chart. `px` defaults to 4 on a wall
and 2 on a phone.

Tape rows too long for the panel glide sideways (`Scroller`); drift rows always
do. The motion is smooth, not stepped: 3px steps at a slow speed came out at
about 12 a second, which read as stutter rather than retro.

### 10.2 Random mode — the plan

**The idea.** `#ticker?mode=random` is its own screen, random all the time: a black CRT field.
Pixel-bordered windows open, each with one readable view of the market, stay a
few seconds, then snap shut. Three to five are up at once, overlapping like a busy
1985 desktop. It is abstract to look at, but every window is real, live data.

**Ambient, plus event-driven.** Most windows are ambient: a random kind, a
random company. But the market also *summons* windows, which is what keeps this
from being a screensaver:

| Trigger | Window it opens |
|---|---|
| New `market_events` row | HEADLINE in amber, plus a LINE window for that company, both on top and kept longer |
| A trade that moves a stock ≥ 2% | BIG NUMBER for that stock, blinking ▲ / ▼ |
| A quiet minute | Nothing extra. Ambient windows carry on |

**Window kinds** (a catalogue, so adding one is one entry):

| Kind | Shows | Renderer |
|---|---|---|
| LINE | One company's price over a random window (15m / 1h / 6h) | `PixelChart` with a single slot |
| TRIO | Three companies, as on the fixed screen | `PixelChart` |
| SPARKS | All seven as tiny sparklines, no axes | `PixelChart` with axes off, ×7 |
| BARS | %Δ vs open for all seven, horizontal bars | new `PixelBars` |
| BIG NUMBER | One price, pixel font at 4×, ▲▼ | new `PixelNumber` |
| HEADLINE | Latest market event | DOM, VT323 |
| TAPE | Last five feed rows | DOM, reuses `FeedRow` |

Title bars read like old filenames (`ANL.CHT`, `MARKET.BAR`, `NEWS.TXT`), with a
close box that is only decoration.

**Motion.**
- **Open:** the frame unfolds from its centre in about 8 chunky `clip-path`
  steps. The canvas inside then draws its line in, which PixelChart already does.
- **Close:** a CRT switch-off. The window collapses to a horizontal line, then
  to a dot, then goes.
- **Stacking:** the newest window is on top, and a summoned window always opens
  above ambient ones.
- **Reduced motion:** windows just appear and disappear.

**Layout rules.**
- **Grid:** positions and sizes snap to a grid of whole chart pixels, so every
  window's pixels line up with every other's.
- **Placement:** pick the candidate spot, out of about a dozen, that overlaps
  least. Overlap is allowed, but no window may hide more than about half of
  another. That keeps the busy look without hiding everything.
- **Screen coverage:** capped at about 70%, so there is always black to breathe.

**Architecture.**
- **`src/wex/popScheduler.js`:** pure and node-checkable.
  - `nextSpawn(state, now, rng, speed)` returns when to open the next window,
    what kind it is (weighted) and how long it lives.
  - `placeWindow(open, size, viewport, rng)` returns a position.
  - `summons(prevData, data)` returns the event-driven specs.
  - All randomness comes from a seeded `rng`, and `?seed=` pins it, so a
    screenshot can be reproduced.
- **`src/wex/usePixelCanvas.js`:** the sizing and redraw loop, extracted from
  `PixelChart` so the bars and big number do not copy it. PixelChart then keeps
  only its `draw`. This is the one refactor of built code, and the fixed screen
  must look identical afterwards.
- **`src/wex/PopWindow.jsx`:** the frame, title bar and open/close animation.
- **`src/wex/TickerRandom.jsx`:** the field, the scheduler clock and the stack
  of open windows. It takes the same `useMarketData()` output as the fixed
  screen and passes it down. A window pins its company when it opens but always
  reads live prices.
- **`PixelChart` options:** `axes` and `legend` flags, defaulting to on, for the
  small windows.

**Stages.**

| Stage | Work | Check |
|---|---|---|
| R1 | Extract `usePixelCanvas`; add the `axes` / `legend` flags; `useMarketData({ slow: false })` for both ticker screens | Fixed `#ticker` screenshot unchanged at 1920 and 390; the network tab shows no `leaderboard` / `market_health` / `company_stats` polls on `#ticker`, and `#wex` still has them |
| R2 | `popScheduler.js` | Node script: coverage cap holds, no window more than half hidden, the same seed gives the same sequence |
| R3 | `PopWindow` + `TickerRandom` with a placeholder body; `?mode=random`, `?seed=`, `?speed=`, `?max=` | Watch it for five minutes at `speed=1` and at `speed=4`: windows open, close and never pile up past `max` |
| R4 | The seven kinds | One screenshot per kind, forced with `?only=bars` and so on |
| R5 | Summons | Fire a GM event and place a big trade; the right windows open on top |
| R6 | Tune on the real wall; phone (at most two windows, full width) | You, across the room |

**Progress.** R1–R5 are built:
- **R1:** the fixed screen is unchanged in screenshots, and `#ticker` no longer polls the standings views.
- **R2:** the scheduler passes a simulated two hours on a wall and a phone, at speeds 0.25, 1 and 4.
- **R3/R4:** every kind was screenshotted with `?only=`. At `speed=4`, 20 windows opened in 20 s, never more than 5 at once, with no page errors.
- **Summons** are checked in the simulation only: firing a real GM event would have moved the live market.

Added after the plan: a whole-market kind (sparks, bars, headline, tape) is never open twice at once, because two identical MOVERS.BAR windows side by side looked like a glitch.

**Settled.**

| Question | Decision |
|---|---|
| Own screen, or over the fixed ticker? | **Its own screen**, `#ticker?mode=random` |
| Fixed, or cycling with the fixed screen? | **Always random.** No cycle mode |
| How abstract? | **Readable.** Every window has a title and real labels, even when the speed makes it hard to read in time |
| Leaderboard windows? | **None.** Market data only; no player names pop up |
| Speed? | **Set in the link**; see below |

**The speed dial.** `?speed=` multiplies the whole tempo. `1` is the default,
`2` is twice as frantic and `0.5` is half. It is clamped to 0.25–4.

| At `speed=1` | Value | Scales with speed? |
|---|---|---|
| Gap between new windows | 2–6 s, random | yes, divided by speed |
| A window's lifetime | 8–20 s, random | yes |
| A summoned window's lifetime | 25 s | yes |
| Windows open at once | 3–5 | no. `?max=` sets the ceiling instead (default 5) |
| Open / close animation | ~0.4 s | **no**. The unfold and switch-off are the look; sped up, they stop reading as a CRT |
| Line draw-in inside a window | 1.2 s | yes, but never under 0.3 s |

A window never shuts before its line has finished drawing, whatever the speed.

**Database load.** Random mode costs the **same** as the fixed ticker: one
`useMarketData()` for the page, and every window draws from it. Windows never
fetch. Measured on the live project, one open screen pulls about 2.4 KB of data
every 3 s and 1 KB every 6 s, compressed. That is roughly 8–9 MB an hour
including HTTP headers. Supabase does not charge per request; the thing to watch
is **egress** on the plan's monthly allowance. Neither ticker screen reads the
leaderboard or the aggregate views, so R1 lets them skip those slow polls
(`useMarketData({ slow: false })`), which cuts about 15%.
