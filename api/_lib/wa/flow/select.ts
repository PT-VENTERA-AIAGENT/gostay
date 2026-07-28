// Choosing which flow answers an inbound message.
//
// Two rules, in this order:
//
//   1. TIERED KEYWORD MATCH — a stronger match always beats a weaker one, so a
//      flow that owns the exact word the guest typed wins over one that merely
//      contains it somewhere. Ported from Chatly's keyword-match.ts, which
//      arrived at the same tiers for the same reason.
//
//   2. GUEST-STATE GATE — a flow whose `requires` is not satisfied is treated as
//      NO MATCH and selection keeps looking. This is the part Chatly has no need
//      for, and it is the whole answer to "how do we tell a reservation from a
//      menu request?": both flows can claim the word "menu", and the guest's
//      actual state decides which one gets it. An in-house guest reaches room
//      service; everyone else falls straight through to the greeting, with no
//      branch anywhere in code.
//
// Why tiers and not a plain `includes`: Indonesian is full of everyday words
// that begin with a trigger — "menunggu", "menuju", "menurut" all contain
// "menu". A substring rule fires the ordering flow on "saya menunggu
// konfirmasi". Tier 2 (whole word) is what makes "menu" safe to use as a
// trigger at all.

import type { FlowRequirement } from "./store";

export type KeywordTier = 0 | 1 | 2 | 3;

/**
 * How strongly `keyword` matches `input`:
 *
 *   3  exact       the guest typed exactly this ("menu" === "menu")
 *   2  whole word  it stands alone inside the message ("lihat menu dong")
 *   1  substring   it appears anywhere ("menunggu") — last resort only
 *   0  no match
 *
 * `input` is expected already lowercased and trimmed; the keyword is normalised
 * here so raw database values are safe to pass.
 */
export function scoreKeyword(input: string, keyword: string): KeywordTier {
  const k = keyword.toLowerCase().trim();
  if (!k || !input) return 0;
  if (input === k) return 3;
  if (input.startsWith(k + " ") || input.endsWith(" " + k) || input.includes(" " + k + " ")) {
    return 2;
  }
  if (input.includes(k)) return 1;
  return 0;
}

/** The best tier any of `keywords` reaches against `input`. */
export function bestKeywordScore(input: string, keywords: readonly string[]): KeywordTier {
  let best: KeywordTier = 0;
  for (const kw of keywords) {
    const s = scoreKeyword(input, kw);
    if (s > best) best = s;
    if (best === 3) break; // nothing beats exact
  }
  return best;
}

/** What the engine knows about the guest when it picks a flow. */
export interface GuestState {
  /** True when they have a checked_in booking at this hotel right now. */
  isInhouse: boolean;
}

/** The flow fields selection needs. Kept narrow so tests need no database. */
export interface SelectableFlow {
  id: string;
  name: string;
  triggerKeywords: string[];
  requires: FlowRequirement;
  priority: number;
}

/** Whether the guest satisfies a flow's precondition. */
export function meetsRequirement(requires: FlowRequirement, state: GuestState): boolean {
  switch (requires) {
    case "inhouse":
      return state.isInhouse;
    case "none":
    default:
      return true;
  }
}

/**
 * The weakest match allowed to START a conversation: whole word or exact.
 *
 * Substring (tier 1) is deliberately NOT enough. Two reasons, both about
 * replies the hotel would never want to send:
 *
 *   - Echo loops. The gateway can deliver our own outbound text back to us, and
 *     a long reply almost always contains SOME trigger as a fragment. The
 *     built-in greeting guards this with a ≤4-word rule plus a cooldown; flows
 *     get the equivalent protection by refusing to start on a fragment.
 *   - Indonesian prefixes. "menunggu", "menuju" and "menurut" all contain
 *     "menu" as a substring, so a tier-1 start would open the room-service
 *     menu on "saya menunggu konfirmasi".
 *
 * Tier 1 is still computed, and still useful for ranking two flows that both
 * matched properly — it just cannot be the reason a flow fires.
 */
export const MIN_START_TIER: KeywordTier = 2;

/**
 * Pick the flow that should answer `input`, or null when none should.
 *
 * `flows` MUST already be in precedence order — lower `priority` first, then
 * name — which is exactly what the idx_wa_flows_active index yields. Ties keep
 * the earlier flow (the comparison is strict `>`), so ordering is fully the
 * hotel's to control and never depends on row order.
 *
 * A flow that matches on words but fails its state gate does not merely lose —
 * it is skipped, so a lower-priority flow can still claim the message. Without
 * that, "menu" from a guest who has not checked in would match room service,
 * fail, and answer nothing.
 */
export function pickFlow<T extends SelectableFlow>(
  flows: readonly T[],
  input: string,
  state: GuestState,
  minTier: KeywordTier = MIN_START_TIER,
): T | null {
  const lower = (input ?? "").toLowerCase().trim();
  if (!lower) return null;

  let best: T | null = null;
  let bestScore: KeywordTier = 0;

  for (const f of flows) {
    if (!meetsRequirement(f.requires, state)) continue;
    const s = bestKeywordScore(lower, f.triggerKeywords);
    if (s < minTier) continue;
    if (s > bestScore) {
      bestScore = s;
      best = f;
      // Exact match on the highest-precedence flow that qualifies — unbeatable.
      if (s === 3) break;
    }
  }
  return best;
}
