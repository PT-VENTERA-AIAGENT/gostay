// GoStay — probe status layanan WhatsApp di web live sebagai staff.
// Jalankan: node scripts/wa-probe.mjs
import fs from "fs";
import crypto from "crypto";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const mint = (sub) => {
  const now = Math.floor(Date.now() / 1000);
  const si = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 });
  return si + "." + crypto.createHmac("sha256", env.SUPABASE_JWT_SECRET).update(si).digest("base64url");
};

const token = mint("b0000000-0000-4000-8000-00000000ab02"); // Budi (staff, Kopi Rintik)

const res = await fetch("https://app.gostay.id/api/wa/connect", {
  headers: { Authorization: "Bearer " + token },
});
console.log("GET /api/wa/connect →", res.status);
console.log(await res.text());
