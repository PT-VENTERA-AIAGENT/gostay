import { supabase } from "@/lib/supabase";

// hotel_knowledge holds the answers the WhatsApp assistant is allowed to give.
// RLS scopes every read and write to the caller's own tenant, and
// set_tenant_id() stamps the tenant on insert — so nothing here mentions it.
//
// No API route, for the same reason as wa_flows: api/ is at Vercel Hobby's
// 12-function cap, and this is an ordinary RLS-protected table.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COLUMNS = "id,topic,content,keywords,is_active,updated_at";

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  keywords: string[];
  is_active: boolean;
  updated_at: string;
}

interface Row extends Omit<KnowledgeEntry, "keywords"> {
  keywords: string[] | null;
}

const toEntry = (r: Row): KnowledgeEntry => ({
  ...r,
  keywords: Array.isArray(r.keywords) ? r.keywords : [],
});

export async function listKnowledge(): Promise<KnowledgeEntry[]> {
  const { data, error } = await db
    .from("hotel_knowledge")
    .select(COLUMNS)
    .order("topic", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toEntry);
}

export interface KnowledgeInput {
  topic: string;
  content: string;
  keywords: string[];
  is_active: boolean;
}

export async function createKnowledge(input: KnowledgeInput): Promise<KnowledgeEntry> {
  const { data, error } = await db.from("hotel_knowledge").insert(input).select(COLUMNS).single();
  if (error) throw error;
  return toEntry(data as Row);
}

export async function updateKnowledge(
  id: string,
  patch: Partial<KnowledgeInput>,
): Promise<KnowledgeEntry> {
  const { data, error } = await db
    .from("hotel_knowledge").update(patch).eq("id", id).select(COLUMNS).single();
  if (error) throw error;
  return toEntry(data as Row);
}

export async function deleteKnowledge(id: string): Promise<void> {
  const { error } = await db.from("hotel_knowledge").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Starter entries covering what guests ask most.
 *
 * Installed with placeholder wording that a hotel MUST edit — deliberately
 * obvious ("_isi …_") rather than plausible-sounding defaults, because a
 * plausible default is one that ships to guests unread. The assistant quotes
 * these close to verbatim, so an unedited entry is visibly unedited.
 */
export const STARTER_KNOWLEDGE: KnowledgeInput[] = [
  {
    topic: "Jam check-in & check-out",
    content: "Check-in mulai pukul 14.00. Check-out paling lambat pukul 12.00.",
    keywords: ["check in", "checkin", "check out", "checkout", "jam berapa", "jam masuk"],
    is_active: true,
  },
  {
    topic: "Sarapan",
    content: "_Isi ketentuan sarapan hotel Anda: termasuk untuk tipe kamar apa, jam berapa, dan di mana._",
    keywords: ["sarapan", "breakfast", "makan pagi"],
    is_active: false,
  },
  {
    topic: "Wifi & internet",
    content: "_Isi ketentuan wifi: gratis atau berbayar, dan di area mana saja tersedia._",
    keywords: ["wifi", "wi-fi", "internet", "password wifi"],
    is_active: false,
  },
  {
    topic: "Parkir",
    content: "_Isi ketentuan parkir: tersedia untuk mobil/motor, gratis atau berbayar, kapasitas._",
    keywords: ["parkir", "parking", "mobil", "motor"],
    is_active: false,
  },
  {
    topic: "Lokasi & alamat",
    content: "_Isi alamat lengkap, patokan terdekat, dan tautan Google Maps._",
    keywords: ["alamat", "lokasi", "dimana", "maps", "arah", "patokan"],
    is_active: false,
  },
  {
    topic: "Kebijakan pembatalan",
    content: "_Isi kebijakan pembatalan dan refund hotel Anda._",
    keywords: ["pembatalan", "refund", "batalkan pesanan", "uang kembali"],
    is_active: false,
  },
  {
    topic: "Hewan peliharaan",
    content: "_Isi apakah tamu boleh membawa hewan peliharaan, dan ketentuannya._",
    keywords: ["hewan", "peliharaan", "kucing", "anjing", "pet"],
    is_active: false,
  },
  {
    topic: "Extra bed & tamu tambahan",
    content: "_Isi ketentuan extra bed: tersedia untuk tipe kamar apa dan berapa biayanya._",
    keywords: ["extra bed", "kasur tambahan", "tamu tambahan", "anak"],
    is_active: false,
  },
];
