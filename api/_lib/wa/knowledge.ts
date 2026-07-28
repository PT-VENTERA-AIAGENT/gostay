// Retrieving the hotel's own answers for the assistant to quote.
//
// Deterministic keyword scoring, not embeddings. Three reasons, in order of how
// much they mattered:
//
//   1. The same question must return the same passage every time. A guest who
//      asks twice and gets two different policies is the problem this whole
//      table exists to fix; a similarity search that reorders on a tie would
//      reintroduce it.
//   2. It runs on the hot path of every inbound message. Embeddings mean a
//      second network call and a second thing that can be down.
//   3. Staff can predict it. "Add the word 'wifi' and it will match" is a rule a
//      hotel manager can act on; "the vector moved" is not.
//
// Scoring reuses the flow matcher's tiers so ONE ranking idea governs the whole
// WhatsApp surface: exact beats whole-word beats substring.

import { serviceGet } from "./client";
import { scoreKeyword, type KeywordTier } from "./flow/select";

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  keywords: string[];
}

interface KnowledgeRow {
  id: string;
  topic: string;
  content: string;
  keywords: string[] | null;
}

/**
 * A tenant's active knowledge entries.
 *
 * Returns [] rather than throwing when the read fails: a hotel with no entries
 * and a hotel whose entries momentarily cannot be read must both end up in the
 * same place — the assistant says it does not know and offers a human, which is
 * always safe.
 */
export async function listKnowledge(tenantId: string): Promise<KnowledgeEntry[]> {
  const res = await serviceGet(
    `hotel_knowledge?tenant_id=eq.${encodeURIComponent(tenantId)}&is_active=eq.true` +
      `&select=id,topic,content,keywords&order=topic.asc`,
  );
  if (!res.ok) {
    console.error(`[wa/knowledge] list failed: HTTP ${res.status}`);
    return [];
  }
  return ((await res.json()) as KnowledgeRow[]).map((r) => ({
    id: r.id,
    topic: r.topic,
    content: r.content,
    keywords: Array.isArray(r.keywords) ? r.keywords : [],
  }));
}

/**
 * Weakest match worth returning.
 *
 * Substring (tier 1) is excluded for the same reason it cannot start a flow: in
 * Indonesian it fires on shared prefixes, and a wrong passage quoted confidently
 * is worse than "saya belum punya informasinya" — the guest acts on the wrong
 * one and only finds out at the desk.
 */
const MIN_TIER: KeywordTier = 2;

/** How many passages to hand the model. Enough for a compound question, few
 *  enough that the prompt stays small and the model cannot drift between them. */
const MAX_RESULTS = 3;

export interface ScoredEntry extends KnowledgeEntry {
  score: number;
}

/**
 * The entries that answer `question`, best first.
 *
 * An entry is scored on its topic AND every keyword; the best single hit wins,
 * so a five-keyword entry is not automatically ranked above a precise one.
 * Ties break on topic so the order never depends on how the database happened
 * to return rows.
 */
export function searchKnowledge(entries: readonly KnowledgeEntry[], question: string): ScoredEntry[] {
  const q = (question ?? "").toLowerCase().trim();
  if (!q) return [];

  const scored: ScoredEntry[] = [];
  for (const e of entries) {
    let best: KeywordTier = 0;
    for (const term of [e.topic, ...e.keywords]) {
      const s = scoreKeyword(q, term);
      if (s > best) best = s;
      if (best === 3) break;
    }
    if (best >= MIN_TIER) scored.push({ ...e, score: best });
  }

  scored.sort((a, b) => b.score - a.score || a.topic.localeCompare(b.topic));
  return scored.slice(0, MAX_RESULTS);
}

/** Fetch and search in one call. */
export async function findKnowledge(tenantId: string, question: string): Promise<ScoredEntry[]> {
  return searchKnowledge(await listKnowledge(tenantId), question);
}
