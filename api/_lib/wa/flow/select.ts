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
 * Fold a message down to lowercase words separated by single spaces.
 *
 * Punctuation becomes a separator rather than part of a word. Without this the
 * boundary tests below are anchored on spaces alone, so "menu?" — a guest
 * typing one word and a question mark — fails both the exact and whole-word
 * tests and falls to tier 1, which is BELOW the threshold to start a flow. The
 * result was silence for one of the most common messages a hotel receives.
 * Indonesian guests punctuate freely ("menu dong!", "…di reguler ?"), so this
 * is the normal case, not an edge one.
 */
function normalise(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How strongly `keyword` matches `input`:
 *
 *   3  exact       the guest typed exactly this ("menu" === "menu")
 *   2  whole word  it stands alone inside the message ("lihat menu dong")
 *   1  substring   it appears anywhere ("menunggu") — last resort only
 *   0  no match
 *
 * Both sides are normalised, so callers may pass raw guest text and raw database
 * values. Multi-word keywords ("pesan kamar") still work: normalising both sides
 * to single-spaced words keeps the phrase contiguous.
 */
export function scoreKeyword(input: string, keyword: string): KeywordTier {
  const k = normalise(keyword);
  const i = normalise(input);
  if (!k || !i) return 0;
  if (i === k) return 3;
  if (i.startsWith(k + " ") || i.endsWith(" " + k) || i.includes(" " + k + " ")) {
    return 2;
  }
  // Substring is checked on the normalised form too, so a keyword never matches
  // across a punctuation boundary it should not have crossed.
  if (i.includes(k)) return 1;
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
/** A keyword that two flows claim — the lower-priority one can never win it. */
export interface KeywordClash {
  keyword: string;
  /** The flow that actually receives messages containing it. */
  ownerName: string;
  /** The flow that lists it but is shadowed. */
  shadowedName: string;
}

/**
 * Keywords listed by more than one flow.
 *
 * Selection walks flows in precedence order and the first best match wins, so a
 * shared keyword only ever fires the higher-priority flow — the other is dead
 * for that word, with nothing in the console to say so. Lor Kali shipped this
 * way: "handuk" and "laundry" sat on Request Tamu, so its whole Housekeeping
 * flow was unreachable, and "kamar kosong" sat on Reservasi, burying Cek Kamar
 * Kosong. Surfacing it is what stops it recurring.
 *
 * `flows` MUST be in precedence order; the first flow to claim a keyword is
 * reported as its owner.
 */
export function findKeywordClashes<T extends SelectableFlow>(
  flows: readonly T[],
): KeywordClash[] {
  const owner = new Map<string, string>();
  const clashes: KeywordClash[] = [];

  for (const f of flows) {
    for (const kw of f.triggerKeywords ?? []) {
      const key = (kw ?? "").trim().toLowerCase();
      if (!key) continue;
      const prev = owner.get(key);
      if (prev === undefined) {
        owner.set(key, f.name);
      } else if (prev !== f.name) {
        clashes.push({ keyword: kw, ownerName: prev, shadowedName: f.name });
      }
    }
  }
  return clashes;
}

/**
 * What selection decided, including the case a plain `pickFlow` cannot express:
 * the guest asked for something the hotel DOES offer, but not to them yet.
 */
export type FlowChoice<T> =
  /** Run this flow. */
  | { kind: "run"; flow: T }
  /**
   * This flow owns the message but the guest fails its precondition. Telling
   * them why beats the old behaviour — silently falling through to whichever
   * lower-priority flow also happened to claim the word, which answered a room
   * service request with the greeting menu and left the guest none the wiser.
   */
  | { kind: "blocked"; flow: T }
  | { kind: "none" };

/**
 * Pick the flow that answers `input`, and say whether a precondition stopped it.
 *
 * Precedence is by match strength first, then the hotel's own ordering — and a
 * gated flow competes on equal terms. So "menu" from a guest who has not checked
 * in is claimed by room service (priority 20) rather than the greeting
 * (priority 90), and comes back as `blocked` so the caller can explain. An
 * in-house guest gets `run` for the same word.
 *
 * `flows` MUST already be in precedence order — lower `priority` first, then
 * name — which is exactly what the idx_wa_flows_active index yields.
 */
export function selectFlow<T extends SelectableFlow>(
  flows: readonly T[],
  input: string,
  state: GuestState,
  minTier: KeywordTier = MIN_START_TIER,
): FlowChoice<T> {
  const lower = (input ?? "").toLowerCase().trim();
  if (!lower) return { kind: "none" };

  let best: T | null = null;
  let bestScore: KeywordTier = 0;
  let bestBlocked = false;

  for (const f of flows) {
    const s = bestKeywordScore(lower, f.triggerKeywords);
    if (s < minTier) continue;
    // Strictly greater, so ties keep the earlier (higher-precedence) flow.
    if (s > bestScore) {
      bestScore = s;
      best = f;
      bestBlocked = !meetsRequirement(f.requires, state);
    }
  }

  if (!best) return { kind: "none" };
  return bestBlocked ? { kind: "blocked", flow: best } : { kind: "run", flow: best };
}

/**
 * The flow to run, ignoring any that the guest's state rules out.
 *
 * Kept for callers that only care about the runnable answer; `selectFlow` is
 * what the router uses, because it can also report a blocked match.
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
