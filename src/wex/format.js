// ============================================================
// Number formatting for WEX
// ============================================================
// Everything is in k and M, everywhere, phones included. A raw 24600000 on a
// projector is unreadable and stops being funny.
//
// One decimal on the k scale is deliberate: it makes the smallest visible move
// 100 ⌀, and a single-share trade at liquidity 800 shifts a 100,000 ⌀ stock by
// ~125 ⌀ — so the number still twitches on a small trade. Anything finer is
// carried by the sparkline, not the digits.

export const WORMCOIN = "⌀"; // ⌀

/**
 * 840 → "840"   ·   104,062 → "104.1k"   ·   24,650,000 → "24.65M"
 * Pass { symbol: true } to append " ⌀".
 */
export function formatWormcoin(value, { symbol = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  const abs = Math.abs(n);
  let out;
  if (abs >= 1_000_000) out = `${trimZeros((n / 1_000_000).toFixed(2))}M`;
  else if (abs >= 1_000) out = `${trimZeros((n / 1_000).toFixed(1))}k`;
  else out = String(Math.round(n));

  return symbol ? `${out} ${WORMCOIN}` : out;
}

/** "2.50M" → "2.5M", "3.00M" → "3M" — trailing zeros are noise at a glance. */
function trimZeros(s) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** 12.345 → "+12.3%"   ·   -4 → "−4.0%"   ·   null → "—" */
export function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : ""; // real minus sign, not a hyphen
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

/** Percent change of a price against its opening value. */
export function pctChange(price, openPrice) {
  const p = Number(price);
  const o = Number(openPrice);
  if (!Number.isFinite(p) || !Number.isFinite(o) || o === 0) return null;
  return ((p / o) - 1) * 100;
}

/**
 * The largest number of shares `cash` can actually buy.
 *
 * Not `cash / price`: the fill is at the midpoint, so the cost of q shares is
 *   q·p·(1 + q/2L)
 * which is above q·p and grows with q. Naively dividing overshoots by a couple
 * of shares and the "max buy" button gets refused for insufficient funds.
 *
 * Solving (p/2L)q² + pq − cash = 0 for q gives
 *   q = L·(√(1 + 2·cash/(p·L)) − 1)
 *
 * Also capped by max_impact, since one trade may not move the market more than
 * that fraction of liquidity.
 */
export function maxAffordableShares({ cash, price, liquidity, maxImpact = 0.25 }) {
  const p = Number(price);
  const L = Number(liquidity);
  const c = Number(cash);
  if (!Number.isFinite(p) || !Number.isFinite(L) || !Number.isFinite(c)) return 0;
  if (p <= 0 || L <= 0 || c <= 0) return 0;

  const q = L * (Math.sqrt(1 + (2 * c) / (p * L)) - 1);
  return Math.max(0, Math.min(Math.floor(q), Math.floor(L * maxImpact)));
}

/**
 * Preview a trade the way execute_trade() will price it. Display only — the
 * server recomputes and is authoritative, and the fill can differ if someone
 * trades first. See supabase/schema.sql for the derivation.
 *
 *   buy   p' = p · (1 + q/L)
 *   sell  p' = p · (1 − q/L)
 *   fill  at the midpoint (p + p')/2
 */
export function previewTrade({ price, liquidity, shares, side }) {
  const p = Number(price);
  const L = Number(liquidity);
  const q = Math.floor(Number(shares));
  if (!Number.isFinite(p) || !Number.isFinite(L) || L <= 0 || !q || q <= 0) {
    return null;
  }
  const after = side === "buy" ? p * (1 + q / L) : p * (1 - q / L);
  const exec = (p + after) / 2;
  return {
    priceAfter: Math.round(after * 100) / 100,
    execPrice: Math.round(exec * 100) / 100,
    total: Math.round(exec * q * 100) / 100,
  };
}
