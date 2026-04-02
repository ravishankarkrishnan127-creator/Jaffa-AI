/**
 * JaffaAI API Proxy — Cloudflare Worker
 *
 * HOW TO DEPLOY (one-time, ~5 minutes):
 * 1. Go to https://dash.cloudflare.com → Workers & Pages → Create application → Create Worker
 * 2. Name it "jaffa-tts", click Deploy, then click "Edit code"
 * 3. Select all default code, delete it, paste this entire file → click Deploy
 * 4. Go to Settings → Variables → add three Environment Variables:
 *      CAMB_KEY    = your Camb AI API key  (from camb.ai)
 *      GEMINI_KEY  = your Google Gemini API key  (from aistudio.google.com)
 *      CRICKET_KEY = your cricapi.com API key  (from cricapi.com)
 * 5. Copy your Worker URL (e.g. https://jaffa-tts.YOUR_NAME.workers.dev)
 * 6. In index.html set:  const PROXY = "https://jaffa-tts.YOUR_NAME.workers.dev";
 *
 * ROUTES:
 *   POST /camb/tts              → submit TTS job to Camb AI
 *   GET  /camb/tts/:task_id     → poll Camb AI job status
 *   GET  /camb/result/:run_id   → get final audio URL from Camb AI
 *   POST /gemini/tts            → generate audio via Gemini TTS
 *   GET  /cricket/:endpoint     → proxy cricapi.com calls (adds API key server-side)
 */

const CAMB_API       = "https://client.camb.ai/apis";
const GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const CRICKET_API    = "https://api.cricapi.com/v1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Allowed cricapi endpoints (whitelist to prevent misuse)
const CRICKET_ENDPOINTS = new Set([
  "currentMatches", "match", "matchScorecard", "series", "cricScore"
]);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {

      // ── POST /camb/tts  → submit Camb AI job ─────────────────────────────
      if (path === "/camb/tts" && request.method === "POST") {
        const body = await request.json();
        const r = await fetch(CAMB_API + "/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.CAMB_KEY },
          body: JSON.stringify(body),
        });
        if (!r.ok) return json({ error: "Camb submit failed", status: r.status }, r.status);
        return json(await r.json());
      }

      // ── GET /camb/tts/:task_id  → poll status ────────────────────────────
      if (path.startsWith("/camb/tts/") && request.method === "GET") {
        const task_id = path.slice("/camb/tts/".length);
        const r = await fetch(CAMB_API + "/tts/" + task_id, {
          headers: { "x-api-key": env.CAMB_KEY },
        });
        if (!r.ok) return json({ error: "Camb poll failed", status: r.status }, r.status);
        return json(await r.json());
      }

      // ── GET /camb/result/:run_id  → get audio URL ────────────────────────
      if (path.startsWith("/camb/result/") && request.method === "GET") {
        const run_id = path.slice("/camb/result/".length);
        const r = await fetch(
          CAMB_API + "/tts-result/" + run_id + "?output_type=file_url",
          { headers: { "x-api-key": env.CAMB_KEY } }
        );
        if (!r.ok) return json({ error: "Camb result failed", status: r.status }, r.status);
        return json(await r.json());
      }

      // ── POST /gemini/tts  → Gemini TTS ──────────────────────────────────
      if (path === "/gemini/tts" && request.method === "POST") {
        const body = await request.json();
        const r = await fetch(GEMINI_TTS_URL + "?key=" + env.GEMINI_KEY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) return json({ error: "Gemini TTS failed", status: r.status }, r.status);
        return json(await r.json());
      }

      // ── GET /cricket/:endpoint?params  → cricapi.com proxy ───────────────
      // e.g. /cricket/currentMatches?offset=0
      //      /cricket/match?id=abc123
      //      /cricket/matchScorecard?id=abc123
      if (path.startsWith("/cricket/") && request.method === "GET") {
        const endpoint = path.slice("/cricket/".length);
        if (!CRICKET_ENDPOINTS.has(endpoint)) {
          return json({ error: "Unknown cricket endpoint" }, 400);
        }
        // Forward all query params, inject API key
        const params = new URLSearchParams(url.search);
        params.set("apikey", env.CRICKET_KEY);
        const r = await fetch(`${CRICKET_API}/${endpoint}?${params.toString()}`);
        if (!r.ok) return json({ error: "Cricket API failed", status: r.status }, r.status);
        return json(await r.json());
      }

      return new Response("Not found", { status: 404, headers: CORS_HEADERS });

    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
