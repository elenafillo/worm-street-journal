import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { wex, storedCode, rememberCode, forgetCode } from "./wexApi.js";
import { usePrices, useTicks } from "./useMarketData.js";
import { HowToTrade } from "./HowItWorks.jsx";
import PortfolioChart from "./PortfolioChart.jsx";
import { buildFortune } from "./portfolioSeries.js";
import { CHART_WINDOWS, resolveWindow, windowStart } from "./chartSeries.js";
import {
  formatWormcoin, formatPct, signedWormcoin, pctChange, previewTrade,
  maxAffordableShares, WORMCOIN,
} from "./format.js";

// This screen polls TWO things at very different rates, and the split is the
// whole reason it scales past a couple of dozen guests.
//
//   Prices and the bell — read straight from PostgREST with the anon key, like
//   the wall does. They change every time anyone trades, so they need to be
//   fresh. They cost nothing but a Supabase read.
//
//   Cash and holdings — only reachable through /api/wex, because `players` and
//   `holdings` are RLS-denied to anon and must stay that way. Every one of
//   those calls is a Vercel serverless invocation. But they only change when
//   THIS guest trades — and the trade response already carries the new figures —
//   or when the Worm Fed intervenes. So a slow poll is enough, plus an
//   immediate refresh when the bell rings (which also catches a reset).
//
// Before the split, a phone made ~12 invocations a minute. It now makes ~1.3.
// Eighty phones over a three-day party is the difference between 1.7 million
// invocations and something a Hobby plan does not notice.
const PRICE_POLL_MS = 5000;
const PORTFOLIO_POLL_MS = 45000;
// The tick history behind the fortune charts. Slower than prices on purpose:
// these rows are the past, and the right edge of every line is drawn from the
// live prices above. Nothing is fetched at all until the panel is open.
const TICK_POLL_MS = 15000;

const FORTUNE_KEY = "wex_fortune_open";

function storedFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;      // private browsing; the panel just starts open
  }
}

// ============================================================
// The three-word gate
// ============================================================
function Gate({ onIn }) {
  const [words, setWords] = useState(["", "", ""]);
  const [needsName, setNeedsName] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = [useRef(null), useRef(null), useRef(null)];

  const code = words.map((w) => w.trim()).filter(Boolean).join("-");

  // Accept a whole code pasted into any box, however it is punctuated.
  function setWord(i, raw) {
    const parts = raw.split(/[\s\-_.,]+/).filter(Boolean);
    if (parts.length > 1) {
      const next = [...words];
      parts.slice(0, 3).forEach((p, k) => { if (i + k < 3) next[i + k] = p.toLowerCase(); });
      setWords(next);
      refs[Math.min(i + parts.length, 2)].current?.focus();
      return;
    }
    const next = [...words];
    next[i] = raw.toLowerCase();
    setWords(next);
  }

  async function submit() {
    if (busy) return;
    setError("");
    if (words.some((w) => !w.trim())) {
      setError("All three words, please.");
      return;
    }
    setBusy(true);
    try {
      const { status, data } = needsName
        ? await wex("claim", { code, display_name: name })
        : await wex("login", { code });

      if (status === 403) {
        setError("Those are not your words, worm. Check the spelling.");
        return;
      }
      if (data.needs_claim) {
        setNeedsName(true);
        return;
      }
      if (!data.player) {
        setError(data.error || "The exchange is not answering.");
        return;
      }
      rememberCode(code);
      onIn(code, data);
    } catch {
      setError("No signal. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wex-gate">
      <div className="wex-gate-title">Worm Stock<br />Exchange</div>
      <div className="wex-gate-sub">Members Only</div>

      {needsName ? (
        <>
          <input
            className="wex-word-input"
            placeholder="Your name"
            value={name}
            maxLength={40}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <div className="wex-gate-hint">
            This is how you will appear on the exchange floor.
          </div>
        </>
      ) : (
        <>
          <div className="wex-words">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                ref={refs[i]}
                className="wex-word-input"
                placeholder={["first", "second", "third"][i]}
                value={words[i]}
                autoFocus={i === 0}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setWord(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  // Space moves on rather than typing a space into a word.
                  if (e.key === " ") { e.preventDefault(); refs[Math.min(i + 1, 2)].current?.focus(); }
                }}
              />
            ))}
          </div>
          <div className="wex-gate-hint">The three words on your card.</div>
        </>
      )}

      <div className="wex-actions" style={{ gridTemplateColumns: "1fr", marginTop: 14 }}>
        <button className="wex-btn buy" onClick={submit} disabled={busy}>
          {busy ? "…" : needsName ? "Join the exchange" : "Enter"}
        </button>
      </div>

      {error && <div className="wex-error">{error}</div>}

      {/* Only before the name prompt. Someone who has already typed their words
          is one tap from being in — do not put a wall of text in front of them. */}
      {!needsName && (
        <div className="wex-how">
          <div className="wex-how-heading">How to trade</div>
          <HowToTrade limit={3} />
          <div className="wex-gate-hint">The rest is on the exchange floor.</div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// One company row, expanding into its trade panel
// ============================================================
function CompanyRow({ co, open, onToggle, marketOpen, cash, maxImpact, onTrade, busy }) {
  const [qty, setQty] = useState(1);
  const change = pctChange(co.price, co.open_price);
  const dir = change > 0 ? "up" : change < 0 ? "down" : "";

  const maxAffordable = maxAffordableShares({
    cash, price: co.price, liquidity: co.liquidity, maxImpact,
  });
  const preview = previewTrade({
    price: co.price, liquidity: co.liquidity, shares: qty, side: "buy",
  });
  const canBuy = marketOpen && !co.is_halted && preview && preview.total <= cash;
  const canSell = marketOpen && !co.is_halted && qty <= co.shares;

  return (
    <div className={`wex-co ${co.is_halted ? "halted" : ""}`}>
      <div
        className="wex-co-head"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
      >
        <div>
          <div className="wex-co-ticker">{co.ticker}</div>
          <div className="wex-co-name">{co.name}</div>
          {co.ceo_name && <div className="wex-co-ceo">Led by {co.ceo_name}</div>}
          {co.shares > 0 && (
            <div className="wex-co-held">
              {co.shares} {co.shares === 1 ? "share" : "shares"} · {formatWormcoin(co.value, { symbol: true })}
            </div>
          )}
        </div>
        <div className="wex-co-right">
          <div className="wex-co-price">{formatWormcoin(co.price)}</div>
          <div className={`wex-co-change ${dir}`}>
            {co.is_halted ? "HALTED" : formatPct(change)}
          </div>
        </div>
      </div>

      {open && (
        <div className="wex-trade">
          <div className="wex-qty">
            <button
              className="wex-qty-btn"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="One fewer"
            >−</button>
            <input
              className="wex-qty-val"
              type="number"
              inputMode="numeric"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
            <button
              className="wex-qty-btn"
              onClick={() => setQty((q) => q + 1)}
              aria-label="One more"
            >+</button>
          </div>

          <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
            <button className="wex-max" onClick={() => setQty(Math.max(1, maxAffordable))}>
              Max buy ({maxAffordable})
            </button>
            {co.shares > 0 && (
              <button className="wex-max" onClick={() => setQty(co.shares)}>
                All {co.shares} held
              </button>
            )}
          </div>

          {preview && (
            <div className="wex-preview">
              Buying {qty} costs about <strong>{formatWormcoin(preview.total, { symbol: true })}</strong>
              {" "}and lifts {co.ticker} to <strong>{formatWormcoin(preview.priceAfter)}</strong>.
              <br />
              Selling {qty} pushes it down instead. The exchange takes its cut in mulch.
            </div>
          )}

          <div className="wex-actions">
            <button
              className="wex-btn buy"
              disabled={!canBuy || busy}
              onClick={() => onTrade(co, "buy", qty)}
            >
              {busy ? "…" : "Buy"}
            </button>
            <button
              className="wex-btn sell"
              disabled={!canSell || busy}
              onClick={() => onTrade(co, "sell", qty)}
            >
              {busy ? "…" : "Sell"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Your fortune over time
// ============================================================
// Two charts from one replay of the ledger — see portfolioSeries.js for why
// there is no table behind this and does not need to be.
//
// Folded by a disclosure rather than always open, and the choice is remembered.
// This screen is a trading desk first: someone who came to buy should not have
// to scroll past four hundred pixels of their own history to reach the Buy
// button, and someone who came to gloat should not have to unfold it every time
// their phone locks.
//
// Nothing is fetched at all while it is folded. useTicks does not run.
function Fortune({ player, holdings, trades, companies, openedAt, open, onToggle }) {
  const [windowId, setWindowId] = useState("session");
  const { ticks, loaded } = useTicks(open, TICK_POLL_MS);

  // The right edge is "now" and keeps moving between polls. State rather than a
  // Date.now() read during render, for the same reason as in PriceChart: the
  // same props must draw the same chart. Stopped while folded and while hidden.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setNow(Date.now());
    }, 3000);
    return () => clearInterval(id);
  }, [open]);

  const { windowMs, startAt } = resolveWindow(windowId, openedAt);

  const fortune = useMemo(() => {
    if (!open || !ticks.length) return null;
    const t0 = windowStart({ windowMs, startAt, earliest: ticks[0].t, now });
    return buildFortune({
      trades, ticks, companies,
      cashNow: player.cash,
      holdingsNow: holdings,
      startingCash: player.starting_cash,
      t0, t1: now,
    });
  }, [open, ticks, trades, companies, holdings,
      player.cash, player.starting_cash, windowMs, startAt, now]);

  const dir = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");

  return (
    <section className="wexf">
      <button className="wexf-toggle" onClick={onToggle} aria-expanded={open}>
        <span>Your fortune over time</span>
        <span className="wexf-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <>
          <div className="wexf-windows" role="group" aria-label="Time window">
            {CHART_WINDOWS.map((w) => (
              <button
                key={w.id}
                className={`wexf-seg ${windowId === w.id ? "active" : ""}`}
                onClick={() => setWindowId(w.id)}
              >
                {w.label}
              </button>
            ))}
          </div>

          {!fortune ? (
            <div className="wexf-empty">
              {loaded ? "No prices on record yet." : "Reading the ledger…"}
            </div>
          ) : (
            <>
              <div className="wexf-block">
                <div className="wexf-head">
                  <span className="wexf-label">Net worth</span>
                  <span className={`wexf-figure ${dir(fortune.change)}`}>
                    {signedWormcoin(fortune.change)}
                    {fortune.changePct !== null && (
                      <span className="wexf-figure-pct">{formatPct(fortune.changePct)}</span>
                    )}
                  </span>
                </div>
                <PortfolioChart
                  mode="wealth"
                  pick={(s) => s.wealth}
                  samples={fortune.samples}
                  t0={fortune.open.t}
                  t1={fortune.close.t}
                  baseline={fortune.startingCash}
                  baselineLabel="started with"
                />
              </div>

              <div className="wexf-block">
                <div className="wexf-head">
                  <span className="wexf-label">Profit &amp; loss</span>
                  <span className={`wexf-figure ${dir(fortune.close.pnl)}`}>
                    {signedWormcoin(fortune.close.pnl)}
                  </span>
                </div>
                <PortfolioChart
                  mode="bars"
                  pick={(s) => s.pnl}
                  samples={fortune.samples}
                  t0={fortune.open.t}
                  t1={fortune.close.t}
                />
                <div className="wexf-caption">
                  Green is a slice of the window you made money in, red one you lost
                  it in. They add up to {signedWormcoin(fortune.change)} across this
                  window; the figure above is your profit since the start.
                </div>

                {/* The reason this is a second chart and not the first one
                    shifted down. Total P&L is exactly net worth minus what you
                    started with; the split is the part you cannot read off the
                    line above. */}
                <div className="wexf-split">
                  <div className="wexf-split-cell">
                    <span className="wexf-split-label">Banked</span>
                    <span className={`wexf-split-value ${dir(fortune.close.realised)}`}>
                      {signedWormcoin(fortune.close.realised)}
                    </span>
                    <span className="wexf-split-note">profit you have sold for</span>
                  </div>
                  <div className="wexf-split-cell">
                    <span className="wexf-split-label">On paper</span>
                    <span className={`wexf-split-value ${dir(fortune.close.unrealised)}`}>
                      {signedWormcoin(fortune.close.unrealised)}
                    </span>
                    <span className="wexf-split-note">still riding on what you hold</span>
                  </div>
                </div>

                {/* Only reachable if the Worm Fed has adjusted this player's
                    cash by hand, or the ledger came back capped. The net worth
                    line above is unaffected either way — say which is which
                    rather than quietly showing a number that does not add up. */}
                {!fortune.exact && (
                  <div className="wexf-note">
                    The books do not quite balance — someone has had a hand in your
                    fortune outside the market. Net worth is right; the split
                    between banked and paper profit is a best guess.
                  </div>
                )}
              </div>

              <div className="wexf-foot">
                Rebuilt from your own trades and every price the market has shown.
                Quiet stretches are squeezed, so an overnight hold does not eat the chart.
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

// ============================================================
// Dashboard
// ============================================================
export default function WexTrade() {
  const [code, setCode] = useState(storedCode);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(Boolean(storedCode()));
  const [fortuneOpen, setFortuneOpen] = useState(() => storedFlag(FORTUNE_KEY, true));

  function toggleFortune() {
    setFortuneOpen((was) => {
      const next = !was;
      try { localStorage.setItem(FORTUNE_KEY, next ? "1" : "0"); } catch { /* not fatal */ }
      return next;
    });
  }

  const refresh = useCallback(async (theCode) => {
    const { status, data: d } = await wex("portfolio", { code: theCode });
    if (status === 403 || d.needs_claim) {
      // The code was regenerated, or the roster was reloaded under us.
      forgetCode();
      setCode("");
      setData(null);
      return;
    }
    if (d.player) setData(d);
  }, []);

  // Resume a session from localStorage on load. `checking` already starts
  // false when there is no stored code, so there is nothing to do in that case.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      await refresh(code);
      if (!cancelled) setChecking(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prices, straight from Supabase. No serverless function in the path.
  const { companies: livePrices, market: liveMarket, loaded: pricesLoaded } =
    usePrices(PRICE_POLL_MS);

  // The slow poll: cash and holdings only. A pocketed phone stops entirely.
  useEffect(() => {
    if (!code || !data) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh(code);
    }, PORTFOLIO_POLL_MS);
    return () => clearInterval(id);
  }, [code, data, refresh]);

  // The bell ringing is the one moment a stale portfolio is actually visible:
  // `wex_reset_market` closes the market AND restores everyone's cash, so
  // without this a guest would see their old holdings against reset prices for
  // up to a full poll. Cheap — it fires a handful of times a night, not on a timer.
  const lastOpen = useRef(null);
  useEffect(() => {
    const isOpen = liveMarket?.is_open;
    if (!code || !data || isOpen === undefined) return;
    if (lastOpen.current !== null && lastOpen.current !== isOpen) refresh(code);
    lastOpen.current = isOpen;
  }, [liveMarket?.is_open, code, data, refresh]);

  /**
   * Live prices merged with the guest's own holdings.
   *
   * Net worth is added up here rather than on the server, which looks like it
   * breaks the "never compute on the client" rule but does not: every input —
   * cash, share counts, prices — still comes from the server, and nothing
   * authoritative reads this number. It exists because the server's copy would
   * be up to 45 seconds stale now that prices arrive on their own schedule, and
   * a net worth that ignores the last three trades is worse than one added up
   * locally. The leaderboard on #wex, which decides who actually wins, is still
   * computed in SQL.
   */
  const view = useMemo(() => {
    if (!data) return null;
    const held = new Map((data.holdings || []).map((h) => [h.company_id, h.shares]));

    // Fall back to the payload the API handed back at login, so the first paint
    // after the gate has figures even before the first Supabase read lands.
    const source = pricesLoaded && livePrices.length ? livePrices : (data.companies || []);
    const market = pricesLoaded && liveMarket && "is_open" in liveMarket
      ? liveMarket
      : data.market;

    const companies = source.map((c) => {
      const shares = held.get(c.id) || 0;
      return { ...c, shares, value: shares * Number(c.price) };
    });

    const cash = Number(data.player.cash);
    const netWorth = companies.reduce((sum, c) => sum + c.value, cash);
    const start = Number(data.player.starting_cash);

    return {
      companies,
      market,
      player: {
        ...data.player,
        net_worth: netWorth,
        pct_return: start > 0 ? Math.round((netWorth / start - 1) * 1000) / 10 : null,
      },
    };
  }, [data, livePrices, liveMarket, pricesLoaded]);

  // The ledger, with `created_at` turned into the millisecond stamp every chart
  // works in. Kept out of the `view` memo above because it does not depend on
  // prices and so has no reason to be rebuilt every five seconds.
  const trades = useMemo(
    () => (data?.trades || []).map((tr) => ({ ...tr, t: new Date(tr.created_at).getTime() })),
    [data]
  );

  async function handleTrade(co, side, shares) {
    if (busy) return;               // party wifi is flaky; double-taps are the likeliest bug
    setBusy(true);
    setToast(null);
    try {
      const { status, data: d } = await wex("trade", {
        code, side, shares, company_id: co.id,
      });
      if (status === 403) { forgetCode(); setCode(""); setData(null); return; }

      if (d.ok) {
        const t = d.trade;
        setToast({
          good: true,
          text: `${side === "buy" ? "Bought" : "Sold"} ${t.shares} ${co.ticker} at `
              + `${formatWormcoin(t.exec_price, { symbol: true })} — `
              + `${formatWormcoin(t.total, { symbol: true })} total. `
              + `${co.ticker} is now ${formatWormcoin(t.price_after)}.`,
        });
        setData({
          player: d.player, holdings: d.holdings,
          companies: d.companies, market: d.market,
          trades: d.trades, ceo_of: d.ceo_of,
        });
      } else {
        setToast({ good: false, text: d.error || "The trade did not go through." });
      }
    } catch {
      setToast({ good: false, text: "No signal — the trade may not have gone through. Check your holdings." });
    } finally {
      setBusy(false);
    }
  }

  function logOut() {
    forgetCode();
    setCode("");
    setData(null);
    setToast(null);
  }

  if (checking) {
    return <div className="wex-root"><div className="wex-gate-sub">Checking your papers…</div></div>;
  }

  if (!code || !data || !view) {
    return (
      <div className="wex-root">
        <Gate onIn={(c, d) => { setCode(c); setData(d); }} />
      </div>
    );
  }

  const { player, companies, market } = view;
  const rdir = player.pct_return > 0 ? "up" : player.pct_return < 0 ? "down" : "";

  return (
    <div className="wex-root">
      <div className="wex-header">
        <div className="wex-brand">
          <span>Worm Stock Exchange</span>
          <span className="wex-name">{player.display_name}</span>
        </div>
        <div className="wex-networth-label">Net worth</div>
        <div className="wex-networth">
          <span>{formatWormcoin(player.net_worth)} {WORMCOIN}</span>
          <span className={`wex-return ${rdir}`}>{formatPct(player.pct_return)}</span>
        </div>
        <div className="wex-cash">
          {formatWormcoin(player.cash, { symbol: true })} in cash ·
          {" "}started with {formatWormcoin(player.starting_cash, { symbol: true })}
        </div>
      </div>

      {!market.is_open && (
        <div className="wex-status">The exchange is closed. No trading until the bell.</div>
      )}

      {toast && (
        <div className={`wex-toast ${toast.good ? "good" : "bad"}`}>{toast.text}</div>
      )}

      <Fortune
        player={player}
        holdings={data.holdings || []}
        trades={trades}
        companies={companies}
        openedAt={market.opened_at}
        open={fortuneOpen}
        onToggle={toggleFortune}
      />

      {/* Only a CEO gets this. The server says which company (`ceo_of`);
          it is null for everyone else. */}
      {data.ceo_of && (
        <div className="wex-ceo">
          <div className="wex-ceo-label">Chief Executive of</div>
          <div className="wex-ceo-co">
            <b>{data.ceo_of.ticker}</b> · {data.ceo_of.name}
          </div>
          <a className="wex-link" href="#submit">File a press release →</a>
        </div>
      )}

      <div className="wex-section-label">The Listings</div>
      {companies.map((co) => (
        <CompanyRow
          key={co.id}
          co={co}
          open={openId === co.id}
          onToggle={() => setOpenId(openId === co.id ? null : co.id)}
          marketOpen={market.is_open}
          cash={player.cash}
          maxImpact={market.max_impact ?? 0.25}
          onTrade={handleTrade}
          busy={busy}
        />
      ))}

      {/* Folded shut by default. The desk is for trading; this is for the
          moment someone wonders why a round trip cost them money. */}
      <details className="wex-how wex-how-details">
        <summary className="wex-how-heading">How to trade</summary>
        <HowToTrade />
      </details>

      <div className="wex-foot">
        <span>Prices move when worms trade</span>
        <button className="wex-link" onClick={logOut}>Not you?</button>
      </div>
    </div>
  );
}
