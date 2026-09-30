// ============================================================
// Random mode's scheduler — which windows open, where, and when
// ============================================================
// The pure part of #ticker?mode=random, kept out of the component so a whole
// evening can be simulated with plain node against a fake clock. Nothing here
// touches React, the DOM or the real clock: time is `now`, randomness is `rng`,
// and the screen is `viewport`.
//
// The component calls step() a few times a second. Each call:
//   1. starts closing windows whose time is up, and drops ones done closing
//   2. opens windows the market has SUMMONED — a new headline, a big trade
//   3. opens one AMBIENT window if one is due, there is room, and the screen
//      is not already too full
//
// Layout is in CSS pixels, snapped to `grid` — a whole number of canvas pixels
// — so the pixels of every window line up with every other's.

import { eventMoves, recentEvents, FLASH_WINDOW_MS } from "./tickerFeed.js";

// ---- tempo, at speed 1 ------------------------------------------------------
const SPAWN_GAP_MS = [2000, 6000];     // between ambient windows
const LIFE_MS = [8000, 20000];         // an ambient window's stay
const SUMMONED_LIFE_MS = 25000;        // a headline or big-trade window's stay
export const OPEN_MS = 400;            // unfold — NOT scaled: it is the look
export const CLOSE_MS = 450;           // switch-off — likewise
const REVEAL_BASE_MS = 1200;           // a line drawing itself in

// How crowded the screen may get. A wall has room to spread windows out; a
// phone does not, and spread out on one they read as a list, not a desk — so
// there windows land anywhere allowed rather than in the emptiest spot, and
// may fill more of the screen. Half a window stays the most one may hide.
const WALL_RULES = { maxCover: 0.7, maxHidden: 0.5, spread: true };
const PHONE_RULES = { maxCover: 0.85, maxHidden: 0.5, spread: false };
export const rulesFor = (viewport) => (viewport.w < 768 ? PHONE_RULES : WALL_RULES);
const BIG_TRADE_PCT = 2;               // a trade moving a stock this much summons

// ---- news, by age -------------------------------------------------------------
// Each headline from the last three hours has its own clock. Fresh news comes
// back often and old news rarely: the gap between showings doubles every
// NEWS_HALF_LIFE_MS of the headline's age.
//
//   just out  30 s    ·   20 min  1 min    ·   40 min  2 min
//   1 h       4 min   ·   2 h     32 min   ·   past 3 h, never
//
// This is the ONLY way a headline window appears, beside the instant summons
// when one breaks — headlines are not in the ambient draw, so how often the
// news shows is decided here and nowhere else.
const NEWS_BASE_MS = 30_000;
const NEWS_HALF_LIFE_MS = 20 * 60_000;

/** The gap until a headline of this age shows again, at this speed. */
export function newsInterval(ageMs, speed = 1) {
  return (NEWS_BASE_MS * 2 ** (Math.max(0, ageMs) / NEWS_HALF_LIFE_MS)) / speed;
}

/** Line draw-in at a given speed: faster with the tempo, never a blur. */
export function revealMs(speed) {
  return Math.max(300, REVEAL_BASE_MS / speed);
}

// ---- seeded randomness -----------------------------------------------------
/** mulberry32: small, fast, and the same sequence for the same `?seed=`. */
export function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng, [lo, hi]) => lo + rng() * (hi - lo);
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

// ---- the catalogue -----------------------------------------------------------
// `size` is [width range, height range] as fractions of the viewport. `weight`
// is how often an ambient spawn picks it. `needs` is what must exist first.
export const KINDS = {
  line:     { weight: 4, size: [[0.30, 0.42], [0.30, 0.40]] },
  trio:     { weight: 2, size: [[0.40, 0.52], [0.38, 0.50]], needs: "three" },
  sparks:   { weight: 2, size: [[0.26, 0.34], [0.40, 0.55]] },
  bars:     { weight: 2, size: [[0.26, 0.34], [0.32, 0.42]] },
  big:      { weight: 3, size: [[0.20, 0.28], [0.24, 0.30]] },
  // Weight 0: headlines are scheduled by age (newsInterval), never drawn at random.
  // `narrowH`: on a phone a headline wraps to several lines, so it gets a
  // taller window than the 0.72-squashed default would give it.
  headline: { weight: 0, size: [[0.34, 0.46], [0.22, 0.30]], narrowH: [0.30, 0.40], needs: "events" },
  tape:     { weight: 2, size: [[0.30, 0.38], [0.30, 0.38]], needs: "tape" },
};

const LINE_HOURS = [0.25, 1, 6];

// ---- geometry ----------------------------------------------------------------
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * How much of the viewport the windows cover, counting overlaps once. Sampled
 * on a 40×24 raster rather than solved exactly: this only gates a spawn, and a
 * percent either way changes nothing anyone can see.
 */
export function coverage(rects, viewport) {
  if (!rects.length) return 0;
  const COLS = 40;
  const ROWS = 24;
  let hit = 0;
  for (let r = 0; r < ROWS; r++) {
    const y = ((r + 0.5) / ROWS) * viewport.h;
    for (let c = 0; c < COLS; c++) {
      const x = ((c + 0.5) / COLS) * viewport.w;
      if (rects.some((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h)) hit++;
    }
  }
  return hit / (COLS * ROWS);
}

const snap = (v, grid) => Math.round(v / grid) * grid;

/** A window's size for `kind` on this viewport, snapped to the grid. */
export function sizeFor(kind, viewport, grid, rng) {
  // A portrait phone gets windows most of the width and a bit shorter —
  // wide enough to read, small enough that three still overlap like a desk.
  const narrow = viewport.w < 768;
  const [wr, hr] = KINDS[kind].size;
  // Floored, not rounded: a 390px phone minus margins is not a whole number of
  // grid cells, and a window off the grid would not line up with the others.
  const full = Math.floor((viewport.w - 2 * grid) / grid) * grid;
  const w = snap(between(rng, narrow ? [0.6, 0.85] : wr) * viewport.w, grid);
  const tall = narrow && KINDS[kind].narrowH;
  const h = snap(tall ? between(rng, tall) * viewport.h
                      : between(rng, hr) * viewport.h * (narrow ? 0.72 : 1), grid);
  return {
    w: Math.max(grid * 6, Math.min(w, full)),
    h: Math.max(grid * 4, Math.min(h, viewport.h - 2 * grid)),
  };
}

/**
 * Where to put a window of `size`: one of `tries` random grid positions,
 * never one that hides more than `maxHidden` of a window already up. With
 * `spread`, the least-overlapping; without, the first allowed — overlap as it
 * falls. Returns null when every candidate breaks the rule; the caller waits.
 */
export function placeWindow(open, size, viewport, grid, rng, tries = 12) {
  const { maxHidden, spread } = rulesFor(viewport);
  const maxX = Math.max(grid, viewport.w - size.w - grid);
  const maxY = Math.max(grid, viewport.h - size.h - grid);
  let best = null;
  for (let i = 0; i < tries; i++) {
    const c = {
      x: Math.max(grid, snap(grid + rng() * (maxX - grid), grid)),
      y: Math.max(grid, snap(grid + rng() * (maxY - grid), grid)),
      ...size,
    };
    if (open.some((o) => overlap(c, o) / (o.w * o.h) > maxHidden)) continue;
    // Every candidate is still drawn either way, so a seed replays the same.
    const score = spread ? open.reduce((sum, o) => sum + overlap(c, o), 0) : 0;
    if (!best || score < best.score) best = { ...c, score };
  }
  return best && { x: best.x, y: best.y, w: best.w, h: best.h };
}

// ---- what goes in a window -----------------------------------------------------
function available(kind, env) {
  const need = KINDS[kind].needs;
  if (need === "three") return env.companies.length >= 3;
  if (need === "events") return env.events.length > 0;
  if (need === "tape") return env.tape.length > 0;
  return env.companies.length > 0;
}

// Kinds that show the whole market, not one company: two of the same at once
// is not variety, it looks like a glitch. Single-company kinds can repeat —
// with a different company each (contentFor prefers one not on screen).
const WHOLE_MARKET = new Set(["sparks", "bars", "headline", "tape"]);

function chooseKind(env, rng, open) {
  const up = new Set(open.map((w) => w.kind));
  const kinds = (env.only ? [env.only] : Object.keys(KINDS)).filter(
    (k) => KINDS[k] && available(k, env) && (env.only || KINDS[k].weight > 0)
      && !(WHOLE_MARKET.has(k) && up.has(k) && !env.only)
  );
  if (!kinds.length) return null;
  const total = kinds.reduce((s, k) => s + KINDS[k].weight, 0);
  let r = rng() * total;
  for (const k of kinds) {
    r -= KINDS[k].weight;
    if (r <= 0) return k;
  }
  return kinds[kinds.length - 1];
}

/**
 * The contents of a new window: which companies, which time window, and a
 * title that reads like an old filename. Single-company kinds prefer a
 * company no other window is already showing.
 */
function contentFor(kind, env, open, rng, pinned = {}) {
  const ids = env.companies.map((c) => c.id);
  const byId = new Map(env.companies.map((c) => [c.id, c]));
  const shown = new Set(open.flatMap((w) => w.companyIds || []));
  const fresh = ids.filter((id) => !shown.has(id));
  const one = () => pinned.companyId || pick(rng, fresh.length ? fresh : ids);
  const tick = (id) => byId.get(id)?.ticker || "???";

  switch (kind) {
    case "line": {
      const id = one();
      return { companyIds: [id], hours: pinned.hours || pick(rng, LINE_HOURS), title: `${tick(id)}.CHT` };
    }
    case "big": {
      const id = one();
      return { companyIds: [id], title: `${tick(id)}.NUM` };
    }
    case "trio": {
      // Summoned by a several-company event: exactly the companies it moved.
      if (pinned.companyIds?.length) {
        return { companyIds: pinned.companyIds.slice(0, 4), hours: pinned.hours || 1, title: "NEWS.CHT" };
      }
      const pool = [...ids];
      const three = [];
      while (three.length < 3 && pool.length) three.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      return { companyIds: three, hours: 6, title: "TRIO.CHT" };
    }
    case "sparks": return { companyIds: [], hours: 1, title: "MARKET.SPK" };
    case "bars": return { companyIds: [], title: "MOVERS.BAR" };
    case "headline": return { companyIds: [], eventId: pinned.eventId ?? env.events[0]?.id, title: "NEWS.TXT" };
    case "tape": return { companyIds: [], title: "TAPE.LOG" };
    default: return { companyIds: [], title: "?" };
  }
}

// ---- the step ----------------------------------------------------------------
/** A fresh scheduler. Nothing opens until the first step() has seen the data. */
export function initialState() {
  return {
    windows: [],        // { id, kind, x, y, w, h, z, openedAt, closeAt, closingAt, summoned, ...content }
    nextId: 1,
    nextZ: 1,
    nextSpawnAt: 0,
    primed: false,      // true once the existing events and trades are recorded
    seenEvents: [],
    seenTrades: [],
    newsNext: {},       // event id → when its headline is next due
  };
}

function lifeFor(summoned, speed, rng) {
  const base = summoned ? SUMMONED_LIFE_MS : between(rng, LIFE_MS);
  // Whatever the speed, a window stays long enough to unfold and draw its line.
  return Math.max(base / speed, OPEN_MS + revealMs(speed) + 800);
}

/**
 * What the market has summoned since the last step: a HEADLINE and a LINE for
 * each new market event, and a BIG number for each trade that moved its stock
 * at least BIG_TRADE_PCT. On the very first step everything already there is
 * recorded as seen and nothing is summoned — a page load is not news.
 */
function detectSummons(state, env) {
  const seenE = new Set(state.seenEvents);
  const seenT = new Set(state.seenTrades);
  const out = [];
  if (state.primed) {
    for (const ev of env.events) {
      if (seenE.has(ev.id)) continue;
      out.push({ kind: "headline", pinned: { eventId: ev.id } });
      // The companies it moved: one gets its own chart, several share one.
      const ids = eventMoves(ev)
        .map((m) => m.company_id)
        .filter((id) => id && env.companies.some((c) => c.id === id));
      if (ids.length === 1) out.push({ kind: "line", pinned: { companyId: ids[0], hours: 1 } });
      if (ids.length > 1) out.push({ kind: "trio", pinned: { companyIds: ids, hours: 1 } });
    }
    for (const tr of env.tape) {
      if (seenT.has(tr.id)) continue;
      const before = Number(tr.price_before);
      const after = Number(tr.price_after);
      if (!before || !Number.isFinite(after)) continue;
      if (Math.abs((after / before - 1) * 100) < BIG_TRADE_PCT) continue;
      const co = env.companies.find((c) => c.ticker === tr.ticker);
      if (co) out.push({ kind: "big", pinned: { companyId: co.id } });
    }
  }
  // Bounded memory: the feeds themselves are capped (40 events, 30 trades).
  return {
    summons: out,
    seenEvents: env.events.map((e) => e.id).slice(0, 200),
    seenTrades: env.tape.map((t) => t.id).slice(0, 200),
  };
}

/**
 * Advance the scheduler to `now`.
 *
 * @param env  { viewport:{w,h}, grid, speed, max, companies, events, tape, only }
 * @returns    the new state (the input is never mutated)
 */
export function step(state, now, env, rng) {
  const speed = env.speed || 1;
  const max = Math.max(1, env.max || 5);

  // 1. Close what is due; forget what has finished closing. A window that no
  //    longer fits — the screen was resized, or the phone turned sideways —
  //    is due now: it closes, and the next spawn fills the new shape.
  const outside = (w) => w.x + w.w > env.viewport.w || w.y + w.h > env.viewport.h;
  let windows = state.windows
    .filter((w) => !(w.closingAt && now - w.closingAt >= CLOSE_MS))
    .map((w) => (!w.closingAt && (now >= w.closeAt || outside(w)) ? { ...w, closingAt: now } : w));

  let { nextId, nextZ, nextSpawnAt } = state;
  const live = () => windows.filter((w) => !w.closingAt);

  const open = (kind, pinned, summoned) => {
    const size = sizeFor(kind, env.viewport, env.grid, rng);
    const content = contentFor(kind, env, live(), rng, pinned);
    // A summoned window must appear: if nowhere keeps the half-hidden rule,
    // fall back to the least-bad spot rather than drop the news.
    const rect =
      placeWindow(live(), size, env.viewport, env.grid, rng) ||
      (summoned ? placeWindow([], size, env.viewport, env.grid, rng) : null);
    if (!rect) return false;
    // The cap counts the newcomer: an ambient window that would take the screen
    // past it waits for the next slot. Summoned ones are news and go anyway.
    if (!summoned && coverage([...live(), rect], env.viewport) > rulesFor(env.viewport).maxCover) return false;
    windows.push({
      id: nextId++,
      kind,
      ...rect,
      ...content,
      // Summoned windows always stack above ambient ones.
      z: (summoned ? 10_000 : 0) + nextZ++,
      summoned,
      openedAt: now,
      closeAt: now + lifeFor(summoned, speed, rng),
      closingAt: null,
    });
    return true;
  };

  // 2. Summons. At the ceiling, the oldest ambient window makes way.
  const { summons, seenEvents, seenTrades } = detectSummons(state, env);
  const newsNext = {};
  for (const s of summons) {
    if (live().length >= max) {
      const oldest = live().filter((w) => !w.summoned).sort((a, b) => a.openedAt - b.openedAt)[0];
      if (oldest) windows = windows.map((w) => (w === oldest ? { ...w, closingAt: now } : w));
    }
    open(s.kind, s.pinned, true);
    // Breaking news has just been shown: its clock starts from here.
    if (s.kind === "headline") newsNext[s.pinned.eventId] = now + newsInterval(0, speed);
  }

  // 2½. The news clocks. At most one headline per step, so three due at once
  //     arrive a beat apart rather than as a pile.
  if (state.primed) {
    let shown = false;
    for (const ev of recentEvents(env.events, now, FLASH_WINDOW_MS)) {
      const gap = newsInterval(now - ev.t, speed);
      const due = newsNext[ev.id] ?? state.newsNext?.[ev.id];
      if (due === undefined) {
        // First sight — a page load, or news older than the screen: stagger
        // across one interval so a busy evening does not open all at once.
        newsNext[ev.id] = now + rng() * gap;
        continue;
      }
      newsNext[ev.id] = due;
      if (shown || now < due) continue;
      const up = live().some((w) => w.kind === "headline" && w.eventId === ev.id);
      // Not already on screen and no room: try again next step, not in a gap.
      if (up || (live().length < max && open("headline", { eventId: ev.id }, false))) {
        newsNext[ev.id] = now + gap;
        shown = !up;
      }
    }
  }

  // 3. One ambient window, if one is due and there is room for it.
  if (state.primed && now >= nextSpawnAt && env.companies.length) {
    if (live().length < max) {
      const kind = chooseKind(env, rng, live());
      if (kind) open(kind, {}, false);
    }
    nextSpawnAt = now + between(rng, SPAWN_GAP_MS) / speed;
  }

  return {
    windows,
    nextId,
    nextZ,
    nextSpawnAt,
    primed: state.primed || env.companies.length > 0,
    seenEvents,
    seenTrades,
    // Only recent events are carried: anything else fell out of the window.
    newsNext,
  };
}
