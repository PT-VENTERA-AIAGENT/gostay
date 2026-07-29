// Verifikasi perbaikan RLS 041: admin hotel (tanpa header platform-scope) harus
// bisa MEMBACA dan MEMBUAT permintaan tamu di hotelnya sendiri, tapi TIDAK boleh
// menyentuh hotel lain. Jalankan: node scripts/verify-admin-request.mjs
import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const mint = (sub) => {
  const now = Math.floor(Date.now() / 1000);
  const si = b64({ alg: "HS256", typ: "JWT" }) + "." +
    b64({ sub, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 });
  return si + "." + crypto.createHmac("sha256", env.SUPABASE_JWT_SECRET).update(si).digest("base64url");
};

const ADMIN = "bfb2b309-c525-5136-bca7-1b9767c5fff2"; // rafli.ventera — role admin, tenant Lor Kali
const OWN_TENANT = "0cfdd376-f6c9-4d8d-ac39-fa77e24cc64e";   // Lor Kali
const OTHER_TENANT = "00000000-0000-4000-8000-000000000001"; // Kopi Rintik

// Klien aplikasi hotel biasa: TANPA x-platform-scope, persis seperti browser staf.
const app = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: "Bearer " + mint(ADMIN) } },
});

let pass = 0, fail = 0;
const t = (label, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗ GAGAL"} ${label}${detail ? " — " + detail : ""}`);
};

console.log("Admin hotel di halaman staf (tanpa scope):");

const read = await app.from("guest_requests").select("id").limit(1);
t("boleh MEMBACA permintaan hotel sendiri", !read.error, read.error?.message ?? "ok");

const created = await app.from("guest_requests")
  .insert({ title: "Verifikasi RLS 041", priority: "normal", status: "open" })
  .select().single();
t("boleh MEMBUAT permintaan di hotel sendiri", !created.error, created.error?.message ?? created.data?.id);

if (created.data) {
  t("tenant_id ter-stempel ke hotel sendiri", created.data.tenant_id === OWN_TENANT, created.data.tenant_id);
  const del = await app.from("guest_requests").delete().eq("id", created.data.id);
  t("boleh menghapus permintaannya sendiri (bersih-bersih)", !del.error, del.error?.message ?? "ok");
}

console.log("\nIsolasi antar hotel harus TETAP utuh:");
const leak = await app.from("guest_requests").select("id").eq("tenant_id", OTHER_TENANT);
t("TIDAK bisa melihat permintaan hotel lain", (leak.data ?? []).length === 0, `${(leak.data ?? []).length} baris`);

const inject = await app.from("guest_requests")
  .insert({ title: "seharusnya ditolak", tenant_id: OTHER_TENANT, priority: "normal", status: "open" })
  .select();
// tenant_id di-stempel ulang oleh trigger set_tenant_id, jadi baris tak pernah mendarat di hotel lain.
const landedElsewhere = (inject.data ?? []).some((r) => r.tenant_id === OTHER_TENANT);
t("TIDAK bisa menyisipkan permintaan ke hotel lain", !landedElsewhere, inject.error?.message ?? "ditolak/di-stempel ulang");
for (const r of inject.data ?? []) await app.from("guest_requests").delete().eq("id", r.id);

console.log(`\nHasil: ${pass} lolos, ${fail} gagal`);
process.exit(fail > 0 ? 1 : 0);
