-- ============================================================================
-- WEX — held stories, CEO press releases, and who filed what
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Idempotent: safe to re-run while iterating. See docs/archive/HELD_STORIES_brief.md.
--
-- WHAT THIS ADDS
--   * articles.held — a story waiting for the GM. Always stored with
--     hidden = true as well, so every existing reader keeps skipping it with
--     no change.
--   * articles.press_company_id — set when the story is a CEO's press release.
--   * companies.ceo_player_id is now unique: one CEO runs one company, and
--     one company has one CEO.
--   * article_filers — the trading name of whoever was logged in to WEX when
--     a story was filed. Its own table, locked like `players`, because anon
--     reads every column of `articles` and the leaderboard exposes player
--     ids: a column on articles would let anyone unmask a byline.
--   * market_events.article_id — which story a move came from.
--   * wex_fire_event / wex_fire_moves take an optional p_article_id and
--     publish that held story in the same transaction as the move.
--   * The existing security on articles / events is written down here, and
--     anon's unneeded write grants on them (TRUNCATE included) are removed.
--
-- Once this has run and been verified, fold it into schema.sql so a rebuild
-- from scratch is still one file. (Already folded; this file is the migration.)
-- ============================================================================

-- One transaction: the fire functions are dropped and recreated below, and
-- the GM panel must never catch the moment in between.
begin;

-- ----------------------------------------------------------------------------
-- Columns
-- ----------------------------------------------------------------------------
alter table articles add column if not exists held boolean not null default false;
alter table articles add column if not exists press_company_id uuid
  references companies(id) on delete set null;

alter table market_events add column if not exists article_id uuid
  references articles(id) on delete set null;

-- A unique index, not a constraint, so NULLs (a company with no CEO player
-- linked yet) are allowed as many times as needed.
create unique index if not exists companies_ceo_player_id_key
  on companies (ceo_player_id);

-- ----------------------------------------------------------------------------
-- article_filers
-- ----------------------------------------------------------------------------
-- trading_name is copied at filing time rather than joined later:
-- wex_reset_all clears display names, and the GM should still know who filed
-- an old story.
create table if not exists article_filers (
  article_id   uuid primary key references articles(id) on delete cascade,
  player_id    uuid references players(id) on delete set null,
  trading_name text,
  created_at   timestamptz not null default now()
);

-- RLS on, no policies => anon gets nothing. Deliberate, as with players.
alter table article_filers enable row level security;
revoke all on article_filers from anon, authenticated;
grant select, insert, update, delete on article_filers to service_role;

-- ----------------------------------------------------------------------------
-- articles / events: the newsroom tables' security, written down
-- ----------------------------------------------------------------------------
-- These tables were set up in the dashboard. As found on 2026-09-30: RLS on,
-- one select policy each, and anon holding every table privilege. The
-- policies below are the ones that were already there, restated so a rebuild
-- gets them too. "read articles" is what keeps a held story secret: held rows
-- are hidden, and anon cannot see hidden rows at all.
--
-- The write grants were harmless (RLS has no write policy, so every anon
-- insert/update/delete is refused), except TRUNCATE, which RLS does not
-- govern. PostgREST offers no way to send one, but there is no reason for
-- anon to hold it. The GM panel and /api/submit use the service role.
alter table articles enable row level security;
alter table events   enable row level security;

drop policy if exists "read articles" on articles;
create policy "read articles" on articles
  for select to public using (hidden = false);

drop policy if exists "read events" on events;
create policy "read events" on events
  for select to public using (true);

revoke all on articles, events from anon, authenticated;
grant select on articles, events to anon;
grant select, insert, update, delete on articles, events to service_role;

-- ----------------------------------------------------------------------------
-- wex_fire_event — now optionally publishes a held story
-- ----------------------------------------------------------------------------
-- These functions return an error rather than raising one, so anything they
-- have already written stays written. Hence the order: check everything,
-- THEN claim the story, THEN move prices. A refused event never publishes.
--
-- Claiming is `update … where held`: a second fire of the same story (a
-- double tap, a second tab) waits on the row lock, then finds held = false
-- and is refused before anything moves.
-- The drop removes the old three-argument version (a new parameter makes a
-- new overload, not a replacement); `or replace` keeps a re-run working.
drop function if exists wex_fire_event(uuid, text, numeric);

create or replace function wex_fire_event(
  p_company    uuid,             -- null = every listed company
  p_headline   text,
  p_pct        numeric,          -- -25 = crash by a quarter
  p_article_id uuid default null -- a held story to publish with the move
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min      numeric;
  v_affected integer;
begin
  if p_headline is null or btrim(p_headline) = '' then
    return json_build_object('ok', false, 'error', 'An event needs a headline.');
  end if;
  if p_pct is null then
    return json_build_object('ok', false, 'error', 'An event needs a percentage.');
  end if;
  if not exists (select 1 from companies
                  where is_listed and (p_company is null or id = p_company)) then
    return json_build_object('ok', false, 'error', 'No such company trades here.');
  end if;

  if p_article_id is not null then
    update articles set held = false, hidden = false
     where id = p_article_id and held;
    if not found then
      return json_build_object('ok', false, 'error', 'That story has already been dealt with.');
    end if;
  end if;

  select min_price into v_min from market_state where id = 1;

  -- Floored at min_price so a big crash cannot take a stock to zero, which
  -- would make the impact maths degenerate and the company untradeable.
  update companies
     set price = greatest(v_min, round(price * (1 + p_pct / 100.0), 2))
   where is_listed
     and (p_company is null or id = p_company);
  get diagnostics v_affected = row_count;

  insert into price_ticks (company_id, price, reason)
  select id, price, 'gm_event'
    from companies
   where is_listed and (p_company is null or id = p_company);

  insert into market_events (company_id, headline, pct_change, article_id)
  values (p_company, btrim(p_headline), p_pct, p_article_id);

  return json_build_object(
    'ok', true, 'affected', v_affected,
    'headline', btrim(p_headline), 'pct_change', p_pct,
    'published', p_article_id is not null
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- wex_fire_moves — likewise
-- ----------------------------------------------------------------------------
drop function if exists wex_fire_moves(text, jsonb);

create or replace function wex_fire_moves(
  p_headline   text,
  p_moves      jsonb,
  p_article_id uuid default null
)
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

  if p_article_id is not null then
    update articles set held = false, hidden = false
     where id = p_article_id and held;
    if not found then
      return json_build_object('ok', false, 'error', 'That story has already been dealt with.');
    end if;
  end if;

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

  insert into market_events (company_id, headline, pct_change, moves, article_id)
  values (
    case when v_n = 1 then (p_moves -> 0 ->> 'company_id')::uuid end,
    btrim(p_headline),
    v_top,
    case when v_n > 1 then p_moves end,
    p_article_id
  );

  return json_build_object('ok', true, 'affected', v_n, 'headline', btrim(p_headline),
                           'published', p_article_id is not null);
end;
$$;

-- New signatures, so new grants. Revoking from public is what strips the
-- privilege service_role would otherwise inherit, so the grant is required.
revoke all on function wex_fire_event(uuid, text, numeric, uuid) from public, anon, authenticated;
revoke all on function wex_fire_moves(text, jsonb, uuid)         from public, anon, authenticated;
grant execute on function wex_fire_event(uuid, text, numeric, uuid) to service_role;
grant execute on function wex_fire_moves(text, jsonb, uuid)         to service_role;

commit;

-- PostgREST caches function signatures; make it see the new ones now.
notify pgrst, 'reload schema';
