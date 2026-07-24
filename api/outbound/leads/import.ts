// Bulk import leads from a CSV or JSON payload.
// Admin-only: verifies the JWT role before touching the DB.
//
// Accepted body shapes:
//   { format: "json", leads: Lead[] }
//   { format: "csv",  csv: "<csv string>" }
//
// CSV expected columns (header row required, order flexible):
//   business_name, phone_wa, city, province, category, rating,
//   review_count, gmaps_url, gmaps_place_id, address
//
// Uses ON CONFLICT (gmaps_place_id) DO NOTHING so re-scraping the same area
// never creates duplicates. Rows without gmaps_place_id use a plain INSERT
// (idempotency is caller's responsibility for those).

import { serviceConfig, serviceHeaders } from "../../_lib/wa/client";
import { requirePlatformAdmin } from "../../_lib/admin/platform-auth";
import { authHeader, readJson, type VercelReq, type VercelRes } from "../../_lib/admin/http";

interface LeadRow {
  business_name: string;
  phone_wa?: string;
  address?: string;
  city?: string;
  province?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  gmaps_url?: string;
  gmaps_place_id?: string;
  booking_price_min?: number;
  booking_price_max?: number;
  estimated_rooms?: number;
  source?: string;
}

function parseCsv(raw: string): LeadRow[] {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return {
      business_name: row.business_name || row.nama || "",
      phone_wa: row.phone_wa || row.whatsapp || row.phone || row.telepon || undefined,
      address: row.address || row.alamat || undefined,
      city: row.city || row.kota || undefined,
      province: row.province || row.provinsi || undefined,
      category: row.category || row.kategori || undefined,
      rating: row.rating ? parseFloat(row.rating) : undefined,
      review_count: row.review_count || row.reviews ? parseInt(row.review_count || row.reviews, 10) : undefined,
      gmaps_url: row.gmaps_url || row.google_maps || undefined,
      gmaps_place_id: row.gmaps_place_id || row.place_id || undefined,
    };
  }).filter((r) => r.business_name);
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const guard = await requirePlatformAdmin(authHeader(req));
  if (guard.ok === false) return res.status(guard.status).json({ error: guard.error });

  const body = readJson(req) as { format?: string; leads?: LeadRow[]; csv?: string };
  let leads: LeadRow[] = [];

  if (body.format === "csv" && typeof body.csv === "string") {
    leads = parseCsv(body.csv);
  } else if (Array.isArray(body.leads)) {
    leads = body.leads.filter((r) => r?.business_name);
  } else {
    return res.status(400).json({ error: "invalid_body", hint: "Provide {format:'csv',csv:'...'} or {format:'json',leads:[]}" });
  }

  if (leads.length === 0) return res.status(400).json({ error: "no_leads" });

  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return res.status(500).json({ error: "db_not_configured" });

  // Split into with-place-id (upsert safe) and without (plain insert)
  const withId = leads.filter((l) => l.gmaps_place_id);
  const withoutId = leads.filter((l) => !l.gmaps_place_id);

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Upsert with ON CONFLICT DO NOTHING for deduped rows
  if (withId.length > 0) {
    const r = await fetch(`${url}/rest/v1/outbound_leads`, {
      method: "POST",
      headers: {
        ...serviceHeaders(serviceKey),
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify(withId.map(toRow)),
    });
    if (r.ok) {
      const rows = await r.json() as unknown[];
      inserted += rows.length;
      skipped += withId.length - rows.length;
    } else {
      errors.push(`upsert_failed_${r.status}`);
    }
  }

  // Plain insert for rows without place_id
  if (withoutId.length > 0) {
    const r = await fetch(`${url}/rest/v1/outbound_leads`, {
      method: "POST",
      headers: { ...serviceHeaders(serviceKey), Prefer: "return=representation" },
      body: JSON.stringify(withoutId.map(toRow)),
    });
    if (r.ok) {
      const rows = await r.json() as unknown[];
      inserted += rows.length;
    } else {
      errors.push(`insert_no_id_failed_${r.status}`);
    }
  }

  return res.status(200).json({ inserted, skipped, errors, total: leads.length });
}

function toRow(l: LeadRow) {
  return {
    source: l.source ?? "google_maps",
    business_name: l.business_name,
    ...(l.phone_wa ? { phone_wa: l.phone_wa.replace(/\D/g, "").replace(/^0/, "62") } : {}),
    ...(l.address ? { address: l.address } : {}),
    ...(l.city ? { city: l.city } : {}),
    ...(l.province ? { province: l.province } : {}),
    ...(l.category ? { category: l.category.toLowerCase() } : {}),
    ...(l.rating !== undefined && !isNaN(l.rating) ? { rating: l.rating } : {}),
    ...(l.review_count !== undefined && !isNaN(l.review_count) ? { review_count: l.review_count } : {}),
    ...(l.gmaps_url ? { gmaps_url: l.gmaps_url } : {}),
    ...(l.gmaps_place_id ? { gmaps_place_id: l.gmaps_place_id } : {}),
    ...(l.booking_price_min ? { booking_price_min: l.booking_price_min } : {}),
    ...(l.booking_price_max ? { booking_price_max: l.booking_price_max } : {}),
    ...(l.estimated_rooms ? { estimated_rooms: l.estimated_rooms } : {}),
  };
}
