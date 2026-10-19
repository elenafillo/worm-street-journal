# Data and security

## The model

- The **anon key is public**: it ships in the bundle. Anything anon can write, a
  guest can write from devtools. So anon may only SELECT.
- **Every write goes through `api/*.js`**, using the service-role key held in
  Vercel env vars. The service-role key bypasses RLS.
- **A player's three-word code is the only credential.** Whoever holds a code
  *is* that player. So `players` can never be readable by anon, and the
  generated `supabase/players.seed.sql` is git-ignored.
- The GM password (`GM_PASSWORD`) is checked server-side in `api/gm.js` and
  `api/wexgm.js`.

## Tables

| Table | What | anon can read |
|---|---|---|
| `articles` | Stories, notices, events. `article_type`: `article` · `notice` · `entertainment` | only rows where `hidden = false` |
| `events` | Breaking-news signals: `breaking_news`, `clear_breaking` | ✅ |
| `article_filers` | Who filed each story (`player_id`, `trading_name` copied at filing) | ❌ |
| `companies` | Seven listed companies: ticker, price, `open_price`, `liquidity`, `color`, `ceo_name`, `ceo_player_id` (unique), halted | ✅ |
| `price_ticks` | One row per price change, with `reason` (trade, gm_event, drift, reset…). The only full record of what happened | ✅ |
| `market_events` | GM events and timeline markers. `moves` jsonb for multi-company events, `article_id` for a held story | ✅ |
| `market_state` | One row: open/closed, `min_price`, `max_impact`, drift dials, bell timestamps | ✅ |
| `players` | Code, display name, `cash`, `starting_cash`, `is_claimed` | ❌ |
| `holdings` | Shares per player per company (signed, so shorts would need no migration) | ❌ |
| `trades` | The trade ledger, with `price_before` / `price_after` | ❌ |

`❌` means RLS is on with **zero policies**. That is deliberate: it denies
everything except the service role.

Storage: the `wsj-images` bucket is public. Photos are cropped to between 4:5
and 5:4 and shrunk to about 1600 px in the browser before upload
([photo.js](../src/lib/photo.js)).

## Views

| View | Security | Why |
|---|---|---|
| `leaderboard`, `trade_tape` | definer | Show names and net worth on the wall without granting anon `players` |
| `market_health`, `company_stats` | definer | Totals and counts only (cash vs invested, volume, holder counts). No row about any one player |
| `articles_version` | invoker | One row (visible count, newest `updated_at`) so screens can tell when to refetch. Runs under the reader's RLS, so it says nothing about hidden stories |

Supabase's linter reports four `security_definer_view` warnings. **They are
expected.** Switching to `security_invoker` would make those views return nothing.

## Held stories and filers

- A held story is stored with `held = true` **and** `hidden = true`, so every
  reader skips it with no special case.
- `wex_fire_event` / `wex_fire_moves` take an optional `p_article_id`. They
  publish that story in the same transaction as the price move, so nobody can
  read the news before the price reacts. Firing the same story a second time is
  refused.
- The filer's trading name is kept in `article_filers`, not on `articles`. anon
  can read every column of `articles`, and `leaderboard` exposes player ids, so
  a column there would let anyone unmask a byline.
- Press releases are ordinary `article` rows with `press_company_id` set. The
  server looks up the CEO's company itself and never trusts a company id sent by
  the client.

## Checking it

With the anon key: `players`, `holdings`, `trades` and `article_filers` must
return nothing, and `leaderboard` must return rows with no `code` column. If
both hold, the security model is intact.
