// Send an approved WA draft to a lead via wa-ventera.
// Admin-only. Requires the draft to be approved=true before sending.
// Updates lead status → 'contacted' and draft → sent=true.

import { requirePlatformAdmin } from "../../_lib/admin/platform-auth";
import { authHeader, readJson, type VercelReq, type VercelRes } from "../../_lib/admin/http";
import { serviceConfig, serviceHeaders, serviceGet, serviceInsert, serviceUpdate } from "../../_lib/wa/client";
import { sendText } from "../../_lib/wa/send";

function outboundSession(): string {
  return (process.env.WA_OUTBOUND_SESSION_ID ?? "").trim();
}

function jidFor(phoneWa: string): string {
  const digits = phoneWa.replace(/\D/g, "");
  return digits.includes("@") ? digits : `${digits}@s.whatsapp.net`;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const guard = await requirePlatformAdmin(authHeader(req));
  if (guard.ok === false) return res.status(guard.status).json({ error: guard.error });

  const sessionId = outboundSession();
  if (!sessionId) return res.status(500).json({ error: "WA_OUTBOUND_SESSION_ID_not_configured" });

  const body = readJson(req);
  const draftId = typeof body.draftId === "string" ? body.draftId : undefined;
  if (!draftId) return res.status(400).json({ error: "draftId_required" });

  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return res.status(500).json({ error: "db_not_configured" });

  // Fetch draft — must be approved and not yet sent
  const draftRes = await serviceGet(
    `outbound_message_drafts?id=eq.${encodeURIComponent(draftId)}&select=*`,
  );
  if (!draftRes.ok) return res.status(500).json({ error: "draft_fetch_failed" });
  const drafts = await draftRes.json() as Array<{
    id: string; lead_id: string; message: string; approved: boolean; sent: boolean;
  }>;
  const draft = drafts[0];
  if (!draft) return res.status(404).json({ error: "draft_not_found" });
  if (!draft.approved) return res.status(400).json({ error: "draft_not_approved" });
  if (draft.sent) return res.status(409).json({ error: "already_sent" });

  // Fetch lead for phone number
  const leadRes = await serviceGet(
    `outbound_leads?id=eq.${encodeURIComponent(draft.lead_id)}&select=id,phone_wa,business_name,status`,
  );
  if (!leadRes.ok) return res.status(500).json({ error: "lead_fetch_failed" });
  const leads = await leadRes.json() as Array<{ id: string; phone_wa?: string; business_name: string; status: string }>;
  const lead = leads[0];
  if (!lead) return res.status(404).json({ error: "lead_not_found" });
  if (!lead.phone_wa) return res.status(400).json({ error: "lead_has_no_phone" });

  const to = jidFor(lead.phone_wa);

  // Send via wa-ventera
  const result = await sendText(sessionId, to, draft.message);
  if (!result.ok) return res.status(502).json({ error: result.error });

  const now = new Date().toISOString();

  // Mark draft as sent
  await serviceUpdate(
    `outbound_message_drafts?id=eq.${encodeURIComponent(draftId)}`,
    { sent: true, sent_at: now },
  );

  // Log to conversation history
  await serviceInsert("outbound_wa_conversations", {
    lead_id: lead.id,
    phone_jid: to,
    direction: "outbound",
    message: draft.message,
    wa_message_id: result.messageId ?? null,
    action_taken: "initial_contact",
    sent_at: now,
  });

  // Update lead status to 'contacted' if still 'new'
  if (lead.status === "new") {
    await serviceUpdate(
      `outbound_leads?id=eq.${encodeURIComponent(lead.id)}`,
      { status: "contacted", last_contacted_at: now },
    );
  } else {
    await serviceUpdate(
      `outbound_leads?id=eq.${encodeURIComponent(lead.id)}`,
      { last_contacted_at: now },
    );
  }

  return res.status(200).json({ ok: true, messageId: result.messageId });
}
