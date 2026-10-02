-- ============================================================================
-- WEX — dashboard support (phase 6)
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Idempotent: safe to re-run while iterating.
--
-- WHY THIS FILE EXISTS
--   The dashboard at /#wex is a PUBLIC page. It reads Supabase directly with
--   the anon key, exactly as the broadsheet reads `articles` — there is no
--   serverless function in front of it.
--
--   That is the whole constraint. `players`, `holdings` and `trades` have RLS
--   on with zero policies and MUST stay that way: `players.code` is the only
--   credential in the system. But three of the things worth putting on a wall —
--   how much of the economy is invested rather than sitting in cash, how much
--   each stock has traded, and how many worms hold it — live in exactly those
--   tables.
--
--   So: two AGGREGATE views. They run as owner (security definer, the default),
--   the same trick that already lets `leaderboard` show names. They return
--   totals and counts only. There is no row in either of them about any
--   individual worm, and no path from them back to a code.
--
--   Supabase's linter will now report FOUR `security_definer_view` warnings
--   instead of two. Expected. Do not "fix" them with security_invoker — the
--   views would return empty forever. See schema.sql's header.
--
-- Once this has run and been verified, fold it into schema.sql so a rebuild
-- from scratch is still one file.
-- ============================================================================


-- ============================================================================
-- 1. companies.color — one fixed colour per company
-- ============================================================================
-- STORED, not derived from sort_order. The colour follows the COMPANY, not its
-- row number: derive it from position and reordering the board — or adding a
-- company ten minutes before the party — silently repaints every line on the
-- chart, and a reader who learned "SLM is violet" is now being lied to.

alter table companies add column if not exists color text;

-- Backfill in sort_order, once. Only fills nulls, so a colour you have picked
-- by hand in the GM panel survives a re-run of this file.
--
-- The seven hues are a prefix of a validated categorical order, checked against
-- both paper surfaces the app uses (#ffffff modern, #f2e8d5 classic) for
-- lightness, chroma, colour-vision separation and contrast. Three of them sit
-- below 3:1 on white — which is legal ONLY because every line carries a visible
-- ticker label and every swatch sits beside its ticker. See docs/archive/WEX_plan.md §8.5.
with palette (i, hex) as (
  values (0, '#2a78d6'),   -- blue
         (1, '#eb6834'),   -- orange
         (2, '#1baf7a'),   -- aqua
         (3, '#eda100'),   -- yellow
         (4, '#e87ba4'),   -- magenta
         (5, '#008300'),   -- green
         (6, '#4a3aa7')    -- violet
),
ranked as (
  select id, (row_number() over (order by sort_order, created_at) - 1) % 7 as i
    from companies
)
update companies c
   set color = palette.hex
  from ranked
  join palette on palette.i = ranked.i
 where c.id = ranked.id
   and c.color is null;


-- ============================================================================
-- 2. market_health — one row, the state of the whole economy
-- ============================================================================
-- The single most useful readout on the wall is `total_invested` against
-- `total_cash`. If nearly everyone is fully invested, a crash will bite and the
-- ranking will finally move; if everyone is sitting in cash, an event barely
-- registers. That is what tells the Worm Fed WHEN to fire something.
--
-- GMs are excluded, and unclaimed accounts are excluded, so the figures
-- describe the people actually playing rather than the printed roster.

create or replace view market_health as
  with net as (
    select p.id,
           p.cash                                  as cash,
           coalesce(sum(h.shares * c.price), 0)    as invested
      from players p
      left join holdings  h on h.player_id = p.id
      left join companies c on c.id = h.company_id
     where p.is_claimed
       and not p.is_gm
     group by p.id
  )
  select count(*)                                              as players_in,
         (select count(*) from players where not is_gm)        as players_total,
         coalesce(sum(cash), 0)                                as total_cash,
         coalesce(sum(invested), 0)                            as total_invested,
         (select count(*) from trades)                         as trade_count,
         (select count(*) from trades
           where created_at > now() - interval '5 minutes')    as trades_recent
    from net;


-- ============================================================================
-- 3. company_stats — one row per company
-- ============================================================================
-- `holders` is the one that changes how you read the news: a stock with one
-- holder behaves very differently from one with fifteen when an event lands.
--
-- Left joins rather than a filtered inner join, so a company nobody has touched
-- still appears with zeroes instead of vanishing from the dashboard.

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
      select company_id,
             count(*)     as holders,
             sum(shares)  as shares_held
        from holdings
       where shares <> 0
       group by company_id
    ) h on h.company_id = c.id
    left join (
      select company_id,
             count(*)                              as trade_count,
             sum(shares)                           as volume_shares,
             count(*) filter (where side = 'buy')  as buys,
             count(*) filter (where side = 'sell') as sells
        from trades
       group by company_id
    ) t on t.company_id = c.id;


-- ============================================================================
-- 4. Grants
-- ============================================================================
-- Read-only, to everyone. Neither view is writable and neither exposes a row
-- about a person.

grant select on market_health, company_stats to anon, service_role;


-- ============================================================================
-- 5. Verify before you close the tab
-- ============================================================================
-- These should return one row and seven rows respectively.
--
--   select * from market_health;
--   select * from company_stats order by ticker;
--   select ticker, color from companies order by sort_order;
--
-- Then the check that actually matters — with the ANON key, not in this editor:
--
--   curl "$URL/rest/v1/market_health?select=*"   -H "apikey: $ANON"  → rows
--   curl "$URL/rest/v1/players?select=*"         -H "apikey: $ANON"  → NO rows
--
-- That pair is the whole security model. If the second one ever returns rows,
-- stop and fix it before the party.
