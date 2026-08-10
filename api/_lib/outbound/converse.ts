// Conversation agent for outbound lead replies.
// Called by inbound.ts when a lead responds to our sales WA.
// Returns { reply, action } and handles side-effects (update status, log, escalate).
//
// Routed through api/_lib/ai/chat.ts instead of the Anthropic SDK, so this path
// gets the same env-configured provider chain — and the same failover — as the
// guest-facing bot. A Claude-class model still writes the copy: see
// OUTBOUND_MODELS in that module.

import { serviceGet, serviceInsert, serviceUpdate } from "../wa/client";
import { sendText } from "../wa/send";
import { chatCompletion, OUTBOUND_MODELS } from "../ai/chat";

export type ConversationAction =
  | "continue"
  | "send_trial_link"
  | "book_demo"
  | "escalate"
  | "close";

interface AgentResponse {
  reply: string;
  action: ConversationAction;
  reason?: string;
}

interface Lead {
  id: string;
  business_name: string;
  city?: string;
  category?: string;
  rating?: number;
  booking_price_min?: number;
  status: string;
}

interface ConvRow {
  direction: string;
  message: string;
  sent_at: string;
}

const TRIAL_LINK = process.env.VITE_APP_URL
  ? `${process.env.VITE_APP_URL}/daftar`
  : "https://app.gostay.id/daftar";

function buildHistory(rows: ConvRow[]): Array<Record<string, unknown>> {
  return rows.map((r) => ({
    role: r.direction === "outbound" ? "assistant" : "user",
    content: r.message,
  }));
}

async function callClaude(lead: Lead, history: ConvRow[], newMessage: string): Promise<AgentResponse> {
  const system = `Kamu sales agent GoStay. GoStay = HMS + WA Bot AI untuk hotel/villa/penginapan kecil Indonesia.
Harga: Starter Rp 99.000/bulan. Early bird: 3 bulan GRATIS untuk 50 hotel pertama.
Setup 30 menit, tanpa kontrak, tanpa kartu kredit.
Website: gostay.id | Trial: ${TRIAL_LINK}

Lead profile:
- Nama: ${lead.business_name}
- Kota: ${lead.city ?? "-"}
- Kategori: ${lead.category ?? "penginapan"}
- Rating: ${lead.rating ?? "-"}
${lead.booking_price_min ? `- Harga kamar mulai Rp ${lead.booking_price_min.toLocaleString("id")}/malam` : ""}

Respond dalam bahasa Indonesia kasual, singkat (maks 3 kalimat).
Return JSON ONLY — jangan tambah teks apapun di luar JSON:
{
  "reply": "teks WA yang akan dikirim",
  "action": "continue|send_trial_link|book_demo|escalate|close",
  "reason": "alasan singkat memilih action ini"
}

Rules action:
- Tanya fitur/cara kerja → action: continue, jelaskan singkat
- Tanya harga → action: continue, jelaskan + sebut early bird 3 bulan gratis
- Tertarik coba / minta link / mau daftar → action: send_trial_link (sertakan link di reply)
- Minta demo / lihat dulu / video call → action: book_demo
- Minta diskon extra / nego di luar paket → action: escalate
- Tidak tertarik / sudah pakai sistem lain / tolak → action: close`;

  const { message } = await chatCompletion({
    models: OUTBOUND_MODELS,
    maxTokens: 400,
    messages: [
      { role: "system", content: system },
      ...buildHistory(history),
      { role: "user", content: newMessage },
    ],
  });

  const text = message.content ?? "";
  if (!text.trim()) throw new Error("unexpected_claude_response");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("claude_no_json");

  const parsed = JSON.parse(jsonMatch[0]) as AgentResponse;
  const validActions: ConversationAction[] = ["continue", "send_trial_link", "book_demo", "escalate", "close"];
  if (!validActions.includes(parsed.action)) parsed.action = "continue";

  // Append trial link to reply when action demands it
  if (parsed.action === "send_trial_link" && !parsed.reply.includes("gostay.id")) {
    parsed.reply += `\n\nDaftar gratis di sini: ${TRIAL_LINK}`;
  }

  return parsed;
}

function statusFor(action: ConversationAction, currentStatus: string): string | null {
  if (currentStatus === "contacted" || currentStatus === "new") {
    if (action !== "continue") return "replied";
  }
  if (action === "send_trial_link") return "trial";
  if (action === "book_demo") return "demo_booked";
  if (action === "close") return "not_interested";
  return null;
}

async function notifyEscalation(lead: Lead, message: string): Promise<void> {
  const escalationNumber = process.env.ESCALATION_WA_NUMBER;
  const sessionId = process.env.WA_OUTBOUND_SESSION_ID;
  if (!escalationNumber || !sessionId) return;

  const appUrl = process.env.VITE_APP_URL ?? "https://app.gostay.id";
  const text = `[GoStay Leads] Eskalasi diperlukan!\n\nLead: ${lead.business_name} (${lead.city ?? "-"})\nPesan: "${message}"\n\nBuka: ${appUrl}/admin/leads/${lead.id}`;
  await sendText(sessionId, escalationNumber, text).catch(() => {});
}

export async function handleLeadConversation(
  lead: Lead,
  phoneJid: string,
  newMessage: string,
  sessionId: string,
): Promise<void> {
  // Fetch conversation history (last 10 messages for context window)
  const histRes = await serviceGet(
    `outbound_wa_conversations?lead_id=eq.${encodeURIComponent(lead.id)}` +
      `&order=sent_at.asc&limit=10&select=direction,message,sent_at`,
  );
  const history: ConvRow[] = histRes.ok ? await histRes.json() : [];

  let agentRes: AgentResponse;
  try {
    agentRes = await callClaude(lead, history, newMessage);
  } catch {
    // Claude down: send a human fallback, escalate
    agentRes = {
      reply: "Terima kasih pesannya! Tim GoStay akan segera menghubungi Anda 🙏",
      action: "escalate",
      reason: "claude_error",
    };
  }

  const now = new Date().toISOString();

  // Log inbound message
  await serviceInsert("outbound_wa_conversations", {
    lead_id: lead.id,
    phone_jid: phoneJid,
    direction: "inbound",
    message: newMessage,
    sent_at: now,
  }).catch(() => {});

  // Send reply
  const sendResult = await sendText(sessionId, phoneJid, agentRes.reply);

  // Log outbound reply
  await serviceInsert("outbound_wa_conversations", {
    lead_id: lead.id,
    phone_jid: phoneJid,
    direction: "outbound",
    message: agentRes.reply,
    wa_message_id: sendResult.messageId ?? null,
    action_taken: agentRes.action,
    sent_at: now,
  }).catch(() => {});

  // Update lead status
  const newStatus = statusFor(agentRes.action, lead.status);
  const patch: Record<string, unknown> = { last_contacted_at: now };
  if (newStatus) patch.status = newStatus;

  await serviceUpdate(
    `outbound_leads?id=eq.${encodeURIComponent(lead.id)}`,
    patch,
  ).catch(() => {});

  // Escalation notification
  if (agentRes.action === "escalate") {
    await notifyEscalation(lead, newMessage);
  }
}
