// @vitest-environment node
import { describe, it, expect } from "vitest";
import { feeSplit, round2 } from "./fee";

describe("feeSplit — Ventera 5% platform fee on hotel reservation income", () => {
  it("splits a round Rp 1.000.000 reservation into 5% fee / 95% net", () => {
    const s = feeSplit(1_000_000, 500);
    expect(s.gross).toBe(1_000_000);
    expect(s.fee).toBe(50_000);   // 5%
    expect(s.net).toBe(950_000);  // 95% → credited to the hotel
    expect(s.fee + s.net).toBe(s.gross); // conservation: no cent lost
  });

  it("defaults to 5% when no rate is given", () => {
    expect(feeSplit(2_000_000)).toEqual({ gross: 2_000_000, fee: 100_000, net: 1_900_000, feeBps: 500 });
  });

  it.each([
    [500_000, 25_000, 475_000],
    [750_000, 37_500, 712_500],
    [1_250_000, 62_500, 1_187_500],
    [349_999, 17_499.95, 332_499.05],
    [1, 0.05, 0.95],
  ])("gross %d → fee %d, net %d (and fee+net === gross)", (gross, fee, net) => {
    const s = feeSplit(gross, 500);
    expect(s.fee).toBe(fee);
    expect(s.net).toBe(net);
    expect(round2(s.fee + s.net)).toBe(gross);
  });

  it("never lets rounding create or destroy money (net is derived from fee)", () => {
    // 333.333 * 5% = 16.66665 → fee rounds to 16.67, so net must be 333.33 - 16.67
    const s = feeSplit(333.33, 500);
    expect(s.fee).toBe(16.67);
    expect(s.net).toBe(316.66);
    expect(round2(s.fee + s.net)).toBe(333.33);
  });

  it("supports a configurable rate (e.g. 10% = 1000 bps)", () => {
    const s = feeSplit(1_000_000, 1000);
    expect(s.fee).toBe(100_000);
    expect(s.net).toBe(900_000);
  });

  it("a 0% rate credits the hotel the full amount", () => {
    expect(feeSplit(1_000_000, 0)).toEqual({ gross: 1_000_000, fee: 0, net: 1_000_000, feeBps: 0 });
  });

  it("accumulates correctly over many reservations (lifetime totals)", () => {
    const reservations = [1_000_000, 500_000, 750_000, 2_400_000, 320_000];
    const totals = reservations.reduce(
      (acc, amt) => {
        const s = feeSplit(amt, 500);
        return { gross: acc.gross + s.gross, fee: acc.fee + s.fee, net: acc.net + s.net };
      },
      { gross: 0, fee: 0, net: 0 },
    );
    expect(totals.gross).toBe(4_970_000);
    expect(totals.fee).toBe(248_500);   // 5% of 4.97M
    expect(totals.net).toBe(4_721_500); // what the hotel can withdraw
    expect(totals.fee + totals.net).toBe(totals.gross);
  });

  it("rejects invalid input", () => {
    expect(() => feeSplit(-1, 500)).toThrow();
    expect(() => feeSplit(NaN, 500)).toThrow();
    expect(() => feeSplit(1000, -1)).toThrow();
    expect(() => feeSplit(1000, 10001)).toThrow();
    expect(() => feeSplit(1000, 5.5)).toThrow();
  });
});
