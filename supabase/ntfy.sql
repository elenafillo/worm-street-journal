-- ============================================================================
-- WSJ — push notifications (ntfy), part 1: the main channel
-- ============================================================================
-- Paste this whole file into the Supabase SQL Editor and run it.
-- Idempotent: safe to re-run while iterating.
--
-- WHAT IT DOES
--   When a story goes live on the broadsheet, one push goes to the main ntfy
--   topic, and tapping it opens the broadsheet. If the story has a photo, the
--   push carries it as an attachment.
--
--   "Goes live" means the row ends up with hidden = false: it is inserted
--   visible, or it is updated from hidden to visible. A story can go live four
--   ways (/api/submit, wex_fire_event / wex_fire_moves, publish_held, the
--   newsroom show toggle). A trigger on the table catches all four. Held
--   stories and press releases notify only once they are actually out.
--
--   Each story pushes at most once. `notified_at` is stamped the first time, so
--   hiding a story and showing it again does not ping everyone a second time.
--
--   Not on this channel: entertainment pieces with a scheduled_at. Those are
--   events, and will go to the events topic with their 30-minute reminder.
--
-- HOW IT IS SENT
--   pg_net, which queues the HTTP request inside the transaction and sends it
--   after commit. A story that rolls back never pushes. A failed push never
--   blocks a story: errors are swallowed and logged as a warning.
--
-- SETUP — once, before running this file
--   1. Database → Extensions → enable pg_net.
--   2. Add two Vault secrets (Project Settings → Vault, or the SQL Editor):
--        select vault.create_secret('<the topic>',  'ntfy_topic');
--        select vault.create_secret('<the site url, no trailing slash>', 'site_url');
--      They live in Vault, not in this file, so the topic is never committed.
--      Without ntfy_topic the trigger does nothing.
--
-- Once this has run and been verified, fold it into schema.sql.
-- ============================================================================

create extension if not exists pg_net;

begin;

alter table articles add column if not exists notified_at timestamptz;

-- Stories already on the broadsheet count as sent. Held ones stay null, so
-- they push when the GM publishes them.
update articles set notified_at = coalesce(created_at, now())
 where hidden = false and notified_at is null;

-- security definer so it can read Vault; search_path pinned as everywhere else.
create or replace function articles_ntfy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text;
  v_site  text;
  v_title text;
  v_msg   text;
  v_tags  jsonb;
begin
  if new.hidden is distinct from false or new.notified_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.hidden = false then
    return new;
  end if;
  -- Scheduled events belong to the events topic, not this one.
  if new.article_type = 'entertainment' and new.scheduled_at is not null then
    return new;
  end if;

  select decrypted_secret into v_topic
    from vault.decrypted_secrets where name = 'ntfy_topic';
  if v_topic is null or v_topic = '' then
    return new;
  end if;
  select decrypted_secret into v_site
    from vault.decrypted_secrets where name = 'site_url';

  v_title := coalesce(nullif(trim(new.headline), ''), 'New in the Worm Street Journal');
  if new.press_company_id is not null then
    v_title := 'Press release: ' || v_title;
  end if;

  v_msg := nullif(trim(new.body), '');
  if v_msg is not null and length(v_msg) > 240 then
    v_msg := left(v_msg, 237) || '...';
  end if;
  v_msg := coalesce(v_msg, 'By ' || coalesce(nullif(trim(new.author_name), ''), 'our correspondent'));

  v_tags := case
    when new.press_company_id is not null   then '["loudspeaker"]'
    when new.article_type = 'notice'        then '["pushpin"]'
    when new.article_type = 'entertainment' then '["tada"]'
    else '["newspaper"]'
  end::jsonb;

  begin
    -- JSON publishing, not headers: headers cannot carry emoji or £ in a title.
    perform net.http_post(
      url  := 'https://ntfy.sh',
      body := jsonb_strip_nulls(jsonb_build_object(
        'topic',    v_topic,
        'title',    v_title,
        'message',  v_msg,
        'tags',     v_tags,
        'priority', case when new.article_type = 'notice' then 2 else 3 end,
        'click',    case when v_site is not null then v_site || '/#broadsheet' end,
        -- The story's photo, shown in the expanded notification. Uploads are
        -- public Storage URLs; anything that is not a plain https link is skipped.
        'attach',   case when new.image_url ~* '^https://' then new.image_url end
      )),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
    new.notified_at := now();
  exception when others then
    raise warning 'articles_ntfy: push failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- BEFORE, so it can stamp notified_at on the same row write.
drop trigger if exists articles_ntfy on articles;
create trigger articles_ntfy
  before insert or update of hidden on articles
  for each row execute function articles_ntfy();

-- Not callable by anyone: it is a trigger, and it reads Vault.
revoke all on function articles_ntfy() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Verify:
--   1. File a non-held story from #submit; a push should arrive within seconds.
--   2. If not, look at what pg_net got back:
--        select id, status_code, content, error_msg, created
--          from net._http_response order by created desc limit 5;
--   3. File a held story: nothing. Publish it from the GM panel: one push.
