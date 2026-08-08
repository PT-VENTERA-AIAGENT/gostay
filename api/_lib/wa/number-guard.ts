// Layer 4 of the concierge guardrail: every consequential number in the reply
// must trace back to what the tools returned.
//
// ─── Why layers 1–3 are not enough ───────────────────────────────────────────
// The existing layers keep the model from REACHING data it should not have and
// scan the output for phone numbers, emails and booking refs. None of them
// checks the figures. The model can call `daftar_tipe_kamar`, receive
// "Deluxe Rp450.000", and answer "Deluxe Rp420.000" — grounded by every
// existing test, wrong by Rp30.000. Measured against a 70B-class model, roughly
// a quarter of the questions whose answer was absent from the grounding came
// back with an invented figure: shipping estimates, discounts, stock counts.
//
// GoStay is better placed than most to check this, because the grounding is not
// a prompt blob: the tool results are right there as `role:"tool"` turns. This
// module compares the two.
//
// ─── Matched per unit, never globally ────────────────────────────────────────
// A flat "does this digit appear anywhere" test is too weak to be worth much.
// With "check-in 2 malam" somewhere in the grounding, a global check happily
// passes an invented "sisa 2 kamar". So a figure quoted as money is only
// cleared by money in the grounding, a duration only by a duration, and so on.
//
// Scope is deliberately narrow: only numbers carrying a unit that costs money
// or sets an expectation are checked. Incidental numbers ("ada 2 pilihan") are
// ignored, because replacing a correct reply with "let me get staff" is also a
// failure.

export type NumberKind = "currency" | "percent" | "duration" | "quantity";

/**
 * Numbers found in the grounding, bucketed by unit. `generic` holds figures
 * that carried no unit at all (a bare year in a date, "30" of "30 m²") and
 * clears a quote in any kind — the guest is also free to name a figure and have
 * the bot repeat it.
 */
export interface GroundedNumbers {
  byKind: Record<NumberKind, Set<string>>;
  generic: Set<string>;
}

// ─── Patterns ────────────────────────────────────────────────────────────────

/** Any run of digits, optionally with thousand/decimal separators. */
const DIGIT_RUN = /\d[\d.,]*/g;

/** Optional range tail, so both ends of "2-3 malam" are captured together. */
const RANGE = String.raw`(?:\s*[-–—]\s*\d[\d.,]*)?`;

const UNIT_PATTERNS: Array<{ kind: NumberKind; re: RegExp }> = [
  // "Rp450.000", "Rp 450000", "IDR 450.000"
  { kind: "currency", re: /(?:rp|idr)\.?\s*\d[\d.,]*/gi },
  // "450 ribu", "1,2 juta"
  { kind: "currency", re: /\d[\d.,]*\s*(?:ribu|rb|juta|jt)\b/gi },
  // "10%", "10 persen". `%` takes no word boundary — "*10%*" has none after the
  // sign, and a trailing \b there would skip the match entirely.
  { kind: "percent", re: /\d[\d.,]*\s*(?:%|persen\b)/gi },
  // "2 malam", "3-5 hari", "1 minggu", "14 jam"
  {
    kind: "duration",
    re: new RegExp(
      String.raw`\d[\d.,]*${RANGE}\s*(?:malam|hari|minggu|bulan|jam|night|nights|day|days)\b`,
      "gi",
    ),
  },
  // "2 kamar", "sisa 3 unit", "4 orang", "2 pax"
  {
    kind: "quantity",
    re: new RegExp(
      String.raw`\d[\d.,]*${RANGE}\s*(?:kamar|unit|room|rooms|orang|tamu|pax|guest|guests|dewasa|buah|pcs)\b`,
      "gi",
    ),
  },
];

const emptyByKind = (): Record<NumberKind, Set<string>> => ({
  currency: new Set(),
  percent: new Set(),
  duration: new Set(),
  quantity: new Set(),
});

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Normalise a numeric token to a comparison key: separators dropped, so
 * "Rp450.000", "450,000" and "450000" all collapse to "450000".
 */
export function normaliseNumber(raw: string): string {
  return raw.replace(/[.,\s]/g, "");
}

/**
 * Bucket every number in the grounding by the unit it is quoted in.
 *
 * Sources are trusted wholesale: the tool results, plus the guest's own
 * question — a guest who says "untuk 4 orang" may have that repeated back.
 */
export function groundedNumbers(sources: string[]): GroundedNumbers {
  const byKind = emptyByKind();
  const generic = new Set<string>();

  for (const source of sources) {
    if (!source) continue;

    // Spans already claimed by a unit mention — their digits belong to that
    // kind, not to `generic`.
    const claimed: Array<[number, number]> = [];

    for (const { kind, re } of UNIT_PATTERNS) {
      for (const mention of source.matchAll(re)) {
        const start = mention.index ?? 0;
        claimed.push([start, start + mention[0].length]);
        for (const key of numbersIn(mention[0])) byKind[kind].add(key);
      }
    }

    for (const run of source.matchAll(DIGIT_RUN)) {
      const start = run.index ?? 0;
      if (claimed.some(([from, to]) => start >= from && start < to)) continue;
      const key = normaliseNumber(run[0]);
      if (key) generic.add(key);
    }
  }

  return { byKind, generic };
}

/**
 * Consequential numbers in `reply` that the grounding does not support, each as
 * the phrase it appeared in ("Rp420.000", "3-5 hari"). Empty means safe to send.
 */
export function ungroundedNumbers(reply: string, grounded: GroundedNumbers): string[] {
  const offenders = new Set<string>();

  for (const { kind, re } of UNIT_PATTERNS) {
    for (const mention of reply.matchAll(re)) {
      // A mention may hold two numbers ("3-5 hari"); both must be grounded.
      for (const key of numbersIn(mention[0])) {
        if (!grounded.byKind[kind].has(key) && !grounded.generic.has(key)) {
          offenders.add(mention[0].trim());
          break;
        }
      }
    }
  }

  return [...offenders];
}

// ─── Internal ────────────────────────────────────────────────────────────────

/** Every digit run inside a single mention, normalised. */
function numbersIn(mention: string): string[] {
  return [...mention.matchAll(DIGIT_RUN)]
    .map((m) => normaliseNumber(m[0]))
    .filter(Boolean);
}
