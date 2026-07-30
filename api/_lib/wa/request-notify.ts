// Memberi tahu tamu ketika permintaannya bergerak.
//
// Sebelum ini permintaan tamu (room service, housekeeping) berjalan satu arah:
// tamu memesan lewat WhatsApp, staf melihatnya di antrean dan menekan
// "Selesai" — dan tamu tidak pernah diberi tahu apa pun. Dari sisi tamu,
// pesanannya masuk ke dalam kesunyian; satu-satunya cara tahu adalah menunggu
// makanannya datang, atau bertanya lagi.
//
// ─── Kenapa tidak memakai deliverStaffReply apa adanya ───────────────────────
// Mesin pengiriman + pemilihan alamatnya dipakai ulang (LID, insiden, sesi
// hotel), TAPI dengan `takeover: false`. Balasan staf memang seharusnya
// membungkam bot — manusia yang mengetik ADALAH pengambilalihan. Notifikasi ini
// bukan manusia yang mengetik; membungkam bot karena sebuah pembaruan status
// akan membuat pesan tamu berikutnya tidak dijawab siapa pun.

import { serviceGet } from "./client";
import { deliverStaffReply } from "./staff-reply";
import { getOrCreateBotProfile, getOrCreateThread, logMessage } from "./crm";

export type RequestStatus = "open" | "in_progress" | "done" | "cancelled";

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

interface RequestRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  title: string | null;
  status: RequestStatus;
}

/**
 * Kalimat untuk tiap status.
 *
 * `open` tidak mengirim apa pun: itu status saat permintaan BARU dibuat, dan
 * tamu sudah menerima konfirmasi dari flow-nya sendiri saat memesan. Mengirim
 * lagi di sini berarti dua pesan untuk satu peristiwa.
 */
function messageFor(status: RequestStatus, title: string, brand: string): string | null {
  const what = title.trim() || "Permintaan Anda";
  switch (status) {
    case "in_progress":
      return `*${brand}*\n${what} sedang kami siapkan. Mohon ditunggu ya 🙏`;
    case "done":
      return `*${brand}*\n${what} sudah selesai. Terima kasih, dan silakan hubungi kami lagi bila ada yang dibutuhkan 🙏`;
    case "cancelled":
      return `*${brand}*\nMohon maaf, ${what.toLowerCase()} kami batalkan. Silakan balas pesan ini bila ada yang perlu kami bantu.`;
    case "open":
    default:
      return null;
  }
}

async function tenantName(tenantId: string): Promise<string> {
  try {
    const res = await serviceGet(
      `tenants?id=eq.${encodeURIComponent(tenantId)}&select=name&limit=1`,
    );
    if (!res.ok) return "hotel kami";
    const rows = (await res.json()) as Array<{ name?: string | null }>;
    return rows[0]?.name?.trim() || "hotel kami";
  } catch {
    return "hotel kami";
  }
}

/**
 * Kabari tamu tentang perubahan status permintaannya.
 *
 * `tenantId` adalah hotel PEMANGGIL, bukan yang dibaca dari permintaannya —
 * dicocokkan di sini supaya staf satu hotel tidak bisa memicu pesan ke tamu
 * hotel lain hanya dengan menebak sebuah id.
 *
 * Tidak pernah melempar: statusnya sudah tersimpan sebelum ini dipanggil, dan
 * gagal mengabari bukan alasan untuk membatalkan pekerjaan staf.
 */
export async function notifyRequestStatus(params: {
  requestId: string;
  tenantId: string;
}): Promise<NotifyResult> {
  try {
    const res = await serviceGet(
      `guest_requests?id=eq.${encodeURIComponent(params.requestId)}` +
        `&select=id,tenant_id,customer_id,title,status&limit=1`,
    );
    if (!res.ok) return { ok: false, error: `request_lookup_${res.status}` };

    const rows = (await res.json()) as RequestRow[];
    const request = rows[0];
    if (!request) return { ok: false, error: "request_not_found" };
    if (request.tenant_id !== params.tenantId) return { ok: false, error: "request_not_found" };
    // Permintaan yang dibuat staf untuk tamu walk-in tanpa kontak: tidak ada
    // siapa pun untuk dikabari, dan itu bukan kegagalan.
    if (!request.customer_id) return { ok: false, error: "request_has_no_guest" };

    const brand = await tenantName(request.tenant_id);
    const text = messageFor(request.status, request.title ?? "", brand);
    if (!text) return { ok: false, error: "status_not_notifiable" };

    const threadId = await getOrCreateThread(request.tenant_id, request.customer_id);

    // Dicatat di percakapan SEBELUM dikirim, supaya staf melihat apa yang
    // dikatakan kepada tamu bahkan ketika pengirimannya gagal — inbox yang
    // menyembunyikan pesan gagal adalah yang membuat kegagalan tak terlihat.
    try {
      const botId = await getOrCreateBotProfile(request.tenant_id);
      await logMessage(request.tenant_id, threadId, botId, text, false);
    } catch (e) {
      console.error("[wa/request-notify] gagal mencatat pesan:", (e as Error).message);
    }

    // takeover:false — lihat catatan di kepala berkas ini.
    return await deliverStaffReply({ threadId, text, takeover: false });
  } catch (e) {
    return { ok: false, error: `exception: ${(e as Error).message}` };
  }
}
