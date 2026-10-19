-- ============================================================================
-- WSJ — sustainable news fetching
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Idempotent: safe to re-run while iterating.
--
-- WHY THIS FILE EXISTS
--   The newspaper screens used to download EVERY visible article, full bodies
--   and all, every four seconds. That cost grows with each story filed: fine
--   at 20 stories, the biggest egress in the project at 200, and silently
--   capped at 1000 by PostgREST after that.
--
--   Now a screen polls `articles_version` — one row, two numbers — and fetches
--   rows only when it changes, and then only the rows that changed. See
--   src/lib/useArticles.js for the client half.
--
-- WHAT THIS ADDS
--   * articles.updated_at, stamped by a trigger on every insert and update.
--     A cursor on created_at would not do: publishing a held story is an
--     UPDATE (hidden -> false) on a row that may be hours old.
--   * articles_version — how many stories a reader can see, and when the
--     newest of them last changed. A security INVOKER view, so it runs under
--     the reader's own RLS: it counts only rows anon may already see, and says
--     nothing about held or hidden stories. (Unlike leaderboard / trade_tape,
--     this one does not need to see past RLS.)
--
--   Hiding or deleting a story changes neither the others' updated_at nor, on
--   its own, the newest timestamp — but it does change `visible`, which is how
--   a screen knows to drop it.
--
-- Once this has run and been verified, fold it into schema.sql so a rebuild
-- from scratch is still one file. (Already folded; this file is the migration.)
-- ============================================================================

begin;

-- Existing rows all get the moment this runs, which is fine: a screen's first
-- load is a full one anyway.
alter table articles add column if not exists updated_at timestamptz not null default now();

create index if not exists articles_updated_at_idx on articles (updated_at);

-- Set on the server, whatever the writer sent. `now()` is the transaction's
-- start, so a slow transaction can commit a timestamp older than one a screen
-- has already seen. The client looks back 30 seconds past its cursor to cover
-- that, and merges by id so the overlap costs nothing but a few bytes.
create or replace function articles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists articles_touch on articles;
create trigger articles_touch
  before insert or update on articles
  for each row execute function articles_touch();

create or replace view articles_version
  with (security_invoker = true) as
  select count(*)        as visible,
         max(updated_at) as changed_at
    from articles
   where hidden = false;

-- Supabase's default privileges hand new views to anon with every grant;
-- a count needs only select.
revoke all on articles_version from anon, authenticated;
grant select on articles_version to anon, service_role;

commit;

-- PostgREST caches the schema; make it see the new view now.
notify pgrst, 'reload schema';

-- Verify: one row, `visible` equal to the stories on the broadsheet.
--   select * from articles_version;
