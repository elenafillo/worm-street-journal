# Party runbook

## Weeks before

- [ ] Run any new migration listed in [database.md](database.md).
- [ ] Set `PARTY_THURSDAY` in [src/lib/config.js](../src/lib/config.js) and deploy. The submit form's THU–SUN buttons are worked out from it.
- [ ] Name the seven companies (GM → Companies): ticker, name, CEO name, blurb, colour. Link each CEO player.
- [ ] Build the roster if the guest list has changed (see *Re-rostering* below). Print the code cards and decide who gets which fortune.
- [ ] Make a QR code for the site, so guests can reach `#trade`.
- [ ] Do a dry run: two browsers, the GM panel, and `#wex` on a third screen. Then reset. See [testing.md](testing.md).

## On the day

- [ ] `select * from wex_smoke_test();` during setup, before any guest trades. Every row should say `ok`.
- [ ] `select wex_reset_market();` to clear the dry run.
- [ ] Projector: `#broadsheet` and `#wex` side by side. Zoom until they fit, then read both from across the room. Optionally `#ticker` on a second screen.
- [ ] GM panel open on the laptop. Weather set (or left off).
- [ ] **Open the exchange** (GM → The Bell).

## During

- Load held stories into events, so each story and its price move land together.
- Watch INVESTED % on `#wex` to choose when to fire an event.
- Late arrival: GM → Players → *+ Add player*.
- Lost or pranked code: GM → Players → regenerate.

## End of each night

- [ ] **Close the exchange.** If it stays open with the weather on, drift keeps
  running all night.

## Between groups

| Call | Effect |
|---|---|
| `select wex_reset_market();` | Money, positions, prices, events and ticks back to the start. The exchange closes. Players keep their names and stay logged in |
| `select wex_reset_all();` | All of the above, plus every account is unclaimed and every phone logged out |

Neither one touches codes or fortunes. Both are in [reset.sql](../supabase/reset.sql).
Note that a reset erases the final standings, so record the winner first.

## Re-rostering (new guest list)

1. Generate the new roster and review it:
   ```
   node scripts/generate-players.mjs --count 70 --floor 1500000 --ceiling 7500000 --alpha 1.43
   ```
   This writes `supabase/players.seed.sql` (git-ignored). Edit it by hand if you want.
2. `select wex_reset_market();` to clear trades and holdings.
3. Remove the old players: `delete from players;`. This **also clears every
   company's CEO link** (`ceo_player_id` is set to null), and old stories lose
   their link to a player but keep the trading name they were filed under.
4. Paste and run `players.seed.sql`.
5. Re-link the CEOs (GM → Companies), then GM → Players → *Copy roster CSV* to
   print the cards.
6. Check: the Players tab shows the new count, nobody is claimed, and every
   price is at its open.
