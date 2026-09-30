# Brief: held stories and CEO press releases

Status: **in progress.** Written 2026-09-29.
- Done (steps 1–2): the `$$` fix in `schema.sql`, and the migration [supabase/held.sql](supabase/held.sql). It was run and verified on 2026-09-30 and folded into `schema.sql` (section 8, plus the fire functions in section 6).
- Done (step 3), tested in the app: the "CEO player" dropdown in the company editor, and `ceo_player_id` accepted by `upsert_company`. The CEO's trading name is never copied into `ceo_name`. It's fine that `ceo_player_id` can be read publicly (the GM's decision).
- Done (step 4): `portfolio`, `login` and `claim` in [api/wex.js](api/wex.js) return `ceo_of: {id, ticker, name} | null`. Only listed companies count. A CEO's trading panel shows a "Chief Executive of" box above The Listings, with a link to file a press release.
- Done (steps 5–6), tested against a fake database but not yet deployed: [api/submit.js](api/submit.js) and the submit form. **Decision (2026-09-30): a WEX login is required to file any story.** It replaces the shared submission code, which is no longer checked. Steps 5 and 6 must be deployed together.
- Done (step 7): the newsroom shows "filed by <trading name>", a red **HELD** tag, and **PRESS RELEASE · TICKER**. For a held story, its Show button reads "Publish, no move" and clears `held`.
- Done (step 8): **Held Stories** in the GM Exchange tab. Stories arrive with the `overview` poll. Each has Load into event, Publish (no move) and Spike. A loaded story rides along with the next fire as `article_id`.
- Done (step 9): HANDOFF.md updated. The broadsheet "PRESS RELEASE" kicker was left as an optional TODO there.
- **Everything is built. What's left is deploying and working through the test checklist below.**

**Rule:** you must be logged in to WEX to file anything: an article, a notice or an event. Until you are, the submit button is greyed out and a note explains why, with a link to TRADE. The `SUBMISSION_CODE` env var can be deleted from Vercel.

**Rule:** each CEO runs exactly one company, and each company has exactly one CEO. This is enforced by a unique index on `companies.ceo_player_id`.

## What we want

Two new ways to file a story on `/#submit`. In both, the story does **not** publish when it's filed:

1. **"Wait for approval"**: a checkbox anyone can tick on an Article. The story is held until the GM deals with it.
2. **"Press release"**: only available to a company's CEO. It's always held, and it's tagged with the CEO's company.

Separately, every guest must be **logged in to WEX** to file, and the GM sees the filer's **trading name** alongside every story. Only the byline they typed is ever published. The trading name is for the GM's eyes only.

For each held story, the GM does one of three things:

- **Fire with a market move.** Pick one to four companies and a percentage for each, using the existing event form. The story publishes **at the same moment** as the prices move.
- **Publish, no move.** The story goes out as an ordinary article.
- **Spike.** The story never runs.

The reason for all this: if a story went out first and the move came later, guests who read fast could trade on the news before the price moved. Publishing and moving together closes that gap.

## Where things are today

- A submitted story publishes immediately. [api/submit.js](api/submit.js) inserts it with `hidden` left at its default of `false`, and the GM can hide it afterwards from the newsroom ([api/gm.js](api/gm.js)).
- A market event is a separate thing the GM types into the Exchange tab ([src/wex/WexAdmin.jsx](src/wex/WexAdmin.jsx), "Fire an Event"). That form calls `fire_event` in [api/wexgm.js](api/wexgm.js), which calls `wex_fire_event` (whole market) or `wex_fire_moves` (one to four companies). Nothing links an event to an article.
- `companies.ceo_player_id` exists but **nothing ever sets it**: `ceo_name` is free text. So at the moment the system can't tell who is a CEO.
- A hidden story really is secret. `articles` has RLS on, and its "read articles" policy (`hidden = false`) means the anon key never receives hidden rows. The broadsheet also filters on `hidden` in the browser ([src/App.jsx:1154](src/App.jsx#L1154)), but that's only a second layer. So a held story, which is stored hidden, can't be read by guests.
- A guest's WEX player code (their three-word phrase) is kept in localStorage by [src/wex/wexApi.js](src/wex/wexApi.js). The submit page runs on the same origin, so it can read that code.

## Prerequisite: fix `schema.sql`

The copy of `wex_fire_moves` in [supabase/schema.sql](supabase/schema.sql) opens with `as $` and closes with `$;`. Both should be `$$`. Fix that before editing the function, or a rebuild from scratch fails at that point.

## Design

### Data (`supabase/held.sql`, a migration; fold into `schema.sql` afterwards)

On `articles`:

| column | type | meaning |
|---|---|---|
| `held` | `boolean not null default false` | waiting for the GM's decision |
| `press_company_id` | `uuid references companies(id) on delete set null` | set when the story is a press release |

- A held story is stored with **both** `held = true` and `hidden = true`. Every existing reader already skips hidden rows, so nothing that reads articles needs to change.
- "Approve" sets both to `false`. "Spike" sets `held = false` and leaves `hidden = true`, which is the same as the GM hiding it today.
- A press release stays `article_type = 'article'` and is marked by `press_company_id`. This deliberately differs from the `article_type='press_release'` idea in [WEX_plan.md](WEX_plan.md): a new type would drop press releases out of the main feed and the broadsheet, because both filter on `article_type === 'article'`.

A new table, **`article_filers`**, records who filed a story while logged in:

| column | type | meaning |
|---|---|---|
| `article_id` | `uuid primary key references articles(id) on delete cascade` | |
| `player_id` | `uuid references players(id) on delete set null` | the player the code resolved to |
| `trading_name` | `text` | the player's `display_name` **copied at filing time**, because `wex_reset_all` clears display names and the GM should still know who filed it |

- Why a separate table rather than a column on `articles`: anon can read every column of `articles`, and the `leaderboard` view exposes `players.id` to anon. A `submitted_by` column on `articles` would let anyone match an article's byline to a trader. Instead, give `article_filers` RLS with **no policies** and no anon grant, the same as `players`. Grant it to `service_role` only.
- Only the GM panel reads this table, through the service role. It's joined in `fetch_articles` ([api/gm.js](api/gm.js)) and in the held-stories list.

On `market_events` (optional, but cheap): `article_id uuid references articles(id) on delete set null`. With it, the GM's Recent Events list can show which story caused a move.

**Newsroom table security.** Checked in the dashboard on 2026-09-30: `articles` and `events` both have RLS on, with one select policy each (`hidden = false` on articles). That was already enough to keep held stories secret. `held.sql` restates those policies so a rebuild gets them, and revokes the public key's unneeded write grants on both tables, TRUNCATE included.

### Firing an event also publishes the story, in one transaction

Add an optional `p_article_id uuid default null` to **both** `wex_fire_event` and `wex_fire_moves`. When it's set, the function does three things before any price moves:

- `update articles set held = false, hidden = false where id = p_article_id and held`
- if that updated no row, return `{ok:false, error:'That story has already been dealt with.'}`. This stops a double tap from firing the event twice.
- write `article_id` onto the new `market_events` row.

Postgres gotcha: a new parameter makes a **new overload**, not a replacement. Run `drop function if exists wex_fire_moves(text, jsonb)` (and the same for `wex_fire_event(uuid, text, numeric)`) before the `create`, then update the `revoke` and `grant` lines to the new signatures.

### Submitting (`/#submit`, [src/App.jsx](src/App.jsx) `handleSubmit`, [api/submit.js](api/submit.js))

- **Who's logged in.** When the page loads, read the WEX code from localStorage (the same key as `wexApi.js`). If there's one, call `portfolio` in [api/wex.js](api/wex.js) to get the player's trading name. Extend `portfolio` to also return `ceo_of: {id, ticker, name} | null`, the one company where `ceo_player_id` is that player.
  - The login is re-checked whenever the page regains focus, so a guest can log in on TRADE in another tab and come straight back.
  - If the code works, show a note directly **under the byline field**: "Note that the Fed will be able to see your name **<trading name>** when you file a story. Only your byline gets printed." Guests should know the GM can see who filed a story, and the byline is where they decide what name to print.
  - If the code is missing or stale, **grey out the submit button** and show a note above it: "You need to be logged in to WEX to file a story. Log in on TRADE with the words on your card, then come back here."
  - The old "Submission Code" field is gone.
- **"Wait for approval"** checkbox, shown in Article mode only, once logged in. Notices and events don't move markets. It sends `held: true`.
- **"Press release"** toggle, shown only when `ceo_of` is set.
  - The toggle names the company ("Press release for SLM"). There's no picker, because a CEO runs exactly one company.
  - Turning it on forces "Wait for approval" on and locks it. The button reads "File the Press Release".
- **Server side** (`/api/submit`): never trust what the client says.
  - Resolve the `code` to a claimed player once, at the top. If there isn't one, refuse with 403 `{error: "Log in to WEX to file a story.", needs_login: true}`, and the form greys its button again. Unclaimed players count as no player.
  - Insert an `article_filers` row (`player_id`, `trading_name` = the player's current `display_name`) after every article. This is best effort: if it fails, it's logged and the story still counts as filed.
  - `held` comes from the request. It forces `hidden = true`.
  - For a press release, the request sends only `press: true`. The server looks up the player's one company itself and sets `press_company_id` from that; it never takes a company id from the client. Refuse if the player runs no company ("Only a CEO can file a press release, worm.").
- Success message for held stories: "Filed. Your story is with the Fed and runs when they approve it."

### Assigning CEOs (GM, Exchange tab, company editor)

Add a "CEO player" dropdown to the company editor in [WexAdmin.jsx](src/wex/WexAdmin.jsx) (around line 564). Fill it from `list_players`, leaving out players who already run another company, and save `ceo_player_id` through `upsert_company` (add it to the allowed keys at [api/wexgm.js:313](api/wexgm.js#L313)). If the unique index still refuses the save, show a clear message. Keep `ceo_name` as the display name, and **never** fill it in from the linked player's trading name. `ceo_name` is shown on WEX ("Led by …"), and the CEO's trading name must not appear there.

### Approving (GM, Exchange tab)

A **"Held stories"** section above "Fire an Event", listing articles where `held` is true, oldest first. It can come from a new `list_held` action in `wexgm.js`, or it can reuse `fetch_articles` from the newsroom. Each card shows the byline, the trading name when there is one ("by *Reginald Earthworm III*, filed by **damp_worm**"), the headline, the start of the body, a thumbnail if there's an image, and a **PRESS RELEASE · SLM** badge where it applies.

Actions:

- **Load into event** pre-fills the existing event form:
  - The headline is the article's headline. The GM can edit it, since the ticker suits something short and uppercase.
  - For a press release, the scope is set to "Companies" with the CEO's company already in row 1.
  - The form remembers the `article_id`, and the button reads "Fire and publish". `fire_event` in `wexgm.js` passes the `article_id` through to the RPC.
  - Add a "✕ detach" link to drop the article and go back to a plain event.
- **Publish, no move**: `held=false, hidden=false`.
- **Spike**: `held=false`, still hidden. Ask for confirmation first.

The newsroom tab ([App.jsx](src/App.jsx) GM panel, around line 1934) will list held stories automatically, because it shows hidden rows. Add a **HELD** tag next to the existing **HIDDEN** one so it's clear why a story isn't live. Also add "· filed by <trading name>" to the meta line of **every** article that has a filer row, held or not.

The broadsheet could show a small "PRESS RELEASE" kicker on articles where `press_company_id` is set. Optional, but it's on-brand.

## Out of scope / decide later

- Authors seeing whether their story was approved or spiked.
- Press releases for more than one company at once.
- Stopping an author trading on their own story before they file it. That can't be prevented and arguably it's part of the game.

## Test checklist

- [ ] A plain article (box unticked) publishes immediately, as it does now.
- [ ] A held article doesn't appear on the broadsheet, the feed, or in an anon PostgREST read of `articles`.
- [ ] A held article appears under Held stories and is tagged HELD in the newsroom.
- [ ] Firing a held story with two companies moves both prices, writes one `market_events` row with `article_id`, and the article goes live in the same instant.
- [ ] Firing the same held story a second time from another tab is refused and nothing moves.
- [ ] Publish-no-move and Spike both remove the story from Held stories.
- [ ] Filed while logged in: the newsroom shows the trading name, and the published byline is only what was typed.
- [ ] Logged out, or with a stale code: the submit button is greyed out with the login note, and a hand-crafted request is refused with 403.
- [ ] An anon PostgREST read can't reach `article_filers`, and nothing in `articles` identifies the filer.
- [ ] After `wex_reset_all`, old stories still show the trading name they were filed under.
- [ ] Only a guest linked as CEO sees the Press release toggle. A hand-crafted request with a non-CEO code, or someone else's company, is refused.
- [ ] `schema.sql` runs cleanly from scratch after the migration has been folded in.
