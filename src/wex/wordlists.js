// ============================================================
// WEX three-word codes
// ============================================================
// 32 × 32 × 32 = 32,768 combinations, in the pattern:
//     adjective · place · worm        e.g. damp-tunnel-wriggler
//
// These lists are NOT secret — knowing the vocabulary does not help you guess
// a code, since it must also exist in the database.
//
// The gate has no autocomplete: guests type the words. normaliseCode() below
// absorbs casing and punctuation, but not misspellings. If someone is stuck at
// the door, look their code up in the GM Players tab.
//
// Rules if you edit them:
//   * No near-homophones across lists — a code gets shouted across a noisy
//     room, and "moss" vs "moist" in different positions is fine, but two
//     lists containing similar words is not.
//   * Keep each list at 32 so the combination count stays honest.

export const ADJECTIVES = [
  "damp", "loud", "soft", "blind", "rich", "greasy", "humble", "brisk",
  "plump", "silent", "crooked", "noble", "weary", "glossy", "murky", "tender",
  "brazen", "hollow", "pale", "restless", "sly", "stout", "thrifty", "vulgar",
  "wistful", "gilded", "grubby", "idle", "jolly", "lucky", "moist", "velvet",
];

export const PLACES = [
  "tunnel", "compost", "mulch", "loam", "burrow", "cellar", "gutter", "orchard",
  "thicket", "dredge", "ledger", "bushel", "market", "furrow", "meadow", "drain",
  "trench", "garden", "hedgerow", "silo", "wharf", "alley", "midden", "peat",
  "bog", "root", "stump", "moss", "fern", "clay", "grit", "husk",
];

export const WORMS = [
  "wriggler", "crawler", "burrower", "nightcrawler", "inchworm", "silkworm",
  "lugworm", "ragworm", "hookworm", "leech", "slug", "grub", "larva", "coil",
  "squirm", "slime", "sludge", "ooze", "gizzard", "bristle", "cocoon", "casting",
  "segment", "creeper", "glider", "molter", "writher", "slitherer", "maggot",
  "earthmover", "mudworm", "clitellum",
];

export const TOTAL_COMBINATIONS =
  ADJECTIVES.length * PLACES.length * WORMS.length;

/** Draw one random code, e.g. "damp-tunnel-wriggler". */
export function randomCode() {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  return `${pick(ADJECTIVES)}-${pick(PLACES)}-${pick(WORMS)}`;
}

/**
 * Strip a typed code to letters and digits, lowercased — the same rule the
 * `players.code_norm` generated column applies in Postgres. Keeps "Damp Tunnel
 * Wriggler", "damp-tunnel-wriggler" and "DAMPTUNNELWRIGGLER" equivalent.
 */
export function normaliseCode(input) {
  return String(input || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
