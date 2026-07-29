// GoStay — audit flow WhatsApp: apakah label di konsol ("Aktif", "Hanya tamu
// menginap") benar-benar yang ditegakkan backend, dan apakah setiap flow bisa
// dijangkau. Jalankan: node scripts/wa-flow-audit.mjs
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const tenants = await svc.from("tenants").select("id,name");
const flows = await svc.from("wa_flows").select("*").order("priority");
if (flows.error) { console.error(flows.error.message); process.exit(1); }

const nameOf = (id) => (tenants.data ?? []).find((t) => t.id === id)?.name ?? id;
const byTenant = new Map();
for (const f of flows.data ?? []) {
  if (!byTenant.has(f.tenant_id)) byTenant.set(f.tenant_id, []);
  byTenant.get(f.tenant_id).push(f);
}

// Tier 2/3 (kata utuh / persis) adalah syarat minimum sebuah flow boleh MULAI.
const normalise = (s) => (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
const score = (input, kw) => {
  const k = normalise(kw), i = normalise(input);
  if (!k || !i) return 0;
  if (i === k) return 3;
  if (i.startsWith(k + " ") || i.endsWith(" " + k) || i.includes(" " + k + " ")) return 2;
  return i.includes(k) ? 1 : 0;
};

let problems = 0;
for (const [tid, list] of byTenant) {
  console.log(`\n═══ ${nameOf(tid)} — ${list.length} flow ═══`);
  const seen = new Map(); // keyword -> flow pertama yang memilikinya

  for (const f of list) {
    const kws = f.trigger_keywords ?? [];
    const label = [
      f.is_active ? "Aktif" : "NONAKTIF",
      f.requires === "inhouse" ? "Hanya tamu menginap" : "semua tamu",
    ].join(" · ");
    console.log(`\n  ${f.name}  [${label}]  prio ${f.priority}`);

    if (!f.is_active) { console.log("    ⚠ nonaktif — tidak akan pernah memulai percakapan"); problems++; }
    if (kws.length === 0) { console.log("    ⚠ tanpa kata kunci — tidak mungkin terpicu"); problems++; }

    // Kata kunci yang sudah diklaim flow berprioritas lebih tinggi tidak akan
    // pernah menang: flow ini mati untuk kata itu.
    for (const kw of kws) {
      const owner = seen.get(normalise(kw));
      if (owner && owner !== f.name) {
        console.log(`    ⚠ "${kw}" sudah diklaim "${owner}" (prioritas lebih tinggi)`);
        problems++;
      } else if (!owner) {
        seen.set(normalise(kw), f.name);
      }
    }

    // Kata kunci yang tak pernah bisa mencapai tier 2 saat diketik sendirian
    // berarti mustahil memulai flow.
    for (const kw of kws) {
      if (score(kw, kw) < 2) { console.log(`    ⚠ "${kw}" tak pernah cukup kuat untuk memulai`); problems++; }
    }

    const nodes = f.definition?.nodes ?? [];
    if (nodes.length <= 1) { console.log("    ⚠ grafik kosong — tak ada yang dijalankan"); problems++; }
    if (!nodes.some((n) => n.type === "trigger")) { console.log("    ⚠ tanpa node trigger — tak bisa mulai"); problems++; }
  }
}

console.log(`\n${problems === 0 ? "✓ Tidak ada masalah." : `⚠ ${problems} catatan di atas.`}`);
