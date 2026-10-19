// ============================================================
// Party-wide config
// ============================================================
// Update PARTY_THURSDAY before each event.
//
// Note for WEX: the exchange's tunables (min_price, max_impact, per-company
// liquidity, per-player starting cash) deliberately live in the database, not
// here, so they can be adjusted mid-party without a deploy. Resist adding them.

export const DISPLAY_STYLE = "modern"; // "classic" | "modern"
export const PARTY_THURSDAY = "2026-11-26"; // ISO date of the party's Thursday
export const BREAKING_DURATION_MS = 5 * 60 * 1000; // how long the breaking banner stays live
