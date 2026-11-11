// Temporary diagnostic — reports which env var NAMES exist (never values).
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const names = Object.keys(process.env).filter((k) =>
    /BLOB|UPSTASH|KV/i.test(k)
  );
  return res.status(200).json({ present: names, node: process.version });
}
