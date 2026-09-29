-- ============================================================================
-- WEX — ticker support (#ticker)
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Idempotent: safe to re-run while iterating.
--
-- WHY THIS FILE EXISTS
--   The 80s ticker at /#ticker lists every trade with how far it MOVED the
--   stock: "SQUIGGLE BUY 12 ANL ▲2.1%". `trades` already records price_before
--   and price_after, but `trade_tape` — the only way anon can see a trade —
--   never exposed them.
--
--   Two columns are added at the END of the view. That is what lets
--   `create or replace view` work without a drop: Postgres allows appending
--   columns to a view but not reordering or removing them. Grants survive a
--   replace, so nothing else needs re-running.
--
--   Nothing here identifies anyone beyond what the tape already showed — a
--   price is public the moment it moves.
--
-- Once this has run and been verified, fold it into schema.sql so a rebuild
-- from scratch is still one file. (Already folded; this file is the migration.)
-- ============================================================================

create or replace view trade_tape as
  select t.id,
         p.display_name,
         c.ticker,
         t.side,
         t.shares,
         t.exec_price,
         t.created_at,
         t.price_before,
         t.price_after
    from trades t
    join players   p on p.id = t.player_id
    join companies c on c.id = t.company_id
   order by t.created_at desc
   limit 30;

-- Verify: both new columns come back, newest trade first.
--   select ticker, side, shares, price_before, price_after from trade_tape limit 3;
