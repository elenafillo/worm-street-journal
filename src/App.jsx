import { useState, useEffect, useRef } from "react";

import { supabase } from "./lib/supabase.js";
import { DISPLAY_STYLE, PARTY_THURSDAY } from "./lib/config.js";
import { useBreaking } from "./lib/useBreaking.js";
import { useArticles } from "./lib/useArticles.js";
import WexTrade from "./wex/WexTrade.jsx";
import WexAdmin from "./wex/WexAdmin.jsx";
import { storedCode, wex } from "./wex/wexApi.js";
import WexDash from "./wex/WexDash.jsx";
import { wexStyles } from "./wex/wexStyles.js";
import { dashStyles } from "./wex/dashStyles.js";
import TickerDash from "./wex/TickerDash.jsx";
import { tickerStyles } from "./wex/tickerStyles.js";
import PhotoCropper, { cropperStyles } from "./PhotoCropper.jsx";
import { clampRatio, needsCrop, readPhoto, renderPhoto } from "./lib/photo.js";

// ============================================================
// Styles
// ============================================================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Inter:wght@400;500;700&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=UnifrakturMaguntia&family=IM+Fell+English:ital@0;1&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=VT323&display=swap');

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

  /* Photo slots are square and show the whole photo: uploads are cropped to
     between 4:5 and 5:4, and whatever is left over becomes paper-coloured
     bands rather than being cut off. Same rule on every screen. */
  .article-image {
    width: 160px;
    min-width: 160px;
    height: 160px;
    object-fit: contain;
    background: var(--paper-dark);
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

  /* Who is filing: the note under the byline, and the gate above the button. */
  .form-note {
    font-family: 'IM Fell English', serif;
    font-size: 13px;
    line-height: 1.4;
    color: var(--muted);
    margin-top: 6px;
  }
  .form-note b { color: var(--ink); }

  .form-login-note {
    background: var(--paper-dark);
    border-left: 4px solid var(--ink);
    padding: 14px 16px;
    font-family: 'IM Fell English', serif;
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 12px;
  }
  .form-login-note a { color: var(--ink); font-weight: bold; }

  .form-check {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-family: 'IM Fell English', serif;
    font-size: 15px;
    margin-bottom: 12px;
    cursor: pointer;
  }
  .form-check input {
    width: 18px; height: 18px; margin-top: 2px;
    flex-shrink: 0; accent-color: var(--ink);
  }
  .form-check small { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }

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

  /* Waiting for the Fed. Not faded like a hidden story: it needs a decision. */
  .gm-article.held-article { border-left-color: var(--red); }
  .gm-tag-held { color: var(--red); }

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
  [data-style="modern"] .error-msg,
  [data-style="modern"] .form-note,
  [data-style="modern"] .form-login-note,
  [data-style="modern"] .form-check {
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

  /* Fixed sizes, because the page is a fixed 1200x960 canvas. 240 + 150 is
     what leaves room for a three-line headline and all three stories below. */
  .broadsheet-hero-image {
    width: 240px;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    background: var(--paper-dark);
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
    width: 150px;
    aspect-ratio: 1 / 1;
    object-fit: contain;
    background: var(--paper-dark);
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

    /* A touch wider than square, so the photo isn't a whole screen tall;
       square and portrait photos get bands at the sides. */
    .broadsheet-hero-image {
      width: 100%;
      aspect-ratio: 5 / 4;
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

// `messages` is every live banner, newest first. They share one strip rather
// than queueing, so a second headline never waits for the first to expire.
function Ticker({ messages }) {
  const measureRef = useRef();
  const [measured, setMeasured] = useState({ segW: 0, reps: 6 });

  // One segment: for each message, big spaces + emoji + BREAKING: + message + emoji
  const segment = messages
    .map(m => TICKER_SEPARATOR + "⚡ BREAKING: " + m + " ⚡")
    .join("");

  useEffect(() => {
    if (!measureRef.current) return;
    const segW = measureRef.current.offsetWidth;
    const reps = Math.max(6, Math.ceil((3 * window.innerWidth) / segW));
    setMeasured({ segW, reps });
  }, [segment]);

  const { segW, reps } = measured;
  const tickerStyle = segW > 0 ? {
    "--ticker-offset": `-${segW}px`,
    "--ticker-duration": `${segW / 120}s`,
  } : {};

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
  const { articles: all, loaded } = useArticles();
  const loading = !loaded;
  const { live: breaking } = useBreaking();

  const articles = all.filter(a => !a.hidden && (!a.article_type || a.article_type === "article"));

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

      {breaking.length > 0 && <Ticker messages={breaking.map(b => b.message)} />}

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

  const { articles: all, loaded } = useArticles();
  const loading = !loaded;
  const [headlineIdx, setHeadlineIdx] = useState(0);
  const { live: breaking } = useBreaking();

  const articles = all.filter(a => !a.hidden);

  const visibleArticles = articles.filter(a => !a.article_type || a.article_type === "article");

  const notices = articles
    .filter(a => a.article_type === "notice")
    .slice(0, 4);

  // What's-on items drop off an hour after they start. Their own clock: the
  // articles no longer re-render the page every poll, only when news changes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
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

        {breaking.length > 0 && <Ticker messages={breaking.map(b => b.message)} />}

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
  // `photo` is what they picked, decoded; `imageFile` is what gets uploaded —
  // cropped and shrunk (lib/photo.js). Kept apart so "Adjust crop" can go
  // back to the full original.
  const [photo, setPhoto] = useState(null);         // { file, bitmap, width, height, url }
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [cropping, setCropping] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null); // index 0–3
  const [selectedTime, setSelectedTime] = useState("");
  const [held, setHeld] = useState(false);     // "Wait for approval"
  const [press, setPress] = useState(false);   // "Press release" (CEOs only)
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");  // the confirmation to show, or ""
  const [error, setError] = useState("");
  const fileRef = useRef();
  const partyDays = getPartyDays();

  // Who is filing. A WEX login is the gate for every story (it replaced the
  // shared submission code), and the same check says whether they run a
  // company. undefined = still checking, null = not logged in.
  const [who, setWho] = useState(undefined);

  // Checked on arrival and whenever the page regains focus, so a guest who
  // logs in on TRADE in another tab can come straight back and file.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const code = storedCode();
      if (!code) { if (!cancelled) setWho(null); return; }
      try {
        const { status, data } = await wex("login", { code });
        if (cancelled) return;
        setWho(status === 200 && data.player
          ? { code, name: data.player.display_name, ceo_of: data.ceo_of || null }
          : null);
      } catch {
        // Flaky party wifi: keep whatever we knew rather than locking them out.
        if (!cancelled) setWho(w => (w === undefined ? null : w));
      }
    }
    check();
    window.addEventListener("focus", check);
    return () => { cancelled = true; window.removeEventListener("focus", check); };
  }, []);

  // Notices and events never move markets, so neither option applies to them.
  const isPress = press && Boolean(who?.ceo_of) && !isNoticeMode;
  const isHeld = isPress || (held && !isNoticeMode);

  const headlineMax = isNoticeMode ? 40 : 120;
  const bodyMax = isNoticeMode ? 160 : 600;

  function switchMode(noticeMode) {
    setIsNoticeMode(noticeMode);
    setSelectedDay(null);
    setSelectedTime("");
    clearPhoto();
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

  function setUpload(file) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : null);
    setImageFile(file);
  }

  function clearPhoto() {
    if (photo) { URL.revokeObjectURL(photo.url); photo.bitmap.close?.(); }
    setPhoto(null);
    setUpload(null);
    setCropping(false);
  }

  async function applyCrop(source, rect) {
    setCropping(false);
    setProcessing(true);
    try {
      setUpload(await renderPhoto(source.bitmap, rect, source.file.name));
    } catch (err) {
      console.error(err);
      setError("That photo couldn't be processed. Try another one.");
      clearPhoto();
    }
    setProcessing(false);
  }

  // Inside 4:5–5:4 it is just shrunk; outside, the crop box opens and the
  // upload is made when they tap "Use photo".
  async function handleImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("That file isn't an image."); return; }
    if (file.size > 25 * 1024 * 1024) { setError("Image must be under 25MB."); return; }
    setError("");
    clearPhoto();
    // A GIF would lose its animation on a canvas, so it goes up as it is and
    // the square slots' bands take care of its shape.
    if (file.type === "image/gif") {
      if (file.size > 5 * 1024 * 1024) { setError("GIFs must be under 5MB."); return; }
      setUpload(file);
      return;
    }
    setProcessing(true);
    let source;
    try {
      const { bitmap, width, height } = await readPhoto(file);
      source = { file, bitmap, width, height, url: URL.createObjectURL(file) };
    } catch {
      setProcessing(false);
      setError("That photo couldn't be read. Try a JPEG or PNG.");
      return;
    }
    setPhoto(source);
    setProcessing(false);
    if (needsCrop(source.width, source.height)) setCropping(true);
    else await applyCrop(source, null);
  }

  function cancelCrop() {
    // Backing out of the first crop means no photo; backing out of an
    // adjustment keeps the one they already had.
    if (imageFile) setCropping(false);
    else clearPhoto();
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
    if (!who) {
      setError("Log in to WEX first — tap TRADE, then come back.");
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
          code: who.code,
          author_name: form.author_name,
          headline: form.headline,
          body: form.body,
          image_url,
          article_type,
          scheduled_at,
          can_be_headline: article_type === "article",
          held: isHeld,
          press: isPress,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        // Their code stopped working (regenerated, or the account was
        // unclaimed) — grey the button out again until they log back in.
        if (result.needs_login) setWho(null);
        setError(result.error || "Something went wrong. Please try again.");
      } else if (Array.isArray(result) && result[0]?.id) {
        setSuccess(
          isHeld ? "✓ Filed. Your story is with the Fed and runs when they approve it."
          : isNoticeMode ? "✓ Your notice has been posted to the board."
          : "✓ Your dispatch has been filed. It will appear on the wall momentarily."
        );
        setForm(f => ({ ...f, headline: "", body: "" }));
        clearPhoto();
        setSelectedDay(null);
        setSelectedTime("");
        setHeld(false);
        setPress(false);
        setTimeout(() => setSuccess(""), 5000);
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
        {who && (
          <div className="form-note">
            Note that the Fed will be able to see your name <b>{who.name}</b> when
            you file a story. Only your byline gets printed.
          </div>
        )}
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
          <label className="form-label">Image (Optional)</label>
          <div
            className={`image-upload-area ${dragOver ? "drag-over" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => { if (!processing) fileRef.current?.click(); }}
          >
            {processing ? (
              <label className="image-upload-label"><span className="spinner" />Preparing your photograph…</label>
            ) : imagePreview ? (
              <>
                <img className="image-preview" src={imagePreview} alt="Preview" />
                <br />
                {photo && (
                  <button
                    type="button"
                    className="image-remove"
                    style={{ marginRight: "16px" }}
                    onClick={e => { e.stopPropagation(); setCropping(true); }}
                  >
                    Adjust crop
                  </button>
                )}
                <button
                  type="button"
                  className="image-remove"
                  onClick={e => { e.stopPropagation(); clearPhoto(); }}
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
              onChange={e => { handleImageFile(e.target.files[0]); e.target.value = ""; }}
            />
          </div>
          {cropping && photo && (
            <PhotoCropper
              src={photo.url}
              initialAspect={clampRatio(photo.width / photo.height)}
              onCancel={cancelCrop}
              onDone={rect => applyCrop(photo, rect)}
            />
          )}
        </div>
      )}

      {who && !isNoticeMode && (
        <div className="form-group">
          {who.ceo_of && (
            <label className="form-check">
              <input type="checkbox" checked={press} onChange={e => setPress(e.target.checked)} />
              <span>
                Press release for {who.ceo_of.ticker}
                <small>An official statement from {who.ceo_of.name}. Always waits for the Fed&apos;s approval.</small>
              </span>
            </label>
          )}
          <label className="form-check">
            <input
              type="checkbox"
              checked={isHeld}
              disabled={isPress}
              onChange={e => setHeld(e.target.checked)}
            />
            <span>
              Wait for approval
              <small>Not published straight away. The Fed reads it first, and may move the market with it.</small>
            </span>
          </label>
        </div>
      )}

      {who === null && (
        <div className="form-login-note">
          You need to be logged in to WEX to file a story. <a href="#trade">Log in on TRADE</a> with
          the words on your card, then come back here.
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      <button className="submit-btn" onClick={handleSubmit} disabled={submitting || !who || processing || cropping}>
        {submitting
          ? <><span className="spinner" />Filing...</>
          : who === undefined ? "Checking your papers…"
          : isPress ? "File the Press Release"
          : isNoticeMode ? "Post to Noticeboard" : "File to the Journal"}
      </button>

      {success && <div className="success-msg">{success}</div>}
    </div>
  );
}

// ============================================================
// GM Panel
// ============================================================
function GMPanel() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  // Which half of the control room you are standing in. Kept as a hard split
  // rather than one row of tabs: moderating an article and crashing the
  // economy should never be one mis-tap apart.
  const [desk, setDesk] = useState("wsj");
  const [articles, setArticles] = useState([]);
  const [breakingMsg, setBreakingMsg] = useState("");
  // The same rule as the wall screens, so LIVE here means live there too,
  // including banners fired from the Exchange desk.
  const { live: liveBreaking, refresh: refreshBreaking } = useBreaking();
  const [now, setNow] = useState(Date.now);

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
    refreshBreaking();
  }

  async function clearBreaking() {
    await gmAction("clear_breaking");
    refreshBreaking();
  }

  // Ticks the countdowns. Polls only fetch every 4s, so a banner is dropped
  // here the moment it expires rather than up to one poll later.
  useEffect(() => {
    if (!liveBreaking.length) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [liveBreaking.length]);
  const liveNow = liveBreaking.filter(b => b.expiresAt > now);

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

      <div className="gm-desk-switch">
        <button
          className={`gm-desk-btn ${desk === "wsj" ? "active" : ""}`}
          onClick={() => setDesk("wsj")}
        >
          <span className="gm-desk-name">WSJ</span>
          <span className="gm-desk-sub">The Newsroom</span>
        </button>
        <button
          className={`gm-desk-btn ${desk === "wex" ? "active" : ""}`}
          onClick={() => setDesk("wex")}
        >
          <span className="gm-desk-name">WEX</span>
          <span className="gm-desk-sub">The Exchange</span>
        </button>
      </div>

      {desk === "wex" ? <WexAdmin password={pw} /> : <>

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
        {liveNow.length > 1 ? "Clear all breaking banners" : "Clear breaking banner"}
      </button>
      <div style={{
        marginBottom: "16px",
        padding: "8px 12px",
        background: liveNow.length ? "var(--red)" : "var(--paper-dark)",
        color: liveNow.length ? "var(--paper)" : "var(--muted)",
        fontFamily: "'IM Fell English', serif",
        fontSize: "13px",
        borderLeft: `4px solid ${liveNow.length ? "var(--red)" : "var(--paper-darker)"}`,
      }}>
        {liveNow.length ? liveNow.map(b => {
          const secs = Math.max(0, Math.ceil((b.expiresAt - now) / 1000));
          return (
            <div key={b.id}>
              <strong>LIVE:</strong> {b.message}
              <span style={{ opacity: 0.8, marginLeft: "12px" }}>
                — clears in {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
              </span>
            </div>
          );
        }) : "No active breaking banner."}
      </div>

      <div className="gm-section-title">All Articles ({articles.length})</div>
      {articles.map(a => (
        <div key={a.id} className={`gm-article ${a.held ? "held-article" : a.hidden ? "hidden-article" : ""}`}>
          <div className="gm-article-headline">{a.headline}</div>
          <div className="gm-article-meta">
            By {a.author_name}
            {a.filed_by && <>, filed by <b>{a.filed_by}</b></>}
            {" · "}{formatDate(a.created_at)} {formatTime(a.created_at)}
            {a.held
              ? <b className="gm-tag-held"> · HELD — awaiting approval</b>
              : a.hidden && " · HIDDEN"}
            {a.press_ticker && <b> · PRESS RELEASE · {a.press_ticker}</b>}
            {a.article_type === "notice" && " · NOTICE"}
            {a.article_type === "entertainment" && ` · EVENT${a.scheduled_at ? " " + formatEventTime(a.scheduled_at) : ""}`}
          </div>
          <div style={{ fontSize: "13px", marginBottom: "10px", fontFamily: "'IM Fell English', serif" }}>
            {a.body.slice(0, 120)}{a.body.length > 120 ? "…" : ""}
          </div>
          <button className={`gm-btn ${a.hidden ? "show" : "hide"}`} onClick={() => toggleHide(a)}>
            {a.held ? "Publish, no move" : a.hidden ? "Show" : "Hide"}
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

      </>}
    </div>
  );
}

// ============================================================
// Root App with simple routing
// ============================================================
const ROUTES = ["broadsheet", "display", "submit", "gm", "trade", "wex", "ticker"];

// Wall screens that fill the viewport and draw no nav bar of their own.
const BARE_ROUTES = ["ticker"];
const DEFAULT_ROUTE = "broadsheet";

// Strip the leading "#" and anything from "?" onward, so a hash carrying query
// params (#broadsheet?mode=random) still resolves to its route. Matching the
// whole hash exactly used to send every parameterised link to the default.
function routeFromHash() {
  const name = window.location.hash.replace(/^#/, "").split("?")[0];
  return ROUTES.includes(name) ? name : DEFAULT_ROUTE;
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);

  // Without this, browser back/forward changed the URL but not the screen.
  useEffect(() => {
    function onHashChange() { setRoute(routeFromHash()); }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function navigate(r) {
    window.location.hash = r;
    setRoute(r);
  }

  return (
    <div data-style={DISPLAY_STYLE}>
      <style>{styles}{wexStyles}{dashStyles}{tickerStyles}{cropperStyles}</style>
      {/* Five short labels, still one phone line without wrapping — roughly
          290px of text and gaps inside a 320px viewport. The old standalone
          "WSJ" brand is gone; it is now the broadsheet link itself.
          WEX is the public market dashboard on the wall, TRADE is the guest's
          own phone screen. WEX used to point at TRADE, which was always a
          slight lie. */}
      {!BARE_ROUTES.includes(route) && <div className="nav">
        <span className={`nav-link ${route === "broadsheet" ? "active" : ""}`} onClick={() => navigate("broadsheet")}>
          WSJ
        </span>
        <span className={`nav-link ${route === "wex" ? "active" : ""}`} onClick={() => navigate("wex")}>
          WEX
        </span>
        <span className={`nav-link ${route === "trade" ? "active" : ""}`} onClick={() => navigate("trade")}>
          TRADE
        </span>
        <span className={`nav-link ${route === "submit" ? "active" : ""}`} onClick={() => navigate("submit")}>
          FILE
        </span>
        <span className={`nav-link ${route === "gm" ? "active" : ""}`} onClick={() => navigate("gm")}>
          FED
        </span>
      </div>}
      {route === "display" && <DisplayScreen />}
      {route === "ticker" && <TickerDash />}
      {route === "broadsheet" && <BroadsheetScreen />}
      {route === "wex" && <WexDash />}
      {route === "trade" && <WexTrade />}
      {route === "submit" && <SubmitForm />}
      {route === "gm" && <GMPanel />}
    </div>
  );
}
