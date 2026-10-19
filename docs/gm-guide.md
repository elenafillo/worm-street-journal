# The GM panel (`#gm`)

One password (`GM_PASSWORD`) opens two desks. The panel was built for a laptop
and hasn't been tested as a phone screen.

## WSJ · The Newsroom

- **Breaking News:** fire a banner across the newspaper screens, or clear them
  all. A banner expires by itself after `BREAKING_DURATION_MS` (5 min), and the
  panel shows a countdown.
- **All Articles:** every story, hidden ones included. Per story you can
  hide/show, delete, and toggle *can be headline*. Tags show **HIDDEN**,
  **HELD**, **PRESS RELEASE · TICKER**, and "filed by *trading name*". For a held
  story, Show reads *Publish, no move*.

## WEX · The Exchange

### Exchange tab

| Section | What it does |
|---|---|
| **The Bell** | Open or close the exchange. Halt or resume all trading. Each ring is also marked on the charts |
| **Held Stories** | Stories waiting for you. *Load into event* (it rides along with the next fire), *Publish (no move)*, or *Spike* |
| **Fire an Event** | A headline plus either *every listed company moves by X%* or one to four companies, each with its own %. *Also broadcast on the WSJ ticker* is on by default. With a story loaded the button reads *Fire and publish*; *✕ detach* drops the story |
| **The Weather** | Drift on/off, interval, mean and spread, or one of five presets. See [market-design.md](market-design.md#drift-the-weather) |
| **Mark the Timeline** | A vertical line on the charts with no price effect ("the band starts") |
| **The Board** | Per company: halt and set the price by hand |
| **Recent Events & Markers** | Removing one takes it off the timeline. **It does not undo the price move** |
| **Start Again** | *Reset market* (money, positions, prices back to start; players stay logged in) or *Reset all* (also unclaims every account). Neither touches codes or fortunes, so printed cards stay valid |

### Companies tab

Edit ticker, name, `ceo_name` (shown publicly as "Led by …"), blurb, starting
price, liquidity, listed, and a colour from the seven swatches. **CEO player**
links a guest as the company's CEO, which lets them file press releases. Each
player can be CEO of only one company. The CEO's trading name is never copied
into `ceo_name`.

### Players tab

Every code, name, cash, net worth and % return. From here: *+ Add player* (for
late arrivals), *Copy roster CSV* (to reprint cards), regenerate a code, set cash,
unclaim, delete.

## Habits worth having

- **Ring the closing bell at the end of every night.** pg_cron keeps drifting
  prices while the market is open, even with every screen shut.
- Watch **INVESTED %** on `#wex` to judge when to fire an event. When everyone
  is fully invested, a crash bites. When everyone is in cash, it barely
  registers.
- A late-night market-wide drop is the one moment when good timing beats a big
  starting fortune.
