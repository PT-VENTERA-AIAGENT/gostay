// GoStay — rapikan tabrakan kata kunci pada flow yang SUDAH terpasang.
//
// Seleksi berjalan menurut presedensi dan pemenang pertama mengambil pesan, jadi
// kata kunci yang diklaim dua flow hanya pernah menjalankan yang prioritasnya
// lebih tinggi — yang satunya mati untuk kata itu, tanpa pemberitahuan. Hotel
// yang memasang template versi lama membawa tabrakan ini:
//
//   "handuk", "laundry"  di Request Tamu  → Housekeeping tak pernah terjangkau
//   "kamar kosong"       di Reservasi     → Cek Kamar Kosong tak terjangkau
//   "check in"           di Reservasi     → Info Check-in tak terjangkau
//   "menu"               di Sapaan        → sudah jadi milik Request Tamu
//
// Skrip ini membuang kata kunci itu dari flow yang MEREBUT, bukan dari yang
// seharusnya memilikinya. Aman dijalankan berulang.
//
// Jalankan:  node scripts/wa-fix-keyword-clashes.mjs          (lihat rencana)
//            node scripts/wa-fix-keyword-clashes.mjs --apply  (terapkan)
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

// Kata kunci yang harus DIBUANG dari flow yang namanya cocok pola berikut.
const STRIP = [
  { match: /request tamu|room service/i, drop: ["handuk", "laundry", "cuci baju", "cuci pakaian"] },
  { match: /reservasi kamar/i, drop: ["kamar kosong", "check in", "checkin"] },
  { match: /sapaan|menu utama/i, drop: ["menu"] },
];

const norm = (s) => (s ?? "").trim().toLowerCase();

const tenants = await svc.from("tenants").select("id,name");
const nameOf = (id) => (tenants.data ?? []).find((t) => t.id === id)?.name ?? id;

const flows = await svc.from("wa_flows").select("id,tenant_id,name,trigger_keywords,priority").order("priority");
if (flows.error) { console.error(flows.error.message); process.exit(1); }

let changes = 0;
for (const f of flows.data ?? []) {
  const rule = STRIP.find((r) => r.match.test(f.name));
  if (!rule) continue;

  const kws = f.trigger_keywords ?? [];
  const kept = kws.filter((k) => !rule.drop.some((d) => norm(d) === norm(k)));
  const removed = kws.filter((k) => rule.drop.some((d) => norm(d) === norm(k)));
  if (removed.length === 0) continue;

  changes++;
  console.log(`${nameOf(f.tenant_id)} — ${f.name}`);
  console.log(`  buang: ${removed.join(", ")}`);
  console.log(`  sisa : ${kept.length} kata kunci`);

  if (kept.length === 0) {
    console.log("  ⚠ dilewati: menghapus semuanya akan membuat flow ini mustahil terpicu");
    continue;
  }
  if (APPLY) {
    const up = await svc.from("wa_flows").update({ trigger_keywords: kept }).eq("id", f.id);
    console.log(up.error ? `  ✗ GAGAL: ${up.error.message}` : "  ✓ diterapkan");
  }
}

console.log(changes === 0
  ? "\nTidak ada tabrakan tersisa."
  : `\n${changes} flow ${APPLY ? "dirapikan" : "akan dirapikan — jalankan ulang dengan --apply"}.`);
