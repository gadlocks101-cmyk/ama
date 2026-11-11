// Anonymous chat — message API for Vercel serverless functions.
// Storage: Upstash Redis (free tier) via REST, with in-memory fallback for local dev.
// Set env vars in Vercel: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

const MAX_LEN = 500;
const MAX_MESSAGES = 200;
const LIST_KEY = "ama:messages";

// ---- In-memory fallback (works locally; per-instance on serverless) ----
const memory = globalThis.__amaMessages || (globalThis.__amaMessages = []);
let memoryId = globalThis.__amaId || (globalThis.__amaId = 0);

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function redis(cmd, ...args) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  const data = await res.json();
  return data.result;
}

async function readMessages() {
  if (hasRedis) {
    const raw = await redis("LRANGE", LIST_KEY, "0", "-1");
    return raw.map((r) => JSON.parse(r));
  }
  return memory;
}

async function appendMessage(msg) {
  if (hasRedis) {
    await redis("LPUSH", LIST_KEY, JSON.stringify(msg));
    await redis("LTRIM", LIST_KEY, "0", String(MAX_MESSAGES - 1));
    await redis("EXPIRE", LIST_KEY, "86400"); // auto-clear after 24h
  } else {
    memory.push(msg);
    if (memory.length > MAX_MESSAGES) memory.splice(0, memory.length - MAX_MESSAGES);
  }
}

export default async function handler(req, res) {
  // CORS: allow same-origin by default; open if needed
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const after = parseInt(req.query.after || "0", 10) || 0;
      const all = await readMessages();
      const messages = all.filter((m) => m.id > after).sort((a, b) => a.id - b.id);
      return res.status(200).json({ messages });
    }

    if (req.method === "POST") {
      const { name, text } = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const clean = String(text || "").trim().slice(0, MAX_LEN);
      const cleanName = String(name || "Anon").trim().slice(0, 24) || "Anon";
      if (!clean) return res.status(400).json({ error: "empty message" });

      const msg = { id: ++memoryId, name: cleanName, text: clean, ts: Date.now() };
      await appendMessage(msg);
      return res.status(200).json({ message: msg });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e.message || e) });
  }
}
