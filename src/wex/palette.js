// ============================================================
// The seven company colours
// ============================================================
// Shared by the chart, the legend, the GM swatch picker and (later) the price
// board, so a company is the same colour everywhere it appears.
//
// The authoritative value lives in `companies.color` in the database — this
// list is the palette the GM picks FROM, plus a fallback for a company created
// before the column existed. Never derive a colour from array position at
// render time: reorder the board and every line on the chart would change
// colour, which quietly lies to anyone who had learned the old ones.
//
// These are a prefix of a validated categorical order, checked against both
// paper surfaces the app uses (#ffffff modern, #f2e8d5 classic) for lightness,
// chroma, colour-vision separation and contrast. Two results carry obligations,
// and both are met by the chart and legend as built:
//
//   * aqua (2.82:1), yellow (2.17:1) and magenta (2.69:1) fall below 3:1 on
//     white — so every line MUST carry a visible ticker label, and every swatch
//     MUST sit beside its ticker. That is not decoration; without it the
//     palette is not accessible.
//   * yellow and aqua separate by only ΔE 5.8 under tritanopia. Same mitigation.
//     If those two ever become the night's rivalry stocks, give one of them the
//     violet slot instead — it is one click in the GM panel.
//
// Up and down are NOT in this list. They are semantic, they live only in the
// numeric readouts, and they always ship with a ▲ / ▼ glyph so the colour is
// never carrying the meaning on its own.

export const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
];

/** The colour to draw a company in: its own, or a stable fallback by index. */
export function colorOf(company, index = 0) {
  return company?.color || SERIES_COLORS[index % SERIES_COLORS.length];
}
