// Anonymous chat — messages API for Cloudflare Pages Functions.
// Storage: Workers KV binding "MESSAGES" (single key holding JSON array).
// Requires Pages bindings: KV namespace MESSAGES.

const LIST_KEY = "chat";
const MAX_LEN = 500;
const MAX_MESSAGES = 200;

async function readStore(env) {
  if (env.__cache && env.__cache.loaded) return env.__cache;
  const raw = await env.MESSAGES.get(LIST_KEY);
  const parsed = raw ? JSON.parse(raw) : { nextId: 0, messages: [] };
  env.__cache = { loaded: true, nextId: parsed.nextId || 0, messages: parsed.messages || [] };
  return env.__cache;
}

async function writeStore(env, c) {
  await env.MESSAGES.put(LIST_KEY, JSON.stringify({ nextId: c.nextId, messages: c.messages }));
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
  });
}

export async function onRequestGet({ request, env }) {
  const after = parseInt(new URL(request.url).searchParams.get("after") || "0", 10) || 0;
  const store = await readStore(env);
  const messages = store.messages.filter((m) => m.id > after).slice(-MAX_MESSAGES);
  return json({ messages });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { name, text, media } = body || {};
    const clean = String(text || "").trim().slice(0, MAX_LEN);
    const cleanName = String(name || "Anonymous").trim().slice(0, 32) || "Anonymous";
    if (!clean && !media) return json({ error: "empty message" }, 400);

    let cleanMedia = null;
    if (media && typeof media.url === "string" && media.url.startsWith("https://")) {
      cleanMedia = {
        url: media.url,
        type: String(media.type || "application/octet-stream").slice(0, 60),
        name: String(media.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80),
        size: Math.min(parseInt(media.size, 10) || 0, 100 * 1024 * 1024),
      };
    }

    const store = await readStore(env);
    const msg = { id: ++store.nextId, name: cleanName, text: clean, media: cleanMedia, ts: Date.now() };
    store.messages.push(msg);
    if (store.messages.length > MAX_MESSAGES) store.messages = store.messages.slice(-MAX_MESSAGES);
    await writeStore(env, store);
    return json({ message: msg });
  } catch (e) {
    return json({ error: "server error", detail: String(e.message || e) }, 500);
  }
}
