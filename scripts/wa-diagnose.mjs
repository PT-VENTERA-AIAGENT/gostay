// GoStay — diagnosa layanan WhatsApp per hotel: status sambungan gateway,
// pemetaan sesi, dan apakah balasan bisa terkirim.
// Jalankan: node scripts/wa-diagnose.mjs
import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const mint = (sub) => {
  const now = Math.floor(Date.now() / 1000);
  const si = b64({ alg: "HS256", typ: "JWT" }) + "." +
    b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 });
  return si + "." + crypto.createHmac("sha256", env.SUPABASE_JWT_SECRET).update(si).digest("base64url");
};
const BASE = "https://app.gostay.id";

const sessions = await svc.from("wa_hotel_sessions").select("session_id,tenant_id,bot_number,is_active");
const tenants = await svc.from("tenants").select("id,name,slug");
const nameOf = (id) => (tenants.data ?? []).find((t) => t.id === id)?.name ?? id;

// Seorang anggota hotel (staf/admin) untuk tiap tenant, agar endpoint bisa dipanggil.
const members = await svc.from("profiles")
  .select("id,email,role,tenant_id").in("role", ["staff", "admin"]).eq("is_active", true);

console.log("STATUS SESI WHATSAPP PER HOTEL\n");
for (const s of sessions.data ?? []) {
  const who = (members.data ?? []).find((m) => m.tenant_id === s.tenant_id && !m.email.includes("bot.gostay.local"));
  let live = "(tak ada akun untuk memanggil endpoint)";
  if (who) {
    try {
      const r = await fetch(`${BASE}/api/wa/connect?tenantId=${s.tenant_id}`, {
        headers: { Authorization: "Bearer " + mint(who.id) },
      });
      const body = await r.text();
      const status = (body.match(/"status":"([^"]+)"/) || [])[1] ?? body.slice(0, 80);
      const connected = /"connected":true/.test(body);
      live = `${status}${connected ? " (TERSAMBUNG)" : " (TIDAK tersambung)"}`;
    } catch (e) {
      live = "gagal memanggil: " + e.message;
    }
  }
  console.log(`${nameOf(s.tenant_id)}`);
  console.log(`  session_id : ${s.session_id}`);
  console.log(`  is_active  : ${s.is_active}`);
  console.log(`  bot_number : ${s.bot_number}`);
  console.log(`  gateway    : ${live}\n`);
}
