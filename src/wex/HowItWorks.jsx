import { useRef, useEffect } from "react";
import { TRADE_RULES, MARKET_RULES, DRIFT_RULE, CHART_NOTES } from "./rules.js";

// ============================================================
// Explaining the exchange — the components
// ============================================================
// The words live next door in rules.js, which keeps this file exporting only
// components (fast refresh breaks otherwise) and means the copy can be reworded
// without touching any markup.

/**
 * The compact list. `limit` trims it for the gate, where the guest is standing
 * in a doorway rather than reading.
 */
export function HowToTrade({ limit }) {
  const rules = limit ? TRADE_RULES.slice(0, limit) : TRADE_RULES;
  return (
    <ol className="wex-how-list">
      {rules.map((r) => (
        <li key={r.title}>
          <strong>{r.title}.</strong> {r.body}
        </li>
      ))}
    </ol>
  );
}

/**
 * The full explainer, in a native <dialog> — which brings Escape, focus
 * trapping and inertness of the page behind it for free, none of which a
 * hand-rolled overlay div gets right without real work.
 */
export function HowWexWorks({ open, onClose, driftEnabled = false }) {
  const ref = useRef(null);

  // The drift rule appears only while drift is actually running — it is the one
  // rule the Worm Fed can switch off mid-evening, and a rule that is false is
  // worse than a rule that is missing.
  const marketRules = driftEnabled ? [DRIFT_RULE, ...MARKET_RULES] : MARKET_RULES;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      className="wex-how-dialog"
      ref={ref}
      onClose={onClose}
      // Tapping outside closes it. A click on the backdrop lands on the dialog
      // element itself, which is the only way to tell the two apart — <dialog>
      // gives us Escape for free but not this.
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="wex-how-head">
        <h2 className="wex-how-title">How does WEX even work?</h2>
        <button className="wex-how-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="wex-how-section">Trading</div>
      <HowToTrade />

      <div className="wex-how-section">The market</div>
      <ol className="wex-how-list" start={TRADE_RULES.length + 1}>
        {marketRules.map((r) => (
          <li key={r.title}>
            <strong>{r.title}.</strong> {r.body}
          </li>
        ))}
      </ol>

      <div className="wex-how-section">Reading the chart</div>
      <dl className="wex-how-defs">
        {CHART_NOTES.map(([term, def]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{def}</dd>
          </div>
        ))}
      </dl>

      <div className="wex-how-foot">
        Everything on this screen is public. What you cannot see is anyone's
        three words — not even the Worm Fed can look those up without opening a
        drawer marked <em>Players</em>.
      </div>
    </dialog>
  );
}
