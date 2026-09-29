-- ============================================================================
-- WEX — Worm Stock Exchange · schema
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- It is idempotent: safe to re-run while iterating.
--
-- SECURITY MODEL (read this before changing anything)
--   * The anon key is public — it ships inside the JS bundle. Anything anon
--     can write, a guest can write from devtools.
--   * So: anon gets SELECT on the public market tables and NOTHING on
--     players / holdings / trades. Those three have RLS enabled and ZERO
--     policies, which denies everything. That is the correct final state,
--     not an omission.
--   * The service-role key (server-side only, in Vercel env vars) bypasses
--     RLS entirely — that is how api/wex.js and api/wexgm.js reach them.
--   * `leaderboard` and `trade_tape` are DELIBERATELY security-definer views.
--     That is what lets the wall display show names and net worth while anon
--     still cannot read the players table. Supabase's linter flags this as
--     `security_definer_view` — expected. Do not "fix" it by adding
--     security_invoker; the views would return empty forever.
-- ============================================================================


-- ============================================================================
-- 1. Tables
-- ============================================================================

-- Players --------------------------------------------------------------------
-- `code` is the only credential in the system: a three-word phrase, stored
-- hyphenated ('damp-tunnel-wriggler'). `code_norm` is the same thing stripped
-- to letters and digits so login tolerates any punctuation or casing the guest
-- types, and so two codes can never collide after normalisation.
create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  code_norm     text generated always as
                  (lower(regexp_replace(code, '[^a-zA-Z0-9]', '', 'g'))) stored,
  display_name  text,                            -- null until claimed
  cash          numeric(16,2) not null,
  starting_cash numeric(16,2) not null,          -- per-player: drives % return AND reset
  is_claimed    boolean not null default false,
  is_gm         boolean not null default false,  -- excluded from the leaderboards
  claimed_at    timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists players_code_norm_key on players (code_norm);

-- Companies ------------------------------------------------------------------
-- `liquidity` is denominated in SHARES, not currency, so it does not scale
-- with the (absurd) share prices. It is the main tuning dial: lower = a given
-- trade moves the price more.
create table if not exists companies (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null unique,
  name          text not null,
  ceo_name      text,                                -- the party attendee
  ceo_player_id uuid references players(id) on delete set null,  -- hook for CEO powers later
  blurb         text,
  price         numeric(16,2) not null,
  open_price    numeric(16,2) not null,              -- baseline for % change
  liquidity     numeric(12,2) not null default 800 check (liquidity > 0),
  is_listed     boolean not null default true,
  is_halted     boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Holdings -------------------------------------------------------------------
-- `shares` is signed so short selling needs no migration later. v0 refuses to
-- go negative (see execute_trade); lifting that check is the whole feature.
create table if not exists holdings (
  player_id  uuid not null references players(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  shares     integer not null default 0,
  primary key (player_id, company_id)
);

-- Ledgers --------------------------------------------------------------------
create table if not exists trades (
  id           bigserial primary key,
  player_id    uuid references players(id) on delete set null,
  company_id   uuid references companies(id) on delete set null,
  side         text not null check (side in ('buy', 'sell')),  -- 'short' later
  shares       integer not null check (shares > 0),
  exec_price   numeric(16,2) not null,
  total        numeric(16,2) not null,
  price_before numeric(16,2),
  price_after  numeric(16,2),
  created_at   timestamptz not null default now()
);

create index if not exists trades_created_at_idx on trades (created_at desc);

create table if not exists price_ticks (
  id         bigserial primary key,
  company_id uuid not null references companies(id) on delete cascade,
  price      numeric(16,2) not null,
  reason     text,                                  -- open | trade | gm_event | gm_set | reset
  created_at timestamptz not null default now()
);

create index if not exists price_ticks_company_time_idx
  on price_ticks (company_id, created_at);

create table if not exists market_events (
  id         bigserial primary key,
  company_id uuid references companies(id) on delete set null,  -- null = market-wide
  headline   text not null,
  pct_change numeric not null,
  created_at timestamptz not null default now()
);

-- Market state ---------------------------------------------------------------
-- Singleton. These are the dials you turn AT the party, without a deploy.
create table if not exists market_state (
  id         integer primary key default 1 check (id = 1),
  is_open    boolean not null default false,
  min_price  numeric(16,2) not null default 1000,   -- price floor; stops a crash hitting zero
  max_impact numeric not null default 0.25,         -- max fraction of liquidity per single trade
  opened_at  timestamptz,
  closed_at  timestamptz,
  updated_at timestamptz not null default now()
);

insert into market_state (id) values (1) on conflict (id) do nothing;


-- ============================================================================
-- 2. Row Level Security
-- ============================================================================
-- NOTE: tables created via the SQL editor have RLS OFF by default (unlike the
-- Table Editor UI, which turns it on for you). Every table must be listed here.

alter table players       enable row level security;
alter table holdings      enable row level security;
alter table trades        enable row level security;
alter table companies     enable row level security;
alter table price_ticks   enable row level security;
alter table market_events enable row level security;
alter table market_state  enable row level security;

-- players / holdings / trades: RLS on, no policies => anon gets nothing.
-- Deliberate. Do not add a policy here.

-- Public market data: anon may read, never write.
drop policy if exists "anon reads companies" on companies;
create policy "anon reads companies" on companies
  for select to anon using (true);

drop policy if exists "anon reads price_ticks" on price_ticks;
create policy "anon reads price_ticks" on price_ticks
  for select to anon using (true);

drop policy if exists "anon reads market_events" on market_events;
create policy "anon reads market_events" on market_events
  for select to anon using (true);

drop policy if exists "anon reads market_state" on market_state;
create policy "anon reads market_state" on market_state
  for select to anon using (true);


-- ============================================================================
-- 3. Views for the wall display
-- ============================================================================
-- These read `players`, which anon cannot touch. They run as owner
-- (security definer, the default) so the board can render names and figures
-- without ever exposing a code. See the header note about the linter warning.

create or replace view leaderboard as
  select p.id,
         p.display_name,
         p.starting_cash,
         p.cash + coalesce(sum(h.shares * c.price), 0) as net_worth,
         -- nullif guards a 0 starting_cash: a null % return renders as "—"
         -- on the board, which beats the whole view erroring out mid-party.
         round(
           ((p.cash + coalesce(sum(h.shares * c.price), 0))
             / nullif(p.starting_cash, 0) - 1) * 100,
           1
         ) as pct_return
    from players p
    left join holdings  h on h.player_id = p.id
    left join companies c on c.id = h.company_id
   where p.is_claimed
     and not p.is_gm
   group by p.id;

create or replace view trade_tape as
  select t.id,
         p.display_name,
         c.ticker,
         t.side,
         t.shares,
         t.exec_price,
         t.created_at,
         -- Appended last (see supabase/ticker.sql) so `create or replace`
         -- still works on a database that has the older view.
         t.price_before,
         t.price_after
    from trades t
    join players   p on p.id = t.player_id
    join companies c on c.id = t.company_id
   order by t.created_at desc
   limit 30;


-- ============================================================================
-- 4. execute_trade — the whole trade in one transaction
-- ============================================================================
-- Why a function rather than a few PostgREST calls: a trade is a
-- read-check-write, and PostgREST cannot hold a transaction across HTTP
-- requests. Without this, two simultaneous buys both read the old cash and
-- price, and the second write clobbers the first — a guest double-tapping
-- "Buy" gets twice the shares for one payment. `for update` serialises them.
--
-- Price impact:  buy  p' = p * (1 + q/L)
--                sell p' = p * (1 - q/L), floored at min_price
--                fill at the midpoint (p + p')/2, so splitting a big order
--                into small ones costs the same — no salami-slicing exploit.
--
-- Returns JSON rather than raising, so the API layer can forward a friendly
-- in-world message instead of a Postgres error.

create or replace function execute_trade(
  p_code    text,
  p_company uuid,
  p_side    text,
  p_shares  integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player      players%rowtype;
  v_company     companies%rowtype;
  v_state       market_state%rowtype;
  v_norm        text;
  v_held        integer;
  v_price_after numeric(16,2);
  v_exec        numeric(16,2);
  v_total       numeric(16,2);
  v_max_shares  integer;
begin
  if p_side not in ('buy', 'sell') then
    return json_build_object('ok', false, 'error', 'That is not a kind of trade.');
  end if;

  if p_shares is null or p_shares <= 0 then
    return json_build_object('ok', false, 'error', 'Trade at least one share, worm.');
  end if;

  select * into v_state from market_state where id = 1;
  if not v_state.is_open then
    return json_build_object('ok', false, 'error', 'The exchange is closed.');
  end if;

  -- Lock the player first, then the company. Consistent ordering everywhere
  -- means concurrent trades queue instead of deadlocking.
  v_norm := lower(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));

  select * into v_player
    from players
   where code_norm = v_norm
   for update;

  if not found then
    return json_build_object('ok', false, 'error', 'Those are not your words, worm.');
  end if;

  if not v_player.is_claimed then
    return json_build_object('ok', false, 'error', 'Claim your account first.');
  end if;

  select * into v_company
    from companies
   where id = p_company
   for update;

  if not found or not v_company.is_listed then
    return json_build_object('ok', false, 'error', 'No such company trades here.');
  end if;

  if v_company.is_halted then
    return json_build_object('ok', false, 'error',
      v_company.name || ' is halted by order of the Worm Fed.');
  end if;

  -- One trade may not move the market more than max_impact.
  v_max_shares := floor(v_company.liquidity * v_state.max_impact);
  if p_shares > v_max_shares then
    return json_build_object('ok', false, 'error',
      'The floor will not absorb more than ' || v_max_shares || ' shares at once.');
  end if;

  select coalesce(shares, 0) into v_held
    from holdings
   where player_id = v_player.id and company_id = v_company.id;
  v_held := coalesce(v_held, 0);

  if p_side = 'buy' then
    v_price_after := round(v_company.price * (1 + p_shares::numeric / v_company.liquidity), 2);
  else
    v_price_after := greatest(
      v_state.min_price,
      round(v_company.price * (1 - p_shares::numeric / v_company.liquidity), 2)
    );
    -- v0 has no short selling: you cannot sell what you do not hold.
    if v_held < p_shares then
      return json_build_object('ok', false, 'error',
        'You hold only ' || v_held || ' of those.');
    end if;
  end if;

  v_exec  := round((v_company.price + v_price_after) / 2, 2);
  v_total := round(v_exec * p_shares, 2);

  if p_side = 'buy' and v_player.cash < v_total then
    return json_build_object('ok', false, 'error', 'Not enough WORMCOIN.');
  end if;

  -- Commit the trade -----------------------------------------------------
  update players
     set cash = cash + case when p_side = 'buy' then -v_total else v_total end
   where id = v_player.id;

  insert into holdings (player_id, company_id, shares)
  values (v_player.id, v_company.id,
          case when p_side = 'buy' then p_shares else -p_shares end)
  on conflict (player_id, company_id)
  do update set shares = holdings.shares + excluded.shares;

  update companies set price = v_price_after where id = v_company.id;

  insert into trades (player_id, company_id, side, shares,
                      exec_price, total, price_before, price_after)
  values (v_player.id, v_company.id, p_side, p_shares,
          v_exec, v_total, v_company.price, v_price_after);

  insert into price_ticks (company_id, price, reason)
  values (v_company.id, v_price_after, 'trade');

  return json_build_object(
    'ok', true,
    'ticker', v_company.ticker,
    'side', p_side,
    'shares', p_shares,
    'exec_price', v_exec,
    'total', v_total,
    'price_before', v_company.price,
    'price_after', v_price_after,
    'cash', (select cash from players where id = v_player.id),
    'shares_held', v_held + case when p_side = 'buy' then p_shares else -p_shares end
  );
end;
$$;

-- Only the server may call this. Guests reach it through /api/wex, which holds
-- the service-role key; anon must never invoke it directly.
-- The grant to service_role is NOT optional: revoking from public strips the
-- privilege service_role would otherwise inherit, and without it every
-- /api/wex trade call fails at PostgREST.
revoke all on function execute_trade(text, uuid, text, integer) from public, anon, authenticated;
grant execute on function execute_trade(text, uuid, text, integer) to service_role;


-- ============================================================================
-- 5. Grants
-- ============================================================================
-- Supabase's default privileges usually cover this, but that depends on the
-- age of the project and any prior tinkering. Stating it outright means the
-- security posture does not rely on inherited state.

-- Guests (anon): read the public market only, never the private tables.
revoke all on players, holdings, trades from anon;

grant select on companies, price_ticks, market_events, market_state to anon;
grant select on leaderboard, trade_tape to anon;

-- The API (service_role): full access to everything.
--
-- This block is NOT optional and NOT covered by RLS. service_role bypasses
-- row-level security, but table GRANTS still apply to it, and Supabase's
-- default privileges cannot be relied on — on this project they did not cover
-- these tables. Without it every /api/wex call fails with
-- `permission denied for table companies`, which looks like an API bug.
--
-- The sequence grant matters just as much: trades, price_ticks and
-- market_events are bigserial, and an insert that cannot touch the sequence
-- fails even when the table grant is present.
grant select, insert, update, delete on
  players, companies, holdings, trades, price_ticks, market_events, market_state
  to service_role;
grant select on leaderboard, trade_tape to service_role;
grant usage, select on all sequences in schema public to service_role;


-- ============================================================================
-- 6. Reset
-- ============================================================================
-- You will run the game more than once — a solo test, then a beta with a few
-- friends, then the party itself — and each run needs to start from nothing.
--
-- Two levels, because "start again" means two different things:
--
--   wex_reset_market()  Money, positions and prices back to the start.
--                       Players KEEP their names and stay logged in.
--                       Use between rounds with the same people.
--
--   wex_reset_all()     The above, plus every account is unclaimed: names
--                       cleared, codes freed. Anyone still holding a phone is
--                       logged out and must claim again.
--                       Use before a NEW group plays.
--
-- Neither touches the roster itself: codes and starting fortunes survive, so
-- printed cards stay valid. To change who is playing or how rich they are,
-- re-run scripts/generate-players.mjs and load a fresh players.seed.sql.
--
-- Both are callable from the SQL Editor and, later, from the GM panel by RPC.

create or replace function wex_reset_market()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_players integer;
begin
  delete from trades;
  delete from holdings;
  delete from market_events;
  delete from price_ticks;

  -- Prices return to their opening value, and each player to their OWN
  -- starting fortune — not a shared default. That is why starting_cash is a
  -- per-player column.
  update companies
     set price = open_price,
         is_halted = false;

  update players set cash = starting_cash;
  get diagnostics v_players = row_count;

  -- Re-seed the opening tick so sparklines have a baseline again.
  insert into price_ticks (company_id, price, reason)
  select id, open_price, 'reset' from companies;

  update market_state
     set is_open = false, opened_at = null, closed_at = null, updated_at = now()
   where id = 1;

  return json_build_object(
    'ok', true,
    'scope', 'market',
    'players_restored', v_players,
    'note', 'Positions and prices cleared. Players keep their names.'
  );
end;
$$;

create or replace function wex_reset_all()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_players integer;
begin
  perform wex_reset_market();

  update players
     set display_name = null,
         is_claimed   = false,
         claimed_at   = null;
  get diagnostics v_players = row_count;

  return json_build_object(
    'ok', true,
    'scope', 'all',
    'players_unclaimed', v_players,
    'note', 'Blank slate. Every code is free to be claimed again.'
  );
end;
$$;

revoke all on function wex_reset_market() from public, anon, authenticated;
revoke all on function wex_reset_all()    from public, anon, authenticated;
grant execute on function wex_reset_market() to service_role;
grant execute on function wex_reset_all()    to service_role;


-- ---------------------------------------------------------------------------
-- GM price control
-- ---------------------------------------------------------------------------
-- Firing an event at the whole economy touches seven companies, seven price
-- ticks and an event row. Doing that as separate PostgREST calls would leave
-- the board half-crashed if one failed, so it happens in one transaction.
--
-- p_company null = market-wide. That is the only difference between "DIRT
-- SCANDAL hits Annelid Corp" and "THE GREAT DROUGHT".

create or replace function wex_fire_event(
  p_company  uuid,        -- null = every listed company
  p_headline text,
  p_pct      numeric      -- -25 = crash by a quarter
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

  select min_price into v_min from market_state where id = 1;

  -- Floored at min_price so a big crash cannot take a stock to zero, which
  -- would make the impact maths degenerate and the company untradeable.
  update companies
     set price = greatest(v_min, round(price * (1 + p_pct / 100.0), 2))
   where is_listed
     and (p_company is null or id = p_company);
  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    return json_build_object('ok', false, 'error', 'No such company trades here.');
  end if;

  insert into price_ticks (company_id, price, reason)
  select id, price, 'gm_event'
    from companies
   where is_listed and (p_company is null or id = p_company);

  insert into market_events (company_id, headline, pct_change)
  values (p_company, btrim(p_headline), p_pct);

  return json_build_object(
    'ok', true, 'affected', v_affected,
    'headline', btrim(p_headline), 'pct_change', p_pct
  );
end;
$$;

-- Escape hatch: set a price outright. For when something has gone wrong, or
-- when the story demands a number the percentages will not reach.
create or replace function wex_set_price(p_company uuid, p_price numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min numeric;
begin
  if p_price is null or p_price <= 0 then
    return json_build_object('ok', false, 'error', 'A price must be above zero.');
  end if;

  select min_price into v_min from market_state where id = 1;

  update companies
     set price = greatest(v_min, round(p_price, 2))
   where id = p_company;

  if not found then
    return json_build_object('ok', false, 'error', 'No such company.');
  end if;

  insert into price_ticks (company_id, price, reason)
  select id, price, 'gm_set' from companies where id = p_company;

  return json_build_object('ok', true);
end;
$$;

revoke all on function wex_fire_event(uuid, text, numeric) from public, anon, authenticated;
revoke all on function wex_set_price(uuid, numeric)        from public, anon, authenticated;
grant execute on function wex_fire_event(uuid, text, numeric) to service_role;
grant execute on function wex_set_price(uuid, numeric)        to service_role;


-- ============================================================================
-- 7. Reference: the existing Worm Street Journal tables
-- ============================================================================
-- Reconstructed from src/App.jsx and api/*.js so this file documents the whole
-- database. These already exist on the live project, so the statements below
-- are a no-op there; they matter only when rebuilding from scratch.

create table if not exists articles (
  id               uuid primary key default gen_random_uuid(),
  author_name      text,
  headline         text,
  body             text,
  image_url        text,
  hidden           boolean default false,
  can_be_headline  boolean default true,
  article_type     text default 'article',   -- article | notice | entertainment
  scheduled_at     timestamptz,
  created_at       timestamptz default now()
);

create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  type       text,                            -- breaking_news | clear_breaking
  payload    jsonb,
  created_at timestamptz default now()
);
