// Mencatat kegagalan layanan WhatsApp, supaya kegagalannya punya alamat: hotel
// mana, tamu siapa, jenis apa.
//
// Sebelum ini satu-satunya jejak adalah console.error di serverless. Akibatnya
// inbox hotel memperlihatkan balasan bot seolah terkirim, tamunya tidak pernah
// menerima apa pun, dan tidak ada yang bisa membedakan keduanya — persis yang
// terjadi pada tamu ber-alamat `@lid` selama berhari-hari.

import { serviceGet, serviceInsert } from "./client";

/** Sepanjang apa cuplikan pesan yang disimpan untuk staf. */
const PREVIEW_LIMIT = 280;

export type IncidentKind = "delivery" | "conversation";

export interface WaIncident {
  tenantId: string;
  kind: IncidentKind;
  /** Null bila kontaknya belum sempat dibuat (mis. provisioning gagal). */
  customerId?: string | null;
  threadId?: string | null;
  /** Alamat tujuan apa adanya — inilah yang memperlihatkan "@lid" sebagai sebab. */
  targetJid?: string | null;
  sessionId?: string | null;
  /** Kode teknis dari sendText, atau `exception:<pesan>` untuk kegagalan proses. */
  reason: string;
  message?: string | null;
}

/**
 * Alamat `@lid` adalah alias privasi WhatsApp: sah sebagai identitas, tapi tak
 * bisa dijadikan tujuan kirim. Dipakai untuk menerangkan kegagalan dengan
 * bahasa manusia, bukan sekadar kode HTTP dari gateway — `send_failed_500`
 * tidak memberi tahu siapa pun bahwa nomornya memang mustahil dihubungi.
 */
export function isUnroutableTarget(jid?: string | null): boolean {
  return (jid ?? "").toLowerCase().endsWith("@lid");
}

/**
 * Simpan satu insiden. Tidak pernah melempar: mencatat masalah tidak boleh
 * menjadi masalah baru yang menggagalkan penanganan webhook.
 */
export async function recordIncident(i: WaIncident): Promise<void> {
  try {
    const res = await serviceInsert("wa_incidents", {
      tenant_id: i.tenantId,
      kind: i.kind,
      customer_id: i.customerId ?? null,
      thread_id: i.threadId ?? null,
      target_jid: i.targetJid ?? null,
      session_id: i.sessionId ?? null,
      reason: isUnroutableTarget(i.targetJid) ? `unroutable_lid:${i.reason}` : i.reason,
      message_preview: (i.message ?? "").slice(0, PREVIEW_LIMIT) || null,
    });
    if (!res.ok) console.error("[wa/incidents] gagal mencatat insiden:", res.status);
  } catch (e) {
    console.error("[wa/incidents] gagal mencatat insiden:", (e as Error).message);
  }
}

/**
 * Catat kiriman yang DITOLAK WhatsApp — kabar yang datang belakangan.
 *
 * Gateway hanya tahu alamat tujuannya, jadi tamu dan percakapannya dicari di
 * sini: lewat `wa_guest_identities` (alamat apa adanya, termasuk `@lid`), lalu
 * lewat angka nomornya bila tamu tersebut tercatat dengan alamat yang berbeda
 * dari yang dipakai saat mengirim. Tidak ketemu pun insidennya tetap disimpan —
 * "ada balasan yang ditolak untuk hotel ini" jauh lebih berguna daripada diam.
 */
export async function recordDeliveryRejection(params: {
  tenantId: string;
  sessionId: string;
  remoteJid: string;
  reason: string;
}): Promise<void> {
  const found = await findGuest(params.tenantId, params.remoteJid);
  await recordIncident({
    tenantId: params.tenantId,
    kind: "delivery",
    customerId: found?.customerId ?? null,
    threadId: found?.threadId ?? null,
    targetJid: params.remoteJid,
    sessionId: params.sessionId,
    // Dibedakan dari kegagalan HTTP: di sini gateway MENERIMA kirimannya dan
    // WhatsApp yang menolak sesudahnya.
    reason: `rejected_by_whatsapp:${params.reason}`,
    message: null,
  });
}

async function findGuest(
  tenantId: string,
  jid: string,
): Promise<{ customerId: string; threadId: string | null } | null> {
  try {
    const digits = jid.replace(/@.*$/i, "").replace(/\D/g, "");
    const byJid = await serviceGet(
      `wa_guest_identities?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        `&phone_jid=eq.${encodeURIComponent(jid)}&select=customer_id&limit=1`,
    );
    let customerId: string | null = null;
    if (byJid.ok) {
      const rows = (await byJid.json()) as Array<{ customer_id?: string | null }>;
      customerId = rows[0]?.customer_id ?? null;
    }

    if (!customerId && digits.length >= 8) {
      const byPhone = await serviceGet(
        `customers?tenant_id=eq.${encodeURIComponent(tenantId)}` +
          `&phone=eq.${encodeURIComponent(digits)}&select=id&limit=1`,
      );
      if (byPhone.ok) {
        const rows = (await byPhone.json()) as Array<{ id?: string }>;
        customerId = rows[0]?.id ?? null;
      }
    }
    if (!customerId) return null;

    const thread = await serviceGet(
      `chat_threads?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        `&customer_id=eq.${encodeURIComponent(customerId)}&status=eq.active` +
        `&order=updated_at.desc&limit=1&select=id`,
    );
    let threadId: string | null = null;
    if (thread.ok) {
      const rows = (await thread.json()) as Array<{ id?: string }>;
      threadId = rows[0]?.id ?? null;
    }
    return { customerId, threadId };
  } catch (e) {
    console.error("[wa/incidents] pencarian tamu gagal:", (e as Error).message);
    return null;
  }
}
