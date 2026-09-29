/**
 * Query params carried INSIDE the hash — `#wex?window=1h`, `#ticker?rotate=30`.
 *
 * The router (App.jsx) strips everything from `?` to find the route; the
 * screens read what it stripped from here. Shared so the wall screens cannot
 * disagree about how a link is parsed.
 */
export function hashParams() {
  const q = window.location.hash.includes("?")
    ? window.location.hash.split("?")[1]
    : "";
  return new URLSearchParams(q);
}

/** A numeric param, clamped to [min, max], or `fallback` if absent or junk. */
export function numberParam(params, name, fallback, min, max) {
  const n = Number(params.get(name));
  if (!params.has(name) || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
