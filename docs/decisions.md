# Decisions

The full reasoning for most of these is in [archive/WEX_plan.md](archive/WEX_plan.md).

| Decision | Why |
|---|---|
| All money logic in SQL, writes only through `api/` | The anon key is public. A trustworthy scoreboard is the whole game |
| Three-word codes printed on cards, claimed with a name | Lets you hand specific fortunes to specific people. Codes are bearer tokens: fine for a party, as long as `players` is never readable |
| Unequal fortunes, drawn from a Pareto distribution | The inequality is the joke. The ratio matters, not the floor |
| Two leaderboards: net worth and % return | Absolute wealth is the satire. % return keeps a poor player in the game |
| Buy and sell only, no shorting | `holdings.shares` is signed and `trades.side` is free text, so shorting needs no migration later |
| Market-driven prices, plus GM events, plus drift | Buying alone only pushes prices up and freezes the ranking. Events and drift bring back the reason to sell |
| Drift driven by a pg_cron heartbeat and a time-gated function | The GM controls it entirely from the panel, and the schedule never changes |
| Story and price move in one transaction | Nobody can read the news and trade on it before the price moves |
| Filer names in their own locked table | A column on `articles` would let anyone unmask a byline |
| Press release is an `article` with `press_company_id`, not a new type | A new type would drop out of the feed and broadsheet filters |
| Polling, not realtime | Simple and good enough. The API/PostgREST split keeps Vercel invocations low |
| `#wex` dashboard and `#board` are separate screens | They are read from different distances. Merged, everything gets smaller |
| `#wex` on a light paper sheet | Beside the WSJ it reads as the market page of the same paper |
| Colour stored per company | Reordering the companies must not repaint anyone's lines |
| % since open is the default y-axis, with a toggle, never two axes | A dual axis suggests a correlation that isn't in the data |
| Hand-written SVG/canvas charts | The dataset is small and the look is bespoke. A library would add more than it saves |
| Every figure in k/M | `24600000` is unreadable on a projector |
| Exchange tunables in the database, not in config | Tune at the party, without a deploy |
| Random ticker mode shows no leaderboards | Market data only. No player names pop up |

## Deliberately not built

- **A rollup table or server-side price series.** Fetching ticks incrementally
  keeps the payload flat however long the party runs. If a rollup is ever built,
  it must be in addition to `price_ticks`: raw ticks are the ledger.
- **Brush-to-zoom.** The three window buttons cover the real need.
- **Per-player volume on the wall.** It would change how people play.
- **Net-worth snapshots.** History is rebuilt from `trades` + `price_ticks`.
