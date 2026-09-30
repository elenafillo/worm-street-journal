import { useState, useEffect, useCallback } from "react";
import { formatWormcoin, formatPct, pctChange } from "./format.js";
import { SERIES_COLORS } from "./palette.js";
import { eventMoves } from "./tickerFeed.js";

// The Worm Fed's exchange controls. Rendered inside the existing GM panel,
// behind the same password — but on its own screen, never interleaved with the
// newsroom. Moving money and moderating articles should not share a tab row.

async function gm(password, action, params = {}) {
  const res = await fetch("/api/wexgm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, action, ...params }),
  });
  let data;
  try { data = await res.json(); } catch { data = { error: "Unreadable reply." }; }
  return { status: res.status, data };
}

// ============================================================
// Exchange — the controls you actually use during the party
// ============================================================
/** " · SLM −15%, CMP −5%" · " · +10% · market-wide" · " · ANL marker" */
function describeEvent(e, tickerOf) {
  const moves = eventMoves(e);
  if (moves.every((m) => m.pct === null)) {
    return ` · ${e.company_id ? `${tickerOf(e.company_id)} ` : ""}marker`;
  }
  const signed = (p) => `${p > 0 ? "+" : ""}${p}%`;
  if (moves.length === 1 && !moves[0].company_id) return ` · ${signed(moves[0].pct)} · market-wide`;
  return ` · ${moves.map((m) => `${tickerOf(m.company_id)} ${signed(m.pct)}`).join(", ")}`;
}

// The most companies one event may move: what fits on the wall screens'
// headline windows and tape rows. The database enforces the same number.
const MAX_EVENT_COMPANIES = 4;

const newRow = () => ({ company_id: "", pct: "-10" });

function ExchangeTab({ password, overview, reload, say }) {
  const [headline, setHeadline] = useState("");
  // An event hits the whole market by one percentage, or one to four named
  // companies by a percentage each: "DROUGHT THREATENS SLIME-BASED
  // TECHNOLOGIES" — SLM −15%, CMP −5%, everyone else untouched.
  const [scope, setScope] = useState("market");    // "market" | "companies"
  const [pct, setPct] = useState("-10");           // the market-wide move
  const [rows, setRows] = useState([newRow()]);    // the per-company moves
  const [activeRow, setActiveRow] = useState(0);   // where the quick hits land
  const [broadcast, setBroadcast] = useState(true);
  const [marker, setMarker] = useState("");
  const [busy, setBusy] = useState(false);
  // A held story loaded into the event form: firing then publishes it in the
  // same transaction as the move. Kept as an id and looked up in the live
  // list, so a story settled from another tab simply drops out of the form.
  const [attachedId, setAttachedId] = useState(null);

  const market = overview?.market || {};
  const companies = overview?.companies || [];
  const held = overview?.held || [];
  const attached = held.find((s) => s.id === attachedId) || null;

  /** Resolves true when the exchange accepted the action. */
  async function act(action, params, confirmText) {
    if (confirmText && !confirm(confirmText)) return false;
    setBusy(true);
    const { status, data } = await gm(password, action, params);
    setBusy(false);

    // The HTTP status has to be part of this. A 500 carries { error } with no
    // `ok` key at all, so testing `data.ok === false` alone treated every
    // server failure as a success and cheerfully said "Done." — which is how a
    // missing database column looked exactly like a working save.
    const failed = status >= 400 || data?.ok === false;
    say(
      failed ? (data?.error || `The exchange refused that (${status}).`) : (data?.note || "Done."),
      !failed
    );
    reload();
    return !failed;
  }

  // "Load into event": the story's headline in the form, and for a press
  // release, the CEO's company already in the first row.
  function loadStory(s) {
    setAttachedId(s.id);
    setHeadline(s.headline || "");
    if (s.press_company_id) {
      setScope("companies");
      setRows([{ ...newRow(), company_id: s.press_company_id }]);
      setActiveRow(0);
    }
  }

  const setRow =(i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    setRows((rs) => (rs.length < MAX_EVENT_COMPANIES ? [...rs, newRow()] : rs));
    setActiveRow(rows.length);
  };
  const dropRow = (i) => {
    setRows((rs) => rs.filter((_, k) => k !== i));
    setActiveRow(0);
  };

  // What the event would do to each named company, for the preview and the
  // button. Mirrors the SQL: floored at min_price.
  const tickerOf = (id) => companies.find((c) => c.id === id)?.ticker || "?";
  const moves = rows
    .filter((r) => r.company_id && r.pct !== "" && Number.isFinite(Number(r.pct)))
    .map((r) => {
      const c = companies.find((x) => x.id === r.company_id);
      const p = Number(r.pct);
      const after = Math.max(Number(market.min_price) || 0, Number(c?.price) * (1 + p / 100));
      return { company_id: r.company_id, pct: p, ticker: c?.ticker || "?", before: Number(c?.price), after };
    });
  const signed = (p) => `${p > 0 ? "+" : ""}${p}%`;

  async function fire() {
    if (!headline.trim()) { say("An event needs a headline.", false); return; }
    const article_id = attached?.id || null;
    let ok;
    if (scope === "market") {
      ok = await act("fire_event", {
        company_id: null,
        headline: headline.trim(),
        pct_change: Number(pct),
        broadcast_wsj: broadcast,
        article_id,
      });
    } else {
      if (rows.some((r) => !r.company_id)) { say("Pick a company in every row, or remove the empty one.", false); return; }
      if (moves.length !== rows.length) { say("Every company needs a percentage.", false); return; }
      if (moves.some((m) => m.pct <= -100)) { say("A company cannot fall 100% or more.", false); return; }
      if (new Set(moves.map((m) => m.company_id)).size !== moves.length) {
        say("Each company can only be in the event once.", false);
        return;
      }
      ok = await act("fire_event", {
        headline: headline.trim(),
        moves: moves.map((m) => ({ company_id: m.company_id, pct: m.pct })),
        broadcast_wsj: broadcast,
        article_id,
      });
    }
    // Only on success: a refused event keeps its headline (and its story) so
    // the Fed can fix the percentage and fire again.
    if (ok) {
      setHeadline("");
      setAttachedId(null);
    }
  }

  // A marker goes on the one company the event form names, or the market.
  const markerCompany = scope === "companies" && rows.length === 1 ? rows[0].company_id || null : null;
  async function mark() {
    if (!marker.trim()) { say("A marker needs something to say.", false); return; }
    await act("add_marker", { headline: marker.trim(), company_id: markerCompany });
    setMarker("");
  }

  return (
    <>
      <div className="gm-section-title">The Bell</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button
          className="gm-btn"
          style={{ background: market.is_open ? "var(--paper-darker)" : "var(--wex-up)", color: market.is_open ? "var(--ink)" : "var(--paper)" }}
          disabled={busy || market.is_open}
          onClick={() => act("open_market", {})}
        >
          Open the exchange
        </button>
        <button
          className="gm-btn hide"
          disabled={busy || !market.is_open}
          onClick={() => act("close_market", {})}
        >
          Close the exchange
        </button>
        <button className="gm-btn" disabled={busy} onClick={() => act("halt", { halted: true })}>
          Halt all trading
        </button>
        <button className="gm-btn" disabled={busy} onClick={() => act("halt", { halted: false })}>
          Resume all
        </button>
      </div>
      <div className="wex-admin-state">
        {market.is_open
          ? "OPEN — worms are trading."
          : "CLOSED — no trades will go through."}
      </div>

      <div className="gm-section-title">Held Stories ({held.length})</div>
      {held.length === 0 && (
        <div className="wex-admin-hint">
          Nothing waiting. Stories filed with &ldquo;Wait for approval&rdquo;, and every
          CEO press release, land here before they run.
        </div>
      )}
      {held.map((s) => (
        <HeldStory
          key={s.id}
          s={s}
          ticker={s.press_company_id ? tickerOf(s.press_company_id) : null}
          loaded={s.id === attachedId}
          busy={busy}
          onLoad={() => loadStory(s)}
          onPublish={() => act("publish_held", { id: s.id })}
          onSpike={() => act("spike_held", { id: s.id }, `Spike "${s.headline}"? It will not run.`)}
        />
      ))}

      <div className="gm-section-title">Fire an Event</div>
      {attached && (
        <div className="wex-admin-attached">
          Publishing with this event: <b>{attached.headline}</b>{" "}
          <button className="wex-link" onClick={() => setAttachedId(null)}>✕ detach</button>
        </div>
      )}
      <input
        className="form-input"
        placeholder="DIRT SCANDAL AT ANNELID CORP"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !busy && fire()}
        style={{ marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {[["market", "Whole market"], ["companies", `Companies (up to ${MAX_EVENT_COMPANIES})`]].map(([value, label]) => (
          <button
            key={value}
            className="gm-btn"
            style={scope === value ? { background: "var(--ink)", color: "var(--paper)" } : undefined}
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {scope === "market" ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ flex: "2 1 180px" }}>Every listed company moves by</span>
          <input
            className="form-input"
            style={{ flex: "1 1 90px" }}
            type="number"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="%"
          />
        </div>
      ) : (
        <>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <select
                className="form-input"
                style={{ flex: "2 1 180px" }}
                value={r.company_id}
                onChange={(e) => setRow(i, { company_id: e.target.value })}
                onFocus={() => setActiveRow(i)}
              >
                <option value="">Pick a company…</option>
                {companies
                  // A company already in another row is not offered again.
                  .filter((c) => c.id === r.company_id || !rows.some((o) => o.company_id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.ticker} — {c.name}</option>
                  ))}
              </select>
              <input
                className="form-input"
                style={{ flex: "1 1 90px" }}
                type="number"
                value={r.pct}
                onChange={(e) => setRow(i, { pct: e.target.value })}
                onFocus={() => setActiveRow(i)}
                placeholder="%"
              />
              {rows.length > 1 && (
                <button className="gm-btn" onClick={() => dropRow(i)} aria-label={`Remove row ${i + 1}`}>✕</button>
              )}
            </div>
          ))}
          {rows.length < MAX_EVENT_COMPANIES && (
            <button className="wex-link" style={{ marginBottom: 8 }} onClick={addRow}>
              + add another company
            </button>
          )}
          {moves.length > 0 && (
            <div className="wex-admin-hint" style={{ marginBottom: 4 }}>
              {moves.map((m) => (
                <div key={m.company_id}>
                  {m.ticker}: {formatWormcoin(m.before)} → {formatWormcoin(m.after)} ⌀ ({signed(m.pct)})
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <label className="wex-admin-check">
        <input type="checkbox" checked={broadcast} onChange={(e) => setBroadcast(e.target.checked)} />
        Also broadcast on the WSJ ticker
      </label>
      <button className="submit-btn" disabled={busy} onClick={fire} style={{ marginTop: 8 }}>
        {busy
          ? "…"
          : scope === "market"
            ? `Fire ${signed(Number(pct))} market event${attached ? " and publish" : ""}`
            : `Fire${attached ? " and publish" : " event"}${moves.length ? ": " + moves.map((m) => `${m.ticker} ${signed(m.pct)}`).join(", ") : ""}`}
      </button>
      <div className="wex-admin-hint">
        Quick hits{scope === "companies" && rows.length > 1 ? ` (row ${activeRow + 1})` : ""}:{" "}
        {[-25, -10, -5, 5, 10, 25].map((p) => (
          <button
            key={p}
            className="wex-link"
            style={{ marginRight: 10 }}
            onClick={() => (scope === "market" ? setPct(String(p)) : setRow(Math.min(activeRow, rows.length - 1), { pct: String(p) }))}
          >
            {p > 0 ? `+${p}` : p}%
          </button>
        ))}
      </div>

      <div className="gm-section-title">The Weather</div>
      <DriftControl market={market} busy={busy} act={act} />

      <div className="gm-section-title">Mark the Timeline</div>
      <div className="wex-admin-hint" style={{ marginBottom: 8 }}>
        A vertical line on the dashboard chart, with no price consequence. For the
        things that explain a jump without having caused it — the band starting,
        someone arriving, a rumour going round the kitchen. Goes on the company
        if the event above names exactly one; otherwise it is market-wide.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ flex: "2 1 220px" }}
          placeholder="The band starts"
          value={marker}
          onChange={(e) => setMarker(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && mark()}
        />
        <button className="gm-btn" disabled={busy} onClick={mark}>
          Add marker
        </button>
      </div>

      <div className="gm-section-title">The Board</div>
      {companies.map((c) => (
        <CompanyControl key={c.id} c={c} password={password} busy={busy} act={act} />
      ))}

      <div className="gm-section-title">Recent Events &amp; Markers</div>
      {(overview?.events || []).length === 0 && <div className="wex-admin-hint">Nothing fired yet.</div>}
      {(overview?.events || []).map((e) => (
        <div key={e.id} className="wex-admin-event">
          <strong>{e.headline}</strong>
          {describeEvent(e, tickerOf)}
          <button
            className="wex-link"
            style={{ marginLeft: 10 }}
            disabled={busy}
            onClick={() => act("delete_event", { id: e.id },
              `Remove "${e.headline}" from the timeline?\n\nPrices already moved and will NOT be put back.`)}
          >
            remove
          </button>
        </div>
      ))}

      <div className="gm-section-title">Start Again</div>
      <div className="wex-admin-hint" style={{ marginBottom: 8 }}>
        Neither touches the roster — codes and starting fortunes survive, so printed cards stay valid.
      </div>
      <button
        className="gm-btn hide"
        disabled={busy}
        onClick={() => act("reset_market", {},
          "Wipe all trades, holdings and prices?\n\nPlayers KEEP their names and stay logged in.")}
      >
        Reset market (keep names)
      </button>
      <button
        className="gm-btn delete"
        disabled={busy}
        onClick={() => act("reset_all", {},
          "Full reset.\n\nAll trades wiped AND every account unclaimed — everyone is logged out and must enter their words again.\n\nUse this before a NEW group plays.")}
      >
        Reset everything (log everyone out)
      </button>
    </>
  );
}

/**
 * Random drift — the market breathing on its own.
 *
 * Without it, buy pressure only pushes prices up, so once everyone is invested
 * the ranking freezes and holding is never a decision. With it, positions gain
 * and lose whether or not anyone acts.
 *
 * Presets rather than a bare number field because "standard deviation per
 * interval" is not a quantity anyone has intuition for at a party. The number
 * is still there underneath for when you do.
 */
function DriftControl({ market, busy, act }) {
  const [f, setF] = useState({
    interval_seconds: market.drift_interval_seconds ?? 300,
    mean: market.drift_mean ?? 0,
    stddev: market.drift_stddev ?? 1.5,
  });
  const on = Boolean(market.drift_enabled);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // market_state always carries id 1, so an empty object is "still loading"
  // rather than "not installed" — without that distinction the warning flashes
  // up on every page load before the first poll lands.
  if (!market.id) return null;

  // market_state always has these once the migration has run, so their absence
  // means one thing. Say it, rather than offering controls that will silently
  // fail to save.
  if (!("drift_enabled" in market)) {
    return (
      <div className="wex-admin-state" style={{ borderLeftColor: "var(--red)" }}>
        Not installed — run <strong>supabase/drift.sql</strong> in the Supabase SQL
        editor, then reload this page. Nothing else is affected: prices still move
        on trades and on events.
      </div>
    );
  }

  const dirty =
    Number(f.interval_seconds) !== Number(market.drift_interval_seconds ?? 300) ||
    Number(f.mean) !== Number(market.drift_mean ?? 0) ||
    Number(f.stddev) !== Number(market.drift_stddev ?? 1.5);

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button
          className="gm-btn"
          style={on ? {} : { background: "var(--wex-up)", color: "var(--paper)" }}
          disabled={busy || on}
          onClick={() => act("set_drift", { enabled: true })}
        >
          Start the weather
        </button>
        <button className="gm-btn hide" disabled={busy || !on} onClick={() => act("set_drift", { enabled: false })}>
          Becalm the market
        </button>
        <button className="gm-btn" disabled={busy || !on} onClick={() => act("drift_now", {})}>
          Gust now
        </button>
      </div>
      <div className="wex-admin-state">
        {on
          ? `DRIFTING — every ${Math.round((market.drift_interval_seconds ?? 300) / 60) || "<1"} min, `
            + `${market.drift_mean > 0 ? "+" : ""}${market.drift_mean ?? 0}% ± ${market.drift_stddev ?? 0}%`
          : "BECALMED — prices move only when worms trade or the Fed intervenes."}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
        <label className="wex-admin-mini">
          every (seconds)
          <input className="form-input" style={{ width: 90 }} value={f.interval_seconds} onChange={set("interval_seconds")} />
        </label>
        <label className="wex-admin-mini">
          drift % (mean)
          <input className="form-input" style={{ width: 90 }} value={f.mean} onChange={set("mean")} />
        </label>
        <label className="wex-admin-mini">
          spread % (σ)
          <input className="form-input" style={{ width: 90 }} value={f.stddev} onChange={set("stddev")} />
        </label>
        <button
          className="gm-btn headline-on"
          disabled={busy || !dirty}
          onClick={() => act("set_drift", {
            interval_seconds: Number(f.interval_seconds),
            mean: Number(f.mean),
            stddev: Number(f.stddev),
          })}
        >
          {dirty ? "Set" : "Set"}
        </button>
      </div>

      <div className="wex-admin-hint">
        Presets:{" "}
        {[
          ["Gentle swell", { interval_seconds: 300, mean: 0, stddev: 1.5 }],
          ["Choppy", { interval_seconds: 180, mean: 0, stddev: 4 }],
          ["Slow bleed", { interval_seconds: 300, mean: -1, stddev: 2 }],
          ["Bull run", { interval_seconds: 300, mean: 1.5, stddev: 2 }],
          ["Storm", { interval_seconds: 120, mean: 0, stddev: 9 }],
        ].map(([label, p]) => (
          <button
            key={label}
            className="wex-link"
            style={{ marginRight: 10 }}
            // Fills the fields AND saves. A preset that only populated the
            // boxes and waited for a second click on Set looks broken — you
            // press "Choppy", the market stays calm, and nothing says why.
            onClick={() => {
              setF({ interval_seconds: p.interval_seconds, mean: p.mean, stddev: p.stddev });
              act("set_drift", p);
            }}
            disabled={busy}
          >
            {label}
          </button>
        ))}
        <br />
        Mean is the tide, spread is the chop. A negative mean is the only thing
        that makes holding cash a real decision — it is how you stop the
        leaderboard freezing once everyone is invested. Halted companies sit it
        out, and drift stops entirely when the market is closed.
      </div>
    </>
  );
}

/** One story waiting for the Fed. Three ways out: load it into the event form
 *  (fire and publish together), publish it with no move, or spike it. */
function HeldStory({ s, ticker, loaded, busy, onLoad, onPublish, onSpike }) {
  const body = s.body || "";
  return (
    <div className={`gm-article wex-admin-held ${loaded ? "loaded" : ""}`}>
      {ticker && <div className="wex-admin-press">Press release · {ticker}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        {s.image_url && <img className="wex-admin-thumb" src={s.image_url} alt="" />}
        <div style={{ minWidth: 0 }}>
          <div className="gm-article-headline">{s.headline}</div>
          <div className="gm-article-meta">
            By {s.author_name}
            {s.filed_by && <>, filed by <b>{s.filed_by}</b></>}
          </div>
          <div className="wex-admin-hint" style={{ marginTop: 0 }}>
            {body.slice(0, 160)}{body.length > 160 ? "…" : ""}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <button className="gm-btn headline-on" disabled={busy || loaded} onClick={onLoad}>
          {loaded ? "Loaded ↓" : "Load into event"}
        </button>
        <button className="gm-btn show" disabled={busy} onClick={onPublish}>Publish, no move</button>
        <button className="gm-btn delete" disabled={busy} onClick={onSpike}>Spike</button>
      </div>
    </div>
  );
}

function CompanyControl({ c, busy, act }) {
  const [price, setPrice] = useState("");
  const change = pctChange(c.price, c.open_price);
  return (
    <div className="gm-article">
      <div className="gm-article-headline">
        {c.ticker} — {c.name} {c.is_halted && "· HALTED"}
      </div>
      <div className="gm-article-meta">
        {formatWormcoin(c.price, { symbol: true })} · {formatPct(change)} since open
        {c.ceo_name && ` · led by ${c.ceo_name}`}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button className="gm-btn" disabled={busy}
          onClick={() => act("halt", { company_id: c.id, halted: !c.is_halted })}>
          {c.is_halted ? "Resume" : "Halt"}
        </button>
        <input
          className="form-input"
          style={{ width: 130, padding: "6px 8px" }}
          placeholder="set price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button
          className="gm-btn"
          disabled={busy || !price}
          onClick={() => { act("set_price", { company_id: c.id, price: Number(price) }); setPrice(""); }}
        >
          Set
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Companies
// ============================================================
function CompaniesTab({ password, overview, reload, say }) {
  const [busy, setBusy] = useState(false);
  // For the CEO dropdown. Same list_players as the Players tab; only the ids
  // and names are used here, so no code reaches this screen.
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await gm(password, "list_players");
      if (!cancelled && Array.isArray(data)) setPlayers(data);
    })();
    return () => { cancelled = true; };
  }, [password]);

  async function save(c, fields) {
    const payload = { ...fields };
    // The server treats a PRESENT open_price as a deliberate rebase and slams
    // the live price back to it. This form always holds one, so without this
    // guard, renaming a company — or now, picking its chart colour — at 10pm
    // would silently undo the night's trading on that stock.
    if (Number(payload.open_price) === Number(c.open_price)) delete payload.open_price;

    setBusy(true);
    const { data } = await gm(password, "upsert_company", { id: c.id, ...payload });
    setBusy(false);
    say(data?.ok ? `${c.ticker} updated.` : data?.error || "Failed.", Boolean(data?.ok));
    reload();
  }

  return (
    <>
      <div className="gm-section-title">The Seven</div>
      <div className="wex-admin-hint" style={{ marginBottom: 10 }}>
        Name each company and who fronts it. Changing the opening price resets that
        stock&apos;s baseline — everyone&apos;s % change is measured from it — so only do that
        before trading starts.
      </div>
      {(overview?.companies || []).map((c) => (
        <CompanyEditor
          key={c.id} c={c} busy={busy} onSave={save}
          players={players} companies={overview?.companies || []}
        />
      ))}
      <button
        className="gm-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await gm(password, "upsert_company", {
            ticker: `NEW${Math.floor(Math.random() * 90 + 10)}`,
            name: "New Company", open_price: 100000, liquidity: 800,
            sort_order: (overview?.companies?.length || 0) + 1,
          });
          setBusy(false);
          reload();
        }}
      >
        + Add a company
      </button>
    </>
  );
}

function CompanyEditor({ c, busy, onSave, players, companies }) {
  const [f, setF] = useState({
    ticker: c.ticker, name: c.name, ceo_name: c.ceo_name || "",
    ceo_player_id: c.ceo_player_id || "",
    blurb: c.blurb || "", liquidity: c.liquidity, open_price: c.open_price,
    color: c.color || "",
  });
  const dirty = ["ticker", "name", "ceo_name", "ceo_player_id", "blurb", "liquidity", "color"].some(
    (k) => String(f[k] ?? "") !== String(c[k] ?? "")
  ) || Number(f.open_price) !== Number(c.open_price);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Claimed players who do not already run another company: one CEO, one
  // company. The current pick always stays in the list, even if that player
  // has since been unclaimed (a wex_reset_all keeps the link, clears the name).
  const takenElsewhere = new Set(
    companies.filter((o) => o.id !== c.id && o.ceo_player_id).map((o) => o.ceo_player_id)
  );
  const ceoOptions = players.filter(
    (p) => p.id === f.ceo_player_id || (p.is_claimed && !takenElsewhere.has(p.id))
  );
  // Deliberately does NOT touch ceo_name. That box is what the exchange shows
  // ("Led by …"); the linked player's trading name stays off the public pages.
  const pickCeo = (e) => setF({ ...f, ceo_player_id: e.target.value });

  return (
    <div className="gm-article">
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <input className="form-input" style={{ width: 80 }} value={f.ticker} onChange={set("ticker")} placeholder="TKR" />
        <input className="form-input" style={{ flex: "2 1 160px" }} value={f.name} onChange={set("name")} placeholder="Company name" />
        <input className="form-input" style={{ flex: "1 1 140px" }} value={f.ceo_name} onChange={set("ceo_name")} placeholder="CEO (an attendee)" />
      </div>
      <label className="wex-admin-mini" style={{ display: "block", marginBottom: 6 }}>
        CEO player — can file press releases for {f.ticker || "this company"}. Never shown to guests.
        <select className="form-input" value={f.ceo_player_id} onChange={pickCeo}>
          <option value="">Nobody linked</option>
          {ceoOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name || "(unclaimed player)"}
            </option>
          ))}
        </select>
      </label>
      <input className="form-input" style={{ marginBottom: 6 }} value={f.blurb} onChange={set("blurb")} placeholder="One line of flavour" />

      {/* Seven fixed swatches, not a free colour picker. The palette is
          validated as a SET — a hand-picked teal would quietly break the
          colour-vision separation the seven were chosen for. */}
      <div className="wex-admin-mini" style={{ marginBottom: 8 }}>
        chart colour
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          {SERIES_COLORS.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              onClick={() => setF({ ...f, color: hex })}
              style={{
                width: 26, height: 26, background: hex, cursor: "pointer",
                border: f.color === hex ? "3px solid var(--ink)" : "1px solid var(--rule)",
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <label className="wex-admin-mini">
          liquidity
          <input className="form-input" style={{ width: 90 }} value={f.liquidity} onChange={set("liquidity")} />
        </label>
        <label className="wex-admin-mini">
          opening price
          <input className="form-input" style={{ width: 120 }} value={f.open_price} onChange={set("open_price")} />
        </label>
        <button className="gm-btn headline-on" disabled={busy || !dirty} onClick={() => onSave(c, f)}>
          {dirty ? "Save" : "Saved"}
        </button>
      </div>
      <div className="wex-admin-hint">
        Lower liquidity = trades move this stock more. 800 is the default.
      </div>
    </div>
  );
}

// ============================================================
// Players
// ============================================================
function PlayersTab({ password, say }) {
  const [players, setPlayers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const { data } = await gm(password, "list_players");
    if (Array.isArray(data)) setPlayers(data);
  }, [password]);

  // The async IIFE keeps the state update out of the effect body, and the
  // flag stops a slow reply landing after the tab has been switched away.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await gm(password, "list_players");
      if (!cancelled && Array.isArray(data)) setPlayers(data);
    })();
    return () => { cancelled = true; };
  }, [password]);

  async function act(action, params, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    const { status, data } = await gm(password, action, params);
    setBusy(false);
    // Same fix as the Exchange tab: this used to say nothing at all unless a
    // new code came back, so a failed set_cash or delete was indistinguishable
    // from a successful one.
    if (status >= 400 || data?.ok === false) {
      say(data?.error || `The exchange refused that (${status}).`, false);
    } else if (data?.code) {
      say(`New code: ${data.code}`, true);
    }
    load();
  }

  function copyRoster() {
    const csv = ["code,name,starting_cash,cash,net_worth,claimed"]
      .concat(players.map((p) =>
        [p.code, p.display_name || "", p.starting_cash, p.cash, p.net_worth, p.is_claimed].join(",")))
      .join("\n");
    navigator.clipboard?.writeText(csv).then(
      () => say("Roster copied as CSV — paste into a mail merge for the cards.", true),
      () => say("Could not reach the clipboard.", false)
    );
  }

  const shown = filter
    ? players.filter((p) =>
        p.code.includes(filter.toLowerCase()) ||
        (p.display_name || "").toLowerCase().includes(filter.toLowerCase()))
    : players;

  const claimed = players.filter((p) => p.is_claimed).length;

  return (
    <>
      <div className="gm-section-title">
        Players — {claimed} of {players.length} claimed
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ flex: "1 1 160px" }}
          placeholder="Search a code or name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="gm-btn" disabled={busy} onClick={() => act("add_player", { cash: 1500000 })}>
          + Add player
        </button>
        <button className="gm-btn" onClick={copyRoster}>Copy roster CSV</button>
      </div>
      <div className="wex-admin-hint" style={{ marginBottom: 10 }}>
        This is the only screen that shows codes — it is how you look up a guest
        stuck at the door. Keep it off the projector.
      </div>

      {shown.map((p) => (
        <PlayerRow key={p.id} p={p} busy={busy} act={act} />
      ))}
      {shown.length === 0 && <div className="wex-admin-hint">No worms match that.</div>}
    </>
  );
}

function PlayerRow({ p, busy, act }) {
  const [cash, setCash] = useState("");
  return (
    <div className="gm-article">
      <div className="gm-article-headline">
        {p.display_name || <em style={{ opacity: 0.6 }}>unclaimed</em>}
      </div>
      <div className="gm-article-meta" style={{ letterSpacing: 1 }}>
        {p.code}
      </div>
      <div className="gm-article-meta">
        {formatWormcoin(p.net_worth, { symbol: true })} net ·
        {" "}{formatWormcoin(p.cash, { symbol: true })} cash ·
        {" "}started {formatWormcoin(p.starting_cash, { symbol: true })} ·
        {" "}{formatPct(p.pct_return)}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ width: 130, padding: "6px 8px" }}
          placeholder="set cash"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
        <button className="gm-btn" disabled={busy || !cash}
          onClick={() => { act("set_cash", { id: p.id, cash: Number(cash) }); setCash(""); }}>
          Set
        </button>
        <button className="gm-btn" disabled={busy}
          onClick={() => act("regenerate_code", { id: p.id }, "Give this worm a new code? The old one stops working.")}>
          New code
        </button>
        {p.is_claimed && (
          <button className="gm-btn hide" disabled={busy}
            onClick={() => act("unclaim_player", { id: p.id }, `Log ${p.display_name} out and free the code?`)}>
            Unclaim
          </button>
        )}
        <button className="gm-btn delete" disabled={busy}
          onClick={() => act("delete_player", { id: p.id }, "Delete this player and all their trades permanently?")}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Shell
// ============================================================
export default function WexAdmin({ password }) {
  const [tab, setTab] = useState("exchange");
  const [overview, setOverview] = useState(null);
  const [msg, setMsg] = useState(null);

  const reload = useCallback(async () => {
    const { data } = await gm(password, "overview");
    if (data?.companies) setOverview(data);
  }, [password]);

  // See the note in PlayersTab — same reason for the IIFE and the flag.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await gm(password, "overview");
      if (!cancelled && data?.companies) setOverview(data);
    })();
    return () => { cancelled = true; };
  }, [password]);

  // Keep the board fresh while it sits open on your laptop during the party.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 5000);
    return () => clearInterval(id);
  }, [reload]);

  const say = useCallback((text, good = true) => {
    setMsg({ text, good });
    setTimeout(() => setMsg(null), 6000);
  }, []);

  return (
    <div>
      <div className="wex-admin-tabs">
        {[["exchange", "Exchange"], ["companies", "Companies"], ["players", "Players"]].map(([id, label]) => (
          <button
            key={id}
            className={`wex-admin-tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && <div className={`wex-toast ${msg.good ? "good" : "bad"}`}>{msg.text}</div>}

      {tab === "exchange" && (
        <ExchangeTab password={password} overview={overview} reload={reload} say={say} />
      )}
      {tab === "companies" && (
        <CompaniesTab password={password} overview={overview} reload={reload} say={say} />
      )}
      {tab === "players" && <PlayersTab password={password} say={say} />}
    </div>
  );
}
