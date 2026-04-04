/**
 * JaffaAI API Proxy — Cloudflare Worker (ES Modules format)
 *
 * HOW TO DEPLOY:
 * 1. Cloudflare dashboard → Workers & Pages → jaffa-tts → Edit code
 * 2. Select ALL existing code and DELETE it
 * 3. Paste this entire file → click Deploy
 *
 * Secrets (Settings → Variables → Secret text) — must be set:
 *   CAMB_KEY    = Camb AI API key
 *   GEMINI_KEY  = Google Gemini API key
 *   CRICKET_KEY = cricapi.com API key
 *   APIFY_KEY   = Apify API token
 *
 * ES Modules format: secrets are accessed via the `env` parameter, NOT as globals.
 */

const CAMB_API       = "https://client.camb.ai/apis";
const GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const CRICKET_API    = "https://api.cricapi.com/v1";
const APIFY_API      = "https://api.apify.com/v2";

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url  = new URL(request.url);
    const path = url.pathname;

    try {

      // ── POST /camb/tts  → submit Camb AI job ─────────────────────────────
      if (path === "/camb/tts" && request.method === "POST") {
        if (!env.CAMB_KEY) return jsonResp({ error: "CAMB_KEY not configured" }, 503);
        const body = await request.json();
        const r = await fetch(CAMB_API + "/tts", {
          method:  "POST",
          headers: { "Content-Type": "application/json", "x-api-key": env.CAMB_KEY },
          body:    JSON.stringify(body),
        });
        if (!r.ok) return jsonResp({ error: "Camb submit failed", status: r.status }, r.status);
        return jsonResp(await r.json());
      }

      // ── GET /camb/tts/:task_id  → poll status ────────────────────────────
      if (path.startsWith("/camb/tts/") && request.method === "GET") {
        if (!env.CAMB_KEY) return jsonResp({ error: "CAMB_KEY not configured" }, 503);
        const task_id = path.slice("/camb/tts/".length);
        const r = await fetch(CAMB_API + "/tts/" + task_id, {
          headers: { "x-api-key": env.CAMB_KEY },
        });
        if (!r.ok) return jsonResp({ error: "Camb poll failed", status: r.status }, r.status);
        return jsonResp(await r.json());
      }

      // ── GET /camb/result/:run_id  → get audio URL ─────────────────────────
      if (path.startsWith("/camb/result/") && request.method === "GET") {
        if (!env.CAMB_KEY) return jsonResp({ error: "CAMB_KEY not configured" }, 503);
        const run_id = path.slice("/camb/result/".length);
        const r = await fetch(CAMB_API + "/tts-result/" + run_id + "?output_type=file_url", {
          headers: { "x-api-key": env.CAMB_KEY },
        });
        if (!r.ok) return jsonResp({ error: "Camb result failed", status: r.status }, r.status);
        return jsonResp(await r.json());
      }

      // ── POST /gemini/tts  → Gemini TTS ──────────────────────────────────
      if (path === "/gemini/tts" && request.method === "POST") {
        if (!env.GEMINI_KEY) return jsonResp({ error: "GEMINI_KEY not configured" }, 503);
        const body = await request.json();
        const r = await fetch(GEMINI_TTS_URL + "?key=" + env.GEMINI_KEY, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        if (!r.ok) return jsonResp({ error: "Gemini TTS failed", status: r.status }, r.status);
        return jsonResp(await r.json());
      }

      // ── GET /cricket/:endpoint  → cricapi.com proxy ──────────────────────
      if (path.startsWith("/cricket/") && request.method === "GET") {
        if (!env.CRICKET_KEY) return jsonResp({ error: "CRICKET_KEY not configured" }, 503);
        const endpoint = path.slice("/cricket/".length);
        const ALLOWED  = new Set(["currentMatches", "match", "matchScorecard", "match_bbb", "series", "cricScore"]);
        if (!ALLOWED.has(endpoint)) return jsonResp({ error: "Unknown endpoint" }, 400);
        const params = new URLSearchParams(url.search);
        params.set("apikey", env.CRICKET_KEY);
        const r = await fetch(CRICKET_API + "/" + endpoint + "?" + params.toString());
        if (!r.ok) return jsonResp({ error: "Cricket API failed", status: r.status }, r.status);
        return jsonResp(await r.json());
      }

      // ── POST /apify/cricket  → Apify ESPN Cricinfo scraper ───────────────
      // timeout=20 gives Apify actor enough time while staying under Cloudflare's 30s wall-time limit
      if (path === "/apify/cricket" && request.method === "POST") {
        if (!env.APIFY_KEY) return jsonResp({ error: "APIFY_KEY not configured" }, 503);
        const body = await request.json();
        const apifyUrl = APIFY_API + "/acts/fingolfin~espn-cricinfo-scraper/run-sync-get-dataset-items?token=" + env.APIFY_KEY + "&timeout=20&memory=256";
        const r = await fetch(apifyUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        if (!r.ok) {
          const errText = await r.text();
          return jsonResp({ error: "Apify failed: " + errText, status: r.status }, r.status);
        }
        const items = await r.json();
        return jsonResp({ ok: true, items: Array.isArray(items) ? items : [items] });
      }

      return new Response("JaffaAI Worker running. No matching route.", { status: 404, headers: CORS });

    } catch (e) {
      return jsonResp({ error: e.message }, 500);
    }
  }
};
