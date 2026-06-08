import { useState, useEffect, useRef } from "react";

// ============================================================
// CONFIG — paste your Supabase credentials here
// ============================================================
const SUPABASE_URL = "https://bliocisgoedlybzlfytk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsaW9jaXNnb2VkbHliemxmeXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTQ5MzUsImV4cCI6MjA5NDI5MDkzNX0.u3BZQrm6lWSPPd4gvyZOK9koOispIhYLnjqevtj5fCA";
const DISPLAY_STYLE = "modern"; // "classic" | "modern"
const PARTY_THURSDAY = "2026-11-26"; // ISO date of the party's Thursday — update each event
const BREAKING_DURATION_MS = 5 * 60 * 1000; // how long the breaking banner stays live

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

  /* ── Broadsheet layout (fixed canvas — use browser zoom to resize) ── */
  .broadsheet-scale-wrapper {
    width: 100%;
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: #1a1008;
    padding: 16px 0;
  }

  .broadsheet-page {
    width: 1200px;
    height: 960px;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--paper);
  }

  .broadsheet-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .broadsheet-main {
    flex: 1;
    padding: 14px 20px 10px;
    border-right: 2px solid var(--rule);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .broadsheet-sidebar {
    width: 210px;
    flex-shrink: 0;
    padding: 14px 16px 10px;
    overflow: hidden;
  }

  .broadsheet-sidebar-title {
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    border-bottom: 2px solid var(--rule);
    padding-bottom: 6px;
    margin-bottom: 12px;
    color: var(--ink);
  }

  .broadsheet-hero {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--rule);
    flex-shrink: 0;
  }

  .broadsheet-hero-headline {
    font-family: 'Playfair Display', serif;
    font-weight: 900;
    font-size: 42px;
    line-height: 1.05;
    color: var(--ink);
    margin-bottom: 12px;
    border-bottom: 1px solid var(--paper-darker);
    padding-bottom: 10px;
  }

  .broadsheet-hero-layout {
    display: flex;
    gap: 18px;
    align-items: flex-start;
  }

  .broadsheet-hero-image {
    width: 34%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    border: 1px solid var(--paper-darker);
    flex-shrink: 0;
  }

  .broadsheet-hero-text { flex: 1; min-width: 0; }

  .broadsheet-hero-body {
    font-family: 'IM Fell English', serif;
    font-size: 18px;
    line-height: 1.7;
    color: var(--ink);
    -webkit-hyphens: auto;
    hyphens: auto;
  }

  .broadsheet-secondary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding-top: 12px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .broadsheet-secondary-item {
    padding: 0 14px;
    border-left: 1px solid var(--paper-darker);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .broadsheet-secondary-item:first-child {
    padding-left: 0;
    border-left: none;
  }

  .broadsheet-secondary-image {
    width: 75%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    border: 1px solid var(--paper-darker);
    margin-bottom: 8px;
    flex-shrink: 0;
    display: block;
  }

  .broadsheet-secondary-headline {
    font-family: 'Playfair Display', serif;
    font-weight: 900;
    font-size: 17px;
    line-height: 1.2;
    color: var(--ink);
    margin-bottom: 6px;
    flex-shrink: 0;
  }

  .broadsheet-secondary-body {
    font-family: 'IM Fell English', serif;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink);
    -webkit-hyphens: auto;
    hyphens: auto;
    overflow: hidden;
  }

  .broadsheet-secondary-byline {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
    flex-shrink: 0;
  }

  .gm-btn.headline-on { color: var(--gold); }
  .gm-btn.headline-on:hover { background: var(--gold); color: var(--paper); }
  .gm-btn.headline-off { color: var(--muted); text-decoration: line-through; }
  .gm-btn.headline-off:hover { background: var(--muted); color: var(--paper); text-decoration: none; }

  /* ── Form type toggle ── */
  .form-type-toggle {
    display: flex;
    margin-bottom: 24px;
    border: 1px solid var(--paper-darker);
  }

  .form-type-btn {
    flex: 1;
    padding: 10px;
    background: none;
    border: none;
    border-right: 1px solid var(--paper-darker);
    font-family: 'IM Fell English', serif;
    font-size: 13px;
    letter-spacing: 1px;
    text-transform: uppercase;
    cursor: pointer;
    color: var(--muted);
    transition: all 0.15s;
  }

  .form-type-btn:last-child { border-right: none; }
  .form-type-btn.active { background: var(--ink); color: var(--paper); }

  /* ── Day selector ── */
  .day-selector { display: flex; gap: 6px; }

  .day-btn {
    flex: 1;
    padding: 8px 4px;
    background: none;
    border: 1px solid var(--paper-darker);
    font-family: 'IM Fell English', serif;
    font-size: 12px;
    letter-spacing: 1px;
    text-transform: uppercase;
    cursor: pointer;
    color: var(--muted);
    transition: all 0.15s;
  }

  .day-btn.selected { background: var(--ink); color: var(--paper); border-color: var(--ink); }

  /* ── Sidebar notices & entertainment ── */
  .sidebar-section-label {
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 3px;
    margin-bottom: 6px;
    margin-top: 10px;
    color: var(--muted);
  }

  .sidebar-notice {
    padding: 5px 0;
    border-bottom: 1px solid var(--paper-darker);
  }

  .sidebar-notice:last-child { border-bottom: none; }

  .sidebar-notice-headline {
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 11px;
    line-height: 1.25;
    color: var(--ink);
    margin-bottom: 2px;
  }

  .sidebar-notice-body {
    font-family: 'IM Fell English', serif;
    font-size: 10px;
    line-height: 1.5;
    color: var(--ink);
  }

  .sidebar-notice-byline {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    font-size: 9px;
    color: var(--muted);
    margin-top: 2px;
  }

  .sidebar-event-time {
    font-family: 'Playfair Display', serif;
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.5px;
    color: var(--red);
    margin-bottom: 1px;
  }

  .sidebar-empty {
    font-family: 'IM Fell English', serif;
    font-style: italic;
    font-size: 10px;
    color: var(--muted);
    padding: 4px 0 8px;
  }

  [data-style="modern"] .form-type-btn {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 11px;
    letter-spacing: 0.5px;
  }

  [data-style="modern"] .day-btn {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 11px;
  }

  [data-style="modern"] .sidebar-section-label {
    font-family: 'Inter', Arial, sans-serif;
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 1.5px;
  }

  [data-style="modern"] .sidebar-notice-headline {
    font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif;
    font-weight: 700;
    font-size: 12px;
  }

  [data-style="modern"] .sidebar-notice-body,
  [data-style="modern"] .sidebar-notice-byline,
  [data-style="modern"] .sidebar-empty {
    font-family: 'Inter', Arial, sans-serif;
    font-style: normal;
  }

  [data-style="modern"] .sidebar-event-time {
    font-family: 'Inter', Arial, sans-serif;
    font-weight: 700;
    font-size: 10px;
  }

  /* ── Mobile broadsheet (≤768px) — reflows the fixed canvas into a scrollable single-column layout ── */
  @media (max-width: 768px) {
    .broadsheet-scale-wrapper {
      padding: 0;
      background: var(--paper);
      align-items: stretch;
    }

    .broadsheet-page {
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .broadsheet-body {
      flex-direction: column;
      overflow: visible;
    }

    .broadsheet-main {
      border-right: none;
      border-bottom: 2px solid var(--rule);
      overflow: visible;
      padding: 12px 16px;
    }

    .broadsheet-hero-headline { font-size: 28px; }

    .broadsheet-hero-layout { flex-direction: column; }

    .broadsheet-hero-image {
      width: 100%;
      aspect-ratio: 16 / 9;
    }

    .broadsheet-hero-body { font-size: 15px; }

    .broadsheet-secondary {
      display: flex;
      flex-direction: column;
      overflow: visible;
      gap: 0;
      padding-top: 8px;
    }

    .broadsheet-secondary-item {
      display: grid;
      grid-template-columns: 90px 1fr;
      column-gap: 12px;
      border-left: none;
      border-top: 1px solid var(--paper-darker);
      padding: 12px 0 0;
      overflow: visible;
    }

    .broadsheet-secondary-image {
      grid-column: 1;
      grid-row: 1 / 4;
      width: 90px;
      aspect-ratio: 1 / 1;
      flex-shrink: 0;
      margin-bottom: 0;
    }

    .broadsheet-secondary-headline,
    .broadsheet-secondary-body,
    .broadsheet-secondary-byline {
      grid-column: 2;
      min-width: 0;
      overflow-wrap: break-word;
    }

    .broadsheet-secondary-headline { font-size: 15px; }

    .broadsheet-sidebar {
      width: 100%;
      padding: 12px 16px 24px;
      border-top: 2px solid var(--rule);
    }
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

function formatEventTime(iso) {
  const d = new Date(iso);
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  return `${days[d.getDay()]} ${h}:${m}${ampm}`;
}

function getPartyDays() {
  const thu = new Date(`${PARTY_THURSDAY}T00:00:00`);
  return [
    { label: "THU", date: thu },
    { label: "FRI", date: new Date(thu.getTime() + 86400000) },
    { label: "SAT", date: new Date(thu.getTime() + 2 * 86400000) },
    { label: "SUN", date: new Date(thu.getTime() + 3 * 86400000) },
  ];
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
      setArticles(data.filter(a => !a.hidden && (!a.article_type || a.article_type === "article")));
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
          }, BREAKING_DURATION_MS);
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
// Broadsheet Screen
// ============================================================
function BroadsheetScreen() {
  const hashQuery = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
  const params = new URLSearchParams(hashQuery);
  const mode = params.get("mode") || "recent";
  const speed = Math.max(5, parseInt(params.get("speed") || "15", 10));

  const [articles, setArticles] = useState([]);
  const [breaking, setBreaking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [headlineIdx, setHeadlineIdx] = useState(0);
  const breakingEventIdRef = useRef(null);
  const breakingTimerRef = useRef(null);

  async function fetchArticles() {
    const data = await supabase.query("articles", {
      select: "*",
      order: "created_at.desc",
    });
    if (Array.isArray(data)) setArticles(data.filter(a => !a.hidden));
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
          }, BREAKING_DURATION_MS);
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

  const visibleArticles = articles.filter(a => !a.article_type || a.article_type === "article");

  const notices = articles
    .filter(a => a.article_type === "notice")
    .slice(0, 4);

  const now = Date.now();
  const events = articles
    .filter(a => a.article_type === "entertainment" && a.scheduled_at)
    .filter(a => now < new Date(a.scheduled_at).getTime() + 60 * 60 * 1000)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 6);

  const headlinePool = mode === "random"
    ? visibleArticles.filter(a => a.can_be_headline !== false)
    : [];

  useEffect(() => {
    if (mode !== "random" || headlinePool.length < 2) return;
    const timer = setInterval(() => {
      setHeadlineIdx(i => {
        let next;
        do { next = Math.floor(Math.random() * headlinePool.length); } while (next === i);
        return next;
      });
    }, speed * 1000);
    return () => clearInterval(timer);
  }, [mode, speed, headlinePool.length]);

  let headline = null;
  let secondaryArticles = [];
  if (mode === "random" && headlinePool.length > 0) {
    headline = headlinePool[headlineIdx % headlinePool.length];
    secondaryArticles = visibleArticles.filter(a => a.id !== headline.id).slice(0, 3);
  } else {
    headline = visibleArticles[0] || null;
    secondaryArticles = visibleArticles.slice(1, 4);
  }

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).toUpperCase();

  return (
    <div className="broadsheet-scale-wrapper">
      <div
        className="broadsheet-page"
        data-style={DISPLAY_STYLE}
      >
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

        <div className="broadsheet-body">
          <div className="broadsheet-main">
            {loading && (
              <div className="empty-state">
                <span className="spinner" /> Awaiting dispatches from the trading floor...
              </div>
            )}
            {!loading && visibleArticles.length === 0 && (
              <div className="empty-state">No reports filed yet. The worms are still burrowing.</div>
            )}
            {headline && (
              <div className="broadsheet-hero">
                <div className="broadsheet-hero-headline">{headline.headline}</div>
                <div className="broadsheet-hero-layout">
                  {headline.image_url && (
                    <img className="broadsheet-hero-image" src={headline.image_url} alt={headline.headline} />
                  )}
                  <div className="broadsheet-hero-text">
                    <div className="broadsheet-hero-body">{headline.body}</div>
                    <div className="article-byline" style={{ marginTop: "10px" }}>
                      By {headline.author_name} · {formatDate(headline.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {secondaryArticles.length > 0 && (
              <div className="broadsheet-secondary">
                {secondaryArticles.map(a => (
                  <div key={a.id} className="broadsheet-secondary-item">
                    {a.image_url && (
                      <img className="broadsheet-secondary-image" src={a.image_url} alt={a.headline} />
                    )}
                    <div className="broadsheet-secondary-headline">{a.headline}</div>
                    <div className="broadsheet-secondary-body">
                      {a.body.slice(0, 160)}{a.body.length > 160 ? "…" : ""}
                    </div>
                    <div className="broadsheet-secondary-byline">By {a.author_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="broadsheet-sidebar">
            <div className="broadsheet-sidebar-title">Notices &amp; Entertainment</div>

            <div className="sidebar-section-label">Notices</div>
            {notices.length === 0 ? (
              <div className="sidebar-empty">No notices posted.</div>
            ) : notices.map(n => (
              <div key={n.id} className="sidebar-notice">
                <div className="sidebar-notice-headline">{n.headline}</div>
                <div className="sidebar-notice-body">{n.body}</div>
                <div className="sidebar-notice-byline">— {n.author_name}</div>
              </div>
            ))}

            <div className="sidebar-section-label">Entertainment</div>
            {events.length === 0 ? (
              <div className="sidebar-empty">No events listed.</div>
            ) : events.map(e => (
              <div key={e.id} className="sidebar-notice">
                <div className="sidebar-event-time">{formatEventTime(e.scheduled_at)}</div>
                <div className="sidebar-notice-headline">{e.headline}</div>
                <div className="sidebar-notice-body">{e.body}</div>
                <div className="sidebar-notice-byline">— {e.author_name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Article Submission Form
// ============================================================
function SubmitForm() {
  const [isNoticeMode, setIsNoticeMode] = useState(false);
  const [form, setForm] = useState({ author_name: "", headline: "", body: "" });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null); // index 0–3
  const [selectedTime, setSelectedTime] = useState("");
  const [submissionCode, setSubmissionCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();
  const partyDays = getPartyDays();

  const headlineMax = isNoticeMode ? 40 : 120;
  const bodyMax = isNoticeMode ? 160 : 600;

  function switchMode(noticeMode) {
    setIsNoticeMode(noticeMode);
    setSelectedDay(null);
    setSelectedTime("");
    setImageFile(null);
    setImagePreview(null);
    setError("");
    setForm(f => ({
      ...f,
      headline: f.headline.slice(0, noticeMode ? 40 : 120),
      body: f.body.slice(0, noticeMode ? 160 : 600),
    }));
  }

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleImageFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB."); return; }
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
    if (isNoticeMode) {
      const hasDay = selectedDay !== null;
      const hasTime = selectedTime !== "";
      if (hasDay !== hasTime) {
        setError("Please select both a day and a time for the event, or leave both blank for a general notice.");
        return;
      }
    }
    if (!submissionCode.trim()) {
      setError("Please enter the submission code.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      let image_url = null;
      if (!isNoticeMode && imageFile) image_url = await supabase.uploadImage(imageFile);

      let article_type = "article";
      let scheduled_at = null;
      if (isNoticeMode) {
        const isEvent = selectedDay !== null && selectedTime !== "";
        if (isEvent) {
          article_type = "entertainment";
          const dayDate = partyDays[selectedDay].date;
          const [hours, minutes] = selectedTime.split(":").map(Number);
          const eventDate = new Date(dayDate);
          eventDate.setHours(hours, minutes, 0, 0);
          scheduled_at = eventDate.toISOString();
        } else {
          article_type = "notice";
        }
      }

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_code: submissionCode,
          author_name: form.author_name,
          headline: form.headline,
          body: form.body,
          image_url,
          article_type,
          scheduled_at,
          can_be_headline: article_type === "article",
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Something went wrong. Please try again.");
      } else if (Array.isArray(result) && result[0]?.id) {
        setSuccess(true);
        setForm(f => ({ ...f, headline: "", body: "" }));
        setImageFile(null);
        setImagePreview(null);
        setSelectedDay(null);
        setSelectedTime("");
        setTimeout(() => setSuccess(false), 5000);
      } else {
        setError("Something went wrong. Please try again.");
        console.error("Submit result:", result);
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

      <div className="form-type-toggle">
        <button
          className={`form-type-btn ${!isNoticeMode ? "active" : ""}`}
          onClick={() => switchMode(false)}
        >
          Article
        </button>
        <button
          className={`form-type-btn ${isNoticeMode ? "active" : ""}`}
          onClick={() => switchMode(true)}
        >
          Notice / Event
        </button>
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
          placeholder={isNoticeMode ? "e.g. Drinks at the Burrow" : "e.g. SLIMECO CEO SPOTTED IN SUSPICIOUS TUNNEL"}
          maxLength={headlineMax}
        />
        <div className="char-count">{form.headline.length}/{headlineMax}</div>
      </div>

      <div className="form-group">
        <label className="form-label">{isNoticeMode ? "Details" : "Story"}</label>
        <textarea
          className="form-textarea"
          name="body"
          value={form.body}
          onChange={handleChange}
          placeholder={isNoticeMode ? "What's happening? Where? Any details..." : "Write your report, rumour, or market intelligence here..."}
          maxLength={bodyMax}
        />
        <div className="char-count">{form.body.length}/{bodyMax}</div>
      </div>

      {isNoticeMode && (
        <div className="form-group">
          <label className="form-label">Event Time — leave blank for a general notice</label>
          <div className="day-selector">
            {partyDays.map((d, i) => (
              <button
                key={d.label}
                type="button"
                className={`day-btn ${selectedDay === i ? "selected" : ""}`}
                onClick={() => setSelectedDay(selectedDay === i ? null : i)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            className="form-input"
            type="time"
            value={selectedTime}
            onChange={e => setSelectedTime(e.target.value)}
            style={{ marginTop: "8px" }}
          />
        </div>
      )}

      {!isNoticeMode && (
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
      )}

      <div className="form-group">
        <label className="form-label">Submission Code</label>
        <input
          className="form-input"
          type="text"
          value={submissionCode}
          onChange={e => setSubmissionCode(e.target.value)}
          placeholder="Enter the code to file your story"
        />
      </div>

      {error && <div className="error-msg">{error}</div>}

      <button className="submit-btn" onClick={handleSubmit} disabled={submitting}>
        {submitting
          ? <><span className="spinner" />Filing...</>
          : isNoticeMode ? "Post to Noticeboard" : "File to the Journal"}
      </button>

      {success && (
        <div className="success-msg">
          {isNoticeMode
            ? "✓ Your notice has been posted to the board."
            : "✓ Your dispatch has been filed. It will appear on the wall momentarily."}
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
  const [activeBreaking, setActiveBreaking] = useState(null);
  const [breakingExpiresAt, setBreakingExpiresAt] = useState(null);
  const [countdown, setCountdown] = useState(null);

  async function fetchBreaking() {
    const data = await supabase.query("events", { select: "*", order: "created_at.desc" });
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[0];
      if (latest.type === "breaking_news") {
        const expiresAt = new Date(latest.created_at).getTime() + BREAKING_DURATION_MS;
        if (Date.now() < expiresAt) {
          setActiveBreaking(latest.payload?.message || "BREAKING NEWS");
          setBreakingExpiresAt(expiresAt);
          return;
        }
      }
    }
    setActiveBreaking(null);
    setBreakingExpiresAt(null);
  }

  async function gmAction(action, params = {}) {
    const res = await fetch("/api/gm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, action, ...params }),
    });
    return res;
  }

  async function fetchArticles() {
    const res = await gmAction("fetch_articles");
    const data = await res.json();
    if (Array.isArray(data)) setArticles(data);
  }

  async function login() {
    const res = await gmAction("fetch_articles");
    if (res.status === 403) {
      alert("Wrong password, worm.");
      return;
    }
    if (!res.ok) {
      alert("Server error — check Vercel env vars.");
      return;
    }
    const data = await res.json();
    if (Array.isArray(data)) setArticles(data);
    setAuthed(true);
    fetchBreaking();
  }

  async function toggleHide(article) {
    await gmAction("hide", { id: article.id, hidden: !article.hidden });
    fetchArticles();
  }

  async function deleteArticle(id) {
    if (!confirm("Delete this article permanently?")) return;
    await gmAction("delete", { id });
    fetchArticles();
  }

  async function toggleHeadline(article) {
    const current = article.can_be_headline !== false;
    await gmAction("headline", { id: article.id, can_be_headline: !current });
    fetchArticles();
  }

  async function triggerBreaking() {
    if (!breakingMsg.trim()) return;
    const msg = breakingMsg.trim();
    await gmAction("trigger_breaking", { message: msg });
    setBreakingMsg("");
    setActiveBreaking(msg);
    setBreakingExpiresAt(Date.now() + BREAKING_DURATION_MS);
  }

  async function clearBreaking() {
    await gmAction("clear_breaking");
    setActiveBreaking(null);
    setBreakingExpiresAt(null);
  }

  useEffect(() => {
    if (!breakingExpiresAt) { setCountdown(null); return; }
    function tick() {
      const remaining = Math.max(0, Math.ceil((breakingExpiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) { setActiveBreaking(null); setBreakingExpiresAt(null); }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [breakingExpiresAt]);

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
      <div style={{
        marginBottom: "16px",
        padding: "8px 12px",
        background: activeBreaking ? "var(--red)" : "var(--paper-dark)",
        color: activeBreaking ? "var(--paper)" : "var(--muted)",
        fontFamily: "'IM Fell English', serif",
        fontSize: "13px",
        borderLeft: `4px solid ${activeBreaking ? "var(--red)" : "var(--paper-darker)"}`,
      }}>
        {activeBreaking ? (
          <>
            <strong>LIVE:</strong> {activeBreaking}
            {countdown !== null && (
              <span style={{ opacity: 0.8, marginLeft: "12px" }}>
                — clears in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
              </span>
            )}
          </>
        ) : "No active breaking banner."}
      </div>

      <div className="gm-section-title">All Articles ({articles.length})</div>
      {articles.map(a => (
        <div key={a.id} className={`gm-article ${a.hidden ? "hidden-article" : ""}`}>
          <div className="gm-article-headline">{a.headline}</div>
          <div className="gm-article-meta">
            By {a.author_name} · {formatDate(a.created_at)} {formatTime(a.created_at)}
            {a.hidden && " · HIDDEN"}
            {a.article_type === "notice" && " · NOTICE"}
            {a.article_type === "entertainment" && ` · EVENT${a.scheduled_at ? " " + formatEventTime(a.scheduled_at) : ""}`}
          </div>
          <div style={{ fontSize: "13px", marginBottom: "10px", fontFamily: "'IM Fell English', serif" }}>
            {a.body.slice(0, 120)}{a.body.length > 120 ? "…" : ""}
          </div>
          <button className={`gm-btn ${a.hidden ? "show" : "hide"}`} onClick={() => toggleHide(a)}>
            {a.hidden ? "Show" : "Hide"}
          </button>
          {(!a.article_type || a.article_type === "article") && (
            <button
              className={`gm-btn ${a.can_be_headline !== false ? "headline-on" : "headline-off"}`}
              onClick={() => toggleHeadline(a)}
            >
              {a.can_be_headline !== false ? "Headline ✓" : "No Headline"}
            </button>
          )}
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
    if (h === "#broadsheet") return "broadsheet";
    if (h === "#display") return "display";
    return "broadsheet";
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
        <span className={`nav-link ${route === "broadsheet" ? "active" : ""}`} onClick={() => navigate("broadsheet")}>
          Broadsheet
        </span>
        <span className={`nav-link ${route === "submit" ? "active" : ""}`} onClick={() => navigate("submit")}>
          File a Story
        </span>
        <span className={`nav-link ${route === "gm" ? "active" : ""}`} onClick={() => navigate("gm")}>
          Worm Fed
        </span>
      </div>
      {route === "display" && <DisplayScreen />}
      {route === "broadsheet" && <BroadsheetScreen />}
      {route === "submit" && <SubmitForm />}
      {route === "gm" && <GMPanel />}
    </div>
  );
}
