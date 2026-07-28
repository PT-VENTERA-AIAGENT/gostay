import { describe, it, expect } from "vitest";
import { stayBar } from "./stayBar";

const W = 100;
const base = { cellWidth: W, numDays: 10, gap: 0 };

describe("stayBar — a night is not a day", () => {
  it("spans one cell per night", () => {
    // 27 → 30 is three nights, so three cells wide, wherever it sits.
    const b = stayBar({ ...base, startOffset: 0, endOffset: 3 })!;
    expect(b.width).toBe(3 * W);
  });

  it("starts at midday of the check-in date", () => {
    // Not at the left edge: the guest arrives in the afternoon.
    const b = stayBar({ ...base, startOffset: 2, endOffset: 4 })!;
    expect(b.left).toBe(2 * W + W / 2);
  });

  it("ends at midday of the check-out date", () => {
    const b = stayBar({ ...base, startOffset: 2, endOffset: 4 })!;
    expect(b.left + b.width).toBe(4 * W + W / 2);
  });

  it("leaves a visible turnover when one stay ends and another begins the same day", () => {
    // The reading this whole shift exists for. Before it, these two bars met
    // edge-to-edge and looked like a double booking — or worse, the check-out
    // day looked entirely free.
    const leaving = stayBar({ ...base, startOffset: 0, endOffset: 3 })!;
    const arriving = stayBar({ ...base, startOffset: 3, endOffset: 5 })!;

    // They meet exactly at midday of day 3, neither overlapping nor leaving a
    // gap that would suggest an empty night.
    expect(leaving.left + leaving.width).toBe(3 * W + W / 2);
    expect(arriving.left).toBe(3 * W + W / 2);
  });
});

describe("stayBar — clipping at the edges of the view", () => {
  it("starts flush when the stay began before the visible range", () => {
    // Its arrival is off-screen; pretending it arrived at midday of the first
    // visible column would be a lie the calendar cannot support.
    const b = stayBar({ ...base, startOffset: -3, endOffset: 2 })!;
    expect(b.left).toBe(0);
    // Half a cell WIDER than an equivalent unclipped stay, and correctly so:
    // the first half of column 0 really is occupied, because the guest was
    // already in the room before this view began. Only the departure end keeps
    // its midday shift.
    expect(b.left + b.width).toBe(2 * W + W / 2);
  });

  it("never overflows the last column", () => {
    const b = stayBar({ ...base, startOffset: 8, endOffset: 20 })!;
    expect(b.left + b.width).toBeLessThanOrEqual(base.numDays * W);
  });

  it("returns null for a stay entirely before or after the view", () => {
    expect(stayBar({ ...base, startOffset: -5, endOffset: -1 })).toBeNull();
    expect(stayBar({ ...base, startOffset: 12, endOffset: 15 })).toBeNull();
  });

  it("returns null for a zero-length range", () => {
    expect(stayBar({ ...base, startOffset: 3, endOffset: 3 })).toBeNull();
  });
});

describe("stayBar — the gap between bars", () => {
  it("insets both sides so touching bars stay distinguishable", () => {
    const b = stayBar({ ...base, gap: 2, startOffset: 1, endOffset: 3 })!;
    expect(b.left).toBe(1 * W + W / 2 + 2);
    expect(b.width).toBe(2 * W - 4);
  });

  it("drops a bar the gap would collapse to nothing", () => {
    expect(stayBar({ cellWidth: 4, numDays: 10, gap: 10, startOffset: 0, endOffset: 1 })).toBeNull();
  });
});
