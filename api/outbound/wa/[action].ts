// Outbound WA (marketing) — tiga aksi dalam SATU function Vercel:
//
//   POST /api/outbound/wa/send      kirim draft yang sudah disetujui
//   POST /api/outbound/wa/generate  buat draft pesan via model
//   POST /api/outbound/wa/inbound   webhook masuk dari gateway WA (sesi outbound)
//
// Dulu empat file terpisah = empat function (converse.ts bahkan bukan endpoint —
// ia pustaka tanpa default export yang kebetulan berada di folder api/ dan ikut
// ter-deploy sia-sia; kini pindah ke api/_lib/outbound bersama yang lain).
// Plan Hobby membatasi 12 function se-project dan slotnya habis — konsolidasi
// ini membebaskan tiga slot tanpa mengubah satu URL pun: segmen dinamis
// [action] menangkap path yang sama persis (pola api/payment/[action].ts).
//
// Auth tetap milik masing-masing handler (platform-admin bearer untuk
// send/generate, secret webhook untuk inbound) — router ini sengaja tidak
// menambahkan gerbang apa pun supaya perilakunya identik dengan sebelumnya.

import type { VercelReq, VercelRes } from "../../_lib/admin/http";
import sendHandler from "../../_lib/outbound/send";
import generateHandler from "../../_lib/outbound/generate";
import inboundHandler from "../../_lib/outbound/inbound";

// Bentuk req/res tiap handler sedikit berbeda (inbound memakai res.end());
// runtime Vercel memenuhi semuanya, jadi router mengetik longgar di sini saja.
const HANDLERS: Record<string, unknown> = {
  send: sendHandler,
  generate: generateHandler,
  inbound: inboundHandler,
};

export default async function handler(req: VercelReq, res: VercelRes) {
  const a = req.query?.action;
  const action = (Array.isArray(a) ? a[0] : a) ?? "";
  const target = HANDLERS[action];
  if (!target) {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).json({ error: "unknown_action" });
    return;
  }
  return (target as (rq: VercelReq, rs: VercelRes) => unknown)(req, res);
}
