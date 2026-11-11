// Anonymous chat — message API for Vercel serverless functions.
// Storage: Vercel Blob (auto-wired via BLOB_READ_WRITE_TOKEN when a Blob store
// is connected to the project in the Vercel dashboard), with in-memory fallback
// for local dev.

import { list, put, head } from "@vercel/blob";

const MAX_LEN = 500;
const MAX_MESSAGES = 200;
const STORE_KEY = "chat.json";

const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

// ---- In-memory fallback (works locally; per-instance on serverless) ----
const memory = globalThis.__amaMessages || (globalThis.__amaMessages = { nextId: 0, messages: [] });

async function readStore() {
  if (hasBlob) {
    try {
      const blobs = await list({ prefix: STORE_KEY, limit: 1 });
      const match = blobs.blobs.find((b) => b.pathname === STORE_KEY);
      if (!match) return { nextId: 0, messages: [] };
      const res = await fetch(match.url);
      return await res.json();
    } catch {
      return { nextId: 0, messages: [] };
    }
  }
  return memory;
}

async function writeStore(store) {
  if (hasBlob) {
    await put(STORE_KEY, JSON.stringify(store), {
      access: "public",
      addRandomSuffix: false,
    });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const after = parseInt(req.query.after || "0", 10) || 0;
      const store = await readStore();
      const messages = store.messages.filter((m) => m.id > after).slice(-MAX_MESSAGES);
      return res.status(200).json({ messages });
    }

    if (req.method === "POST") {
      const { name, text, media } = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const clean = String(text || "").trim().slice(0, MAX_LEN);
      const cleanName = String(name || "Anonymous").trim().slice(0, 32) || "Anonymous";
      if (!clean && !media) return res.status(400).json({ error: "empty message" });

      // Sanitize optional media attachment
      let cleanMedia = null;
      if (media && typeof media.url === "string" && media.url.startsWith("https://")) {
        cleanMedia = {
          url: media.url,
          type: String(media.type || "application/octet-stream").slice(0, 60),
          name: String(media.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80),
          size: Math.min(parseInt(media.size, 10) || 0, 100 * 1024 * 1024),
        };
      }

      const store = await readStore();
      const msg = { id: ++store.nextId, name: cleanName, text: clean, media: cleanMedia, ts: Date.now() };
      store.messages.push(msg);
      if (store.messages.length > MAX_MESSAGES) {
        store.messages = store.messages.slice(-MAX_MESSAGES);
      }
      await writeStore(store);
      return res.status(200).json({ message: msg });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e.message || e) });
  }
}
