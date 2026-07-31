// Resepsionis AI (Voice) — dua aksi dalam SATU function Vercel:
//
//   POST /api/voice/session     ephemeral key OpenAI Realtime untuk browser staf
//   POST /api/voice/call-ended  webhook selesai-telepon dari gateway suara
//
// Thin shell — logika dan gerbangnya di api/_lib/voice/handlers.ts; arsitektur
// di docs/VOICE-AI.md. Pola [action] yang sama dengan api/payment.

import { authHeader, readJson, type VercelReq, type VercelRes } from "../_lib/admin/http";
import { handleVoiceSession, handleVoiceCallEnded } from "../_lib/voice/handlers";

function actionParam(req: VercelReq): string {
  const a = req.query?.action;
  return (Array.isArray(a) ? a[0] : a) ?? "";
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const action = actionParam(req);

  if (action === "session") {
    const result = await handleVoiceSession(authHeader(req));
    if (result.ok === false) { res.status(result.status).json({ error: result.error }); return; }
    res.status(200).json(result.payload);
    return;
  }

  if (action === "call-ended") {
    const result = await handleVoiceCallEnded(
      headerValue(req.headers["x-voice-secret"]),
      readJson(req),
    );
    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
    res.status(200).json({
      ok: true,
      callLogId: result.callLogId,
      customerId: result.customerId,
      customerCreated: result.customerCreated,
    });
    return;
  }

  res.status(404).json({ error: "unknown_action" });
}
