// @vitest-environment node
import { describe, it, expect } from "vitest";
import { feeSplit, feeBpsFor, round2 } from "./fee";

describe("feeSplit — Ventera 7% platform fee on hotel reservation income", () => {
  it("splits a round Rp 1.000.000 reservation into 7% fee / 93% net", () => {
    const s = feeSplit(1_000_000, 700);
    expect(s.gross).toBe(1_000_000);
    expect(s.fee).toBe(70_000);   // 7%
    expect(s.net).toBe(930_000);  // 93% → credited to the hotel
    expect(s.fee + s.net).toBe(s.gross); // conservation: no cent lost
  });

  it("defaults to 7% when no rate is given", () => {
    expect(feeSplit(2_000_000)).toEqual({ gross: 2_000_000, fee: 140_000, net: 1_860_000, feeBps: 700 });
  });

  it.each([
    [500_000, 35_000, 465_000],
    [750_000, 52_500, 697_500],
    [1_250_000, 87_500, 1_162_500],
    [349_999, 24_499.93, 325_499.07],
    [1, 0.07, 0.93],
  ])("gross %d → fee %d, net %d (and fee+net === gross)", (gross, fee, net) => {
    const s = feeSplit(gross, 700);
    expect(s.fee).toBe(fee);
    expect(s.net).toBe(net);
    expect(round2(s.fee + s.net)).toBe(gross);
  });

  it("never lets rounding create or destroy money (net is derived from fee)", () => {
    // 333.33 * 7% = 23.3331 → fee rounds to 23.33, so net must be 333.33 - 23.33
    const s = feeSplit(333.33, 700);
    expect(s.fee).toBe(23.33);
    expect(s.net).toBe(310.00);
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
        const s = feeSplit(amt, 700);
        return { gross: acc.gross + s.gross, fee: acc.fee + s.fee, net: acc.net + s.net };
      },
      { gross: 0, fee: 0, net: 0 },
    );
    expect(totals.gross).toBe(4_970_000);
    expect(totals.fee).toBe(347_900);   // 7% of 4.97M
    expect(totals.net).toBe(4_622_100); // what the hotel can withdraw
    expect(totals.fee + totals.net).toBe(totals.gross);
  });

  it("rejects invalid input", () => {
    expect(() => feeSplit(-1, 700)).toThrow();
    expect(() => feeSplit(NaN, 700)).toThrow();
    expect(() => feeSplit(1000, -1)).toThrow();
    expect(() => feeSplit(1000, 10001)).toThrow();
    expect(() => feeSplit(1000, 5.5)).toThrow();
  });
});

// Mirror of hotel_fee_bps() in migration 055. The trigger is what actually
// takes the money; these cases pin the rule the trigger implements.
describe("feeBpsFor — which rate applies to a hotel", () => {
  it("charges the commission hotel the platform rate", () => {
    expect(feeBpsFor("commission", 700)).toBe(700);
    expect(feeBpsFor("commission")).toBe(700); // 7% is the default rate
  });

  it("charges a subscription hotel nothing — it already paid monthly", () => {
    expect(feeBpsFor("subscription", 700)).toBe(0);
    expect(feeBpsFor("subscription", 1000)).toBe(0);
  });

  it("follows the platform rate when it changes, for commission hotels only", () => {
    expect(feeBpsFor("commission", 1000)).toBe(1000);
    expect(feeBpsFor("subscription", 1000)).toBe(0);
  });

  it("treats an unknown or missing model as commission, never as free", () => {
    // A hotel with no config row, a null column, or a value this build doesn't
    // know must keep paying — "unrecognised" must not become a 0% loophole.
    expect(feeBpsFor(null)).toBe(700);
    expect(feeBpsFor(undefined)).toBe(700);
    expect(feeBpsFor("")).toBe(700);
    expect(feeBpsFor("SUBSCRIPTION")).toBe(700);   // exact match only
    expect(feeBpsFor("langganan")).toBe(700);
  });

  it("composes with feeSplit: subscription income is credited whole", () => {
    const s = feeSplit(1_000_000, feeBpsFor("subscription"));
    expect(s).toEqual({ gross: 1_000_000, fee: 0, net: 1_000_000, feeBps: 0 });

    const c = feeSplit(1_000_000, feeBpsFor("commission"));
    expect(c.fee).toBe(70_000);
    expect(c.net).toBe(930_000);
  });
});
