-- ============================================================================
-- WEX — events that move several companies by different amounts
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Idempotent: safe to re-run while iterating.
--
-- WHY THIS FILE EXISTS
--   An event used to move ONE company, or every listed company, by one
--   percentage. Stories are rarely that tidy: "DROUGHT THREATENS SLIME-BASED
--   TECHNOLOGIES" should knock SLM hard and CMP a little, and leave the rest
--   alone. So an event can now carry a list of moves — up to four, which is
--   what fits on the wall screens.
--
--   Stored as a `moves` jsonb column on market_events, not a second table:
--   the wall reads events straight from PostgREST with the anon key, and one
--   column keeps that one request with no join. The column is NULL for every
--   event that moves one company or the whole market, so nothing written
--   before this changes meaning.
--
--     moves = [{"company_id": "<uuid>", "pct": -10}, {"company_id": "…", "pct": -4}]
--
--   For a multi-company event, company_id is NULL (it is not about one
--   company) and pct_change holds the biggest move, sign kept — so anything
--   that reads only pct_change still sees a real move, never 0, which is what
--   a MARKER is.
--
-- Once this has run and been verified, fold it into schema.sql so a rebuild
-- from scratch is still one file. (Already folded; this file is the migration.)
-- ============================================================================

alter table market_events add column if not exists moves jsonb;

-- ----------------------------------------------------------------------------
-- wex_fire_moves — one headline, one to four companies, a move each
-- ----------------------------------------------------------------------------
-- Everything is checked BEFORE anything moves, and it is one function, so one
-- transaction: a bad third row cannot leave the first two companies moved and
-- no headline written.
create or replace function wex_fire_moves(p_headline text, p_moves jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min  numeric;
  v_n    integer;
  v_move jsonb;
  v_id   uuid;
  v_pct  numeric;
  v_top  numeric := 0;
begin
  if p_headline is null or btrim(p_headline) = '' then
    return json_build_object('ok', false, 'error', 'An event needs a headline.');
  end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then
    return json_build_object('ok', false, 'error', 'An event needs at least one company.');
  end if;

  v_n := jsonb_array_length(p_moves);
  if v_n < 1 or v_n > 4 then
    return json_build_object('ok', false, 'error', 'Between one and four companies, please.');
  end if;
  if (select count(distinct m ->> 'company_id') from jsonb_array_elements(p_moves) m) <> v_n then
    return json_build_object('ok', false, 'error', 'Each company can only move once per event.');
  end if;

  for v_move in select * from jsonb_array_elements(p_moves) loop
    begin
      v_id  := (v_move ->> 'company_id')::uuid;
      v_pct := (v_move ->> 'pct')::numeric;
    exception when others then
      return json_build_object('ok', false, 'error', 'One of the moves is unreadable.');
    end;
    if v_pct is null or v_pct <= -100 then
      return json_build_object('ok', false, 'error', 'Every company needs a percentage above -100.');
    end if;
    if not exists (select 1 from companies where id = v_id and is_listed) then
      return json_build_object('ok', false, 'error', 'No such company trades here.');
    end if;
    if abs(v_pct) > abs(v_top) then v_top := v_pct; end if;
  end loop;

  select min_price into v_min from market_state where id = 1;

  for v_move in select * from jsonb_array_elements(p_moves) loop
    v_id  := (v_move ->> 'company_id')::uuid;
    v_pct := (v_move ->> 'pct')::numeric;
    -- Floored at min_price, exactly as wex_fire_event does.
    update companies
       set price = greatest(v_min, round(price * (1 + v_pct / 100.0), 2))
     where id = v_id;
    insert into price_ticks (company_id, price, reason)
    select id, price, 'gm_event' from companies where id = v_id;
  end loop;

  insert into market_events (company_id, headline, pct_change, moves)
  values (
    case when v_n = 1 then (p_moves -> 0 ->> 'company_id')::uuid end,
    btrim(p_headline),
    v_top,
    case when v_n > 1 then p_moves end
  );

  return json_build_object('ok', true, 'affected', v_n, 'headline', btrim(p_headline));
end;
$$;

revoke all on function wex_fire_moves(text, jsonb) from public, anon, authenticated;
grant execute on function wex_fire_moves(text, jsonb) to service_role;

-- Verify (then delete the test row from the GM panel's Recent Events):
--   select wex_fire_moves('TEST: DROUGHT', jsonb_build_array(
--     jsonb_build_object('company_id', (select id from companies order by sort_order limit 1), 'pct', -1),
--     jsonb_build_object('company_id', (select id from companies order by sort_order offset 1 limit 1), 'pct', 1)));
--   select headline, company_id, pct_change, moves from market_events order by id desc limit 1;
