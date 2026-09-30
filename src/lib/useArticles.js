// ============================================================
// Articles — fetched once, then only what changed
// ============================================================
// The newspaper screens used to re-download every article, bodies and all,
// every four seconds. That grows with each story filed, and at a party where
// the news never stops it becomes the heaviest thing the project sends — and
// past 1000 stories PostgREST silently caps it, so the oldest just vanish.
//
// Now each poll reads `articles_version` (supabase/news.sql): one row, how
// many stories anon can see and when the newest of them last changed. If
// neither moved, that is the whole poll. If they did:
//
//   1. fetch rows whose updated_at is past our cursor, and merge them by id.
//      A cursor on created_at would miss a held story, which is published by
//      an UPDATE to a row that may be hours old;
//   2. if we now hold a different number of stories than `visible`, one was
//      hidden or deleted — neither of which a reader can see as a changed row,
//      because RLS stops returning it. Fetch just the visible ids, drop ours
//      that are gone, and fetch any we somehow lack.
//
// Until news.sql has run, `articles_version` does not exist and every poll
// falls back to the old full load, so deploying this first breaks nothing.

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";

const POLL_MS = 4000;

// PostgREST's max-rows on Supabase. Asking for more returns this many,
// silently — see the note in src/wex/useMarketData.js.
const PAGE_MAX = 1000;

// updated_at is `now()`, the START of the writing transaction, so a slow one
// can commit a timestamp older than one we have already seen. Looking back
// past the cursor covers it; merging by id makes the overlap harmless.
const LOOKBACK_MS = 30_000;

const newestFirst = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at);

/** Every visible article (or just `select` of each), paged by id so none are capped. */
async function fetchAll(select) {
  const rows = [];
  let after = null;
  for (;;) {
    const page = await supabase.query("articles", {
      select,
      order: "id.asc",
      limit: PAGE_MAX,
      ...(after === null ? {} : { params: { id: `gt.${after}` } }),
    });
    if (!Array.isArray(page)) throw new Error(page?.message || "articles unreadable");
    rows.push(...page);
    if (page.length < PAGE_MAX) return rows;
    after = page[page.length - 1].id;
  }
}

/** The one-row fingerprint, or null if news.sql has not run yet. */
async function fetchVersion() {
  const rows = await supabase.query("articles_version", { select: "visible,changed_at" });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

const sameVersion = (a, b) =>
  a && b && Number(a.visible) === Number(b.visible) && a.changed_at === b.changed_at;

/**
 * Every article anon can see, newest first. Callers still filter by
 * article_type; RLS has already removed hidden and held ones.
 */
export function useArticles(intervalMs = POLL_MS) {
  const [articles, setArticles] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Mutable store. Only `articles` is rendered from; the rest is bookkeeping.
  const store = useRef({ byId: new Map(), cursor: 0, version: null });

  useEffect(() => {
    const s = store.current;
    let alive = true;
    let busy = false;

    const publish = () => {
      if (alive) setArticles([...s.byId.values()].sort(newestFirst));
    };

    const merge = (rows) => {
      for (const r of rows) {
        s.byId.set(r.id, r);
        const t = Date.parse(r.updated_at);
        if (t > s.cursor) s.cursor = t;
      }
    };

    async function fullLoad(version) {
      const rows = await fetchAll("*");
      s.byId = new Map();
      s.cursor = 0;
      merge(rows);
      s.version = version;
      publish();
    }

    async function changedSince(version) {
      const since = new Date(s.cursor - LOOKBACK_MS).toISOString();
      const rows = await supabase.query("articles", {
        select: "*",
        order: "updated_at.asc",
        limit: PAGE_MAX,
        params: { updated_at: `gte.${since}` },
      });
      if (!Array.isArray(rows)) throw new Error(rows?.message || "articles unreadable");
      // A thousand changes in one poll is a bulk edit, not news; start over.
      if (rows.length === PAGE_MAX) return fullLoad(version);
      merge(rows);

      // Something left, or something arrived that the cursor missed.
      if (s.byId.size !== Number(version.visible)) {
        const live = new Set((await fetchAll("id")).map((r) => r.id));
        for (const id of s.byId.keys()) if (!live.has(id)) s.byId.delete(id);
        const missing = [...live].filter((id) => !s.byId.has(id));
        for (let i = 0; i < missing.length; i += 100) {
          const chunk = missing.slice(i, i + 100);
          const rows = await supabase.query("articles", {
            select: "*",
            params: { id: `in.(${chunk.join(",")})` },
          });
          if (Array.isArray(rows)) merge(rows);
        }
      }

      s.version = version;
      publish();
    }

    async function poll() {
      if (busy) return;   // a slow poll on party wifi must not stack up behind itself
      busy = true;
      try {
        // Read the version BEFORE any rows: a change landing mid-load then
        // shows up as a new version next poll, never as a silent miss.
        const version = await fetchVersion();
        if (!version) await fullLoad(null);                   // news.sql not run yet
        else if (sameVersion(version, s.version)) return;     // the usual case
        else if (!s.cursor) await fullLoad(version);          // first load, or an empty paper
        else await changedSince(version);
      } catch {
        // Keep what is on screen. A front page that blanks on one dropped
        // poll is worse than one a few seconds behind.
      } finally {
        busy = false;
        if (alive) setLoaded(true);
      }
    }

    poll();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);

  return { articles, loaded };
}
