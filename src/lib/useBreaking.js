// ============================================================
// Breaking news — which banners are live
// ============================================================
// Worked out from the `events` rows themselves, never from a timer in the
// browser: a banner is live for BREAKING_DURATION_MS after its created_at,
// unless a clear_breaking came after it. So a reloaded screen shows exactly
// what every other screen shows, and an old banner can never come back.
//
// Several banners can be live at once. Each expires on its own; a
// clear_breaking hides everything fired before it.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { BREAKING_DURATION_MS } from "./config.js";

/** The live banners, newest first, from `events` sorted newest first. */
export function liveBreaking(events, now) {
  const live = [];
  for (const e of events) {
    if (e.type === "clear_breaking") break;
    if (e.type !== "breaking_news") continue;
    const expiresAt = Date.parse(e.created_at) + BREAKING_DURATION_MS;
    if (now < expiresAt) {
      live.push({ id: e.id, message: e.payload?.message || "BREAKING NEWS", expiresAt });
    }
  }
  return live;
}

/**
 * Polls `events` and returns { live, refresh }. Only the last
 * BREAKING_DURATION_MS of rows are fetched: a clear older than that can only
 * hide banners that have expired anyway.
 */
export function useBreaking(intervalMs = 4000) {
  const [live, setLive] = useState([]);

  const refresh = useCallback(async () => {
    const since = new Date(Date.now() - BREAKING_DURATION_MS).toISOString();
    const data = await supabase.query("events", {
      select: "*",
      order: "created_at.desc",
      limit: 50,
      params: { created_at: `gte.${since}` },
    });
    if (!Array.isArray(data)) return;
    const next = liveBreaking(data, Date.now());
    // Keep the same array while nothing changed, so the ticker is not
    // re-measured on every poll.
    const key = next.map(b => b.id).join();
    setLive(prev => (prev.map(b => b.id).join() === key ? prev : next));
  }, []);

  useEffect(() => {
    // Every poll, the first included, is a timeout, so nothing sets state
    // synchronously from inside the effect.
    const first = setTimeout(refresh, 0);
    const unsub = supabase.subscribe("events", refresh, intervalMs);
    return () => { clearTimeout(first); unsub(); };
  }, [refresh, intervalMs]);

  return { live, refresh };
}
