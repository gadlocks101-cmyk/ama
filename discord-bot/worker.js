// ama Discord bot — Cloudflare Worker + Durable Object
// Keeps a persistent gateway connection so the bot appears Online 24/7.
//
// Setup (Cloudflare dashboard):
//   1. Workers & Pages -> Create -> Worker ("ama-bot") -> paste this file
//   2. Settings -> Variables -> add DISCORD_TOKEN (secret) = your bot token
//   3. Settings -> Triggers -> add Cron Trigger: * * * * * (keeps DO awake)
//   4. In wrangler.toml / dashboard, add Durable Object binding BOT -> BotDO
//      (Dashboard: Settings -> Bindings -> Durable Object -> class BotDO,
//       namespace ama-bot-do, script ama-bot)
//   5. Deploy. Visit https://ama-bot.<your-subdomain>.workers.dev/wake to start it.

const INTENTS = 1; // GUILDS — enough for presence; add more later

export class BotDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ws = null;
    this.heartbeatInterval = null;
    this.seq = null;
    this.sessionId = null;
    this.resumeGatewayUrl = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/wake") {
      await this.ensureConnected();
      return new Response(JSON.stringify({ status: this.ws ? "connecting/connected" : "down" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/status") {
      return new Response(JSON.stringify({ ws: !!this.ws, ready: this.ready || false }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }

  async ensureConnected() {
    if (this.ws && this.ws.readyState === 1) return;
    await this.connect();
  }

  async connect() {
    const token = this.env.DISCORD_TOKEN;
    if (!token) { console.error("DISCORD_TOKEN missing"); return; }

    this.ws = new WebSocket(
      this.resumeGatewayUrl || "wss://gateway.discord.gg/?v=10&encoding=json"
    );
    this.ws.accept();

    this.ws.addEventListener("message", (ev) => this.handleGateway(JSON.parse(ev.data)));
    this.ws.addEventListener("close", () => this.scheduleReconnect());
    this.ws.addEventListener("error", () => this.scheduleReconnect());
  }

  async handleGateway(p) {
    if (p.s !== null) this.seq = p.s;

    switch (p.op) {
      case 10: { // HELLO
        this.heartbeatInterval = p.d.heartbeat_interval;
        await this.state.storage.setAlarm(Date.now() + this.heartbeatInterval);

        if (this.sessionId) {
          // RESUME
          this.ws.send(JSON.stringify({
            op: 6,
            d: { token: this.env.DISCORD_TOKEN, session_id: this.sessionId, seq: this.seq },
          }));
        } else {
          // IDENTIFY — show online with a custom activity
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
              properties: {
                os: "linux",
                browser: "ama-worker",
                device: "ama-worker",
              },
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
        // Future: handle p.t === "MESSAGE_CREATE" etc.
        break;
      case 7: // RECONNECT
        this.ws.close(4000);
        break;
      case 9: // INVALID SESSION
        if (!p.d) { this.sessionId = null; this.ready = false; }
        setTimeout(() => this.ws.send(JSON.stringify({ op: 2, d: {
          token: this.env.DISCORD_TOKEN, intents: INTENTS,
          properties: { os: "linux", browser: "ama-worker", device: "ama-worker" },
        }})), 2000);
        break;
    }
  }

  async alarm() {
    const now = Date.now();
    if (this.ws && this.ws.readyState === 1) {
      // heartbeat
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/wake" || url.pathname === "/status") {
      const id = env.BOT.idFromName("singleton");
      const stub = env.BOT.get(id);
      return stub.fetch(request);
    }
    return new Response("ama bot worker — visit /wake", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    // Cron keeps the DO alive so the gateway connection persists
    const id = env.BOT.idFromName("singleton");
    const stub = env.BOT.get(id);
    ctx.waitUntil(stub.fetch("https://do/wake"));
  },
};
