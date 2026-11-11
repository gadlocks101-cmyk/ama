// ama — Cloudflare Pages advanced-mode worker.
// Serves static assets AND runs the Discord bot (Durable Object keeps a
// persistent gateway WebSocket so the bot shows Online 24/7).
//
// Required Pages settings:
//   - Environment variable: DISCORD_TOKEN (Secret) = bot token
//   - Durable Object binding is declared in wrangler.toml (migrations)

const INTENTS = 1; // GUILDS

export class BotDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ws = null;
    this.seq = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.ready = false;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/wake") {
      await this.ensureConnected();
      return json({ ws: !!this.ws, ready: this.ready });
    }
    if (url.pathname === "/status") {
      return json({ ws: !!this.ws, ready: this.ready, session: !!this.sessionId });
    }
    return json({ error: "not found" }, 404);
  }

  async ensureConnected() {
    if (this.ws && this.ws.readyState === 1) return json;
    await this.connect();
  }

  async connect() {
    const token = this.env.DISCORD_TOKEN;
    if (!token) { console.error("DISCORD_TOKEN missing"); return; }

    this.ws = new WebSocket(this.resumeGatewayUrl || "wss://gateway.discord.gg/?v=10&encoding=json");
    this.ws.accept();
    this.ws.addEventListener("message", (ev) => this.handleGateway(JSON.parse(ev.data)));
    this.ws.addEventListener("close", () => this.scheduleReconnect());
    this.ws.addEventListener("error", () => this.scheduleReconnect());

    // Safety net: alarm heartbeat/reconnect loop (works even after eviction)
    await this.state.storage.setAlarm(Date.now() + 5000);
  }

  async handleGateway(p) {
    if (p.s !== null) this.seq = p.s;

    switch (p.op) {
      case 10: { // HELLO
        this.heartbeatInterval = p.d.heartbeat_interval;
        await this.state.storage.setAlarm(Date.now() + this.heartbeatInterval);

        if (this.sessionId) {
          this.ws.send(JSON.stringify({
            op: 6,
            d: { token: this.env.DISCORD_TOKEN, session_id: this.sessionId, seq: this.seq },
          }));
        } else {
          this.ws.send(JSON.stringify({
            op: 2,
            d: {
              token: this.env.DISCORD_TOKEN,
              intents: INTENTS,
              presence: {
                status: "online",
                activities: [{ name: "ama · anonymous chat", type: 0 }],
                since: null,
                afk: false,
              },
              properties: { os: "linux", browser: "ama-worker", device: "ama-worker" },
            },
          }));
        }
        break;
      }
      case 11: // HEARTBEAT ACK
        this.ack = true;
        break;
      case 0: // DISPATCH
        if (p.t === "READY") {
          this.sessionId = p.d.session_id;
          this.resumeGatewayUrl = p.d.resume_gateway_url;
          this.ready = true;
        }
        if (p.t === "RESUMED") this.ready = true;
        // Future: handle p.t === "MESSAGE_CREATE" etc. for chat relay
        break;
      case 7: // RECONNECT requested
        this.ws.close(4000);
        break;
      case 9: // INVALID SESSION
        if (!p.d) { this.sessionId = null; this.ready = false; }
        setTimeout(() => this.identify(), 2000);
        break;
    }
  }

  identify() {
    if (!this.ws || this.ws.readyState !== 1) return this.connect();
    this.ws.send(JSON.stringify({
      op: 2,
      d: {
        token: this.env.DISCORD_TOKEN,
        intents: INTENTS,
        presence: {
          status: "online",
          activities: [{ name: "ama · anonymous chat", type: 0 }],
          since: null,
          afk: false,
        },
        properties: { os: "linux", browser: "ama-worker", device: "ama-worker" },
      },
    }));
  }

  async alarm() {
    const now = Date.now();
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ op: 1, d: this.seq }));
      await this.state.storage.setAlarm(now + (this.heartbeatInterval || 41250));
    } else {
      await this.connect();
      await this.state.storage.setAlarm(now + 5000);
    }
  }

  async scheduleReconnect() {
    this.ws = null;
    this.ready = false;
    await this.state.storage.setAlarm(Date.now() + 5000);
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/wake" || url.pathname === "/status") {
      const id = env.BOT.idFromName("singleton");
      const stub = env.BOT.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
