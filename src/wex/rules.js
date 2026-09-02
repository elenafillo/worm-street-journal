// ============================================================
// Explaining the exchange — the copy
// ============================================================
// Two different jobs, deliberately kept apart.
//
// TRADE_RULES is a how-to: which button, what the number at the top means, how
// to find out what an order will cost. It is what a guest reads on their own
// phone with a drink in the other hand, so it describes the screen in front of
// them rather than explaining economics at them.
//
// MARKET_RULES is the why: no counterparty, the price moved because YOU moved
// it, a round trip loses money by design. Nobody works that out from a Buy
// button, and a guest who thinks they were cheated stops playing — but it
// belongs on the wall, where there is room, not in the way of a trade.
//
// One place for the words, three placements (see HowItWorks.jsx): the gate,
// before login, while they are holding a card and deciding whether to bother;
// the trade desk, folded away, for the mid-party "wait, why did that happen";
// and the public dashboard, in full, for whoever is standing at the wall.
//
// Kept together so the three cannot drift apart — and so retuning `liquidity`
// at the dry run means rewriting one sentence, in one file.
//
// No numbers in this copy on purpose. Every dial worth quoting lives in the
// database and can be changed at the party (see WEX_plan.md §6), so a rule that
// said "one trade can move a stock 25%" would be a lie by 10pm.

/**
 * How to actually use the thing. Ordered to match the screen top to bottom —
 * log in, read the big number, open a company, trade it — so someone following
 * along on their phone can find each part as they are told about it. The gate
 * shows the first three.
 */
export const TRADE_RULES = [
  {
    title: "Your three words are your account",
    body: "Anyone holding them is you. Don't read them out across a loud room.",
  },
  {
    title: "Your net worth is cash plus shares",
    body: "The big number at the top is whatever WORMCOIN you are holding, plus what your shares are worth right now. It moves when prices move, even while you sit perfectly still.",
  },
  {
    title: "Tap a company to trade it",
    body: "The row opens up. Set how many shares with the − and + buttons, or type a number straight in, then hit Buy or Sell.",
  },
  {
    title: "The screen does the sums for you",
    body: "Max buy fills in the most you can currently afford. All held fills in everything you own of that company, and each row shows what you are holding. Before you commit, the panel tells you roughly what the order will cost and where it will leave the price.",
  },
  {
    title: "You are the market",
    body: "There is nobody on the other side of your trade. Buying pushes the price up; selling pushes it down. Everyone watching the wall sees it happen.",
  },
];

/** The rest of it, for anyone standing in front of the wall. */
export const MARKET_RULES = [
  {
    // Moved off the trade screen, which needed to be about which buttons to
    // press — but kept here, because a guest who buys and sells straight back,
    // ends up down, and is never told why concludes they were cheated.
    title: "You pay the middle, and a round trip costs you",
    body: "An order fills at the average of the price before and after it, so splitting a big buy into ten small ones costs exactly the same. It also means buying and selling straight back leaves you slightly down. That gap is the exchange taking its cut in mulch.",
  },
  {
    title: "Thin companies move further",
    body: "Every company has a depth. The same order shifts a shallow one much further than a deep one, so the small caps are where the drama is.",
  },
  {
    title: "No single trade can break the market",
    body: "One order may only move a company so far. To crash something properly you need friends, or the Worm Fed.",
  },
  {
    title: "The Worm Fed intervenes",
    body: "It can spike a company, crash the whole economy, halt trading, or simply mark the timeline when something happens in the room. Those are the numbered lines on the chart.",
  },
  {
    title: "Two leaderboards, on purpose",
    body: "Richest worms is the satire. Best return is the game — it is measured against the fortune you were handed at the door, so the poorest worm in the room can still win.",
  },
  {
    title: "The fortunes were never fair",
    body: "Starting money was drawn from the same shape real wealth follows: a couple of obscene piles, a middle, and a long poor tail. That is the joke. Sorry.",
  },
  {
    title: "You cannot sell what you do not own",
    body: "No short selling on this exchange. The worms are not ready.",
  },
];

/**
 * Shown only while `market_state.drift_enabled` is true.
 *
 * Conditional because it is the one rule that can become a lie: drift is off by
 * default and the Worm Fed can becalm the market at any point in the evening. A
 * printed rule saying prices move on their own, on a night they don't, is worse
 * than no rule — so it is toggled by the same flag that governs the behaviour.
 */
export const DRIFT_RULE = {
  title: "The market moves on its own",
  body: "Prices drift every few minutes whether or not anyone trades, by an amount nobody chooses. Your holdings gain and lose while you stand at the bar. Halted companies sit it out, and nothing drifts once the bell has closed the exchange.",
};

/** Reading the chart — only shown on the wall, where the chart is. */
export const CHART_NOTES = [
  ["Each line is a company",
   "Its colour is fixed, so it stays the same line all night. Tap one in the list below to have it to itself."],
  ["The steps are real",
   "Prices only change when someone trades, so the line steps rather than curves. Nothing is smoothed."],
  ["Numbered rules are events",
   "Whatever the Worm Fed did, listed underneath with the time it happened."],
  ["Shaded bands are dead air",
   "Quiet stretches are squeezed so the busy parts get the room. The band says how much time it swallowed."],
];
