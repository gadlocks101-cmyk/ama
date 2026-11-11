# ama · anonymous chat

A lightweight anonymous chat site. No accounts, no names — you get a random alias locally. Responsive for desktop & mobile.

## Deploy to Vercel

1. Push this repo (or import it at vercel.com/new).
2. **Recommended:** create a free database at [upstash.com](https://upstash.com) (Redis), then add these env vars in your Vercel project settings:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Deploy. Done.

> Without Upstash, the app still works locally (in-memory fallback), but on serverless each instance has its own memory — set up Upstash for production.

## How it works

- Static `index.html` — mobile-first UI, random anonymous alias stored in `localStorage`.
- `api/messages.js` — GET/POST serverless endpoint (2s polling for near-realtime updates).
- Messages auto-expire after 24h, capped at the last 200.
