// Anonymous chat — media upload API for Cloudflare Pages Functions.
// Storage: R2 bucket binding named "MEDIA".
// Files are served through the bucket's public r2.dev URL (enable it in the
// dashboard) — set that base URL as the R2_PUBLIC_BASE environment variable,
// e.g. https://pub-xxxxxxxx.r2.dev
// Free tier: 10 GB storage, generous Class-B reads.

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

function sanitizeName(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80) || "file";
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" },
  });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.MEDIA) return json({ error: "R2 MEDIA binding missing" }, 500);
    const base = env.R2_PUBLIC_BASE;
    if (!base) return json({ error: "R2_PUBLIC_BASE env var not set" }, 500);

    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty upload" }, 400);
    if (buf.byteLength > MAX_BYTES) return json({ error: "file too large (max 25 MB)" }, 413);

    const filename = sanitizeName(new URL(request.url).searchParams.get("filename"));
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filename}`;

    await env.MEDIA.put(key, buf, {
      httpMetadata: { contentType },
    });

    return json({
      url: `${base.replace(/\/$/, "")}/${key}`,
      contentType,
      name: filename,
      size: buf.byteLength,
    });
  } catch (e) {
    return json({ error: "upload failed", detail: String(e.message || e) }, 500);
  }
}
