// ============================================================
// Client for /api/wex
// ============================================================
// Mirrors the gmAction() shape already used by the GM panel.
//
// The code is a bearer token. It is kept in localStorage so a guest is not
// retyping three words every time their phone locks, and it is sent on every
// request — there is no session.

const STORAGE_KEY = "wex_code";

export function storedCode() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    // Private browsing, or storage blocked. The gate still works, the guest
    // just re-enters their words.
    return "";
  }
}

export function rememberCode(code) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* not fatal */ }
}

export function forgetCode() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* not fatal */ }
}

/**
 * Every call returns { status, data }. Callers decide what a status means —
 * a refused trade is a normal 200 with { ok: false }, not an exception.
 */
export async function wex(action, params = {}) {
  const res = await fetch("/api/wex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { error: "The exchange said something unintelligible." };
  }
  return { status: res.status, data };
}
