# ama · anonymous chat

A lightweight anonymous chat site. No accounts, no names — you get a random `Anonymous#1234` alias locally. Responsive for desktop & mobile, installable as a PWA. Supports sending images, videos and files of any format.

## Deploy to Cloudflare Pages

1. **Create the project:** dash.cloudflare.com → Workers & Pages → Create → Pages → **Connect to Git** → select `gadlocks101-cmyk/ama`
   - Build command: *(none)*
   - Build output directory: `/` (root)
2. **Create a KV namespace:** Workers & Pages → KV → Create namespace, name it `ama_messages`
3. **Create an R2 bucket:** R2 → Create bucket, name it `ama-media`, and enable **public access** (r2.dev URL)
4. **Bind them:** Pages project → Settings → Functions →
   - **KV namespace bindings:** add `MESSAGES` → `ama_messages` (Production + Preview)
   - **R2 bucket bindings:** add `MEDIA` → `ama-media`
   - **Environment variables:** add `R2_PUBLIC_BASE` = your bucket's public r2.dev URL (from R2 → bucket → Settings → Public access)
5. **Redeploy** the project so bindings apply.

## How it works

- `index.html` — mobile-first UI, `Anonymous#XXXX` alias stored in `localStorage`, 2s polling.
- `functions/api/messages.js` — GET/POST; messages stored in KV (last 200 kept).
- `functions/api/upload.js` — POST raw file bytes (max 25 MB); stored in R2, public URL returned.
- PWA: `manifest.json` + `sw.js` — installable, offline-capable shell.
