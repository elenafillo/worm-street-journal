-- ============================================================================
-- WEX — seed data
-- ============================================================================
-- Run AFTER schema.sql. Idempotent: re-running updates the placeholder rows
-- rather than duplicating them, and will NOT clobber prices once trading has
-- started (see the note on the upsert below).
--
-- These seven companies are placeholders. Edit them in the Supabase Table
-- Editor before the party: real names, tickers, and the CEO of each — the
-- party attendee fronting it. `ceo_name` is free text; `ceo_player_id` stays
-- null in v0 and only matters if CEO powers get built later.
-- ============================================================================

insert into companies (ticker, name, ceo_name, blurb, price, open_price, liquidity, sort_order)
values
  ('ANL', 'Annelid Corp',      'TBC', 'Vertically integrated soil aeration.',            100000, 100000, 800, 1),
  ('MLC', 'Mulch & Sons',      'TBC', 'Family mulch since the Great Damp.',              100000, 100000, 800, 2),
  ('CST', 'Castings Ltd',      'TBC', 'Premium castings for the discerning root.',       100000, 100000, 800, 3),
  ('BUR', 'Burrow Holdings',   'TBC', 'Real estate, subterranean.',                      100000, 100000, 800, 4),
  ('SLM', 'Slime Dynamics',    'TBC', 'Lubrication technologies for the modern worm.',   100000, 100000, 800, 5),
  ('CMP', 'Compost United',    'TBC', 'Turning waste into worth since the last rain.',   100000, 100000, 800, 6),
  ('SEG', 'Segment & Co.',     'TBC', 'Merchant bankers to the annelid classes.',        100000, 100000, 800, 7)
on conflict (ticker) do update set
  -- Deliberately does NOT touch `price`: re-running this mid-party would
  -- otherwise wipe out live trading. Use the GM reset action for that.
  name       = excluded.name,
  blurb      = excluded.blurb,
  sort_order = excluded.sort_order;

-- Opening tick for each company, so sparklines have a starting point.
-- Only inserted for companies that have no history yet.
insert into price_ticks (company_id, price, reason)
select c.id, c.open_price, 'open'
  from companies c
 where not exists (select 1 from price_ticks pt where pt.company_id = c.id);
