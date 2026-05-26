// Cloudflare Worker: Grok API proxy for Golf Tracker
//
// Holds the xAI API key as a Worker secret so it never reaches the browser.
// The deployed Golf Tracker calls THIS worker; the worker calls api.x.ai
// with the Authorization header attached.
//
// Setup (3 steps):
//   1. npm i -g wrangler && wrangler login
//   2. cd proxy && wrangler secret put GROK_API_KEY    # paste your xai-... key
//   3. wrangler deploy                                  # prints the *.workers.dev URL
//
// Then in the Golf Tracker app → Stats tab → AI Coach settings,
// paste the *.workers.dev URL into the "AI Proxy URL" field.

const ALLOWED_ORIGINS = [
  "https://ayaan2129.github.io",
  "http://localhost:8765",
  "http://localhost:8080",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const key = env.GROK_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "GROK_API_KEY not configured on the worker" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Forward to xAI. The body has the OpenAI-compatible chat completions shape
    // (model, messages, temperature, ...).
    const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      },
    });
  },
};
