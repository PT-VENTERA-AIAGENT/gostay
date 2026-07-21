// Tiny Vercel-style req/res surface + helpers shared by the admin endpoints
// (api/admin/*). Mirrors the inline shapes used in api/wa/inbound.ts, factored
// out because several admin routes need the same bearer/body/param extraction.

export interface VercelReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

export interface VercelRes {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

/** The raw `Authorization` header value, if present. */
export function authHeader(req: VercelReq): string | undefined {
  const h = req.headers["authorization"] ?? req.headers["Authorization"];
  return Array.isArray(h) ? h[0] : h;
}

/** Parse the JSON body whether Vercel handed us a string or a parsed object. */
export function readJson(req: VercelReq): Record<string, unknown> {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body as Record<string, unknown>) ?? {};
}

/** A [slug] dynamic-route param. */
export function slugParam(req: VercelReq): string {
  const s = req.query?.slug;
  return (Array.isArray(s) ? s[0] : s) ?? "";
}

/** kebab-case a hotel name into a slug candidate (matches create_tenant's rule). */
export function toSlug(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// A service-role DELETE against `/rest/v1/<pathAndQuery>`. Best-effort: swallows
// errors, since it is only used on rollback/cleanup paths where a failed delete
// must not itself throw. Imported here from client.ts's config to reuse the one
// service-role credential source.
import { serviceConfig, serviceHeaders } from "../wa/client";

export async function serviceDelete(pathAndQuery: string): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return;
  await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method: "DELETE",
    headers: serviceHeaders(serviceKey),
  }).catch(() => {});
}
