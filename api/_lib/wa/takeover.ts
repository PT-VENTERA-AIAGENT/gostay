// Staff takeover: making the bot actually stop.
//
// A handoff used to be a sentence — "kami sambungkan ke staf" — and then the
// bot answered the guest's next message anyway. The guest was promised a human
// and got a robot; staff typing in the inbox were talking over an assistant that
// would not yield. This is the switch that makes the promise true.
//
// ─── Why it expires ──────────────────────────────────────────────────────────
// Chatly's equivalent flag is cleared by hand. That fails quietly in the worst
// possible way: one forgotten takeover mutes that guest forever, and nobody
// notices, because the symptom IS silence. So a takeover lapses on its own.
// Staff can end it early, and simply replying again extends it — which is what
// someone in the middle of a conversation does anyway.

import { serviceGet, serviceUpdate } from "./client";

/** How long the bot stays quiet after a handoff, unless renewed. */
const DEFAULT_HOURS = 4;

function pauseHours(): number {
  const raw = Number(process.env.WA_TAKEOVER_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HOURS;
}

/**
 * Whether a human currently owns this conversation.
 *
 * FAILS OPEN — a read error returns false, so a database hiccup leaves the bot
 * answering rather than silently muting a hotel. Silence is the failure mode
 * that goes unnoticed; an extra bot reply is visible and recoverable.
 */
export async function isBotPaused(threadId: string): Promise<boolean> {
  try {
    const res = await serviceGet(
      `chat_threads?id=eq.${encodeURIComponent(threadId)}&select=bot_paused_until&limit=1`,
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ bot_paused_until: string | null }>;
    const until = rows[0]?.bot_paused_until;
    if (!until) return false;
    return new Date(until).getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Hand the conversation to a human for the next few hours.
 *
 * Best-effort: a failure here must not break the reply the guest is already
 * receiving. The worst case is that the bot keeps talking, which is exactly
 * where we were before this existed.
 */
export async function pauseBot(threadId: string, hours = pauseHours()): Promise<void> {
  try {
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    const res = await serviceUpdate(
      `chat_threads?id=eq.${encodeURIComponent(threadId)}`,
      { bot_paused_until: until },
    );
    if (!res.ok) console.error(`[wa/takeover] pause failed: HTTP ${res.status}`);
  } catch (e) {
    console.error("[wa/takeover] pause threw:", (e as Error).message);
  }
}

/** Give the conversation back to the bot. */
export async function resumeBot(threadId: string): Promise<void> {
  try {
    await serviceUpdate(
      `chat_threads?id=eq.${encodeURIComponent(threadId)}`,
      { bot_paused_until: null },
    );
  } catch (e) {
    console.error("[wa/takeover] resume threw:", (e as Error).message);
  }
}
