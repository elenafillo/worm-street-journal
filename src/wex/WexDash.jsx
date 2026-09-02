import { useState, useMemo } from "react";
import { useMarketData } from "./useMarketData.js";
import PriceChart from "./PriceChart.jsx";
import { colorOf } from "./palette.js";
import { HowWexWorks } from "./HowItWorks.jsx";
import { formatWormcoin, formatPct, pctChange, WORMCOIN } from "./format.js";

// ============================================================
// #wex — the public dashboard
// ============================================================
// Projected on the wall beside the broadsheet, and equally the page a guest
// opens on their phone between trades. It scrolls: there is more here than fits
// a screen, and pretending otherwise would shrink everything to fit.
//
// Reading order is fixed and deliberate — chart, then what the economy is
// doing, then who is winning, then what just happened. Same order on a phone,
// on a narrow window and on the wall; only the number of columns changes.
//
// Everything here comes from the anon-readable tables and views. No credential,
// no write path, nothing about an individual that `leaderboard` does not
// already show.

const WINDOWS = [
  { id: "15m", label: "15 min", ms: 15 * 60 * 1000 },
  { id: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { id: "all", label: "Session", ms: null },
];

function hashParams() {
  const q = window.location.hash.includes("?")
    ? window.location.hash.split("?")[1]
    : "";
  return new URLSearchParams(q);
}

export default function WexDash() {
  const { companies, market, ticks, events, tape, board, health, stats, loaded, error } =
    useMarketData();

  const params = useMemo(() => hashParams(), []);
  const [windowId, setWindowId] = useState(() => {
    const w = params.get("window");
    return WINDOWS.some((x) => x.id === w) ? w : "1h";
  });
  const [yMode, setYMode] = useState(() => (params.get("y") === "abs" ? "abs" : "pct"));
  const [explainer, setExplainer] = useState(false);

  // `?only=ANL,MLC` pre-sets the projector to a couple of stocks without
  // anyone having to touch the laptop mid-crash.
  const [hidden, setHidden] = useState({});
  const only = params.get("only");
  const effectiveHidden = useMemo(() => {
    if (!only) return hidden;
    const keep = new Set(only.toUpperCase().split(",").map((s) => s.trim()));
    const h = { ...hidden };
    for (const c of companies) if (!keep.has(c.ticker?.toUpperCase())) h[c.id] = true;
    return h;
  }, [only, hidden, companies]);

  const windowMs = WINDOWS.find((w) => w.id === windowId)?.ms ?? null;

  const statsById = useMemo(
    () => new Map(stats.map((s) => [s.company_id, s])),
    [stats]
  );

  // ---- derived readouts ----------------------------------------------------
  const movers = useMemo(() => {
    const withChange = companies
      .map((c) => ({ c, change: pctChange(c.price, c.open_price) }))
      .filter((x) => Number.isFinite(x.change));
    if (!withChange.length) return { up: null, down: null };
    const sorted = [...withChange].sort((a, b) => b.change - a.change);
    return { up: sorted[0], down: sorted[sorted.length - 1] };
  }, [companies]);

  const invested = Number(health?.total_invested || 0);
  const cash = Number(health?.total_cash || 0);
  const wealth = invested + cash;
  const investedPct = wealth > 0 ? (invested / wealth) * 100 : 0;

  // The number generate-players.mjs prints at setup, now moving live. Computed
  // here rather than in SQL because `leaderboard` already carries every net
  // worth the page is allowed to see.
  const top3Share = useMemo(() => {
    if (!board.length) return null;
    const nets = board.map((p) => Number(p.net_worth) || 0).sort((a, b) => b - a);
    const total = nets.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    return (nets.slice(0, 3).reduce((a, b) => a + b, 0) / total) * 100;
  }, [board]);

  const byReturn = useMemo(
    () => [...board].sort((a, b) => (Number(b.pct_return) || -Infinity) - (Number(a.pct_return) || -Infinity)),
    [board]
  );

  function toggle(id) {
    setHidden((h) => ({ ...h, [id]: !h[id] }));
  }

  if (!loaded) {
    return (
      <div className="wexd-root">
        <div className="wexd-empty">Opening the exchange…</div>
      </div>
    );
  }

  return (
    <div className="wexd-root">
      {/* ---------------- Masthead ---------------- */}
      <header className="wexd-masthead">
        <div>
          <h1 className="wexd-title">Worm Stock Exchange</h1>
          <div className="wexd-sub">Wormhill · live from the floor</div>
        </div>
        <div className="wexd-masthead-right">
          <div className={`wexd-stamp ${market.is_open ? "open" : "closed"}`}>
            {market.is_open ? "● Open" : "● Closed"}
          </div>
          <button className="wexd-how-btn" onClick={() => setExplainer(true)}>
            How does WEX even work?
          </button>
        </div>
      </header>

      <HowWexWorks open={explainer} onClose={() => setExplainer(false)} />

      {error && <div className="wexd-error">{error} — showing the last figures received.</div>}

      {/* market_health always returns exactly one row once it exists, so a null
          here after a successful load means one thing only. Worth saying out
          loud rather than silently rendering six em-dashes. */}
      {!health && (
        <div className="wexd-error">
          The economy views are missing — run <strong>supabase/dashboard.sql</strong> in
          the Supabase SQL editor. The chart and standings below work without it;
          the tiles will stay blank.
        </div>
      )}

      {/* ---------------- Controls ----------------
          One row, above everything it scopes. Not inside the chart card: the
          window also frames how you read the movers and the tape below it. */}
      <div className="wexd-controls">
        <div className="wexd-segmented" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              className={`wexd-seg ${windowId === w.id ? "active" : ""}`}
              onClick={() => setWindowId(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="wexd-segmented" role="group" aria-label="Vertical axis">
          <button
            className={`wexd-seg ${yMode === "pct" ? "active" : ""}`}
            onClick={() => setYMode("pct")}
          >
            % since open
          </button>
          <button
            className={`wexd-seg ${yMode === "abs" ? "active" : ""}`}
            onClick={() => setYMode("abs")}
          >
            {WORMCOIN} price
          </button>
        </div>
      </div>

      {/* ---------------- 1. The graph ---------------- */}
      <section className="wexd-card">
        <PriceChart
          companies={companies}
          ticks={ticks}
          events={events}
          windowMs={windowMs}
          yMode={yMode}
          hidden={effectiveHidden}
          onToggleSeries={toggle}
          height={360}
        />

        {/* The legend, the table view and the series toggle in one. It is here
            rather than in its own section because it belongs to the chart: it
            is what stops identity being carried by colour alone. */}
        <div className="wexd-legend">
          {companies.map((c, i) => {
            const change = pctChange(c.price, c.open_price);
            const st = statsById.get(c.id);
            const off = effectiveHidden[c.id];
            return (
              <button
                key={c.id}
                className={`wexd-legend-item ${off ? "off" : ""} ${c.is_halted ? "halted" : ""}`}
                onClick={() => toggle(c.id)}
                aria-pressed={!off}
              >
                <span className="wexd-swatch" style={{ background: colorOf(c, i) }} />
                <span className="wexd-legend-body">
                  <span className="wexd-legend-top">
                    <span className="wexd-legend-ticker">{c.ticker}</span>
                    <span className="wexd-legend-price">{formatWormcoin(c.price)}</span>
                  </span>
                  <span className="wexd-legend-bottom">
                    <span className="wexd-legend-name">{c.name}</span>
                    <span className={`wexd-delta ${change > 0 ? "up" : change < 0 ? "down" : ""}`}>
                      {c.is_halted ? "HALTED" : `${change > 0 ? "▲" : change < 0 ? "▼" : "—"} ${formatPct(change)}`}
                    </span>
                  </span>
                  {st && (
                    <span className="wexd-legend-meta">
                      {st.holders} {Number(st.holders) === 1 ? "holder" : "holders"} ·{" "}
                      {st.trade_count} {Number(st.trade_count) === 1 ? "trade" : "trades"}
                      {c.ceo_name ? ` · ${c.ceo_name}` : ""}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------- 2. The stat tiles ---------------- */}
      <h2 className="wexd-section">The state of the economy</h2>
      <div className="wexd-tiles">
        {/* The most useful number on the page. Fully invested and a crash will
            bite; everyone in cash and an event barely registers. */}
        <div className="wexd-tile wide">
          <div className="wexd-tile-label">Invested vs cash</div>
          <div className="wexd-tile-value">{investedPct.toFixed(0)}%</div>
          <div className="wexd-meter">
            <span className="wexd-meter-fill" style={{ width: `${investedPct}%` }} />
            <span className="wexd-meter-rest" />
          </div>
          <div className="wexd-tile-foot">
            {formatWormcoin(invested, { symbol: true })} in stock ·{" "}
            {formatWormcoin(cash, { symbol: true })} in hand
          </div>
        </div>

        <div className="wexd-tile">
          <div className="wexd-tile-label">Top 3 worms hold</div>
          <div className="wexd-tile-value">
            {top3Share === null ? "—" : `${top3Share.toFixed(0)}%`}
          </div>
          <div className="wexd-tile-foot">of all WORMCOIN</div>
        </div>

        <div className="wexd-tile">
          <div className="wexd-tile-label">Biggest riser</div>
          <div className="wexd-tile-value up">
            {movers.up ? `▲ ${movers.up.c.ticker}` : "—"}
          </div>
          <div className="wexd-tile-foot">
            {movers.up ? formatPct(movers.up.change) : "nothing has moved"}
          </div>
        </div>

        <div className="wexd-tile">
          <div className="wexd-tile-label">Biggest faller</div>
          <div className="wexd-tile-value down">
            {movers.down ? `▼ ${movers.down.c.ticker}` : "—"}
          </div>
          <div className="wexd-tile-foot">
            {movers.down ? formatPct(movers.down.change) : "nothing has moved"}
          </div>
        </div>

        <div className="wexd-tile">
          <div className="wexd-tile-label">Trades</div>
          <div className="wexd-tile-value">{health?.trade_count ?? "—"}</div>
          <div className="wexd-tile-foot">
            {health?.trades_recent ? `${health.trades_recent} in the last 5 min` : "quiet floor"}
          </div>
        </div>

        <div className="wexd-tile">
          <div className="wexd-tile-label">Worms trading</div>
          <div className="wexd-tile-value">
            {health ? `${health.players_in}` : "—"}
            {health && <span className="wexd-of"> / {health.players_total}</span>}
          </div>
          <div className="wexd-tile-foot">accounts claimed</div>
        </div>
      </div>

      {/* ---------------- 3. The leaderboards ---------------- */}
      <h2 className="wexd-section">Standings</h2>
      <div className="wexd-boards">
        <div className="wexd-card">
          <div className="wexd-board-title">Richest worms</div>
          <Standings
            rows={board.slice(0, 8)}
            value={(p) => formatWormcoin(p.net_worth, { symbol: true })}
          />
        </div>
        <div className="wexd-card">
          <div className="wexd-board-title">Best return</div>
          <Standings
            rows={byReturn.slice(0, 8)}
            value={(p) => formatPct(p.pct_return)}
            valueClass={(p) => (Number(p.pct_return) > 0 ? "up" : Number(p.pct_return) < 0 ? "down" : "")}
          />
        </div>
      </div>

      {/* ---------------- 4. The tape ---------------- */}
      <h2 className="wexd-section">The tape</h2>
      <div className="wexd-card">
        {tape.length === 0 && <div className="wexd-empty">No trades yet.</div>}
        <ul className="wexd-tape">
          {tape.slice(0, 14).map((t) => (
            <li key={t.id}>
              <span className="wexd-tape-time">
                {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="wexd-tape-who">{t.display_name || "A worm"}</span>
              <span className={`wexd-tape-side ${t.side}`}>
                {t.side === "buy" ? "bought" : "sold"}
              </span>
              <span className="wexd-tape-what">
                {t.shares} {t.ticker}
              </span>
              <span className="wexd-tape-price">
                @ {formatWormcoin(t.exec_price, { symbol: true })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="wexd-foot">
        Figures refresh every few seconds. Prices move only when worms trade —
        or when the Worm Fed intervenes.
      </div>
    </div>
  );
}

function Standings({ rows, value, valueClass }) {
  if (!rows.length) return <div className="wexd-empty">Nobody has claimed a fortune yet.</div>;
  return (
    <ol className="wexd-standings">
      {rows.map((p, i) => (
        <li key={p.id}>
          <span className="wexd-rank">{i + 1}</span>
          <span className="wexd-who">{p.display_name || "—"}</span>
          <span className={`wexd-amount ${valueClass ? valueClass(p) : ""}`}>{value(p)}</span>
        </li>
      ))}
    </ol>
  );
}
