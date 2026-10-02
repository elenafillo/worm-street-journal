# TODO

The one backlog. Per-party chores are in
[docs/party-runbook.md](docs/party-runbook.md).

## Before the party

- [ ] Name the seven companies (currently ANL, MLC, CST, BUR, SLM, CMP, SEG at 100,000 ⌀) and link the CEOs.
- [ ] Check `PARTY_THURSDAY` (currently `2026-11-26`).
- [ ] New roster for 70 guests (see the runbook), then print the cards.
- [ ] QR code / domain for guests.
- [ ] Dry run, and tune `liquidity`.
- [ ] Tune random ticker mode on the real wall.

## Should do

- [ ] Fold `dashboard.sql`, `drift.sql` and `ntfy.sql` into `schema.sql`.
- [ ] **End-of-party results export:** save the final standings before a reset erases them.
- [ ] Add an `also_starting` checkbox to set-cash in the Players tab (the API already supports it).
- [ ] Test the GM panel on a phone.
- [ ] Remove "PRICE: 1 WORMCOIN" from both newspaper mastheads in [App.jsx](src/App.jsx).
- [ ] Fix the 5 `set-state-in-effect` lint errors in `App.jsx`.
- [ ] `#ticker` quotes: % change over 2 h, 15 min and since open, from the `price_ticks` already loaded.
- [ ] Events channel for ntfy (part 2): entertainment pieces with a 30-minute reminder.
- [ ] `.env.example` lists only `VITE_GM_PASSWORD`, which nothing reads. Replace it with the three server vars.

## Nice to have

- [ ] `#board`: seven enormous price rows with sparklines, for a second screen.
- [ ] Print button on the broadsheet, plus an "Extra, extra" spinning-newspaper effect from the GM panel (needs e.g. `html-to-image`).
- [ ] An accent colour for each box type (article / notice / event).
- [ ] "PRESS RELEASE" kicker on the broadsheet.
- [ ] Tag a story with a ticker.
- [ ] Image moderation before a story shows.
- [ ] Sound when a BREAKING banner fires.
- [ ] Short selling (no migration needed).
- [ ] Event deck: one-tap preset events (see [archive/WEX_plan.md §5](docs/archive/WEX_plan.md)).

## Notifications
- [ ] Add channels, notifications to each
- [ ] Add notification only on verification option
- [ ] Test managed channels with pro nfty