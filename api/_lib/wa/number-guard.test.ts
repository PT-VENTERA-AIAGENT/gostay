import { describe, it, expect } from "vitest";
import { groundedNumbers, normaliseNumber, ungroundedNumbers } from "./number-guard";

// What the concierge tools actually hand back, plus the guest's question —
// exactly the sources askConcierge() feeds the guard.
const TOOL_OUTPUT = [
  "Deluxe — Rp450.000/malam, maks 2 tamu\nSuite — Rp1.200.000/malam, maks 4 tamu",
  "Tersedia 3 kamar Deluxe untuk 2026-08-20 s/d 2026-08-22.",
  "Check-in 14.00, check-out 12.00. Sarapan termasuk.",
];

const grounded = groundedNumbers(TOOL_OUTPUT);

describe("normaliseNumber", () => {
  it("collapses separators so the formats compare equal", () => {
    expect(normaliseNumber("450.000")).toBe("450000");
    expect(normaliseNumber("450,000")).toBe("450000");
    expect(normaliseNumber("450000")).toBe("450000");
  });
});

describe("groundedNumbers", () => {
  it("buckets a figure under the unit it was quoted in", () => {
    expect(grounded.byKind.currency.has("450000")).toBe(true);
    expect(grounded.byKind.currency.has("1200000")).toBe(true);
    // "maks 2 tamu" / "maks 4 tamu" are quantities, "3 kamar" too
    expect([...grounded.byKind.quantity].sort()).toEqual(["2", "3", "4"]);
  });

  it("keeps unit-less figures in generic", () => {
    // The ISO dates carry no unit, so their parts clear a quote in any kind.
    expect(grounded.generic.has("2026")).toBe(true);
  });
});

describe("ungroundedNumbers — quotes the tools support", () => {
  it.each([
    ["rate, reformatted", "Deluxe-nya Rp450.000 per malam ya kak"],
    ["rate, raw", "Suite Rp1200000 semalam"],
    ["room count", "Masih ada 3 kamar untuk tanggal itu"],
    ["capacity", "Deluxe muat 2 tamu"],
    ["no figures at all", "Sarapan sudah termasuk kok kak"],
  ])("%s", (_label, reply) => {
    expect(ungroundedNumbers(reply, grounded)).toEqual([]);
  });

  it("allows a figure the guest themselves named", () => {
    const withGuest = groundedNumbers([...TOOL_OUTPUT, "kami berdua, 2 malam ya"]);
    expect(ungroundedNumbers("Baik, 2 malam untuk 2 tamu", withGuest)).toEqual([]);
  });
});

describe("ungroundedNumbers — catches invented figures", () => {
  it("flags a rate the tools never returned", () => {
    // The classic: read Rp450.000, wrote Rp420.000.
    expect(ungroundedNumbers("Deluxe Rp420.000 saja kak", grounded)).toEqual(["Rp420.000"]);
  });

  it("flags an invented discount", () => {
    expect(ungroundedNumbers("Ada diskon 15% untuk 3 malam", grounded)).toEqual(
      expect.arrayContaining(["15%"]),
    );
  });

  it("flags a room count no tool produced", () => {
    expect(ungroundedNumbers("Sisa 7 kamar kak", grounded)).toEqual(["7 kamar"]);
  });

  it("checks both ends of a range", () => {
    // 2 and 3 are grounded as quantities; as a DURATION neither is, and 5 is
    // nowhere at all.
    expect(ungroundedNumbers("Menginap 3-5 hari ya kak", grounded)).toEqual(["3-5 hari"]);
  });

  it("does not let a quantity vouch for a rate", () => {
    // "3 kamar" grounds a 3 as a quantity; "Rp3" is money and must not pass.
    expect(ungroundedNumbers("Cuma Rp3 kak", grounded)).toEqual(["Rp3"]);
  });

  it("does not let a rate vouch for a capacity", () => {
    expect(ungroundedNumbers("Muat 450000 orang", grounded)).toEqual(["450000 orang"]);
  });

  it("reports each distinct offender once", () => {
    expect(
      ungroundedNumbers("Rp420.000 untuk Deluxe, dan Rp420.000 juga untuk Superior", grounded),
    ).toEqual(["Rp420.000"]);
  });
});

describe("ungroundedNumbers — ignores incidental numbers", () => {
  it.each([
    ["bare count", "Ada 2 pilihan buat kakak"],
    ["clock time", "Check-in mulai pukul 14.00"],
    ["list markers", "1. Deluxe\n2. Suite"],
  ])("%s", (_label, reply) => {
    // No currency / percent / duration / quantity unit attached, so these fall
    // outside the guard: replacing a correct answer is also a failure.
    expect(ungroundedNumbers(reply, grounded)).toEqual([]);
  });
});
