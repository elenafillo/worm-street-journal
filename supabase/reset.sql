-- ============================================================================
-- WEX — reset between runs
-- ============================================================================
-- The functions themselves live in schema.sql (section 6). This file is just
-- the two invocations, so you can keep it open in a SQL Editor tab and hit Run
-- between a solo test, a beta, and the real thing.
--
-- Neither one touches the roster: codes and starting fortunes survive, so any
-- cards you have printed stay valid.
-- ============================================================================


-- Between rounds with the SAME people ----------------------------------------
-- Money, positions and prices back to the start. Players keep their names and
-- stay logged in on their phones.

select wex_reset_market();


-- Before a NEW group plays ---------------------------------------------------
-- Everything above, plus every account is unclaimed — names cleared, codes
-- freed, anyone holding a phone is logged out and must enter their words again.
-- Uncomment to use:

-- select wex_reset_all();


-- Check the state afterwards -------------------------------------------------
-- Uncomment to confirm you are back to a blank slate:

-- select
--   (select count(*) from players)                    as players,
--   (select count(*) from players where is_claimed)   as claimed,
--   (select count(*) from trades)                     as trades,
--   (select count(*) from holdings)                   as holdings,
--   (select count(*) from companies
--      where price <> open_price)                     as prices_off_baseline,
--   (select is_open from market_state where id = 1)   as market_open;
