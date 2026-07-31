// Resepsionis AI (Voice) fase 1 — logika di balik api/voice/[action].
// Arsitektur & kontraknya: docs/VOICE-AI.md.
//
// Dua tugas, dua gerbang:
//   session     mencetak ephemeral key OpenAI Realtime untuk browser staf —
//               kunci OpenAI asli tidak pernah menyentuh browser. Gerbangnya
//               JWT Supabase (HS256, SUPABASE_JWT_SECRET) DAN role staf/admin
//               yang dibaca ulang dari tabel profiles: JWT kita tidak memuat
//               role (get_my_role() pun membacanya dari DB), jadi token saja
//               tidak membuktikan siapa-siapa.
//   call-ended  webhook selesai-telepon, provider-agnostik. Gerbangnya
//               x-voice-secret. Menulis call_logs (source 'ai') dan
//               find-or-create tamu CRM per nomor — tenant-scoped, sehingga
//               nomor yang sama tidak pernah menggandakan tamu.

import { verifySupabaseToken } from "../identity";
import { safeEqual } from "../payment/token";
import { serviceGet, serviceInsert } from "../wa/client";
import { getOrCreateBotProfile } from "../wa/crm";

// ─── session ─────────────────────────────────────────────────────────────────

// Endpoint GA. Jalur beta lama (/v1/realtime/sessions) sudah PENSIUN — ia
// menjawab 404 "Invalid URL", ditemukan saat verifikasi produksi 31 Jul 2026.
const OPENAI_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

function realtimeConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    sessionsUrl: process.env.VOICE_REALTIME_SESSIONS_URL ?? OPENAI_REALTIME_CLIENT_SECRETS_URL,
    model: process.env.VOICE_REALTIME_MODEL ?? "gpt-realtime",
    voice: process.env.VOICE_REALTIME_VOICE ?? "marin",
  };
}

export type SessionResult =
  | { ok: true; status: 200; payload: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/** Bearer JWT → profil staf/admin aktif, atau null. */
async function staffProfileFromJwt(authHeader: string | undefined): Promise<string | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const claims = verifySupabaseToken(token, secret);
  if (!claims) return null;
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp <= Math.floor(Date.now() / 1000)) return null;
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  if (!sub) return null;

  const res = await serviceGet(
    `profiles?id=eq.${encodeURIComponent(sub)}&select=id,role,is_active&limit=1`,
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; role?: string; is_active?: boolean }>;
  const p = rows[0];
  if (!p || p.is_active === false) return null;
  return p.role === "staff" || p.role === "admin" ? p.id : null;
}

/**
 * Mint sesi Realtime berumur pendek. Payload OpenAI diteruskan apa adanya —
 * browser butuh `client_secret.value` dan kita tidak menyimpan apa pun.
 */
export async function handleVoiceSession(
  authHeader: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionResult> {
  const profileId = await staffProfileFromJwt(authHeader);
  if (!profileId) return { ok: false, status: 401, error: "unauthorized" };

  const { apiKey, sessionsUrl, model, voice } = realtimeConfig();
  if (!apiKey) return { ok: false, status: 503, error: "openai_not_configured" };

  const res = await fetchImpl(sessionsUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    // Bentuk GA: konfigurasi sesi dibungkus `session`, suara di audio.output.
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        audio: { output: { voice } },
      },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error(`[voice] mint sesi gagal HTTP ${res.status}:`, JSON.stringify(body).slice(0, 300));
    return { ok: false, status: 502, error: "realtime_session_failed" };
  }
  // GA membalas { value, expires_at, session } — dinormalkan ke bentuk yang
  // dibaca halaman (client_secret.value), supaya klien tidak peduli versi API.
  const value = typeof body.value === "string" ? body.value : undefined;
  return {
    ok: true,
    status: 200,
    payload: {
      client_secret: { value, expires_at: body.expires_at },
      model,
    },
  };
}

// ─── call-ended ──────────────────────────────────────────────────────────────

export interface CallEndedResult {
  ok: boolean;
  status: number;
  error?: string;
  callLogId?: string;
  customerId?: string;
  customerCreated?: boolean;
}

async function tenantIdForSlug(slug: string): Promise<string | null> {
  const res = await serviceGet(
    `tenants?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/**
 * Tamu CRM untuk sebuah nomor — cari per digit (data lama menyimpan `+62…` dan
 * `62…` berdampingan), TENANT-SCOPED, buat bila belum ada. Konvensi email
 * placeholder sama dengan jalur WhatsApp dan walk-in.
 */
async function findOrCreateCustomerByPhone(
  tenantId: string,
  phone: string,
  name: string | null,
): Promise<{ id: string; created: boolean }> {
  // Kanonik: awalan 0 → 62, lalu cocokkan EKOR nomor — data lama menyimpan
  // "+62…", "62…", dan "08…" berdampingan untuk orang yang sama.
  const raw = phone.replace(/\D/g, "");
  const digits = raw.startsWith("0") ? `62${raw.slice(1)}` : raw;
  if (!digits) throw new Error("caller_phone_invalid");
  const tail = digits.startsWith("62") ? digits.slice(2) : digits;

  const found = await serviceGet(
    `customers?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&phone=ilike.${encodeURIComponent(`%${tail}`)}&select=id&limit=1`,
  );
  if (!found.ok) throw new Error(`customer_lookup_${found.status}`);
  const rows = (await found.json()) as Array<{ id: string }>;
  if (rows[0]) return { id: rows[0].id, created: false };

  const ins = await serviceInsert(
    "customers",
    {
      tenant_id: tenantId,
      full_name: name?.trim() || digits,
      email: `phone-${digits}@noreply.ventera.id`,
      phone: digits,
      profile_id: null,
    },
    "return=representation",
  );
  if (!ins.ok) throw new Error(`customer_insert_${ins.status}`);
  const created = (await ins.json()) as Array<{ id: string }>;
  return { id: created[0].id, created: true };
}

/**
 * Terima laporan selesai-telepon dan tinggalkan dua jejak: baris call_logs
 * (transkrip + ringkasan, source 'ai', agent = profil bot hotel) dan tamu CRM.
 */
export async function handleVoiceCallEnded(
  secretHeader: string | undefined,
  body: Record<string, unknown>,
): Promise<CallEndedResult> {
  if (!safeEqual(secretHeader, process.env.VOICE_WEBHOOK_SECRET)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const hotel = typeof body.hotel === "string" ? body.hotel.trim() : "";
  const callerPhone = typeof body.caller_phone === "string" ? body.caller_phone.trim() : "";
  if (!hotel || !callerPhone) {
    return { ok: false, status: 400, error: "hotel_and_caller_phone_required" };
  }

  const tenantId = await tenantIdForSlug(hotel);
  if (!tenantId) return { ok: false, status: 404, error: "hotel_not_found" };

  const customer = await findOrCreateCustomerByPhone(
    tenantId,
    callerPhone,
    typeof body.caller_name === "string" ? body.caller_name : null,
  );

  const botId = await getOrCreateBotProfile(tenantId);
  const direction = body.direction === "outbound" ? "outbound" : "inbound";
  const duration = Number(body.duration_seconds);
  const followUp = body.follow_up === true;

  const ins = await serviceInsert(
    "call_logs",
    {
      tenant_id: tenantId,
      agent_id: botId,
      customer_id: customer.id,
      caller_phone: callerPhone,
      direction,
      duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : null,
      summary: typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : null,
      transcript:
        typeof body.transcript === "string" && body.transcript.trim() ? body.transcript : null,
      follow_up: followUp,
      follow_up_due:
        followUp && typeof body.follow_up_due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.follow_up_due)
          ? body.follow_up_due
          : null,
      source: "ai",
    },
    "return=representation",
  );
  if (!ins.ok) return { ok: false, status: 500, error: `call_log_insert_${ins.status}` };
  const rows = (await ins.json()) as Array<{ id: string }>;

  return {
    ok: true,
    status: 200,
    callLogId: rows[0]?.id,
    customerId: customer.id,
    customerCreated: customer.created,
  };
}
