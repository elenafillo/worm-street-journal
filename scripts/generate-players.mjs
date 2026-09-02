#!/usr/bin/env node
// ============================================================================
// WEX — generate the player roster
// ============================================================================
// Draws N unique three-word codes and a starting fortune for each, prints a
// table to eyeball, and writes supabase/players.seed.sql for you to review,
// hand-edit, and paste into the Supabase SQL Editor.
//
//   node scripts/generate-players.mjs
//   node scripts/generate-players.mjs --count 30 --floor 1500000 --ceiling 25000000 --alpha 1.2
//
// Fortunes are drawn from a PARETO distribution — the one real wealth actually
// follows — so you get a couple of obscene fortunes, a middle, and a long poor
// tail without hand-tuning tiers. `--alpha` is the cruelty dial: lower is more
// unequal (1.16 is the classic 80/20; 2.0 is fairly gentle).
//
// Nothing here touches the database. The .sql file is the reviewable artifact;
// re-run as often as you like until the spread looks fun rather than cruel.
// ============================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADJECTIVES, PLACES, WORMS, TOTAL_COMBINATIONS } from "../src/wex/wordlists.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "supabase", "players.seed.sql");

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i === process.argv.length - 1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const COUNT   = arg("count", 30);
const FLOOR   = arg("floor", 1_500_000);
const CEILING = arg("ceiling", 25_000_000);
const ALPHA   = arg("alpha", 1.2);

if (COUNT > TOTAL_COMBINATIONS) {
  console.error(`Only ${TOTAL_COMBINATIONS} codes exist; asked for ${COUNT}.`);
  process.exit(1);
}
if (FLOOR <= 0 || CEILING < FLOOR) {
  console.error("Need 0 < floor <= ceiling.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

// Round to two significant figures, so a card reads "2,700,000 ⌀" rather than
// "2,713,884 ⌀". Absurd numbers are only funny if they scan at a glance.
function round2sig(n) {
  if (n <= 0) return 0;
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

function paretoFortune() {
  // Inverse-transform sampling: x = floor / U^(1/alpha).
  // Math.random() can return exactly 0, which would be Infinity — reroll it.
  let u = 0;
  while (u === 0) u = Math.random();
  const raw = FLOOR / u ** (1 / ALPHA);
  return Math.min(CEILING, Math.max(FLOOR, round2sig(raw)));
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const seen = new Set();
const players = [];
while (players.length < COUNT) {
  const code = `${pick(ADJECTIVES)}-${pick(PLACES)}-${pick(WORMS)}`;
  if (seen.has(code)) continue;      // the unique index would reject it anyway
  seen.add(code);
  players.push({ code, cash: paretoFortune() });
}

players.sort((a, b) => b.cash - a.cash);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const money = (n) => n.toLocaleString("en-GB");
const total = players.reduce((sum, p) => sum + p.cash, 0);
const richest = players[0].cash;
const poorest = players[players.length - 1].cash;
const top3 = players.slice(0, 3).reduce((sum, p) => sum + p.cash, 0);
const pad = Math.max(...players.map((p) => p.code.length));

console.log(`\n  WEX roster — ${COUNT} worms, Pareto α=${ALPHA}\n`);
for (const p of players) {
  console.log(`  ${p.code.padEnd(pad)}   ${money(p.cash).padStart(12)} ⌀`);
}

console.log(`
  ─────────────────────────────────────────────────────
  Total in circulation   ${money(total)} ⌀
  Richest / poorest      ${(richest / poorest).toFixed(1)}×
  Top 3 hold             ${Math.round((top3 / total) * 100)}% of all WORMCOIN
  ─────────────────────────────────────────────────────
`);

if (richest / poorest < 3) {
  console.log("  Note: that spread is quite flat. Lower --alpha for more inequality.\n");
}

// ---------------------------------------------------------------------------
// Write the SQL
// ---------------------------------------------------------------------------
const rows = players
  .map((p) => `  ('${p.code}', ${p.cash}, ${p.cash})`)
  .join(",\n");

const sql = `-- ============================================================================
-- WEX — player roster
-- ============================================================================
-- Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} by scripts/generate-players.mjs
--   count ${COUNT} · floor ${money(FLOOR)} · ceiling ${money(CEILING)} · Pareto alpha ${ALPHA}
--
-- Top 3 hold ${Math.round((top3 / total) * 100)}% of all WORMCOIN. Richest is ${(richest / poorest).toFixed(1)}x the poorest.
--
-- EDIT FREELY before pasting into the Supabase SQL Editor — change any figure,
-- delete a row, add one. \`cash\` and \`starting_cash\` should match: the second
-- is the baseline for % return and for what "reset market" restores.
--
-- Players are created UNCLAIMED. A guest becomes one by entering the code at
-- /#trade and typing their name. Print these codes on cards and hand them out;
-- who gets which fortune is your call at the door.
--
-- Safe to re-run: existing codes are left alone.
-- ============================================================================

insert into players (code, cash, starting_cash) values
${rows}
on conflict (code) do nothing;
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, sql, "utf8");
console.log(`  Wrote supabase/players.seed.sql — review it, then paste into Supabase.\n`);
