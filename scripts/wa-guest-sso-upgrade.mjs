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
// Identitas terbelah: satu orang dengan DUA profil, karena WhatsApp memindahkan
// alamatnya ke LID di tengah jalan sehingga profil kedua ikut tercetak. Digabung
// hanya bila diminta eksplisit — ini memindahkan pemilik baris kontak, bukan
// sekadar menulis sso_sub.
const MERGE_SPLIT = process.argv.includes("--merge-split");

const fileEnv = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
// process.env menang: kunci provisioning hidup di Vercel, bukan di .env lokal,
// jadi ia diberikan saat menjalankan skrip alih-alih dituliskan ke berkas.
const env = { ...fileEnv, ...process.env };
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

/**
 * Nomor asli tamu menurut WhatsApp sendiri, dari `remoteJidAlt` pesan masuk.
 *
 * Dibutuhkan karena `customers.phone` sebagian tamu masih menyimpan angka LID:
 * pemulihan otomatisnya tak pernah berjalan (profil mereka ber-tenant hotel
 * lain, jadi jalur cepat yang memuat pemulihan itu selalu dilewati). Nomornya
 * sendiri tidak hilang — ia ada di setiap pesan yang pernah mereka kirim.
 */
async function phoneFromInbound(phoneJid) {
  const { data } = await svc
    .from("wa_inbound_messages")
    .select("raw")
    .eq("phone_jid", phoneJid)
    .order("created_at", { ascending: false })
    .limit(25);
  for (const row of data ?? []) {
    const alt = row?.raw?.key?.remoteJidAlt;
    if (typeof alt === "string" && !alt.toLowerCase().includes("@lid")) {
      const d = digitsOf(alt);
      if (d.length >= 8 && d.length <= 15) return d;
    }
  }
  return null;
}

// Realm yang client OIDC GoStay diizinkan pakai. Sama dengan guestRealm() di
// api/_lib/wa/guest.ts, dan alasannya sama: akun di realm lain ada tapi tak
// pernah bisa dipakai login (form OTP menyaring realmId IN allowedRealms).
const GUEST_REALM = (env.SSO_GUEST_REALM ?? "").trim() || "ventera-shop";

async function provision(phone, displayName) {
  const res = await fetch(`${PROVISION_URL}/api/admin/users/provision`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PROVISION_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phone, realm: GUEST_REALM, ...(displayName ? { displayName } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.sub) throw new Error(`ventera_${res.status}${body.error ? `: ${body.error}` : ""}`);
  return { sub: body.sub, created: body.created === true };
}

// SEMUA identitas tamu, bukan hanya yang ber-sso_sub lokal.
//
// Sebuah identitas bisa memegang sub yang asli tapi milik realm yang SALAH —
// akunnya ada, hanya di ruangan yang tak boleh dipakai client OIDC GoStay, jadi
// login tetap menjawab "nomor tidak terdaftar". Menyaring `wa:%` melewatkan
// justru kasus itu. Endpoint provisioning idempoten per (realm, nomor), jadi
// memeriksa semua orang aman: yang sudah benar mengembalikan sub yang sama dan
// tidak ditulis ulang.
const { data: rows, error } = await svc
  .from("wa_guest_identities")
  .select("id,tenant_id,phone_jid,sso_sub,profile_id,customer_id");
if (error) throw error;

console.log(
  `${APPLY ? "TERAPKAN" : "RENCANA (dry-run)"} — ${rows.length} identitas tamu, realm target ${GUEST_REALM}\n`,
);

let upgraded = 0, skipped = 0, failed = 0;

for (const r of rows) {
  const { data: cust } = await svc
    .from("customers").select("full_name,phone,wa_push_name").eq("id", r.customer_id).maybeSingle();
  const stored = usablePhone(cust?.phone, r.phone_jid);
  // Nomor tersimpan dulu; kalau itu masih angka LID, tanya WhatsApp lewat
  // remoteJidAlt di pesan-pesan yang sudah masuk.
  const phone = stored ?? (await phoneFromInbound(r.phone_jid));
  const needsPhoneRepair = !stored && Boolean(phone);
  const name = cust?.wa_push_name || cust?.full_name || null;
  const who = `${name ?? "(tanpa nama)"} ${r.phone_jid}`;

  if (!phone) {
    console.log(`  LEWATI  ${who} — belum ada nomor asli (LID tanpa pendamping)`);
    skipped++;
    continue;
  }

  if (!APPLY) {
    const extra = needsPhoneRepair ? " + perbaiki customers.phone (kini angka LID)" : "";
    console.log(`  NAIKKAN ${who} → daftarkan SSO pada ${phone}${extra}`);
    upgraded++;
    continue;
  }

  try {
    const { sub, created } = await provision(phone, name ?? undefined);

    // Sudah menunjuk akun yang benar di realm target — tidak ada yang perlu
    // ditulis. Ini yang membuat skrip aman dijalankan berulang.
    if (r.sso_sub === sub) {
      console.log(`  SUDAH   ${who} → ${phone} (sudah menunjuk akun realm ${GUEST_REALM})`);
      skipped++;
      continue;
    }

    // `profiles.sso_sub` UNIK, dan satu nomor bisa muncul sebagai beberapa
    // identitas dengan PROFIL berbeda — mis. sebuah nomor yang pernah menyapa
    // lewat alias LID dan lewat nomornya sendiri menghasilkan dua subjek lokal,
    // jadi dua profil. Memberi keduanya sub yang sama akan menabrak indeks unik.
    // Yang dilakukan di sini: berhenti dan laporkan. Menggabungkan dua profil
    // menjadi satu adalah keputusan tersendiri, bukan efek samping skrip ini.
    const holder = await svc.from("profiles").select("id").eq("sso_sub", sub).maybeSingle();
    if (holder.data && holder.data.id !== r.profile_id) {
      if (!MERGE_SPLIT) {
        console.log(
          `  BENTROK ${who} — ${phone} sudah dipegang profil lain (${holder.data.id.slice(0, 8)}). ` +
            `Ini identitas TERBELAH: jalankan dengan --merge-split untuk menggabungkan.`,
        );
        skipped++;
        continue;
      }

      // Profil pemegang sub itulah yang akan ditemukan saat tamu login, jadi
      // baris kontak harus pindah ke sana — di situlah booking-nya menggantung.
      // Baris kontak bersifat per-hotel dan kedua profil tidak berbagi hotel
      // yang sama (diperiksa di bawah), jadi tidak ada pasangan (profil, hotel)
      // yang menjadi ganda.
      const clash = await svc
        .from("customers")
        .select("id,tenant_id")
        .eq("profile_id", holder.data.id)
        .eq("tenant_id", r.tenant_id);
      if ((clash.data ?? []).length > 0) {
        console.log(`  BENTROK ${who} — kedua profil punya kontak di hotel yang sama; butuh penggabungan manual`);
        skipped++;
        continue;
      }

      const mc = await svc.from("customers").update({ profile_id: holder.data.id, phone })
        .eq("id", r.customer_id);
      if (mc.error) throw new Error(`customers.profile_id: ${mc.error.message}`);
      const mi = await svc.from("wa_guest_identities")
        .update({ profile_id: holder.data.id, sso_sub: sub }).eq("id", r.id);
      if (mi.error) throw new Error(`wa_guest_identities: ${mi.error.message}`);

      console.log(
        `  GABUNG  ${who} → kontak dipindahkan ke profil ${holder.data.id.slice(0, 8)} (${phone})`,
      );
      upgraded++;
      continue;
    }

    // profiles dulu: kalau ini gagal, identitasnya sengaja dibiarkan menunjuk
    // sub lama supaya keadaannya tetap konsisten (login lewat sub lama = tetap
    // profil yang sama), bukan setengah jalan.
    const p = await svc.from("profiles").update({ sso_sub: sub }).eq("id", r.profile_id);
    if (p.error) throw new Error(`profiles: ${p.error.message}`);
    const w = await svc.from("wa_guest_identities").update({ sso_sub: sub }).eq("id", r.id);
    if (w.error) throw new Error(`wa_guest_identities: ${w.error.message}`);

    // Sekalian betulkan nomor kontaknya. Tanpa ini staf tetap melihat angka LID
    // di CRM, dan balasan staf tetap dialamatkan ke sana.
    if (needsPhoneRepair) {
      const c = await svc.from("customers").update({ phone }).eq("id", r.customer_id);
      if (c.error) console.log(`  (nomor kontak gagal diperbaiki: ${c.error.message})`);
    }

    console.log(
      `  OK      ${who} → ${phone} (akun ${created ? "baru" : "sudah ada"}${needsPhoneRepair ? ", nomor kontak diperbaiki" : ""})`,
    );
    upgraded++;
  } catch (e) {
    console.log(`  GAGAL   ${who} — ${e.message}`);
    failed++;
  }
}

console.log(`\nnaik: ${upgraded}  dilewati: ${skipped}  gagal: ${failed}`);
if (!APPLY) console.log("\nTidak ada yang diubah. Tambahkan --apply untuk menerapkan.");
