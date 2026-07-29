// Mencatat kegagalan layanan WhatsApp, supaya kegagalannya punya alamat: hotel
// mana, tamu siapa, jenis apa.
//
// Sebelum ini satu-satunya jejak adalah console.error di serverless. Akibatnya
// inbox hotel memperlihatkan balasan bot seolah terkirim, tamunya tidak pernah
// menerima apa pun, dan tidak ada yang bisa membedakan keduanya — persis yang
// terjadi pada tamu ber-alamat `@lid` selama berhari-hari.

import { serviceInsert } from "./client";

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
