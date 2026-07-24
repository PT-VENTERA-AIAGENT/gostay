// Generate a personalized WA sales message for a single lead via Claude.
// Admin-only. Saves the draft to outbound_message_drafts (approved=false).
// The admin previews it in /admin/campaigns/:id before approving.

import Anthropic from "@anthropic-ai/sdk";
import { requirePlatformAdmin } from "../../_lib/admin/platform-auth";
import { authHeader, readJson, type VercelReq, type VercelRes } from "../../_lib/admin/http";
import { serviceConfig, serviceHeaders, serviceGet, serviceInsert } from "../../_lib/wa/client";

interface Lead {
  id: string;
  business_name: string;
  city?: string;
  province?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  booking_price_min?: number;
  booking_price_max?: number;
  estimated_rooms?: number;
}

function monthsCovered(priceMin?: number): string {
  if (!priceMin || priceMin < 100_000) return "beberapa";
  const months = Math.round((99_000 * 12) / priceMin);
  return months > 24 ? "lebih dari 2 tahun" : `${months} bulan`;
}

async function generateMessage(lead: Lead): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("anthropic_not_configured");

  const client = new Anthropic({ apiKey });
  const covered = monthsCovered(lead.booking_price_min);

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 350,
    system: `Kamu sales assistant GoStay yang ramah dan profesional.
GoStay adalah HMS + WA Bot AI untuk hotel/villa/penginapan kecil Indonesia.
Fitur utama: WA Bot auto-balas booking 24/7, dashboard reservasi, zero komisi.
Harga: Starter Rp 99.000/bulan. Early bird: 3 bulan GRATIS untuk 50 pertama.
Setup 30 menit, tanpa kontrak, tanpa kartu kredit.

Tulis pesan WA pertama (cold outreach) yang:
- Personal dan spesifik ke properti ini
- Singkat: maks 4 kalimat / ~80 kata
- Bahasa Indonesia kasual, tidak formal berlebihan
- Tidak terkesan spam atau broadcast
- Tutup dengan satu pertanyaan atau ajakan ringan
- JANGAN pakai emoji berlebihan (maks 1-2)
- JANGAN sebut harga di pesan pertama kecuali kalau sangat relevan`,
    messages: [{
      role: "user",
      content: `Buat pesan WA untuk properti berikut:
Nama: ${lead.business_name}
Kategori: ${lead.category ?? "penginapan"}
Kota: ${lead.city ?? "Indonesia"}
Rating Google: ${lead.rating ?? "-"} (${lead.review_count ?? "-"} ulasan)
${lead.booking_price_min ? `Harga kamar: mulai Rp ${lead.booking_price_min.toLocaleString("id")}/malam` : ""}
${lead.booking_price_min ? `Satu booking nutup biaya GoStay ${covered}` : ""}

Pain point yang sering: WA telat dibalas, booking manual spreadsheet, staf kelelahan.`,
    }],
  });

  const text = msg.content[0];
  return text.type === "text" ? text.text.trim() : "";
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const guard = await requirePlatformAdmin(authHeader(req));
  if (guard.ok === false) return res.status(guard.status).json({ error: guard.error });

  const body = readJson(req);
  const leadId = typeof body.leadId === "string" ? body.leadId : undefined;
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : undefined;
  if (!leadId) return res.status(400).json({ error: "leadId_required" });

  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return res.status(500).json({ error: "db_not_configured" });

  // Fetch lead
  const leadRes = await serviceGet(`outbound_leads?id=eq.${encodeURIComponent(leadId)}&select=*`);
  if (!leadRes.ok) return res.status(500).json({ error: "lead_fetch_failed" });
  const leads = await leadRes.json() as Lead[];
  const lead = leads[0];
  if (!lead) return res.status(404).json({ error: "lead_not_found" });

  let message: string;
  try {
    message = await generateMessage(lead);
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }

  if (!message) return res.status(500).json({ error: "empty_message" });

  // Save draft (approved=false, admin must review first)
  const draft = {
    lead_id: leadId,
    message,
    model: "claude-sonnet-4-6",
    approved: false,
    sent: false,
    ...(campaignId ? { campaign_id: campaignId } : {}),
  };

  const draftRes = await serviceInsert("outbound_message_drafts", draft, "return=representation");
  if (!draftRes.ok) return res.status(500).json({ error: "draft_save_failed" });
  const saved = (await draftRes.json() as Record<string, unknown>[])[0];

  return res.status(200).json({ ok: true, draftId: saved.id, message });
}
