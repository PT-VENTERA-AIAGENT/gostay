// GoStay — siapkan E2E di web LIVE.
//
// Menjalankan operasi SENSITIF (dieksekusi oleh Anda, bukan otomatis):
//   1) set payment_config.platform_fee_bps = 700  (fee jadi 7%, mulai sekarang)
//   2) mint sesi login STAFF (Budi) + TAMU (Andi) yang valid 30 hari, lalu cetak
//      snippet console yang tinggal Anda tempel di F12 → Console pada situs.
//
// Jalankan:  node scripts/e2e-live-setup.mjs
// (butuh .env berisi VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET)

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

function mint(sub) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 30 * 24 * 3600;
  const si = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp });
  return si + "." + crypto.createHmac("sha256", env.SUPABASE_JWT_SECRET).update(si).digest("base64url");
}

const PEOPLE = [
  { tag: "STAFF", pid: "b0000000-0000-4000-8000-00000000ab02", sub: "ab|budi", name: "Budi Staff",  email: "budi@demo.local", role: "staff",    home: "/dashboard" },
  { tag: "TAMU",  pid: "a0000000-0000-4000-8000-00000000ab01", sub: "ab|andi", name: "Andi Wijaya", email: "andi@demo.local", role: "customer", home: "/portal/my-account" },
];

async function main() {
  // 1) Fee → 7%
  const fee = await svc.from("payment_config").update({ platform_fee_bps: 700, updated_by: "e2e_live_setup" }).eq("id", true).select().maybeSingle();
  console.log("payment_config:", fee.error ? "GAGAL " + fee.error.message : JSON.stringify(fee.data));

  // 2) Login staff + tamu
  for (const p of PEOPLE) {
    const prof = await svc.from("profiles").select("id,role,tenant_id,full_name").eq("id", p.pid).maybeSingle();
    const session = {
      claims: { sub: p.sub, name: p.name, email: p.email },
      access_token: "x",
      expires_at: Date.now() + 30 * 24 * 3600 * 1000,
      supabase_token: mint(p.pid),
      role: p.role,
      profile_id: p.pid,
    };
    const snippet = `sessionStorage.setItem('gostay_sso_session', ${JSON.stringify(JSON.stringify(session))}); location.href='${p.home}';`;
    console.log(`\n===== ${p.tag} — ${p.name} =====`);
    console.log("profil DB :", prof.data ? JSON.stringify(prof.data) : "(TIDAK DITEMUKAN — sesi tetap dibuat tapi RLS akan menolak)");
    console.log("Buka situs (mis. https://app.gostay.id atau http://localhost:8080), F12 → Console, tempel:\n" + snippet);
  }
  console.log("\nSelesai. Login valid 30 hari.");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
