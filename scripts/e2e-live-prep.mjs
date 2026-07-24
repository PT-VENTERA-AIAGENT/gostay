// GoStay — prep sebelum E2E live: fee 7%, bersihkan saldo demo Kopi Rintik,
// dan tulis sesi STAFF untuk dibaca Playwright. Jalankan: node scripts/e2e-live-prep.mjs
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
  const now = Math.floor(Date.now() / 1000), exp = now + 30 * 24 * 3600;
  const si = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp });
  return si + "." + crypto.createHmac("sha256", env.SUPABASE_JWT_SECRET).update(si).digest("base64url");
};

const T = "00000000-0000-4000-8000-000000000001"; // Kopi Rintik
const STAFF = "b0000000-0000-4000-8000-00000000ab02";

async function main() {
  // 1) Fee 7%
  const fee = await svc.from("payment_config").update({ platform_fee_bps: 700, updated_by: "e2e_live_prep" }).eq("id", true).select().maybeSingle();
  console.log("fee:", fee.error ? "GAGAL " + fee.error.message : fee.data.platform_fee_bps + " bps");

  // 2) Bersihkan artefak saldo demo (urutan penting agar trigger reverse jadi no-op)
  for (const step of [
    ["payouts", () => svc.from("payouts").delete().eq("tenant_id", T)],
    ["balance_ledger", () => svc.from("balance_ledger").delete().eq("tenant_id", T)],
    ["payments", () => svc.from("payments").delete().eq("tenant_id", T)],
    ["hotel_balance", () => svc.from("hotel_balance").delete().eq("tenant_id", T)],
  ]) {
    const r = await step[1]();
    console.log("bersih " + step[0] + ":", r.error ? "GAGAL " + r.error.message : "ok");
  }

  // 3) Sesi STAFF untuk Playwright
  const session = {
    claims: { sub: "ab|budi", name: "Budi Staff", email: "budi@demo.local" },
    access_token: "x",
    expires_at: Date.now() + 30 * 24 * 3600 * 1000,
    supabase_token: mint(STAFF),
    role: "staff",
    profile_id: STAFF,
  };
  fs.mkdirSync(new URL("../e2e/__fixtures__/", import.meta.url), { recursive: true });
  fs.writeFileSync(new URL("../e2e/__fixtures__/session.staff.json", import.meta.url), JSON.stringify(session, null, 2));
  console.log("sesi staff ditulis → e2e/__fixtures__/session.staff.json");
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
