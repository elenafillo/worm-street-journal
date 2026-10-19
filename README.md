# Worm Street

A weekend party game: worms meet Wall Street. A projected wall shows two live
panels side by side: a newspaper, the **Worm Street Journal** (WSJ), and a stock
exchange, the **Worm Stock Exchange** (WEX). Guests trade and file stories from
their phones. The GM (the "Worm Fed") moderates stories, fires market events and
breaking news, and controls the weather.

**Live:** https://worm-street-journal.vercel.app


**Dev version (most up to date):** https://worm-street-journal-git-wex-elena-fillo-s-projects.vercel.app/

**Stack:** React 19 + Vite · Supabase (Postgres, Storage, pg_cron, pg_net) · Vercel serverless functions in `api/`

## Screens

| Route | Nav | What it is |
|---|---|---|
| `#broadsheet` | WSJ | Newspaper front page. The default route, projected on the wall |
| `#wex` | WEX | Market dashboard: chart, health, leaderboards, tape. Projected beside the broadsheet |
| `#trade` | TRADE | Guest phone: log in with three words, see portfolio, buy and sell |
| `#submit` | FILE | File an article, notice or event. Needs a WEX login |
| `#gm` | FED | GM panel, password-gated |
| `#ticker` | — | 80s terminal for the exchange. `?mode=random` for pop-up windows |
| `#display` | — | Vertical article feed |

URL parameters for each screen are in [docs/screens.md](docs/screens.md).

## Run locally

```bash
npm install
npm run dev               # localhost:5173, serves api/* too
npm run dev -- --host     # same, plus your LAN, to test on a phone
```

Supabase is live; there is no local database. Put `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `GM_PASSWORD` in `.env.local` (git-ignored).
Production uses the same vars in Vercel → Settings → Environment Variables.
More in [docs/dev-notes.md](docs/dev-notes.md).

## Docs

| | |
|---|---|
| [docs/party-runbook.md](docs/party-runbook.md) | **Before, during and after a party.** Read this first |
| [TODO.md](TODO.md) | The backlog. The only place status lives |
| [docs/architecture.md](docs/architecture.md) | How the pieces fit, and where the code is |
| [docs/data-and-security.md](docs/data-and-security.md) | Tables, views, RLS, and the one rule that keeps the game honest |
| [docs/database.md](docs/database.md) | Each SQL file, what it adds, and how to rebuild from scratch |
| [docs/screens.md](docs/screens.md) | Every route and its URL parameters |
| [docs/gm-guide.md](docs/gm-guide.md) | Using the GM panel |
| [docs/market-design.md](docs/market-design.md) | Price engine, fortunes, drift, events, charts |
| [docs/testing.md](docs/testing.md) | What has been verified, and the checklists |
| [docs/dev-notes.md](docs/dev-notes.md) | Dev server, Windows gotchas, lint |
| [docs/decisions.md](docs/decisions.md) | Why things are the way they are |
| [docs/archive/](docs/archive/) | The original WEX plan and held-stories brief, frozen |
