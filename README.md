# Worm Street

A weekend party game — worms meet Wall Street. The centrepiece is a projected wall display running two live panels: a stock exchange (WEX) and a newspaper, the **Worm Street Journal**. Guests file stories, notices and event listings from their phones; a GM moderates from a password-gated panel and can fire BREAKING NEWS across the display.

The Worm Street Journal is built and deployed. WEX is not started yet.

**Live:** https://worm-street-journal.vercel.app

| Route | What it does |
|---|---|
| [`/#broadsheet`](https://worm-street-journal.vercel.app/#broadsheet) | Newspaper front page — the projected display, and the default landing page |
| [`/#submit`](https://worm-street-journal.vercel.app/#submit) | Guest submission form, gated by a party code |
| [`/#gm`](https://worm-street-journal.vercel.app/#gm) | Moderation panel, password-gated |

**Stack:** React + Vite · Supabase (Postgres + Storage) · Vercel

## Running it locally

```bash
npm install
npm run dev               # localhost:5173 — guest-facing routes
npm run dev -- --host     # same, plus your local network, for testing on a phone
vercel dev                # localhost:3000 — needed to test the GM panel
```

Supabase is already live and connected; no local instance required. Env vars for local dev go in `.env.local` (git-ignored) — see `.env.example`.

## Next steps

- Print button on the broadsheet, plus an "Extra, extra" capture-and-spin effect in the GM panel
- Distinct accent colours for articles vs notices vs events
- Point a domain at it and get a QR code to guests
- Build WEX

## More detail

[**HANDOFF.md**](HANDOFF.md) is the working document — data model, architecture decisions, the full backlog, and the constants you need to update before each party (notably `PARTY_THURSDAY`).
