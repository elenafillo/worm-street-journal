// ============================================================
// Supabase client (browser)
// ============================================================
// A hand-rolled PostgREST wrapper — the supabase-js SDK is not installed and
// is not needed for this.
//
// The anon key below is public by design: it ships inside the JS bundle, so
// anyone can read it and craft their own requests. Everything it can reach is
// therefore read-only by RLS. All writes go through the service-role
// serverless functions in /api. Never add a mutation path here that the
// database itself would not let a stranger perform.

export const SUPABASE_URL = "https://bliocisgoedlybzlfytk.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsaW9jaXNnb2VkbHliemxmeXRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTQ5MzUsImV4cCI6MjA5NDI5MDkzNX0.u3BZQrm6lWSPPd4gvyZOK9koOispIhYLnjqevtj5fCA";

function getHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export const supabase = {
  async query(table, options = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    const params = new URLSearchParams();
    if (options.select) params.append("select", options.select);
    if (options.order) params.append("order", options.order);
    if (options.limit) params.append("limit", options.limit);
    // Row filters, PostgREST-style: { id: "gt.4210" }. Read-only, like the rest
    // of this method — the dashboard needs it to fetch only the price ticks it
    // has not already seen, instead of re-pulling the night's history every
    // three seconds. Do not extend this to the mutating methods below.
    if (options.params) {
      for (const [k, v] of Object.entries(options.params)) params.append(k, v);
    }
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
  // Not realtime — a plain poll. Callers pass their own interval; the default
  // matches the newspaper's original 4s cadence.
  subscribe(table, callback, intervalMs = 4000) {
    const interval = setInterval(callback, intervalMs);
    return () => clearInterval(interval);
  },
};
