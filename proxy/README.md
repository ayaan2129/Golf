# Golf Tracker → Grok API proxy

A 60-line Cloudflare Worker that holds your xAI API key as a server-side
secret and forwards requests from the Golf Tracker. Free tier covers
100,000 requests/day — more than enough for personal use.

## Why a proxy

The Golf Tracker is hosted on GitHub Pages, which only serves static files.
Embedding the API key in `script.js` would expose it to anyone who views
source. The proxy keeps the credential on the server side.

## Deploy (one-time, ~5 minutes)

You need a free Cloudflare account.

```bash
# 1. Install wrangler (Cloudflare's CLI)
npm install -g wrangler

# 2. Authenticate (opens a browser tab)
wrangler login

# 3. From the proxy/ directory, store the API key as a secret
cd proxy
wrangler secret put GROK_API_KEY
# Paste the xai-... key when prompted, then press Enter

# 4. Deploy
wrangler deploy
# Wrangler prints the URL, e.g.
#   https://golf-grok-proxy.<your-subdomain>.workers.dev
```

## Wire it up in the app

1. Open the Golf Tracker → Stats tab → "AI Coach Settings" card
2. Paste the `*.workers.dev` URL into the **AI Proxy URL** field
3. Tick "Use AI for chat & reports"

Chat replies and the AI-generated round reports now route through your
Worker. The xAI key never reaches the browser.

## Optional: lock down the allowed origins

Edit `ALLOWED_ORIGINS` in `grok-worker.js` and re-deploy. Default allows
`https://ayaan2129.github.io` plus localhost for development. Add any
other origin (e.g. a custom domain) before deploying.

## Rotate the key later

```bash
wrangler secret put GROK_API_KEY
# Paste the new key
wrangler deploy
```

Then revoke the old key on console.x.ai.
