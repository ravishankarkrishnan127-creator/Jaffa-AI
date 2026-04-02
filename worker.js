/**
 * JaffaAI API Proxy — Cloudflare Worker
 * Classic Service Worker format — works with Cloudflare dashboard editor default.
 *
 * HOW TO DEPLOY / UPDATE:
 * 1. In Cloudflare dashboard → Workers & Pages → jaffa-tts → Edit code
 * 2. Select ALL existing code and DELETE it
 * 3. Paste this entire file → click Deploy
 *
 * Environment variables (Settings → Variables → Secret) — must be set:
 *   CAMB_KEY    = Camb AI API key
 *   GEMINI_KEY  = Google Gemini API key
 *   CRICKET_KEY = cricapi.com API key
 *
 * NOTE: In Service Worker format, env vars are accessible as globals (not env.KEY).
 */

const CAMB_API       = "https://client.camb.ai/apis";
const GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const CRICKET_API    = "https://api.cricapi.com/v1";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url  = new URL(request.url);
  const path = url.pathname;

  try {

    // ── POST /camb/tts  → submit Camb AI job ──────────────────────────────
    if (path === "/camb/tts" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch(CAMB_API + "/tts", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-api-key": CAMB_KEY },
        body:    JSON.stringify(body),
      });
      if (!r.ok) return jsonResp({ error: "Camb submit failed", status: r.status }, r.status);
      return jsonResp(await r.json());
    }

    // ── GET /camb/tts/:task_id  → poll status ─────────────────────────────
    if (path.startsWith("/camb/tts/") && request.method === "GET") {
      const task_id = path.slice("/camb/tts/".length);
      const r = await fetch(CAMB_API + "/tts/" + task_id, {
        headers: { "x-api-key": CAMB_KEY },
      });
      if (!r.ok) return jsonResp({ error: "Camb poll failed", status: r.status }, r.status);
      return jsonResp(await r.json());
    }

    // ── GET /camb/result/:run_id  → get audio URL ─────────────────────────
    if (path.startsWith("/camb/result/") && request.method === "GET") {
      const run_id = path.slice("/camb/result/".length);
      const r = await fetch(CAMB_API + "/tts-result/" + run_id + "?output_type=file_url", {
        headers: { "x-api-key": CAMB_KEY },
      });
      if (!r.ok) return jsonResp({ error: "Camb result failed", status: r.status }, r.status);
      return jsonResp(await r.json());
    }

    // ── POST /gemini/tts  → Gemini TTS ───────────────────────────────────
    if (path === "/gemini/tts" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch(GEMINI_TTS_URL + "?key=" + GEMINI_KEY, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!r.ok) return jsonResp({ error: "Gemini TTS failed", status: r.status }, r.status);
      return jsonResp(await r.json());
    }

    // ── GET /cricket/:endpoint  → cricapi.com proxy ───────────────────────
    if (path.startsWith("/cricket/") && request.method === "GET") {
      const endpoint = path.slice("/cricket/".length);
      const ALLOWED  = new Set(["currentMatches", "match", "matchScorecard", "series", "cricScore"]);
      if (!ALLOWED.has(endpoint)) return jsonResp({ error: "Unknown endpoint" }, 400);
      const params = new URLSearchParams(url.search);
      params.set("apikey", CRICKET_KEY);
      const r = await fetch(CRICKET_API + "/" + endpoint + "?" + params.toString());
      if (!r.ok) return jsonResp({ error: "Cricket API failed", status: r.status }, r.status);
      return jsonResp(await r.json());
    }

    return new Response("JaffaAI Worker running. No matching route.", { status: 404, headers: CORS });

  } catch (e) {
    return jsonResp({ error: e.message }, 500);
  }
}
