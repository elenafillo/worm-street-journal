import { useState, useEffect, useRef } from "react";

// ============================================================
// CONFIG — paste your Supabase credentials here
// ============================================================
const SUPABASE_URL = "https://bliocisgoedlybzlfytk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsaW9jaXNnb2VkbHliemxmeXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTQ5MzUsImV4cCI6MjA5NDI5MDkzNX0.u3BZQrm6lWSPPd4gvyZOK9koOispIhYLnjqevtj5fCA";
const GM_PASSWORD = import.meta.env.VITE_GM_PASSWORD;
const DISPLAY_STYLE = "classic"; // "classic" | "modern"

// ============================================================
// Supabase client
// ============================================================
function getHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

const supabase = {
  async query(table, options = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    const params = new URLSearchParams();
    if (options.select) params.append("select", options.select);
    if (options.order) params.append("order", options.order);
    if (params.toString()) url += `?${params}`;
    const res = await fetch(url, { headers: getHeaders() });
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...getHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async update(table, data, eq) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    const params = new URLSearchParams();
    Object.entries(eq).forEach(([k, v]) => params.append(k, `eq.${v}`));
    url += `?${params}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { ...getHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  async delete(table, eq) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    const params = new URLSearchParams();
    Object.entries(eq).forEach(([k, v]) => params.append(k, `eq.${v}`));
    url += `?${params}`;
    await fetch(url, { method: "DELETE", headers: getHeaders() });
  },
  async uploadImage(file) {
    const ext = file.name.split(".").pop();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/wsj-images/${filename}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": file.type,
        },
        body: file,
      }
    );
    if (!res.ok) throw new Error("Upload failed");
    return `${SUPABASE_URL}/storage/v1/object/public/wsj-images/${filename}`;
  },
  subscribe(table, callback) {
    const interval = setInterval(callback, 4000);
    return () => clearInterval(interval);
  },
};

// ============================================================
// Styles
// ============================================================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Inter:wght@400;500;700&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=UnifrakturMaguntia&family=IM+Fell+English:ital@0;1&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');

  @font-face {
    font-family: 'Rojal';
    src: url('/fonts/Rojal.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: #1a1008;
    --paper: #f2e8d5;
    --paper-dark: #e8d9bc;
    --paper-darker: #d9c9a8;
    --red: #8b1a1a;
    --gold: #b8860b;
    --rule: #2a1a08;
    --muted: #5c4a2a;
  }

  body {
    background: var(--paper);
    color: var(--ink);
    font-family: 'Libre Baskerville', Georgia, serif;
    min-height: 100vh;
  }

  .display-root {
    width: 100vw;
    min-height: 100vh;
    background: var(--paper);
    display: flex;
    flex-direction: column;
  }

  .masthead {
    border-bottom: 4px double var(--rule);
    padding: 12px 24px 8px;
    text-align: center;
    background: var(--paper);
  }

  .masthead-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-family: 'IM Fell English', serif;
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 4px;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 4px;
  }

  .masthead-title {
    font-family: 'UnifrakturMaguntia', cursive;
    font-size: clamp(36px, 6vw, 72px);
    color: var(--ink);
    line-height: 1;
    letter-spacing: 2px;
  }

  .masthead-subtitle {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    font-size: 13px;
    color: var(--muted);
    margin-top: 2px;
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .masthead-rule {
    border: none;
    border-top: 1px solid var(--rule);
    margin: 6px 0 0;
  }

  .breaking-banner {
    background: var(--red);
    color: var(--paper);
    font-family: 'Playfair Display', serif;
    font-weight: 900;
    font-size: 14px;
    letter-spacing: 4px;
    text-transform: uppercase;
    padding: 5px 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .breaking-ticker {
    display: inline-block;
    white-space: nowrap;
    animation: ticker var(--ticker-duration, 20s) linear infinite;
  }

  @keyframes ticker {
    from { transform: translateX(0); }
    to { transform: translateX(var(--ticker-offset, -200px)); }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .articles-grid {
    padding: 16px 24px;
    flex: 1;
    overflow-y: auto;
  }

  .article-card {
    border-bottom: 1px solid var(--paper-darker);
    padding: 16px 0;
    animation: fadeIn 0.6s ease;
  }

  .article-inner {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .article-inner.img-left { flex-direction: row; }
  .article-inner.img-right { flex-direction: row-reverse; }
  .article-inner.no-img { flex-direction: column; }

  .article-image {
    width: 220px;
    min-width: 220px;
    height: 160px;
    object-fit: cover;
    border: 1px solid var(--paper-darker);
    flex-shrink: 0;
  }

  .article-text { flex: 1; }

  .article-headline {
    font-family: 'Playfair Display', serif;
    font-weight: 900;
    font-size: clamp(16px, 2.2vw, 26px);
    line-height: 1.15;
    color: var(--ink);
    margin-bottom: 8px;
  }

  .article-body {
    font-family: 'IM Fell English', serif;
    font-size: clamp(12px, 1.2vw, 15px);
    line-height: 1.65;
    color: var(--ink);
    -webkit-hyphens: auto;
    hyphens: auto;
  }

  .article-byline {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    font-size: 11px;
    color: var(--muted);
    margin-top: 6px;
  }

  .empty-state {
    text-align: center;
    padding: 80px 24px;
    font-family: 'IM Fell English', serif;
    font-style: italic;
    color: var(--muted);
    font-size: 18px;
  }

  .form-root {
    max-width: 640px;
    margin: 0 auto;
    padding: 32px 24px 64px;
    min-height: 100vh;
  }

  .form-masthead {
    text-align: center;
    border-bottom: 3px double var(--rule);
    padding-bottom: 16px;
    margin-bottom: 28px;
  }

  .form-title {
    font-family: 'UnifrakturMaguntia', cursive;
    font-size: 42px;
    color: var(--ink);
  }

  .form-subtitle {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    font-size: 13px;
    color: var(--muted);
    letter-spacing: 2px;
    margin-top: 4px;
  }

  .form-group { margin-bottom: 20px; }

  .form-label {
    display: block;
    font-family: 'IM Fell English', serif;
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .form-input, .form-textarea {
    width: 100%;
    background: #fff9f0;
    border: 1px solid var(--paper-darker);
    border-bottom: 2px solid var(--ink);
    padding: 10px 12px;
    font-family: 'Libre Baskerville', Georgia, serif;
    font-size: 14px;
    color: var(--ink);
    outline: none;
    transition: border-color 0.2s;
  }

  .form-input:focus, .form-textarea:focus {
    border-color: var(--red);
    border-bottom-color: var(--red);
  }

  .form-textarea {
    min-height: 120px;
    resize: vertical;
    line-height: 1.6;
  }

  .image-upload-area {
    border: 2px dashed var(--paper-darker);
    padding: 24px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    background: #fff9f0;
  }

  .image-upload-area:hover, .image-upload-area.drag-over {
    border-color: var(--gold);
    background: #fffaf3;
  }

  .image-upload-label {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    color: var(--muted);
    font-size: 14px;
    cursor: pointer;
  }

  .image-preview {
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
    margin-top: 12px;
    border: 1px solid var(--paper-darker);
  }

  .image-remove {
    background: none;
    border: none;
    color: var(--red);
    font-family: 'IM Fell English', serif;
    font-size: 12px;
    cursor: pointer;
    margin-top: 6px;
    text-decoration: underline;
  }

  .submit-btn {
    width: 100%;
    background: var(--ink);
    color: var(--paper);
    border: none;
    padding: 14px;
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 3px;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 8px;
  }

  .submit-btn:hover:not(:disabled) { background: var(--red); }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .success-msg {
    background: #e8f5e9;
    border: 1px solid #4caf50;
    border-left: 4px solid #4caf50;
    padding: 14px 16px;
    font-family: 'IM Fell English', serif;
    font-size: 14px;
    color: #1b5e20;
    margin-top: 16px;
    animation: fadeIn 0.4s ease;
  }

  .error-msg {
    background: #fce4e4;
    border: 1px solid var(--red);
    border-left: 4px solid var(--red);
    padding: 14px 16px;
    font-family: 'IM Fell English', serif;
    font-size: 14px;
    color: var(--red);
    margin-top: 16px;
  }

  .char-count {
    font-family: 'IM Fell English', serif;
    font-size: 11px;
    color: var(--muted);
    text-align: right;
    margin-top: 3px;
  }

  .gm-root {
    max-width: 800px;
    margin: 0 auto;
    padding: 32px 24px;
    min-height: 100vh;
  }

  .gm-header {
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    font-weight: 900;
    border-bottom: 3px double var(--rule);
    padding-bottom: 12px;
    margin-bottom: 24px;
    color: var(--ink);
  }

  .gm-article {
    background: #fff9f0;
    border: 1px solid var(--paper-darker);
    border-left: 4px solid var(--gold);
    padding: 14px 16px;
    margin-bottom: 12px;
  }

  .gm-article.hidden-article {
    opacity: 0.5;
    border-left-color: var(--muted);
  }

  .gm-article-headline {
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 16px;
    margin-bottom: 4px;
  }

  .gm-article-meta {
    font-family: 'IM Fell English', serif;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .gm-btn {
    background: none;
    border: 1px solid currentColor;
    padding: 4px 12px;
    font-family: 'IM Fell English', serif;
    font-size: 12px;
    cursor: pointer;
    margin-right: 8px;
    transition: all 0.15s;
  }

  .gm-btn.hide { color: var(--muted); }
  .gm-btn.hide:hover { background: var(--muted); color: var(--paper); }
  .gm-btn.show { color: #2e7d32; }
  .gm-btn.show:hover { background: #2e7d32; color: white; }
  .gm-btn.delete { color: var(--red); }
  .gm-btn.delete:hover { background: var(--red); color: var(--paper); }

  .gm-section-title {
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 1px;
    border-bottom: 1px solid var(--paper-darker);
    padding-bottom: 8px;
    margin-bottom: 16px;
    margin-top: 32px;
    color: var(--ink);
  }

  .nav {
    background: var(--ink);
    padding: 10px 24px;
    display: flex;
    gap: 24px;
    align-items: center;
  }

  .nav-link {
    color: var(--paper);
    font-family: 'IM Fell English', serif;
    font-size: 13px;
    letter-spacing: 1px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .nav-link:hover, .nav-link.active { opacity: 1; }

  .nav-brand {
    font-family: 'UnifrakturMaguntia', cursive;
    font-size: 22px;
    color: var(--paper);
    margin-right: auto;
  }

  .gate {
    max-width: 360px;
    margin: 80px auto;
    padding: 32px;
    background: #fff9f0;
    border: 1px solid var(--paper-darker);
    text-align: center;
  }

  .gate-title {
    font-family: 'Playfair Display', serif;
    font-weight: 900;
    font-size: 22px;
    margin-bottom: 16px;
  }

  .spinner {
    display: inline-block;
    width: 20px; height: 20px;
    border: 2px solid var(--paper-darker);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: middle;
    margin-right: 8px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Modern WSJ style overrides ── */
  [data-style="modern"] {
    --ink: #111111;
    --paper: #ffffff;
    --paper-dark: #f5f5f5;
    --paper-darker: #e0e0e0;
    --red: #D71920;
    --gold: #D71920;
    --rule: #cccccc;
    --muted: #666666;
    background: #ffffff;
    min-height: 100vh;
    color: #111111;
    font-family: 'Inter', Arial, sans-serif;
  }

  [data-style="modern"] .masthead {
    border-bottom: 3px solid #D71920;
  }

  [data-style="modern"] .masthead-top {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  [data-style="modern"] .masthead-title {
    font-family: 'Rojal', Georgia, serif;
    font-weight: normal;
    font-size: clamp(40px, 6.5vw, 84px);
    letter-spacing: 1px;
    text-transform: none;
  }

  [data-style="modern"] .masthead-subtitle {
    font-family: 'Inter', Arial, sans-serif;
    font-style: normal;
    font-weight: 400;
    letter-spacing: 1px;
    color: var(--red);
  }

  [data-style="modern"] .masthead-rule {
    border-top-color: var(--paper-darker);
  }

  [data-style="modern"] .article-headline {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 700;
    font-size: clamp(18px, 2.4vw, 30px);
    letter-spacing: 0.2px;
  }

  [data-style="modern"] .article-body {
    font-family: 'Inter', Arial, sans-serif;
    font-size: clamp(12px, 1.1vw, 14px);
    line-height: 1.6;
  }

  [data-style="modern"] .article-byline {
    font-family: 'Inter', Arial, sans-serif;
    font-style: normal;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  [data-style="modern"] .article-card {
    border-bottom-color: var(--paper-darker);
  }

  [data-style="modern"] .breaking-banner {
    background: var(--red);
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 16px;
  }

  [data-style="modern"] .empty-state {
    font-family: 'Inter', Arial, sans-serif;
    font-style: normal;
  }

  [data-style="modern"] .nav-brand {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 900;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  [data-style="modern"] .nav-link {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 12px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  [data-style="modern"] .gm-header {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 900;
    font-size: 32px;
    letter-spacing: 0.5px;
  }

  [data-style="modern"] .gm-section-title {
    font-family: 'Inter', Arial, sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  [data-style="modern"] .gm-article {
    background: var(--paper-dark);
    border-left-color: var(--red);
  }

  [data-style="modern"] .gm-article-headline {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 700;
    font-size: 18px;
  }

  [data-style="modern"] .gm-article-meta {
    font-family: 'Inter', Arial, sans-serif;
    font-style: normal;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  [data-style="modern"] .gm-btn {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  [data-style="modern"] .gate-title {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 900;
    font-size: 26px;
    letter-spacing: 0.5px;
  }

  [data-style="modern"] .form-input,
  [data-style="modern"] .form-textarea {
    background: var(--paper-dark);
    font-family: 'Inter', Arial, sans-serif;
  }

  [data-style="modern"] .form-label {
    font-family: 'Inter', Arial, sans-serif;
  }

  [data-style="modern"] .submit-btn {
    font-family: 'Inter', Arial, sans-serif;
    font-weight: 700;
    letter-spacing: 2px;
  }

  [data-style="modern"] .form-title {
    font-family: 'Rojal', Georgia, serif;
    font-weight: normal;
    font-size: 52px;
    letter-spacing: 1px;
    text-transform: none;
  }

  [data-style="modern"] .form-subtitle {
    font-family: 'Inter', Arial, sans-serif;
    font-style: normal;
    letter-spacing: 1px;
    color: var(--red);
  }

  [data-style="modern"] .form-masthead {
    border-bottom-color: var(--red);
    border-bottom-style: solid;
    border-bottom-width: 2px;
  }

  [data-style="modern"] .char-count {
    font-family: 'Inter', Arial, sans-serif;
  }

  [data-style="modern"] .image-upload-label {
    font-family: 'Inter', Arial, sans-serif;
    font-style: normal;
  }

  [data-style="modern"] .success-msg,
  [data-style="modern"] .error-msg {
    font-family: 'Inter', Arial, sans-serif;
  }
`;

// ============================================================
// Utilities
// ============================================================
function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).toUpperCase();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ============================================================
// Breaking News Ticker
// ============================================================
const TICKER_SEPARATOR = "     "; // em spaces between repetitions

function Ticker({ message }) {
  const measureRef = useRef();
  const [measured, setMeasured] = useState({ segW: 0, reps: 6 });

  useEffect(() => {
    if (!measureRef.current) return;
    const segW = measureRef.current.offsetWidth;
    const reps = Math.max(6, Math.ceil((3 * window.innerWidth) / segW));
    setMeasured({ segW, reps });
  }, [message]);

  const { segW, reps } = measured;
  const tickerStyle = segW > 0 ? {
    "--ticker-offset": `-${segW}px`,
    "--ticker-duration": `${segW / 120}s`,
  } : {};

  // Each repeated segment: big spaces + emoji + BREAKING: + message + emoji
  const segment = TICKER_SEPARATOR + "⚡ BREAKING: " + message + " ⚡";

  return (
    <div className="breaking-banner">
      {/* Hidden element to measure one segment width */}
      <span ref={measureRef} style={{ position: "absolute", visibility: "hidden", pointerEvents: "none" }}>
        {segment}
      </span>
      <span className="breaking-ticker" style={tickerStyle}>
        {Array.from({ length: reps }).map((_, i) => (
          <span key={i}>{segment}</span>
        ))}
      </span>
    </div>
  );
}

// ============================================================
// Display Screen
// ============================================================
function DisplayScreen() {
  const [articles, setArticles] = useState([]);
  const [breaking, setBreaking] = useState(null);
  const [loading, setLoading] = useState(true);
  const breakingEventIdRef = useRef(null);
  const breakingTimerRef = useRef(null);

  async function fetchArticles() {
    const data = await supabase.query("articles", {
      select: "*",
      order: "created_at.desc",
    });
    if (Array.isArray(data)) {
      setArticles(data.filter(a => !a.hidden));
    }
    setLoading(false);
  }

  async function checkEvents() {
    const data = await supabase.query("events", {
      select: "*",
      order: "created_at.desc",
    });
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[0];
      if (latest.type === "breaking_news") {
        if (latest.id !== breakingEventIdRef.current) {
          breakingEventIdRef.current = latest.id;
          if (breakingTimerRef.current) clearTimeout(breakingTimerRef.current);
          setBreaking(latest.payload?.message || "BREAKING NEWS");
          breakingTimerRef.current = setTimeout(() => {
            setBreaking(null);
            breakingEventIdRef.current = null;
          }, 10 * 60 * 1000);
        }
      } else if (latest.type === "clear_breaking") {
        if (breakingTimerRef.current) clearTimeout(breakingTimerRef.current);
        breakingTimerRef.current = null;
        breakingEventIdRef.current = null;
        setBreaking(null);
      }
    }
  }

  useEffect(() => {
    fetchArticles();
    const unsub1 = supabase.subscribe("articles", fetchArticles);
    const unsub2 = supabase.subscribe("events", checkEvents);
    return () => {
      unsub1();
      unsub2();
      if (breakingTimerRef.current) clearTimeout(breakingTimerRef.current);
    };
  }, []);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).toUpperCase();

  return (
    <div className="display-root" data-style={DISPLAY_STYLE}>
      <div className="masthead">
        <div className="masthead-top">
          <span>{today}</span>
          <span>ESTABLISHED THIS VERY WEEKEND · WORMHILL</span>
          <span>PRICE: 1 WORMCOIN</span>
        </div>
        <div className="masthead-title">The Worm Street Journal</div>
        <div className="masthead-subtitle">Squirming News</div>
        <hr className="masthead-rule" />
      </div>

      {breaking && <Ticker message={breaking} />}

      <div className="articles-grid">
        {loading && (
          <div className="empty-state">
            <span className="spinner" /> Awaiting dispatches from the trading floor...
          </div>
        )}
        {!loading && articles.length === 0 && (
          <div className="empty-state">
            No reports filed yet. The worms are still burrowing.
          </div>
        )}
        {articles.map((article, i) => {
          const hasImage = !!article.image_url;
          const imgSide = i % 2 === 0 ? "img-left" : "img-right";
          const layoutClass = hasImage ? imgSide : "no-img";
          return (
            <div className="article-card" key={article.id}>
              <div className={`article-inner ${layoutClass}`}>
                {hasImage && (
                  <img
                    className="article-image"
                    src={article.image_url}
                    alt={article.headline}
                  />
                )}
                <div className="article-text">
                  <div className="article-headline">{article.headline}</div>
                  <div className="article-body">{article.body}</div>
                  <div className="article-byline">
                    By {article.author_name} · {formatDate(article.created_at)} · {formatTime(article.created_at)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Article Submission Form
// ============================================================
function SubmitForm() {
  const [form, setForm] = useState({
    author_name: "",
    headline: "",
    body: "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleImageFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError("");
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) handleImageFile(file);
  }

  async function handleSubmit() {
    if (!form.author_name.trim() || !form.headline.trim() || !form.body.trim()) {
      setError("Please fill in your name, headline, and story.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      let image_url = null;
      if (imageFile) {
        image_url = await supabase.uploadImage(imageFile);
      }
      const result = await supabase.insert("articles", {
        author_name: form.author_name,
        headline: form.headline,
        body: form.body,
        image_url,
      });
      if (Array.isArray(result) && result[0]?.id) {
        setSuccess(true);
        setForm(f => ({ ...f, headline: "", body: "" }));
        setImageFile(null);
        setImagePreview(null);
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError("Something went wrong. Please try again.");
        console.error("Insert result:", result);
      }
    } catch (err) {
      setError("Something went wrong filing your story. Try again.");
      console.error(err);
    }
    setSubmitting(false);
  }

  return (
    <div className="form-root">
      <div className="form-masthead">
        <div className="form-title">The Worm Street Journal</div>
        <div className="form-subtitle">File a Dispatch to the Trading Floor</div>
      </div>

      <div className="form-group">
        <label className="form-label">Your Name / Byline</label>
        <input
          className="form-input"
          name="author_name"
          value={form.author_name}
          onChange={handleChange}
          placeholder="e.g. Reginald Earthworm III"
          maxLength={60}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Headline</label>
        <input
          className="form-input"
          name="headline"
          value={form.headline}
          onChange={handleChange}
          placeholder="e.g. SLIMECO CEO SPOTTED IN SUSPICIOUS TUNNEL"
          maxLength={120}
        />
        <div className="char-count">{form.headline.length}/120</div>
      </div>

      <div className="form-group">
        <label className="form-label">Story</label>
        <textarea
          className="form-textarea"
          name="body"
          value={form.body}
          onChange={handleChange}
          placeholder="Write your report, rumour, or market intelligence here..."
          maxLength={600}
        />
        <div className="char-count">{form.body.length}/600</div>
      </div>

      <div className="form-group">
        <label className="form-label">Image (Optional · Max 5MB)</label>
        <div
          className={`image-upload-area ${dragOver ? "drag-over" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          {imagePreview ? (
            <>
              <img className="image-preview" src={imagePreview} alt="Preview" />
              <br />
              <button
                className="image-remove"
                onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
              >
                Remove image
              </button>
            </>
          ) : (
            <label className="image-upload-label">
              Tap to attach a photograph, or drag one here
            </label>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={e => handleImageFile(e.target.files[0])}
          />
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
        {submitting ? <><span className="spinner" />Filing Story...</> : "File to the Journal"}
      </button>

      {success && (
        <div className="success-msg">
          ✓ Your dispatch has been filed. It will appear on the wall momentarily.
        </div>
      )}
    </div>
  );
}

// ============================================================
// GM Panel
// ============================================================
function GMPanel() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [articles, setArticles] = useState([]);
  const [breakingMsg, setBreakingMsg] = useState("");

  async function fetchArticles() {
    const data = await supabase.query("articles", {
      select: "*",
      order: "created_at.desc",
    });
    if (Array.isArray(data)) setArticles(data);
  }

  useEffect(() => {
    if (authed) fetchArticles();
  }, [authed]);

  function login() {
    if (pw === GM_PASSWORD) setAuthed(true);
    else alert("Wrong password, worm.");
  }

  async function toggleHide(article) {
    await supabase.update("articles", { hidden: !article.hidden }, { id: article.id });
    fetchArticles();
  }

  async function deleteArticle(id) {
    if (!confirm("Delete this article permanently?")) return;
    await supabase.delete("articles", { id });
    fetchArticles();
  }

  async function triggerBreaking() {
    if (!breakingMsg.trim()) return;
    await supabase.insert("events", {
      type: "breaking_news",
      payload: { message: breakingMsg },
    });
    setBreakingMsg("");
    alert("BREAKING banner triggered on the display!");
  }

  async function clearBreaking() {
    await supabase.insert("events", { type: "clear_breaking", payload: {} });
    alert("Breaking banner cleared.");
  }

  if (!authed) {
    return (
      <div className="gm-root">
        <div className="gate">
          <div className="gate-title">Worm Fed Access</div>
          <div className="form-group">
            <input
              className="form-input"
              type="password"
              placeholder="Password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
            />
          </div>
          <button className="submit-btn" onClick={login}>Enter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gm-root">
      <div className="gm-header">&#9881; Worm Fed Control Room</div>

      <div className="gm-section-title">Breaking News</div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="Type breaking news message..."
          value={breakingMsg}
          onChange={e => setBreakingMsg(e.target.value)}
          onKeyDown={e => e.key === "Enter" && triggerBreaking()}
        />
        <button
          className="submit-btn"
          style={{ width: "auto", padding: "0 20px", margin: 0 }}
          onClick={triggerBreaking}
        >
          Trigger
        </button>
      </div>
      <button className="gm-btn hide" onClick={clearBreaking} style={{ marginBottom: "8px" }}>
        Clear breaking banner
      </button>

      <div className="gm-section-title">All Articles ({articles.length})</div>
      {articles.map(a => (
        <div key={a.id} className={`gm-article ${a.hidden ? "hidden-article" : ""}`}>
          <div className="gm-article-headline">{a.headline}</div>
          <div className="gm-article-meta">
            By {a.author_name} · {formatDate(a.created_at)} {formatTime(a.created_at)}
            {a.hidden && " · HIDDEN"}
          </div>
          <div style={{ fontSize: "13px", marginBottom: "10px", fontFamily: "'IM Fell English', serif" }}>
            {a.body.slice(0, 120)}{a.body.length > 120 ? "…" : ""}
          </div>
          <button className={`gm-btn ${a.hidden ? "show" : "hide"}`} onClick={() => toggleHide(a)}>
            {a.hidden ? "Show" : "Hide"}
          </button>
          <button className="gm-btn delete" onClick={() => deleteArticle(a.id)}>
            Delete
          </button>
        </div>
      ))}
      {articles.length === 0 && (
        <div style={{ fontFamily: "'IM Fell English', serif", fontStyle: "italic", color: "var(--muted)" }}>
          No articles yet.
        </div>
      )}
    </div>
  );
}

// ============================================================
// Root App with simple routing
// ============================================================
export default function App() {
  const [route, setRoute] = useState(() => {
    const h = window.location.hash;
    if (h === "#submit") return "submit";
    if (h === "#gm") return "gm";
    return "display";
  });

  function navigate(r) {
    window.location.hash = r;
    setRoute(r);
  }

  return (
    <div data-style={DISPLAY_STYLE}>
      <style>{styles}</style>
      <div className="nav">
        <span className="nav-brand">WSJ</span>
        <span className={`nav-link ${route === "display" ? "active" : ""}`} onClick={() => navigate("display")}>
          Wall Display
        </span>
        <span className={`nav-link ${route === "submit" ? "active" : ""}`} onClick={() => navigate("submit")}>
          File a Story
        </span>
        <span className={`nav-link ${route === "gm" ? "active" : ""}`} onClick={() => navigate("gm")}>
          Worm Fed
        </span>
      </div>
      {route === "display" && <DisplayScreen />}
      {route === "submit" && <SubmitForm />}
      {route === "gm" && <GMPanel />}
    </div>
  );
}
