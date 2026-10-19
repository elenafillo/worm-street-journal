# Database files

Every file is pasted into the Supabase SQL Editor and run. All of them are
idempotent. Each one's header explains what it does.

`schema.sql` is the full rebuild. The other files are migrations: once one has
been run and verified, it is folded into `schema.sql` so a from-scratch rebuild
stays one file. **Three are not folded yet**, so today a rebuild is
`schema.sql` → `seed.sql` → `dashboard.sql` → `drift.sql` → `ntfy.sql`.

All of these have been run on the live project (as of 2026-10-02).

| File | What | Folded into schema |
|---|---|---|
| [schema.sql](../supabase/schema.sql) | All core tables, views, RLS, grants, `execute_trade`, GM and reset functions | — |
| [seed.sql](../supabase/seed.sql) | Seven placeholder companies and their opening ticks. Run after schema | — |
| `players.seed.sql` | The roster. Generated, git-ignored, holds live codes | — |
| [dashboard.sql](../supabase/dashboard.sql) | `companies.color`, `market_health`, `company_stats` | ⬜ |
| [drift.sql](../supabase/drift.sql) | Drift dials, `wex_drift()`, the pg_cron heartbeat. Enable pg_cron first | ⬜ |
| [ntfy.sql](../supabase/ntfy.sql) | Push to ntfy when a story goes live. Needs pg_net and two Vault secrets (`ntfy_topic`, `site_url`) | ⬜ |
| [ticker.sql](../supabase/ticker.sql) | `price_before` / `price_after` on `trade_tape` | ✅ |
| [events.sql](../supabase/events.sql) | `market_events.moves`: one event moves up to four companies | ✅ |
| [held.sql](../supabase/held.sql) | Held stories, press releases, `article_filers`, one CEO per company | ✅ |
| [news.sql](../supabase/news.sql) | `articles.updated_at` + trigger, `articles_version` view | ✅ |
| [reset.sql](../supabase/reset.sql) | The two reset calls, to keep open in an editor tab | — |
| [smoke_test.sql](../supabase/smoke_test.sql) | Trades with a test player and checks the arithmetic. Setup only, never mid-party | — |

When you add a migration, add it here and note when it was run.
