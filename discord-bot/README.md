# ama Discord Bot

Runs on a Cloudflare Worker with a Durable Object that holds a persistent
gateway WebSocket to Discord — the bot stays **Online 24/7**.

## Deploy (dashboard)

1. **Cloudflare → Workers & Pages → Create → Worker** → name it `ama-bot` → Deploy
2. **Edit code** → paste `worker.js` → Deploy
3. **Settings → Variables & Secrets** → add `DISCORD_TOKEN` (Secret) = the bot token
4. **Settings → Bindings** → **Durable Object Namespace** → class `BotDO`, name `BOT`, script `ama-bot`
5. **Settings → Triggers → Cron Triggers** → add `* * * * *`
6. Visit `https://ama-bot.<your-subdomain>.workers.dev/wake` → the bot connects
7. Check `https://ama-bot.<your-subdomain>.workers.dev/status` → `{"ws":true,"ready":true}`

## Invite the bot

https://discord.com/oauth2/authorize?client_id=1570178996568850452&scope=bot

## Files

- `worker.js` — Worker + BotDO (gateway connection, heartbeats, presence, auto-reconnect/resume)
- `config.json` — token (base64) + status
- `wrangler.toml` — for CLI deploys (`npx wrangler deploy` from this folder)
