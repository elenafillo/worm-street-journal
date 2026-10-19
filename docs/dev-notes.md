# Dev notes

## Dev server

```bash
npm run dev               # :5173, client + api/*.js
npm run dev -- --host     # also on your LAN, for phones
vercel dev                # :3000, the real Vercel runtime, as a cross-check
npm run build
npm run lint
```

`npm run dev` serves `api/*.js` through a small dev-only plugin in
[vite.config.js](../vite.config.js), so you only need one process. `vercel dev`
is closer to production, but on Node 24 / Windows it prints a libuv
`UV_HANDLE_CLOSING` assertion and crashes more easily.

## Env vars

| Var | Used by |
|---|---|
| `SUPABASE_URL` | `api/_supabase.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/_supabase.js` (bypasses RLS, never sent to the browser) |
| `GM_PASSWORD` | `api/gm.js`, `api/wexgm.js` |

Locally they go in `.env.local`; in production, in the Vercel dashboard. The anon
key and the Supabase URL for the browser are hard-coded in
[src/lib/supabase.js](../src/lib/supabase.js), which is fine because both are
public. `SUBMISSION_CODE` is no longer read; delete it from Vercel.

ntfy's topic and site URL live in Supabase Vault, not in env vars (see
[ntfy.sql](../supabase/ntfy.sql)).

## Windows gotcha: curl from PowerShell

PowerShell strips double quotes from arguments passed to `curl.exe`, and
`Set-Content -Encoding utf8` adds a BOM. Either one gives a misleading
"malformed JSON" 400. Write the body with `[System.IO.File]::WriteAllText(...)`
and send it with `--data "@file.json"`.

## Headless Chrome

Screenshots work by driving Chrome over the DevTools protocol from a throwaway
node script. **Don't trust** `--screenshot`: it freezes CSS animations and lays
out the phone view wrong.

## Lint

`npm run lint` reports 5 errors, all `react-hooks/set-state-in-effect`, in
`App.jsx` and the two untracked files below. Every file under `src/wex/` passes.

## Untracked files

`src/App_old.jsx` and `src/App_broadsheet.jsx` are old versions, kept locally for
reference. Nothing imports them and they are git-ignored.
`App_broadsheet.jsx` has a hard-coded GM password, so **never commit it**.

## Limits

Vercel Hobby allows 12 serverless functions; this project uses 4. On Supabase,
watch **egress**. That is why photos are shrunk before upload, why articles are
fetched only when they change, and why ticks are fetched incrementally.
