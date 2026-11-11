// Anonymous chat — media upload API for Vercel serverless functions.
// Stores files in Vercel Blob, returns a public URL.
// Note: serverless request body limit ~4.5 MB (Vercel Hobby).

import { put } from "@vercel/blob";

const MAX_BYTES = 4.5 * 1024 * 1024;

function sanitizeName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80) || "file";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ error: "Blob store not connected" });
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        return res.status(413).json({ error: "file too large (max ~4.5 MB)" });
      }
      chunks.push(chunk);
    }
    if (total === 0) return res.status(400).json({ error: "empty upload" });

    const filename = sanitizeName(req.query.filename);
    const contentType = String(req.headers["content-type"] || "application/octet-stream");

    const blob = await put(`uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filename}`, Buffer.concat(chunks), {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });

    return res.status(200).json({
      url: blob.url,
      contentType,
      name: filename,
      size: total,
    });
  } catch (e) {
    return res.status(500).json({ error: "upload failed", detail: String(e.message || e) });
  }
}
