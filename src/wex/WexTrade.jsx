import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { wex, storedCode, rememberCode, forgetCode } from "./wexApi.js";
import { usePrices } from "./useMarketData.js";
import {
  formatWormcoin, formatPct, pctChange, previewTrade, maxAffordableShares, WORMCOIN,
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
// Dashboard
// ============================================================
export default function WexTrade() {
  const [code, setCode] = useState(storedCode);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(Boolean(storedCode()));

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

      <div className="wex-foot">
        <span>Prices move when worms trade</span>
        <button className="wex-link" onClick={logOut}>Not you?</button>
      </div>
    </div>
  );
}
