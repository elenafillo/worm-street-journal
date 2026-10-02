# Testing

There is no test suite. Verification is a mix of node scripts against the pure
modules, headless Chrome screenshots, SQL smoke tests, and running through the
lists below by hand.

## What has been verified

- `npm run build` passes.
- `api/wex.js` 19/19 and `api/wexgm.js` 18/18, end to end over HTTP (at the time
  they were built).
- The chart maths (`chartSeries.js`), the drift limits over a simulated
  four-hour evening, and random mode's scheduler over a simulated two hours, all
  with plain node.
- `#ticker` and both its modes, screenshotted at 1920 and 390 wide.

## Not verified

- **Locally, any `/api/*` call that needs the service role.** The
  `SUPABASE_SERVICE_ROLE_KEY` in this machine's `.env.local` isn't a valid JWT.
  `add_marker`, `delete_event`, `set_drift` and `drift_now` have been read
  through but never run.
- Random-mode summons with a real GM event. That would have moved the live
  market.
- The held-stories checklist below.
- How it feels on the wall: projector legibility, scroll smoothness.

## Security

- [ ] With the anon key, `players`, `holdings`, `trades` and `article_filers` return nothing.
- [ ] `leaderboard`, `trade_tape`, `market_health` and `company_stats` return rows, and no column identifies a player.

## Trading

- [ ] Login normalises the code: `Damp Tunnel Wriggler` and `damp-tunnel-wriggler` both work. A wrong code gets a 403.
- [ ] With the market closed, a trade is refused.
- [ ] Buying 24 shares at `liquidity=800` raises the price by ~3%. The matching sell returns slightly less. Anything over 200 shares is refused.
- [ ] Two buys at the same moment for one player never take cash below zero, and the second trade's price builds on the first's.
- [ ] Big numbers format as `840 ⌀`, `104.1k ⌀`, `247.31M ⌀`, with no raw digit strings anywhere.
- [ ] Reset: prices back to open, holdings cleared, each player back to their **own** starting cash.
- [ ] `#trade` on a real phone: tap targets, code entry with autocorrect on, and polling stops when the screen locks.

## Dashboard and charts

- [ ] A company nobody traded for 20 min still draws a flat line at `?window=15m`.
- [ ] A reset with `#wex` open clears and redraws the chart. No cliff.
- [ ] A market-wide event draws one marker, and every line steps at it.
- [ ] Changing a company's `sort_order` keeps every colour.
- [ ] Ten minutes with devtools open: tick responses stay small, and there is no flash on refetch.
- [ ] The nav fits on one line at 320 px.

## Held stories and filing

- [ ] A plain article publishes immediately.
- [ ] A held article doesn't appear on any screen or in an anon read. It does appear under Held Stories, tagged HELD.
- [ ] Firing a held story with two companies moves both prices, writes one `market_events` row with `article_id`, and publishes the story at the same moment.
- [ ] Firing the same story again from another tab is refused, and nothing moves.
- [ ] Both *Publish, no move* and *Spike* clear the story from Held Stories.
- [ ] The newsroom shows the trading name. The printed byline is only what the guest typed.
- [ ] Logged out or with a stale code, the button is greyed out, and a hand-made request gets a 403.
- [ ] Only a linked CEO sees *Press release*. A non-CEO's hand-made request is refused.
- [ ] After `wex_reset_all`, old stories still show the trading name they were filed under.
- [ ] `schema.sql` (plus the unfolded migrations) runs cleanly from scratch.
