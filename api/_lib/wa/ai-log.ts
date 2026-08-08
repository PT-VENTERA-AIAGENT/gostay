// Audit trail of every concierge answer, for the platform console.
//
// The concierge already decides carefully whether an answer may be sent — it
// refuses more often than it answers. But every one of those refusals used to
// be a console.error in a serverless function: nobody could tell a bot that is
// working from a bot that has silently replaced every answer with "let me get
// staff" since a provider ran out of credit. Same gap wa_incidents closed for
// undelivered messages, one layer up.
//
// Written with the service role (RLS is for readers), and never allowed to
// break a reply: an audit row is not worth failing a guest's message over.

import { serviceConfig, serviceInsert } from "./client";

/**
 * What happened to one concierge answer.
 *
 * The distinction that matters to an operator is WHY nothing useful was sent —
 * a blocked figure is a model problem, `failed` is a vendor problem, and they
 * want opposite responses.
 */
export type AiReplyStatus =
  /** Answered from tool data and sent. */
  | "sent"
  /** Answered without calling a single tool — the model talking from memory. */
  | "ungrounded"
  /** Reply quoted a rate/count no tool returned (number-guard). */
  | "blocked_numbers"
  /** Reply leaked something shaped like a phone number, email or booking ref. */
  | "blocked_pii"
  /** No provider answered, or the chain is unconfigured. */
  | "failed";

export interface AiReplyLogEntry {
  tenantId: string;
  question: string;
  status: AiReplyStatus;
  /** The text actually sent to the guest. Null when it was replaced. */
  reply?: string | null;
  provider?: string | null;
  model?: string | null;
  toolsUsed?: string[];
  /** Figures the number-guard could not trace to a tool result. */
  offenders?: string[];
  error?: string | null;
  latencyMs?: number;
}

/** Long free text is not worth storing in full for an audit list. */
const MAX_TEXT = 2000;

function clip(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
}

/**
 * Record one concierge answer. Never throws, never rejects.
 *
 * Silently does nothing when the service role is not configured, which is the
 * case in unit tests — so no test needs to know this module exists.
 */
export async function recordAiReply(entry: AiReplyLogEntry): Promise<void> {
  const { url, serviceKey } = serviceConfig();
  if (!url || !serviceKey) return;

  try {
    await serviceInsert("ai_reply_logs", {
      tenant_id: entry.tenantId,
      question: clip(entry.question) ?? "",
      status: entry.status,
      reply: clip(entry.reply),
      provider: entry.provider ?? null,
      model: entry.model ?? null,
      tools_used: entry.toolsUsed ?? [],
      offenders: entry.offenders ?? [],
      error: clip(entry.error),
      latency_ms: Math.max(0, Math.round(entry.latencyMs ?? 0)),
    });
  } catch (e) {
    console.error(`[wa/ai-log] could not record: ${(e as Error).message}`);
  }
}
