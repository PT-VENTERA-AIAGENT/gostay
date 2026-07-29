// @vitest-environment node
import { describe, it, expect } from "vitest";
import { scoreKeyword, bestKeywordScore, pickFlow, meetsRequirement, findKeywordClashes, type SelectableFlow } from "./select";

const flow = (over: Partial<SelectableFlow> & { id: string }): SelectableFlow => ({
  name: over.id,
  triggerKeywords: [],
  requires: "none",
  priority: 100,
  ...over,
});

describe("scoreKeyword", () => {
  it("ranks exact above whole-word above substring", () => {
    expect(scoreKeyword("menu", "menu")).toBe(3);
    expect(scoreKeyword("lihat menu dong", "menu")).toBe(2);
    expect(scoreKeyword("saya menunggu", "menu")).toBe(1);
    expect(scoreKeyword("halo kak", "menu")).toBe(0);
  });

  it("matches a whole word at either end of the message", () => {
    expect(scoreKeyword("menu dong", "menu")).toBe(2);
    expect(scoreKeyword("boleh lihat menu", "menu")).toBe(2);
  });

  it("is not defeated by punctuation the guest typed", () => {
    // The regression this guards: "menu?" scored tier 1, which is BELOW the
    // threshold to start a flow — so one of the most common messages a hotel
    // receives got no reply at all.
    expect(scoreKeyword("menu?", "menu")).toBe(3);
    expect(scoreKeyword("menu!", "menu")).toBe(3);
    expect(scoreKeyword("lihat menu, dong", "menu")).toBe(2);
    expect(scoreKeyword("ada kamar yang kosong di reguler ?", "reguler")).toBe(2);
    expect(scoreKeyword("mau pesan kamar!", "pesan kamar")).toBe(2);
  });

  it("handles empty input and empty keyword", () => {
    expect(scoreKeyword("", "menu")).toBe(0);
    expect(scoreKeyword("menu", "")).toBe(0);
    expect(scoreKeyword("menu", "  ")).toBe(0);
  });

  it("normalises keyword casing so raw DB values are safe", () => {
    expect(scoreKeyword("menu", "MENU")).toBe(3);
    expect(scoreKeyword("lihat menu dong", " Menu ")).toBe(2);
  });
});

describe("bestKeywordScore", () => {
  it("returns the strongest tier across the list", () => {
    // "kamar" only appears as a substring; "menu" is exact — exact must win.
    expect(bestKeywordScore("menu", ["kamarnya", "menu"])).toBe(3);
  });

  it("is 0 when nothing matches", () => {
    expect(bestKeywordScore("halo", ["menu", "makan"])).toBe(0);
  });
});

describe("meetsRequirement", () => {
  it("lets anyone through 'none' and only in-house guests through 'inhouse'", () => {
    expect(meetsRequirement("none", { isInhouse: false })).toBe(true);
    expect(meetsRequirement("inhouse", { isInhouse: false })).toBe(false);
    expect(meetsRequirement("inhouse", { isInhouse: true })).toBe(true);
  });
});

describe("pickFlow — the reservation-vs-menu problem", () => {
  // The two flows that both want the word "menu", in precedence order.
  const flows = [
    flow({ id: "roomservice", triggerKeywords: ["menu", "makan", "minum"], requires: "inhouse", priority: 10 }),
    flow({ id: "greeting", triggerKeywords: ["halo", "hai", "menu", "info"], requires: "none", priority: 90 }),
  ];

  it('sends "menu" to room service when the guest is checked in', () => {
    expect(pickFlow(flows, "menu", { isInhouse: true })?.id).toBe("roomservice");
  });

  it('sends "menu" to the greeting when the guest is NOT checked in', () => {
    // The whole point: an unmet requirement is skipped, not merely outranked,
    // so a lower-priority flow can still claim the message.
    expect(pickFlow(flows, "menu", { isInhouse: false })?.id).toBe("greeting");
  });

  it("still routes a greeting word to the greeting for an in-house guest", () => {
    expect(pickFlow(flows, "halo", { isInhouse: true })?.id).toBe("greeting");
  });

  it("does not fire on words that merely start with 'menu'", () => {
    // "menunggu" only reaches tier 1, and tier 1 cannot start a flow.
    expect(bestKeywordScore("saya menunggu konfirmasi", ["menu"])).toBe(1);
    expect(pickFlow(flows, "saya menunggu konfirmasi", { isInhouse: true })).toBeNull();
  });

  it("does not start on our own echoed reply", () => {
    // The gateway can deliver outbound text back to us. A long reply contains
    // triggers as fragments; none of them may fire.
    const echo = "Selamat datang. Ketik menunggu konfirmasi pemesanankamar untuk melanjutkan";
    expect(pickFlow(flows, echo, { isInhouse: true })).toBeNull();
  });

  it("still fires when the trigger stands as a whole word in a longer message", () => {
    expect(pickFlow(flows, "boleh lihat menu dong kak", { isInhouse: true })?.id).toBe("roomservice");
  });

  it("returns null when nothing matches at any tier", () => {
    expect(pickFlow(flows, "nomor rekening berapa", { isInhouse: true })).toBeNull();
  });

  it("returns null on an empty message", () => {
    expect(pickFlow(flows, "   ", { isInhouse: true })).toBeNull();
  });
});

describe("pickFlow — precedence", () => {
  it("keeps the earlier flow when two match at the same tier", () => {
    const tied = [
      flow({ id: "first", triggerKeywords: ["info"], priority: 10 }),
      flow({ id: "second", triggerKeywords: ["info"], priority: 20 }),
    ];
    expect(pickFlow(tied, "info", { isInhouse: false })?.id).toBe("first");
  });

  it("lets a stronger match beat a higher-precedence weaker one", () => {
    const mixed = [
      // Higher precedence, but only a substring hit on "kamarnya".
      flow({ id: "weak", triggerKeywords: ["kamar"], priority: 10 }),
      // Lower precedence, but the guest typed this exactly.
      flow({ id: "strong", triggerKeywords: ["kamarnya"], priority: 90 }),
    ];
    expect(pickFlow(mixed, "kamarnya", { isInhouse: false })?.id).toBe("strong");
  });
});

describe("findKeywordClashes", () => {
  // Precedence order in, as the bot sees it: lower priority first.
  const ordered = (...fs: SelectableFlow[]) =>
    [...fs].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  it("reports nothing when every keyword has one owner", () => {
    const flows = ordered(
      flow({ id: "a", name: "Reservasi", triggerKeywords: ["booking"], priority: 10 }),
      flow({ id: "b", name: "Sapaan", triggerKeywords: ["halo"], priority: 90 }),
    );
    expect(findKeywordClashes(flows)).toEqual([]);
  });

  it("names the winner and the flow it buries", () => {
    // The real case: Housekeeping could never be reached for "handuk" because
    // Request Tamu (a lower priority number) claimed the same word.
    const flows = ordered(
      flow({ id: "rs", name: "Request Tamu", triggerKeywords: ["menu", "handuk"], priority: 20 }),
      flow({ id: "hk", name: "Housekeeping", triggerKeywords: ["handuk", "sprei"], priority: 25 }),
    );
    expect(findKeywordClashes(flows)).toEqual([
      { keyword: "handuk", ownerName: "Request Tamu", shadowedName: "Housekeeping" },
    ]);
  });

  it("compares case- and space-insensitively", () => {
    const flows = ordered(
      flow({ id: "a", name: "A", triggerKeywords: ["Check In"], priority: 10 }),
      flow({ id: "b", name: "B", triggerKeywords: [" check in "], priority: 55 }),
    );
    expect(findKeywordClashes(flows)).toHaveLength(1);
  });

  it("does not flag a flow against itself when it repeats a keyword", () => {
    const flows = [flow({ id: "a", name: "A", triggerKeywords: ["menu", "menu"], priority: 10 })];
    expect(findKeywordClashes(flows)).toEqual([]);
  });

  it("ignores blank keywords rather than reporting them as a clash", () => {
    const flows = ordered(
      flow({ id: "a", name: "A", triggerKeywords: ["", "  "], priority: 10 }),
      flow({ id: "b", name: "B", triggerKeywords: [""], priority: 20 }),
    );
    expect(findKeywordClashes(flows)).toEqual([]);
  });
});
