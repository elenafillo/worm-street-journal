# Screens

URL parameters go inside the hash: `#wex?window=15m&only=ANL,MLC`.

## Wall

### `#broadsheet` — the newspaper (default route)

A fixed 1200×960 canvas. Fit it to the projector with browser zoom. At ≤768 px
it reflows into one scrolling column.

- Hero story, a row of three secondary stories, and a sidebar with **Notices**
  (latest 4) and **Entertainment** (next 6, each dropped 1 h after its time).
- Only `article`-type rows go in the main columns. Only stories with
  `can_be_headline` (GM toggle) can be the hero in random mode.
- Photos sit whole inside square slots.
- Breaking-news banners run across the top. Several can be live at once.

| Param | Values | Default |
|---|---|---|
| `mode` | `recent` (newest story is the hero) · `random` (hero rotates) | `recent` |
| `speed` | seconds per hero in random mode, min 5 | `15` |

### `#wex` — the market dashboard

A light paper sheet, made to sit beside the broadsheet as its market page.
Includes a price chart with event markers and the open/close bell, a legend,
"the state of the economy" tiles, two leaderboards (net worth and % return), the
trade tape, and an explainer of how the market works (`MARKET_RULES` in
[rules.js](../src/wex/rules.js)). Clicking a legend row isolates that company.

| Param | Values | Default |
|---|---|---|
| `window` | `15m` · `1h` · `all` | `1h` |
| `y` | `pct` (since open) · `abs` (⌀) | `pct` |
| `only` | tickers, e.g. `ANL,MLC` | all |

### `#ticker` — the 80s terminal

Green phosphor, no nav bar, and nothing to click. On the left are quotes and a
scrolling tape; on the right is a pixel chart of three companies that rotate.
Recent headlines flash up in a pop-up window.

| Param | Values | Default |
|---|---|---|
| `rotate` | seconds between swapping one chart company | `90` |
| `hours` | chart span | `6` |
| `y` | `abs` · `pct` | `abs` |
| `px` | chart pixel size | fit to screen |
| `news` | minutes between headline flashes (0 = off) | `3` |
| `newsage` | how old a headline can be, in hours | `3` |

**`#ticker?mode=random`** is a separate screen: pixel windows (LINE, TRIO, SPARKS,
BARS, BIG NUMBER, HEADLINE, TAPE) open and close over a black field. A GM event
or a ≥2% trade summons windows on top.

| Param | Values | Default |
|---|---|---|
| `speed` | tempo multiplier, 0.25–4 | `1` |
| `max` | most windows open at once, 1–8 | `5` |
| `only` | show one window kind, e.g. `bars` | all |
| `seed` | fixes the random sequence, for screenshots | time |
| `y`, `px` | as above | |

### `#display` — the feed

A vertical article feed with images alternating left and right. Not in the nav.

## Phone

### `#trade` — the guest's exchange

The gate asks for the three words on the guest's card, then a name the first
time. The code is kept in localStorage (`wex_code`). The dashboard shows net
worth, % return, both ranks, a chart of the guest's own fortune (wealth line or
per-slice P&L bars), holdings, the listings, and a trade sheet that previews
cost and price impact. The server's fill is the one that counts. A CEO sees a
"Chief Executive of" box with a link to file a press release. "How to trade"
help comes from `TRADE_RULES`.

### `#submit` — filing

**Needs a WEX login.** Until then the button is greyed out. Three types:

- **Article**, optionally *Wait for approval* (held for the GM). A CEO also gets
  *Press release*, which is always held.
- **Notice**
- **Event**, with a day button (THU–SUN, worked out from `PARTY_THURSDAY`) and a time

Photos outside 4:5–5:4 open a crop box. All photos are shrunk before upload. The
GM sees the filer's trading name; only the typed byline is printed.

## GM

### `#gm` — the Fed

Password-gated. See [gm-guide.md](gm-guide.md).
