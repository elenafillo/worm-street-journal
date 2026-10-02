# Market design

All price logic runs server-side, in SQL.

## The price engine

For `q` shares at price `p` with company liquidity `L` (in shares):

```
buy:   p_after = p * (1 + q/L)
sell:  p_after = max(min_price, p * (1 - q/L))
fill   = (p + p_after) / 2        -- midpoint
guard  = q <= L * max_impact
```

- A midpoint fill means splitting an order into smaller ones saves nothing.
- A buy followed by an equal sell loses a little (`(1+x)(1−x) < 1`). That's the
  spread; in the game it's "the exchange's cut in mulch".
- `execute_trade` does the read-check-write in one transaction with
  `select … for update`, so a double tap can't buy twice for one payment.
- `numeric(16,2)` throughout, so net worths can grow into the hundreds of
  millions.

| Dial | Value | Where |
|---|---|---|
| Opening price | 100,000 ⌀ | `companies.open_price` |
| `liquidity` | 800 shares, the main tuning dial | per company |
| `max_impact` | 0.25 (caps a trade at 200 shares) | `market_state` |
| `min_price` | floor | `market_state` |

Feel: a median player going all-in moves a stock ~3%, and six players together
move it ~20%.

## Fortunes

[scripts/generate-players.mjs](../scripts/generate-players.mjs) draws each
starting fortune from a Pareto distribution (`floor / U^(1/α)`), clamps it at
the ceiling, and rounds it to two significant figures. Lower `--alpha` means a
more unequal room. The script prints a summary line ("the top 3 worms hold N% of
all WORMCOIN") and writes `supabase/players.seed.sql`.

The ratio matters more than the floor. A floor of 1.5M still lets the poorest
player buy ~15 shares. If the game feels lumpy, raise every fortune rather than
lowering share prices.

`starting_cash` is stored per player. It's the baseline for % return and the
amount a reset restores.

## Events

`fire_event` applies `price *= 1 + pct/100` (floored at `min_price`), either to
every listed company or to one to four companies with a separate % each (stored
in `market_events.moves`). It can carry a held story, which then publishes in
the same transaction.

Without events or drift, buying only ever pushes prices up, so once everyone is
invested the ranking freezes. Negative moves are what bring back the decision to
sell.

## Drift (the weather)

Every `drift_interval_seconds`, each listed company that isn't halted is
multiplied by `1 + d/100`, where `d` is drawn from a normal distribution with
the economy-wide mean and spread. A negative mean is what makes holding cash
worthwhile. **Off by default.**

- **The clock:** pg_cron runs `select wex_drift();` every minute. The function
  decides for itself: it does nothing unless drift is on, the market is open, and
  a full interval has passed. `/api/wexgm` `overview` and `/api/wex` `portfolio`
  also call it as a backup. It is not granted to anon and not called from
  `execute_trade`.
- **Catch-up** is capped at 5 intervals. Opening the market restarts the clock.
- **Limits are per hour**, because drift compounds:
  `|mean| × ticks/h ≤ 60` and `stddev × √(ticks/h) ≤ 60`, enforced in
  `api/wexgm.js`. There's also a hard ceiling of 1e12 on price in SQL.
- The guest-facing drift rule (`DRIFT_RULE` in [rules.js](../src/wex/rules.js))
  only shows while drift is on.

Presets, simulated over four hours from 100k:

| Preset | Interval | Mean | σ | Median | p10 → p90 |
|---|---|---|---|---|---|
| Gentle swell | 5 min | 0% | 1.5% | 99k | 87k → 114k |
| Choppy | 3 min | 0% | 4% | 94k | 59k → 145k |
| Slow bleed | 5 min | −1% | 2% | 61k | 51k → 73k |
| Bull run | 5 min | +1.5% | 2% | 202k | 170k → 240k |
| Storm | 2 min | 0% | 9% | 62k | 17k → 214k |

## Charts

Shared maths lives in [chartSeries.js](../src/wex/chartSeries.js).

- **Step lines**, never smoothed: prices change only at discrete moments.
- **Carry-in:** a company with no ticks in the window still gets a flat line at
  its last price.
- **Dead air is squeezed.** Any gap over 10 min with no ticks is drawn 3 min
  wide, as a shaded, labelled band. The charts stop at the closing bell
  ([bell.js](../src/wex/bell.js)).
- **Downsampling** keeps min, max and last per ~4 px, so spikes survive. The
  point count doesn't grow with history.
- Guest fortune charts are rebuilt from `trades` + `price_ticks`
  ([portfolioSeries.js](../src/wex/portfolioSeries.js)). No snapshot table.

## Colour

Seven company colours ([palette.js](../src/wex/palette.js)), stored in
`companies.color` so a company keeps its colour when the order changes. Aqua,
yellow and magenta are below 3:1 contrast on paper, and yellow and aqua are close
under tritanopia. Both are acceptable **only because** every line is labelled
with its ticker and the legend is always shown. Lines are 3 px. Green and red
mean up and down in the numbers only, never as a line colour. Seven is the
maximum: an eighth company gets no line.
