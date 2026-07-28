// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runFlow, type FlowActions, type FlowRunContext } from "./engine";
import { coerceFlow, type FlowDefinition } from "./types";
import type { StoredFlow } from "./store";

// ─── Harness ─────────────────────────────────────────────────────────────────

let sent: string[];
let actions: FlowActions;
let ctx: FlowRunContext;

beforeEach(() => {
  sent = [];
  actions = {
    startBooking: vi.fn().mockResolvedValue(undefined),
    startRoomService: vi.fn().mockResolvedValue(true),
    checkAvailability: vi.fn().mockResolvedValue(undefined),
    showRoomTypes: vi.fn().mockResolvedValue(undefined),
    showMenu: vi.fn().mockResolvedValue(undefined),
    sendPortalLink: vi.fn().mockResolvedValue(undefined),
    askConcierge: vi.fn().mockResolvedValue(undefined),
  };
  ctx = {
    reply: async (t: string) => { sent.push(t); },
    actions,
  };
});

const asFlow = (def: FlowDefinition): StoredFlow => ({
  id: "flow-1",
  name: "Test",
  triggerKeywords: [],
  requires: "none",
  priority: 100,
  definition: def,
});

/** Build a graph from a terse node list + edge list. */
function graph(nodes: unknown[], edges: Array<[string, string, string?]>): StoredFlow {
  return asFlow(
    coerceFlow({
      version: 1,
      nodes,
      edges: edges.map(([source, target, sourceHandle], i) => ({
        id: `e${i}`, source, target, ...(sourceHandle ? { sourceHandle } : {}),
      })),
    }),
  );
}

const trigger = { id: "t", type: "trigger", data: {} };

// ─── Walking ─────────────────────────────────────────────────────────────────

describe("runFlow — walking the graph", () => {
  it("sends messages in order and finishes at an unwired outlet", async () => {
    const flow = graph(
      [trigger,
       { id: "m1", type: "message", data: { text: "Halo" } },
       { id: "m2", type: "message", data: { text: "Ada yang bisa dibantu?" } }],
      [["t", "m1"], ["m1", "m2"]],
    );

    const r = await runFlow({ flow, vars: {}, input: "halo", ctx });

    expect(sent).toEqual(["Halo", "Ada yang bisa dibantu?"]);
    expect(r.status).toBe("done");
    expect(r.nodeId).toBeNull();
  });

  it("ends cleanly when the flow has no trigger node", async () => {
    const flow = graph([{ id: "m1", type: "message", data: { text: "Halo" } }], []);
    const r = await runFlow({ flow, vars: {}, input: "halo", ctx });
    expect(r.status).toBe("done");
    expect(sent).toEqual([]);
  });

  it("interpolates variables, and renders an unknown one as empty", async () => {
    const flow = graph(
      [trigger, { id: "m1", type: "message", data: { text: "Halo {{guest_name}}, selamat datang di {{hotel_name}}. {{nope}}" } }],
      [["t", "m1"]],
    );

    await runFlow({ flow, vars: { guest_name: "Budi", hotel_name: "Hotel Uji" }, input: "hi", ctx });

    expect(sent[0]).toBe("Halo Budi, selamat datang di Hotel Uji.");
  });

  it("stops a cyclic graph rather than spinning until timeout", async () => {
    const flow = graph(
      [trigger,
       { id: "a", type: "message", data: { text: "A" } },
       { id: "b", type: "message", data: { text: "B" } }],
      [["t", "a"], ["a", "b"], ["b", "a"]],
    );

    const r = await runFlow({ flow, vars: {}, input: "go", ctx });

    expect(r.status).toBe("failed");
    expect(r.error).toBe("max_steps_exceeded");
  });
});

// ─── Ask / resume ────────────────────────────────────────────────────────────

describe("runFlow — ask and resume", () => {
  const askFlow = graph(
    [trigger,
     { id: "q", type: "ask", data: { prompt: "Nama Anda siapa?", variable: "guest_name" } },
     { id: "m", type: "message", data: { text: "Terima kasih {{guest_name}}" } }],
    [["t", "q"], ["q", "m"]],
  );

  it("halts at the ask node and reports where to resume", async () => {
    const r = await runFlow({ flow: askFlow, vars: {}, input: "halo", ctx });

    expect(sent).toEqual(["Nama Anda siapa?"]);
    expect(r.status).toBe("waiting");
    expect(r.nodeId).toBe("q");
  });

  it("stores the answer and continues on the next message", async () => {
    const r = await runFlow({ flow: askFlow, resumeAt: "q", vars: {}, input: "  Budi  ", ctx });

    expect(r.vars.guest_name).toBe("Budi"); // trimmed
    expect(sent).toEqual(["Terima kasih Budi"]);
    expect(r.status).toBe("done");
  });

  it("ends the run when the node it resumes into has vanished", async () => {
    // The hotel edited the graph while a guest was mid-answer.
    const r = await runFlow({ flow: askFlow, resumeAt: "gone", vars: {}, input: "Budi", ctx });
    expect(r.status).toBe("done");
    expect(sent).toEqual([]);
  });

  it("ends — does NOT park — when the answered node has no outgoing edge", async () => {
    // The regression this guards: treating "no next node" as "keep waiting"
    // would strand the guest on a node nothing can ever advance.
    const dangling = graph(
      [trigger, { id: "q", type: "ask", data: { prompt: "Nama?", variable: "n" } }],
      [["t", "q"]],
    );
    const r = await runFlow({ flow: dangling, resumeAt: "q", vars: {}, input: "Budi", ctx });

    expect(r.status).toBe("done");
    expect(r.nodeId).toBeNull();
  });
});

// ─── Choice ──────────────────────────────────────────────────────────────────

describe("runFlow — choice", () => {
  const choiceFlow = graph(
    [trigger,
     { id: "c", type: "choice", data: {
       text: "Mau apa?",
       options: [{ id: "book", label: "Pesan kamar" }, { id: "food", label: "Room service" }],
     } },
     { id: "mb", type: "message", data: { text: "Baik, pesan kamar" } },
     { id: "mf", type: "message", data: { text: "Baik, room service" } }],
    [["t", "c"], ["c", "mb", "book"], ["c", "mf", "food"]],
  );

  it("renders a numbered list and waits", async () => {
    const r = await runFlow({ flow: choiceFlow, vars: {}, input: "halo", ctx });

    expect(sent[0]).toBe("Mau apa?\n\n1. Pesan kamar\n2. Room service");
    expect(r.status).toBe("waiting");
    expect(r.nodeId).toBe("c");
  });

  it("branches on the printed number", async () => {
    const r = await runFlow({ flow: choiceFlow, resumeAt: "c", vars: {}, input: "2", ctx });
    expect(sent).toEqual(["Baik, room service"]);
    expect(r.status).toBe("done");
  });

  it("accepts common number shapes and the option's own words", async () => {
    for (const [input, expected] of [["1", "Baik, pesan kamar"], ["2.", "Baik, room service"],
                                     ["1)", "Baik, pesan kamar"], ["room service", "Baik, room service"],
                                     ["mau pesan kamar", "Baik, pesan kamar"]] as const) {
      sent = [];
      ctx = { reply: async (t: string) => { sent.push(t); }, actions };
      await runFlow({ flow: choiceFlow, resumeAt: "c", vars: {}, input, ctx });
      expect(sent).toEqual([expected]);
    }
  });

  it("re-asks and stays parked when the pick is not understood", async () => {
    const r = await runFlow({ flow: choiceFlow, resumeAt: "c", vars: {}, input: "hmmm", ctx });

    expect(sent[0]).toContain("belum kami kenali");
    expect(sent[0]).toContain("1. Pesan kamar");
    expect(r.status).toBe("waiting");
    expect(r.nodeId).toBe("c"); // same node — a typo must not drop them out
  });

  it("re-asks on a number that is not on offer", async () => {
    const r = await runFlow({ flow: choiceFlow, resumeAt: "c", vars: {}, input: "9", ctx });
    expect(r.status).toBe("waiting");
    expect(sent[0]).toContain("belum kami kenali");
  });
});

// ─── Conditions ──────────────────────────────────────────────────────────────

describe("runFlow — condition", () => {
  const condFlow = (operator: string, value?: string) =>
    graph(
      [trigger,
       { id: "c", type: "condition", data: { variable: "is_inhouse", operator, ...(value ? { value } : {}) } },
       { id: "yes", type: "message", data: { text: "YES" } },
       { id: "no", type: "message", data: { text: "NO" } }],
      [["t", "c"], ["c", "yes", "true"], ["c", "no", "false"]],
    );

  it("branches true/false on equality", async () => {
    await runFlow({ flow: condFlow("==", "ya"), vars: { is_inhouse: "ya" }, input: "x", ctx });
    expect(sent).toEqual(["YES"]);
  });

  it("compares case-insensitively", async () => {
    await runFlow({ flow: condFlow("==", "Ya"), vars: { is_inhouse: "YA" }, input: "x", ctx });
    expect(sent).toEqual(["YES"]);
  });

  it("treats a missing variable as empty", async () => {
    await runFlow({ flow: condFlow("is_set"), vars: {}, input: "x", ctx });
    expect(sent).toEqual(["NO"]);
  });

  it("supports is_empty and contains", async () => {
    await runFlow({ flow: condFlow("is_empty"), vars: {}, input: "x", ctx });
    expect(sent).toEqual(["YES"]);

    sent = [];
    ctx = { reply: async (t: string) => { sent.push(t); }, actions };
    await runFlow({ flow: condFlow("contains", "hou"), vars: { is_inhouse: "inhouse" }, input: "x", ctx });
    expect(sent).toEqual(["YES"]);
  });
});

// ─── Actions ─────────────────────────────────────────────────────────────────

describe("runFlow — actions", () => {
  const actionFlow = (action: string) =>
    graph(
      [trigger,
       { id: "a", type: "action", data: { action } },
       { id: "after", type: "message", data: { text: "AFTER" } }],
      [["t", "a"], ["a", "after"]],
    );

  it("hands the conversation over on start_booking and stops walking", async () => {
    const r = await runFlow({ flow: actionFlow("start_booking"), vars: {}, input: "x", ctx });

    expect(actions.startBooking).toHaveBeenCalled();
    // The booking conversation parks its own pending state; continuing would
    // overwrite it.
    expect(sent).toEqual([]);
    expect(r.status).toBe("done");
  });

  it("continues the graph when room service declines (guest not in-house)", async () => {
    (actions.startRoomService as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await runFlow({ flow: actionFlow("start_room_service"), vars: {}, input: "x", ctx });

    expect(sent).toEqual(["AFTER"]);
  });

  it("keeps control after a non-takeover action", async () => {
    await runFlow({ flow: actionFlow("show_room_types"), vars: {}, input: "x", ctx });

    expect(actions.showRoomTypes).toHaveBeenCalled();
    expect(sent).toEqual(["AFTER"]);
  });

  it("fails the run — not the webhook — when an action throws", async () => {
    (actions.showMenu as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    const r = await runFlow({ flow: actionFlow("show_menu"), vars: {}, input: "x", ctx });

    expect(r.status).toBe("failed");
    expect(r.error).toBe("node_failed_action");
  });
});

// ─── Terminals ───────────────────────────────────────────────────────────────

describe("runFlow — terminal nodes", () => {
  it("reports handoff so the caller can flag a human", async () => {
    const flow = graph(
      [trigger, { id: "h", type: "handoff", data: { text: "Kami sambungkan ke staf." } }],
      [["t", "h"]],
    );
    const r = await runFlow({ flow, vars: {}, input: "admin", ctx });

    expect(sent).toEqual(["Kami sambungkan ke staf."]);
    expect(r.status).toBe("handoff");
  });

  it("sends an end node's text when it has one, and nothing when it does not", async () => {
    const withText = graph([trigger, { id: "e", type: "end", data: { text: "Terima kasih!" } }], [["t", "e"]]);
    const r1 = await runFlow({ flow: withText, vars: {}, input: "x", ctx });
    expect(sent).toEqual(["Terima kasih!"]);
    expect(r1.status).toBe("done");

    sent = [];
    ctx = { reply: async (t: string) => { sent.push(t); }, actions };
    const bare = graph([trigger, { id: "e", type: "end", data: {} }], [["t", "e"]]);
    const r2 = await runFlow({ flow: bare, vars: {}, input: "x", ctx });
    expect(sent).toEqual([]);
    expect(r2.status).toBe("done");
  });
});
