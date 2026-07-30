// GoStay — naikkan tamu WhatsApp dari identitas LOKAL ke akun Ventera SSO,
// supaya mereka bisa masuk ke portal tamu.
//
// Latar: tamu yang chat sebelum 30 Jul 2026 dibuatkan `sso_sub` lokal
// (`wa:<jid>`) karena provisioning mengirim angka LID — bukan nomor telepon —
// dan Ventera benar menolaknya. Tanpa akun SSO, form OTP di halaman masuk
// menjawab "nomor HP tidak terdaftar".
//
// Yang dilakukan skrip ini, per tamu:
//   1. baca nomor asli tamu dari customers.phone (diisi/dipulihkan dari
//      remoteJidAlt setiap kali ia mengirim pesan);
//   2. provision akun Ventera pada nomor itu (idempoten — nomor yang sudah
//      punya akun mengembalikan sub yang sama);
//   3. tulis sub itu ke profiles.sso_sub DAN wa_guest_identities.sso_sub.
//
// PENTING — kenapa TIDAK ada baris yang dipindahkan: sejak PR yang menyertai
// skrip ini, login mencari profil lewat `sso_sub`, bukan lewat id turunan. Jadi
// mengganti `sso_sub` sudah cukup: profil tamu tetap profil yang sama, beserta
// seluruh kontak, booking, dan percakapannya. Tidak ada FK yang disentuh — itu
// bedanya dengan migrasi profileId yang harus memindahkan puluhan baris.
//
// Jalankan:
//   node scripts/wa-guest-sso-upgrade.mjs            → RENCANA saja (dry-run)
//   node scripts/wa-guest-sso-upgrade.mjs --apply    → terapkan
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PROVISION_URL = (env.SSO_VENTERA_PROVISION_URL ?? "https://sso.ventera.ai").replace(/\/$/, "");
const PROVISION_KEY = env.PROVISION_API_KEY;

/** Angka saja. Sebuah LID menghasilkan angkanya sendiri — disaring di bawah. */
const digitsOf = (v) => (v ?? "").replace(/\D+/g, "");

/**
 * Nomor yang layak didaftarkan: 8–15 angka, dan BUKAN angka LID-nya sendiri.
 * `customers.phone` pernah menyimpan angka LID untuk tamu yang belum sempat
 * dipulihkan, dan mendaftarkannya berarti membuat akun pada nomor yang tidak
 * menghubungi siapa pun.
 */
function usablePhone(phone, phoneJid) {
  const d = digitsOf(phone);
  if (d.length < 8 || d.length > 15) return null;
  if (phoneJid.toLowerCase().includes("@lid") && d === digitsOf(phoneJid)) return null;
  return d;
}

async function provision(phone, displayName) {
  const res = await fetch(`${PROVISION_URL}/api/admin/users/provision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PROVISION_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, ...(displayName ? { displayName } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.sub) throw new Error(`ventera_${res.status}${body.error ? `: ${body.error}` : ""}`);
  return { sub: body.sub, created: body.created === true };
}

const { data: rows, error } = await svc
  .from("wa_guest_identities")
  .select("id,tenant_id,phone_jid,sso_sub,profile_id,customer_id")
  .like("sso_sub", "wa:%");
if (error) throw error;

console.log(`${APPLY ? "TERAPKAN" : "RENCANA (dry-run)"} — ${rows.length} identitas ber-sso_sub lokal\n`);

let upgraded = 0, skipped = 0, failed = 0;

for (const r of rows) {
  const { data: cust } = await svc
    .from("customers").select("full_name,phone,wa_push_name").eq("id", r.customer_id).maybeSingle();
  const phone = usablePhone(cust?.phone, r.phone_jid);
  const name = cust?.wa_push_name || cust?.full_name || null;
  const who = `${name ?? "(tanpa nama)"} ${r.phone_jid}`;

  if (!phone) {
    console.log(`  LEWATI  ${who} — belum ada nomor asli (LID tanpa pendamping)`);
    skipped++;
    continue;
  }

  if (!APPLY) {
    console.log(`  NAIKKAN ${who} → daftarkan SSO pada ${phone}`);
    upgraded++;
    continue;
  }

  try {
    const { sub, created } = await provision(phone, name ?? undefined);
    // profiles dulu: kalau ini gagal, identitasnya sengaja dibiarkan menunjuk
    // sub lama supaya keadaannya tetap konsisten (login lewat sub lama = tetap
    // profil yang sama), bukan setengah jalan.
    const p = await svc.from("profiles").update({ sso_sub: sub }).eq("id", r.profile_id);
    if (p.error) throw new Error(`profiles: ${p.error.message}`);
    const w = await svc.from("wa_guest_identities").update({ sso_sub: sub }).eq("id", r.id);
    if (w.error) throw new Error(`wa_guest_identities: ${w.error.message}`);

    console.log(`  OK      ${who} → ${phone} (akun ${created ? "baru" : "sudah ada"})`);
    upgraded++;
  } catch (e) {
    console.log(`  GAGAL   ${who} — ${e.message}`);
    failed++;
  }
}

console.log(`\nnaik: ${upgraded}  dilewati: ${skipped}  gagal: ${failed}`);
if (!APPLY) console.log("\nTidak ada yang diubah. Tambahkan --apply untuk menerapkan.");
