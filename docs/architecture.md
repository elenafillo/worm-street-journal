# Architecture

```
Wall      #broadsheet  #wex  #ticker  #display  ──┐
Phone     #trade  #submit                       ──┤  anon key, read-only
GM        #gm                                     │  (PostgREST, polled)
                                                  ▼
              POST /api/submit  /api/wex  /api/gm  /api/wexgm
                     │  service-role key, server-side only
                     ▼
              Supabase Postgres ── pg_cron (drift, every minute)
                                └─ pg_net  (ntfy push on new stories)
              Supabase Storage: wsj-images
```

## The rule

**Anon-readable data comes straight from PostgREST. The API is only for what RLS
denies, and for writes.** The anon key is public (it is in
[src/lib/supabase.js](../src/lib/supabase.js)), so no price, cash or share
balance is ever computed or written by the client. Trades run inside one
plpgsql function, `execute_trade`. Details in
[data-and-security.md](data-and-security.md).

This rule also controls cost. Every `/api/*` call is a Vercel invocation, and
PostgREST reads are free, so `#trade` polls prices from PostgREST every 5 s and
calls `/api/wex` for cash and holdings only every 45 s, plus once when the bell
rings. That is about 1.3 invocations per phone per minute instead of 12.

## Polling, not realtime

There are no websockets. Screens poll, pause when the tab is hidden, and keep the
last good data on screen while refetching, so nothing flickers.

| What | How often | Where |
|---|---|---|
| Market: ticks, companies, market state, tape, events | 3 s, incremental (`created_at > newest seen`) | [useMarketData.js](../src/wex/useMarketData.js) |
| Standings: leaderboard, `market_health`, `company_stats` | 6 s, skipped on `#ticker` | same |
| Articles | 4 s. Polls the one-row `articles_version` view and fetches only changed rows | [useArticles.js](../src/lib/useArticles.js) |
| Breaking banners | worked out from `events` rows, not from a browser timer | [useBreaking.js](../src/lib/useBreaking.js) |

A tick with `reason = 'reset'`, or a change to `market_state.opened_at`, makes the
market hook drop its history and fetch it again.

## Where the code is

| Path | What |
|---|---|
| [src/App.jsx](../src/App.jsx) | Router (`ROUTES`), nav, and the newspaper screens: `BroadsheetScreen`, `DisplayScreen`, `SubmitForm`, `GMPanel` (Newsroom tab) |
| [src/lib/](../src/lib/) | `supabase.js` (read-only PostgREST client), `config.js` (party constants), `photo.js` + [PhotoCropper.jsx](../src/PhotoCropper.jsx), `useArticles`, `useBreaking` |
| [src/wex/](../src/wex/) | Everything for the exchange. Screens: `WexTrade`, `WexDash`, `TickerDash`, `TickerRandom`, `WexAdmin` (GM tabs) |
| src/wex, pure modules | Node-testable, no React: `chartSeries`, `portfolioSeries`, `tickerFeed`, `popScheduler`, `bell`, `format`, `palette`, `rules` |
| [api/](../api/) | `submit.js` (filing), `gm.js` (newsroom), `wex.js` (guest: login, claim, portfolio, trade), `wexgm.js` (GM exchange). `_supabase.js` is shared and not routed |
| [supabase/](../supabase/) | `schema.sql` (the full rebuild) plus migrations. See [database.md](database.md) |
| [scripts/generate-players.mjs](../scripts/generate-players.mjs) | Builds the player roster |

## Conventions

- Hash routing. Query parameters sit inside the hash (`#wex?window=15m`), so read
  them with `hashParams()` ([hashParams.js](../src/wex/hashParams.js)), not
  `location.search`.
- Format every figure with `formatWormcoin()` ([format.js](../src/wex/format.js)):
  `840 ⌀`, `104.1k ⌀`, `24.65M ⌀`.
- Charts are hand-written SVG or canvas. There is no chart library.
- Exchange tunables live in the database so they can change mid-party without a
  deploy. Don't add them to `config.js`.
