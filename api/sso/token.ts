import { exchangeCode } from "../_lib/exchange";
import { exchangePortalToken } from "../_lib/wa/portal-session";

interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as
    | {
        code?: string;
        code_verifier?: string;
        tenant_slug?: string;
        signup_context?: "owner" | "guest";
        portal_token?: string;
      }
    | undefined;

  // Tamu masuk lewat tautan WhatsApp, bukan SSO. Menumpang route ini karena
  // api/ sudah di batas 12 function plan Hobby — dan karena tempatnya memang
  // di sini: inilah satu-satunya berkas yang mencetak sesi.
  if (body?.portal_token) {
    const guest = await exchangePortalToken(body.portal_token);
    res.status(guest.status).json(guest.body);
    return;
  }

  const result = await exchangeCode({
    code: body?.code ?? "",
    code_verifier: body?.code_verifier ?? "",
    origin: headerValue(req.headers.origin),
    tenantSlug: body?.tenant_slug,
    signupContext: body?.signup_context === "guest" ? "guest" : "owner",
  });

  res.status(result.status).json(result.body);
}
