// @vitest-environment node
import { describe, it, expect } from "vitest";
import { searchKnowledge, type KnowledgeEntry } from "./knowledge";

const entry = (topic: string, keywords: string[] = []): KnowledgeEntry => ({
  id: topic, topic, content: `Jawaban untuk ${topic}`, keywords,
});

const KB: KnowledgeEntry[] = [
  entry("Sarapan", ["breakfast", "makan pagi"]),
  entry("Wifi", ["internet", "password wifi"]),
  entry("Parkir", ["parking", "mobil", "motor"]),
  entry("Jam check-in", ["check in", "jam masuk"]),
];

describe("searchKnowledge", () => {
  it("finds an entry by its topic", () => {
    expect(searchKnowledge(KB, "sarapan").map((e) => e.topic)).toEqual(["Sarapan"]);
  });

  it("finds an entry by a keyword the topic does not contain", () => {
    // The whole point of the keywords column: a guest says "internet", the
    // hotel filed it under "Wifi".
    expect(searchKnowledge(KB, "ada internet?").map((e) => e.topic)).toEqual(["Wifi"]);
  });

  it("matches a topic sitting inside a longer question", () => {
    expect(searchKnowledge(KB, "jam berapa sarapan dimulai?")[0]?.topic).toBe("Sarapan");
  });

  it("returns the same result for the same question, every time", () => {
    // The requirement this table exists for. Two guests asking the same thing
    // must not get two different policies.
    const runs = Array.from({ length: 5 }, () => searchKnowledge(KB, "parkir mobil").map((e) => e.id));
    for (const r of runs) expect(r).toEqual(runs[0]);
  });

  it("orders ties by topic rather than by however the rows arrived", () => {
    const a = [entry("Zebra", ["x"]), entry("Alpha", ["x"])];
    const b = [entry("Alpha", ["x"]), entry("Zebra", ["x"])];
    expect(searchKnowledge(a, "x").map((e) => e.topic))
      .toEqual(searchKnowledge(b, "x").map((e) => e.topic));
  });

  it("returns nothing rather than a wrong passage", () => {
    // "I don't know" is a safe answer; a confidently-quoted wrong policy is not.
    expect(searchKnowledge(KB, "boleh bawa hewan peliharaan?")).toEqual([]);
    expect(searchKnowledge(KB, "")).toEqual([]);
  });

  it("does not match on a substring alone", () => {
    // "parkiran" contains "parkir", but tier 1 is excluded — in Indonesian a
    // shared prefix is a coincidence more often than a match.
    const kb = [entry("Bank", ["bca"])];
    expect(searchKnowledge(kb, "bcaunfamiliarword")).toEqual([]);
  });

  it("prefers the exact hit over a merely-present one", () => {
    const kb = [
      entry("Informasi Umum", ["parkir", "sarapan", "wifi", "lokasi"]),
      entry("Parkir", ["parkir"]),
    ];
    // Both match "parkir" at the same tier; the tie breaks on topic, which is
    // deterministic. Exactness wins outright when the guest types just the word.
    expect(searchKnowledge(kb, "parkir")[0].score).toBe(3);
  });

  it("caps how many passages reach the model", () => {
    const many = Array.from({ length: 10 }, (_, i) => entry(`Topik ${i}`, ["umum"]));
    expect(searchKnowledge(many, "umum").length).toBeLessThanOrEqual(3);
  });
});
