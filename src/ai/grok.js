// xAI Grok client. Two modes:
//  1) Direct: uses a user-supplied API key from localStorage (key lives on
//     the device only).
//  2) Proxy: routes through a Cloudflare Worker URL also stored locally,
//     so the API key can stay on the server. See proxy/README.md.

export function aiEnabled() {
  if (localStorage.getItem("aiMode") !== "on") return false;
  return !!getProxyUrl() || !!getGrokKey();
}

export function getGrokKey() {
  return localStorage.getItem("grokApiKey") || "";
}

export function getProxyUrl() {
  return (localStorage.getItem("aiProxyUrl") || "").trim();
}

export async function callGrok(systemPrompt, userPrompt, opts) {
  const proxyUrl = getProxyUrl();
  const key = getGrokKey();
  if (!proxyUrl && !key) throw new Error("Set an AI Proxy URL or a Grok API key first.");
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  if (Array.isArray(userPrompt)) {
    for (const m of userPrompt) messages.push(m);
  } else if (userPrompt) {
    messages.push({ role: "user", content: userPrompt });
  }
  const body = {
    model: (opts && opts.model) || "grok-2-latest",
    messages,
    temperature: (opts && opts.temperature !== undefined) ? opts.temperature : 0.5,
  };
  const url = proxyUrl || "https://api.x.ai/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (!proxyUrl) headers["Authorization"] = "Bearer " + key;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).substring(0, 200); } catch (e) {}
    throw new Error("API " + res.status + " " + detail);
  }
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}
