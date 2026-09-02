-- ============================================================================
-- WEX — price drift
-- ============================================================================
-- Paste into the Supabase SQL Editor and run. Idempotent.
--
-- WHAT IT IS
--   Every `drift_interval_seconds`, each listed company's price is multiplied
--   by (1 + d/100) where d is drawn from a normal distribution with an
--   economy-wide mean and standard deviation. All four dials — on/off,
--   interval, mean, spread — live in `market_state` and are set from the GM
--   panel, because you will want to turn the weather up at 10pm without a
--   deploy.
--
-- WHY IT EXISTS
--   Buy pressure alone only pushes prices up, so once everyone is invested the
--   ranking freezes and there is never a reason to sell. Drift puts noise back
--   in: positions gain and lose on their own, so holding is a decision rather
--   than the absence of one.
--
-- HOW IT IS DRIVEN
--   `pg_cron` fires it every minute (section 3 below). That is the real clock,
--   and it is free on Supabase — enable the extension under Database →
--   Extensions and this file schedules the rest.
--
--   The function is also IDEMPOTENT AND TIME-GATED: it works out how many
--   intervals have elapsed since `last_drift_at` and applies exactly that many,
--   so calling it twice in a second does nothing the second time. That is what
--   lets a one-minute heartbeat serve any `drift_interval_seconds` — four calls
--   in five return "not yet" after a single cheap SELECT — and it is why the
--   same function can safely be called from the two paths already polling
--   during a party, as belt and braces for the night cron stops:
--
--     /api/wexgm  "overview"   — the GM panel, open on your laptop all night
--     /api/wex    "portfolio"  — any guest phone with the trade screen open
--
--   Both hold the service-role key. The function is NOT granted to anon: it
--   writes prices, and the one rule of this project is that anon never gets a
--   write path, however well guarded.
--
--   Deliberately NOT called from execute_trade(). It would guarantee that every
--   trade prices against a perfectly current market, but execute_trade is the
--   one piece of concurrency-critical SQL in the project and drift would make
--   every trade contend on the market_state row. Not worth re-testing that for
--   a few seconds of freshness the heartbeat already provides.
--
-- ⚠ ONE THING TO REMEMBER AT THE END OF THE NIGHT
--   A real scheduler runs whether or not anyone is in the room. Drift used to
--   stop by itself when the last screen closed; it no longer does. Leave the
--   exchange OPEN overnight with the weather on and you will come back to
--   several hundred intervals of drift and an unrecognisable market.
--   `wex_drift()` checks `is_open`, so the fix is simply to ring the closing
--   bell — GM → Exchange → Close the exchange.
-- ============================================================================


-- ============================================================================
-- 1. The dials
-- ============================================================================
-- Off by default. Turning drift on mid-party should be a decision, not
-- something that starts happening because a migration ran.

alter table market_state add column if not exists drift_enabled boolean not null default false;
alter table market_state add column if not exists drift_interval_seconds integer not null default 300;
alter table market_state add column if not exists drift_mean numeric not null default 0;
alter table market_state add column if not exists drift_stddev numeric not null default 1.5;
alter table market_state add column if not exists last_drift_at timestamptz;

comment on column market_state.drift_mean is
  'Percent per interval. 0 is a directionless market; negative is a slow bleed that makes cash worth holding.';
comment on column market_state.drift_stddev is
  'Percent per interval. The weather dial. 1.5 is a gentle swell; 5 is a choppy sea; 15 is chaos.';


-- ============================================================================
-- 2. wex_drift()
-- ============================================================================
-- Returns JSON rather than raising, like every other function here, so the API
-- layer never has to catch a Postgres error to learn that nothing happened.

drop function if exists wex_drift();

create or replace function wex_drift(p_force boolean default false)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state    market_state%rowtype;
  v_now      timestamptz := now();
  v_elapsed  numeric;
  v_due      integer;
  v_company  record;
  v_price    numeric(16,2);
  v_pct      numeric;
  v_moved    integer := 0;
  -- A long closure, a laptop asleep, a GM panel shut for an hour: without a cap
  -- the first call afterwards would apply a dozen intervals at once and put a
  -- cliff on the chart that no one in the room caused.
  c_max_catchup constant integer := 5;
  -- Hard ceiling, belt and braces. api/wexgm.js already refuses settings that
  -- compound to more than ~60% an hour, but market_state is also editable by
  -- hand in the Supabase table editor, and these numbers compound: a 10% mean
  -- every ten seconds reaches 1e64 in an evening. numeric(16,2) tops out near
  -- 1e14, and an overflow here would not just break drift — every subsequent
  -- trade would fail on the same column. A trillion is absurd and safe.
  c_max_price constant numeric := 1e12;
begin
  -- Cheap unlocked read first. Almost every call lands here and returns having
  -- taken no lock at all — this runs on every GM poll and every phone poll, and
  -- locking market_state each time would funnel the whole exchange through one
  -- row for no reason.
  select * into v_state from market_state where id = 1;

  if not found or not v_state.drift_enabled or not v_state.is_open then
    return json_build_object('ok', true, 'applied', 0, 'note', 'not drifting');
  end if;

  -- First call after the bell: start the clock rather than drifting for
  -- however long the market happened to be shut.
  if v_state.last_drift_at is null then
    update market_state set last_drift_at = v_now where id = 1;
    return json_build_object('ok', true, 'applied', 0, 'note', 'clock started');
  end if;

  v_elapsed := extract(epoch from (v_now - v_state.last_drift_at));
  if not p_force and v_elapsed < greatest(1, v_state.drift_interval_seconds) then
    return json_build_object('ok', true, 'applied', 0, 'note', 'not yet');
  end if;

  -- Due. NOW take the lock and re-check, so two callers arriving together
  -- cannot both decide to drift.
  select * into v_state from market_state where id = 1 for update;

  if not v_state.drift_enabled or not v_state.is_open then
    return json_build_object('ok', true, 'applied', 0, 'note', 'not drifting');
  end if;

  v_due := floor(
    extract(epoch from (v_now - v_state.last_drift_at))
      / greatest(1, v_state.drift_interval_seconds)
  );
  if p_force then v_due := greatest(v_due, 1); end if;
  if v_due < 1 then
    return json_build_object('ok', true, 'applied', 0, 'note', 'already drifted');
  end if;
  v_due := least(v_due, c_max_catchup);

  -- Halted companies sit the weather out: a halt is the Worm Fed freezing that
  -- stock, and a price that moved anyway would make the halt look broken.
  for v_company in
    select id, price from companies
     where is_listed and not is_halted
     order by id
     for update
  loop
    v_price := v_company.price;

    for i in 1..v_due loop
      -- Box-Muller: one normal draw from two uniforms. greatest() keeps ln()
      -- off zero, which random() is entitled to return.
      v_pct := v_state.drift_mean
             + v_state.drift_stddev
               * sqrt(-2 * ln(greatest(random(), 1e-12)))
               * cos(2 * pi() * random());
      v_price := least(
        c_max_price,
        greatest(v_state.min_price, round(v_price * (1 + v_pct / 100.0), 2))
      );
    end loop;

    -- One tick per company however many intervals were caught up, and none at
    -- all if the price landed back where it started — the chart should not grow
    -- a row every five minutes for a company nobody is touching.
    if v_price <> v_company.price then
      update companies set price = v_price where id = v_company.id;
      insert into price_ticks (company_id, price, reason) values (v_company.id, v_price, 'drift');
      v_moved := v_moved + 1;
    end if;
  end loop;

  -- Stamped with now() rather than advanced by v_due intervals: after a capped
  -- catch-up the backlog is forgiven instead of being re-applied forever.
  update market_state set last_drift_at = v_now, updated_at = v_now where id = 1;

  return json_build_object(
    'ok', true, 'applied', v_due, 'companies_moved', v_moved,
    'mean', v_state.drift_mean, 'stddev', v_state.drift_stddev
  );
end;
$$;

-- Server only. anon must never hold a function that writes prices, however
-- well time-gated it is.
revoke all on function wex_drift(boolean) from public, anon, authenticated;
grant execute on function wex_drift(boolean) to service_role;


-- ============================================================================
-- 3. The heartbeat
-- ============================================================================
-- Every minute, unconditionally. The JOB is dumb on purpose — all the
-- conditions live in wex_drift() itself, which returns immediately unless
-- `drift_enabled` and `is_open` are both true and a full interval has elapsed.
-- So the weather switch in the GM panel governs everything, and the schedule
-- never needs touching.
--
-- Why every minute rather than every five: the interval is a GM dial that can
-- change mid-party. A heartbeat faster than the shortest interval anyone would
-- set means the schedule stays correct whatever they pick, at a cost of one
-- cheap SELECT per minute. (Note the corollary — an interval set BELOW 60s
-- would batch into a single catch-up. All five GM presets are 120s or slower.)
--
-- Wrapped in a guard so this file still runs on a project where pg_cron has not
-- been enabled: without it the whole script would fail at the last statement,
-- after having already done the useful work.
--
-- cron.schedule() upserts by job name, so re-running this file re-points the
-- existing job rather than stacking up duplicates.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('wex-drift', '* * * * *', 'select wex_drift();');
    raise notice 'wex-drift scheduled: every minute.';
  else
    raise notice 'pg_cron is not enabled — skipping the heartbeat. Drift will only advance when the GM panel or a guest phone polls. Enable it under Database → Extensions and re-run this file.';
  end if;
end;
$$;


-- ============================================================================
-- 4. Verify
-- ============================================================================
-- The heartbeat:
--   select jobid, jobname, schedule, command, active from cron.job;
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
--
-- To stop it (the GM weather switch is the normal off-switch; this is for
-- taking the schedule out entirely):
--   select cron.unschedule('wex-drift');
--
-- The function:
--   select * from market_state;                 -- the four new dials
--   select wex_drift();                         -- {"applied": 0, ...} while off
--   update market_state set drift_enabled = true, is_open = true where id = 1;
--   select wex_drift(true);                     -- force one tick
--   select ticker, price from companies order by sort_order;
--   select * from price_ticks where reason = 'drift' order by id desc limit 7;
--
-- Then turn it back off until you want it:
--   update market_state set drift_enabled = false where id = 1;
