// GoStay — panggil trigger pulihkan layanan WhatsApp di web live, lalu pantau
// sampai QR terbit / tersambung. Jalankan: node scripts/wa-restore.mjs
import fs from "fs";
import crypto from "crypto";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const si = b64({ alg: "HS256", typ: "JWT" }) + "." +
  b64({ sub: "b0000000-0000-4000-8000-00000000ab02", role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 });
const token = si + "." + crypto.createHmac("sha256", env.SUPABASE_JWT_SECRET).update(si).digest("base64url");
const H = { Authorization: "Bearer " + token };
const BASE = "https://app.gostay.id";

const before = await fetch(`${BASE}/api/wa/connect`, { headers: H });
console.log("sebelum   :", (await before.text()).slice(0, 120));

const res = await fetch(`${BASE}/api/wa/connect?action=restore`, {
  method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}",
});
const body = await res.text();
console.log("restore   :", res.status, body.slice(0, 160));

for (let i = 1; i <= 8; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const g = await fetch(`${BASE}/api/wa/connect`, { headers: H });
  const t = await g.text();
  // QR payloads are huge data-urls; report only the shape.
  const status = (t.match(/"status":"([^"]+)"/) || [])[1] ?? "?";
  console.log(`poll ${i}: status=${status}${t.includes('"qr"') ? "  (QR TERBIT)" : ""}`);
  if (status === "qr" || status === "open") break;
}
