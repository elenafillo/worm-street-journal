-- ============================================================================
-- WEX — smoke test
-- ============================================================================
-- Run in the Supabase SQL Editor AFTER schema.sql and seed.sql.
-- Paste this whole file, Run, and read the table it prints. Every row should
-- say `ok`. A `FAIL` means stop and fix it before building anything on top.
--
-- It creates a test player, trades with it, checks the arithmetic and every
-- refusal path, then removes its own traces and restores the market state and
-- the company price it borrowed.
--
-- Run it during SETUP, not while guests are trading: cleanup deletes rows
-- created after it started, so a trade landing mid-run would be swept up too.
--
-- Re-runnable afterwards with just:  select * from wex_smoke_test();
-- ============================================================================

create or replace function wex_smoke_test()
returns table (step text, status text, detail text)
language plpgsql
as $$
declare
  v_company    uuid;
  v_player     uuid;
  v_r          json;
  v_cash       numeric;
  v_rls_off    text;
  v_policies   int;
  v_was_open   boolean;
  v_old_price  numeric;
  v_old_liq    numeric;
  v_tick_mark  bigint;
  v_trade_mark bigint;
begin
  -- Save everything we are about to disturb ---------------------------------
  select is_open into v_was_open from market_state where id = 1;
  select coalesce(max(id), 0) into v_tick_mark  from price_ticks;
  select coalesce(max(id), 0) into v_trade_mark from trades;
  select id, price, liquidity into v_company, v_old_price, v_old_liq
    from companies order by sort_order limit 1;

  if v_company is null then
    step := '0 · seed data'; status := 'FAIL';
    detail := 'No companies found — run seed.sql first.';
    return next;
    return;
  end if;

  -- 1 · RLS on every WEX table ----------------------------------------------
  select string_agg(c.relname, ', ') into v_rls_off
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('players','companies','holdings','trades',
                       'price_ticks','market_events','market_state')
     and c.relrowsecurity = false;

  step := '1 · RLS enabled';
  if v_rls_off is null then
    status := 'ok';   detail := 'all 7 WEX tables have RLS on';
  else
    status := 'FAIL'; detail := 'RLS is OFF on: ' || v_rls_off || ' — anon can write these';
  end if;
  return next;

  -- 2 · The private tables deny everything ----------------------------------
  select count(*) into v_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in ('players', 'holdings', 'trades');

  step := '2 · private tables';
  if v_policies = 0 then
    status := 'ok';   detail := 'players/holdings/trades have zero policies (deny-all)';
  else
    status := 'FAIL'; detail := v_policies || ' policy/policies present — codes may be readable';
  end if;
  return next;

  -- 2b · GRANTS ------------------------------------------------------------
  -- Distinct from RLS, and easy to miss: this test runs as the table OWNER,
  -- so everything below would pass even with no grants at all. The API does
  -- NOT run as the owner — it uses service_role, which bypasses RLS but is
  -- still subject to grants. Check the roles the app actually uses.
  step := '2b · service_role grants';
  if has_table_privilege('service_role', 'companies', 'SELECT')
     and has_table_privilege('service_role', 'players',  'SELECT')
     and has_table_privilege('service_role', 'players',  'UPDATE')
     and has_table_privilege('service_role', 'trades',   'INSERT')
     and has_table_privilege('service_role', 'holdings', 'INSERT')
  then
    status := 'ok';   detail := 'the API can reach every table it writes';
  else
    status := 'FAIL';
    detail := 'service_role is missing grants — /api/wex will 500 with '
              || '"permission denied". Re-run schema.sql section 5.';
  end if;
  return next;

  step := '2c · anon grants';
  if has_table_privilege('anon', 'companies', 'SELECT')
     and has_table_privilege('anon', 'price_ticks', 'SELECT')
     and not has_table_privilege('anon', 'players', 'SELECT')
  then
    status := 'ok';   detail := 'anon reads the market, cannot touch players';
  else
    status := 'FAIL';
    detail := 'anon grants wrong — the wall board will not render, '
              || 'or worse, codes are readable';
  end if;
  return next;

  -- Set up a known market ---------------------------------------------------
  update market_state set is_open = true where id = 1;
  update companies set price = 100000, liquidity = 800 where id = v_company;

  insert into players (code, display_name, cash, starting_cash, is_claimed, claimed_at)
  values ('smoke-test-worm', 'Smoke Test Worm', 5000000, 5000000, true, now())
  returning id into v_player;

  -- 3 · Buy 24 shares: 100,000 -> 103,000, filled at the 101,500 midpoint ----
  -- Deliberately passes the code as 'SMOKE TEST WORM' so this also proves
  -- normalisation (stored hyphenated, typed uppercase with spaces).
  v_r := execute_trade('SMOKE TEST WORM', v_company, 'buy', 24);

  step := '3 · buy math';
  if (v_r->>'ok')::boolean
     and (v_r->>'price_after')::numeric = 103000
     and (v_r->>'exec_price')::numeric  = 101500
     and (v_r->>'total')::numeric       = 2436000
  then
    status := 'ok';
    detail := 'buy 24 @ L=800: 100k -> 103k, filled 101.5k, cost 2.436M';
  else
    status := 'FAIL'; detail := v_r::text;
  end if;
  return next;

  step := '4 · code normalisation';
  if (v_r->>'ok')::boolean then
    status := 'ok';   detail := '"SMOKE TEST WORM" matched smoke-test-worm';
  else
    status := 'FAIL'; detail := coalesce(v_r->>'error', v_r::text);
  end if;
  return next;

  -- 5 · Round trip must lose exactly the spread ------------------------------
  -- Buying then immediately selling the same quantity returns slightly less
  -- than you paid, because (1+x)(1-x) < 1. That is the exchange's natural
  -- friction, and it is deterministic given a fixed price and liquidity:
  --
  --   buy  cost = q·p·(1 + x/2)       = 24 × 100,000 × 1.015  = 2,436,000
  --   sell got  = q·p·(1+x)·(1 - x/2) = 24 × 103,000 × 0.985  = 2,434,920
  --   loss      = q·p·x²/2            where x = q/L = 0.03    =     1,080
  --
  -- Asserting the exact figure rather than a range: if the pricing formula
  -- ever changes, this says by how much.
  v_r := execute_trade('smoke-test-worm', v_company, 'sell', 24);
  select cash into v_cash from players where id = v_player;

  step := '5 · round-trip spread';
  if (v_r->>'ok')::boolean and (5000000 - v_cash) = 1080 then
    status := 'ok';
    detail := '5.000M -> ' || v_cash || ' · spread cost 1,080 ⌀ (0.044%), as derived';
  else
    status := 'FAIL';
    detail := 'spread was ' || (5000000 - v_cash) || ', expected exactly 1080 · ' || v_r::text;
  end if;
  return next;

  -- 6 · max_impact caps one trade at 25% of liquidity (200) ------------------
  v_r := execute_trade('smoke-test-worm', v_company, 'buy', 201);
  step := '6 · guard · oversized trade';
  if not (v_r->>'ok')::boolean then
    status := 'ok';   detail := v_r->>'error';
  else
    status := 'FAIL'; detail := '201 shares slipped past max_impact';
  end if;
  return next;

  -- 7 · No shorting in v0 ----------------------------------------------------
  v_r := execute_trade('smoke-test-worm', v_company, 'sell', 5);
  step := '7 · guard · naked sell';
  if not (v_r->>'ok')::boolean then
    status := 'ok';   detail := v_r->>'error';
  else
    status := 'FAIL'; detail := 'sold shares that were not held — shorting leaked in';
  end if;
  return next;

  -- 8 · Insufficient funds ---------------------------------------------------
  update players set cash = 10 where id = v_player;
  v_r := execute_trade('smoke-test-worm', v_company, 'buy', 1);
  step := '8 · guard · broke worm';
  if not (v_r->>'ok')::boolean then
    status := 'ok';   detail := v_r->>'error';
  else
    status := 'FAIL'; detail := 'bought a share with 10 WORMCOIN';
  end if;
  return next;

  -- 9 · Unknown code ---------------------------------------------------------
  v_r := execute_trade('not-a-real-code', v_company, 'buy', 1);
  step := '9 · guard · unknown code';
  if not (v_r->>'ok')::boolean then
    status := 'ok';   detail := v_r->>'error';
  else
    status := 'FAIL'; detail := 'an unknown code traded successfully';
  end if;
  return next;

  -- 10 · Closed market -------------------------------------------------------
  update market_state set is_open = false where id = 1;
  update players set cash = 5000000 where id = v_player;
  v_r := execute_trade('smoke-test-worm', v_company, 'buy', 1);
  step := '10 · guard · closed market';
  if not (v_r->>'ok')::boolean then
    status := 'ok';   detail := v_r->>'error';
  else
    status := 'FAIL'; detail := 'traded while the exchange was closed';
  end if;
  return next;

  -- 11 · Views resolve and never expose a code -------------------------------
  perform 1 from leaderboard limit 1;
  perform 1 from trade_tape  limit 1;

  step := '11 · views';
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name in ('leaderboard', 'trade_tape')
       and column_name = 'code'
  ) then
    status := 'FAIL'; detail := 'a view exposes `code` — anon could read credentials';
  else
    status := 'ok';   detail := 'leaderboard and trade_tape query cleanly, no code column';
  end if;
  return next;

  -- Put everything back ------------------------------------------------------
  delete from trades      where id > v_trade_mark;
  delete from price_ticks where id > v_tick_mark;
  delete from holdings    where player_id = v_player;
  delete from players     where id = v_player;
  update companies    set price = v_old_price, liquidity = v_old_liq where id = v_company;
  update market_state set is_open = v_was_open where id = 1;

  step := '12 · cleanup'; status := 'ok';
  detail := 'test player removed, price and market state restored';
  return next;
  return;

exception when others then
  -- Never leave a test player or a closed market behind on failure.
  begin
    delete from trades      where id > v_trade_mark;
    delete from price_ticks where id > v_tick_mark;
    delete from holdings    where player_id = v_player;
    delete from players     where id = v_player;
    update companies    set price = v_old_price, liquidity = v_old_liq where id = v_company;
    update market_state set is_open = v_was_open where id = 1;
  exception when others then
    null;
  end;
  step := '!! · aborted'; status := 'FAIL'; detail := sqlerrm;
  return next;
  return;
end;
$$;

select * from wex_smoke_test();
