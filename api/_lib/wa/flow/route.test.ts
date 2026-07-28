// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

const { pending, store, client, inbound } = vi.hoisted(() => ({
  pending: { setPending: vi.fn(), clearPending: vi.fn() },
  store: { listActiveFlows: vi.fn(), getFlow: vi.fn() },
  // routeFlow declines outright when Supabase is unconfigured; these tests are
  // about routing, so stand it up as configured.
  client: { isConfigured: vi.fn(() => true) },
  inbound: { checkFlowStartBudget: vi.fn() },
}));
vi.mock("../pending", () => pending);
vi.mock("./store", () => store);
vi.mock("../client", () => client);
vi.mock("../inbound", () => inbound);

import { routeFlow, type FlowRouteParams } from "./route";
import { coerceFlow } from "./types";
import type { FlowActions } from "./engine";
import type { StoredFlow } from "./store";

let sent: string[];
let actions: FlowActions;
let isInhouse: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  sent = [];
  client.isConfigured.mockReturnValue(true);
  inbound.checkFlowStartBudget.mockResolvedValue(true);
  pending.setPending.mockResolvedValue(undefined);
  pending.clearPending.mockResolvedValue(undefined);
  store.listActiveFlows.mockResolvedValue([]);
  store.getFlow.mockResolvedValue(null);
  isInhouse = vi.fn().mockResolvedValue(false);
  actions = {
    startBooking: vi.fn().mockResolvedValue(undefined),
    startRoomService: vi.fn().mockResolvedValue(true),
    showRoomTypes: vi.fn().mockResolvedValue(undefined),
    showMenu: vi.fn().mockResolvedValue(undefined),
    sendPortalLink: vi.fn().mockResolvedValue(undefined),
  };
});

function params(over: Partial<FlowRouteParams> = {}): FlowRouteParams {
  return {
    tenantId: "tenant-x",
    phoneJid: "628111@s.whatsapp.net",
    input: "menu",
    pending: null,
    vars: { hotel_name: "Hotel Uji" },
    reply: async (t: string) => { sent.push(t); },
    actions,
    isInhouse,
    ...over,
  };
}

function flow(over: Partial<StoredFlow> & { id: string }): StoredFlow {
  return {
    name: over.id,
    triggerKeywords: [],
    requires: "none",
    priority: 100,
    definition: coerceFlow({ version: 1, nodes: [], edges: [] }),
    ...over,
  };
}

const simple = (id: string, text: string, keywords: string[], requires: "none" | "inhouse" = "none") =>
  flow({
    id, triggerKeywords: keywords, requires,
    definition: coerceFlow({
      version: 1,
      nodes: [{ id: "t", type: "trigger", data: {} }, { id: "m", type: "message", data: { text } }],
      edges: [{ id: "e", source: "t", target: "m" }],
    }),
  });

describe("routeFlow — when it declines", () => {
  it("declines when the hotel has drawn no flows", async () => {
    const r = await routeFlow(params());
    expect(r.handled).toBe(false);
    expect(sent).toEqual([]);
  });

  it("declines when no flow matches the message", async () => {
    store.listActiveFlows.mockResolvedValue([simple("greet", "Halo", ["halo"])]);
    const r = await routeFlow(params({ input: "nomor rekening berapa" }));
    expect(r.handled).toBe(false);
  });

  it("leaves a booking conversation alone rather than stealing the message", async () => {
    // The guest is mid-quote; a stray keyword must not discard their slots.
    store.listActiveFlows.mockResolvedValue([simple("rs", "Menu:", ["menu"])]);
    const r = await routeFlow(params({ pending: { kind: "confirm_booking", payload: {} } }));

    expect(r.handled).toBe(false);
    expect(store.listActiveFlows).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("falls back to the built-in conversation when the store throws", async () => {
    store.listActiveFlows.mockRejectedValue(new Error("db down"));
    const r = await routeFlow(params());
    expect(r.handled).toBe(false);
  });
});

describe("routeFlow — the reservation-vs-menu gate", () => {
  const flows = [
    simple("roomservice", "Menu room service:", ["menu", "makan"], "inhouse"),
    simple("greeting", "Selamat datang di {{hotel_name}}", ["halo", "menu"], "none"),
  ];

  it('routes "menu" to room service for a guest who is checked in', async () => {
    store.listActiveFlows.mockResolvedValue(flows);
    isInhouse.mockResolvedValue(true);

    const r = await routeFlow(params({ input: "menu" }));

    expect(r.handled).toBe(true);
    expect(sent).toEqual(["Menu room service:"]);
  });

  it('routes "menu" to the greeting for a guest who is not', async () => {
    store.listActiveFlows.mockResolvedValue(flows);
    isInhouse.mockResolvedValue(false);

    const r = await routeFlow(params({ input: "menu" }));

    expect(r.handled).toBe(true);
    expect(sent).toEqual(["Selamat datang di Hotel Uji"]);
  });

  it("does not query the stay when no flow gates on it", async () => {
    // The hot path: one query per inbound message saved for every hotel whose
    // flows are all ungated.
    store.listActiveFlows.mockResolvedValue([simple("greeting", "Halo", ["halo"])]);

    await routeFlow(params({ input: "halo" }));

    expect(isInhouse).not.toHaveBeenCalled();
  });

  it("queries the stay at most once when a flow does gate on it", async () => {
    store.listActiveFlows.mockResolvedValue(flows);
    await routeFlow(params({ input: "menu" }));
    expect(isInhouse).toHaveBeenCalledTimes(1);
  });
});

describe("routeFlow — halting and resuming", () => {
  const asking = flow({
    id: "f-ask",
    triggerKeywords: ["daftar"],
    definition: coerceFlow({
      version: 1,
      nodes: [
        { id: "t", type: "trigger", data: {} },
        { id: "q", type: "ask", data: { prompt: "Nama Anda?", variable: "guest_name" } },
        { id: "m", type: "message", data: { text: "Terima kasih {{guest_name}}" } },
      ],
      edges: [{ id: "e1", source: "t", target: "q" }, { id: "e2", source: "q", target: "m" }],
    }),
  });

  it("parks the run where it halted", async () => {
    store.listActiveFlows.mockResolvedValue([asking]);

    const r = await routeFlow(params({ input: "daftar" }));

    expect(r.handled).toBe(true);
    expect(sent).toEqual(["Nama Anda?"]);
    // The parked row carries where to resume plus the facts gathered so far,
    // so the next message can pick up without re-deriving them.
    expect(pending.setPending).toHaveBeenCalledWith(
      "tenant-x", "628111@s.whatsapp.net", "flow",
      {
        flowId: "f-ask",
        nodeId: "q",
        vars: { hotel_name: "Hotel Uji", is_inhouse: "tidak" },
      },
      30,
    );
  });

  it("resumes the parked run and clears the row when it finishes", async () => {
    store.getFlow.mockResolvedValue(asking);

    const r = await routeFlow(params({
      input: "Budi",
      pending: { kind: "flow", payload: { flowId: "f-ask", nodeId: "q", vars: {} } },
    }));

    expect(r.handled).toBe(true);
    expect(sent).toEqual(["Terima kasih Budi"]);
    expect(pending.clearPending).toHaveBeenCalled();
  });

  it("resumes a flow the hotel has since deactivated", async () => {
    // Deactivating stops NEW conversations; it must not strand a guest who is
    // already halfway through answering.
    store.getFlow.mockResolvedValue(asking);
    await routeFlow(params({
      input: "Budi",
      pending: { kind: "flow", payload: { flowId: "f-ask", nodeId: "q", vars: {} } },
    }));
    expect(sent).toEqual(["Terima kasih Budi"]);
  });

  it("drops a malformed pending row instead of stranding the guest", async () => {
    const r = await routeFlow(params({
      pending: { kind: "flow", payload: { nodeId: "q" } }, // no flowId
    }));

    expect(r.handled).toBe(false);
    expect(pending.clearPending).toHaveBeenCalled();
  });

  it("drops the row when the flow has been deleted outright", async () => {
    store.getFlow.mockResolvedValue(null);
    const r = await routeFlow(params({
      pending: { kind: "flow", payload: { flowId: "gone", nodeId: "q", vars: {} } },
    }));

    expect(r.handled).toBe(false);
    expect(pending.clearPending).toHaveBeenCalled();
  });
});

describe("routeFlow — anti-spam", () => {
  const greeting = simple("greeting", "Halo!", ["halo"]);

  it("stays silent once the same flow's start budget is exhausted", async () => {
    // The loop this guards: a third-party system relaying our reply back as a
    // genuine inbound (so the fromMe filter does not catch it), re-triggering
    // the same flow indefinitely.
    store.listActiveFlows.mockResolvedValue([greeting]);
    inbound.checkFlowStartBudget.mockResolvedValue(false);

    const r = await routeFlow(params({ input: "halo" }));

    expect(sent).toEqual([]);
    // Reported as handled on purpose: falling back would let the built-in
    // conversation answer the very message we just declined, and the loop
    // would carry on under a different budget.
    expect(r.handled).toBe(true);
  });

  it("budgets per flow, so a different flow still answers", async () => {
    store.listActiveFlows.mockResolvedValue([greeting, simple("rs", "Menu:", ["menu"])]);
    inbound.checkFlowStartBudget.mockImplementation(async (flowId: string) => flowId !== "greeting");

    await routeFlow(params({ input: "menu" }));

    expect(sent).toEqual(["Menu:"]);
  });

  it("never throttles a guest answering a question we asked", async () => {
    // A resume must always get through — otherwise the guest is stranded on a
    // node nothing can advance.
    inbound.checkFlowStartBudget.mockResolvedValue(false);
    store.getFlow.mockResolvedValue(
      flow({
        id: "f-ask",
        definition: coerceFlow({
          version: 1,
          nodes: [
            { id: "t", type: "trigger", data: {} },
            { id: "q", type: "ask", data: { prompt: "Nama?", variable: "n" } },
            { id: "m", type: "message", data: { text: "Terima kasih {{n}}" } },
          ],
          edges: [{ id: "e1", source: "t", target: "q" }, { id: "e2", source: "q", target: "m" }],
        }),
      }),
    );

    await routeFlow(params({
      input: "Budi",
      pending: { kind: "flow", payload: { flowId: "f-ask", nodeId: "q", vars: {} } },
    }));

    expect(sent).toEqual(["Terima kasih Budi"]);
    expect(inbound.checkFlowStartBudget).not.toHaveBeenCalled();
  });
});

describe("routeFlow — handing over to a built-in conversation", () => {
  const handover = flow({
    id: "f-book",
    triggerKeywords: ["booking"],
    definition: coerceFlow({
      version: 1,
      nodes: [
        { id: "t", type: "trigger", data: {} },
        { id: "q", type: "ask", data: { prompt: "Untuk tanggal berapa?", variable: "when" } },
        { id: "a", type: "action", data: { action: "start_booking" } },
      ],
      edges: [{ id: "e1", source: "t", target: "q" }, { id: "e2", source: "q", target: "a" }],
    }),
  });

  it("does NOT clear the pending row the booking conversation just wrote", async () => {
    // The bug this guards: the resumed flow ends via an action that parks its
    // own state; clearing "our" row afterwards would delete the booking slots.
    store.getFlow.mockResolvedValue(handover);

    const r = await routeFlow(params({
      input: "20 juli",
      pending: { kind: "flow", payload: { flowId: "f-book", nodeId: "q", vars: {} } },
    }));

    expect(actions.startBooking).toHaveBeenCalled();
    expect(r.handled).toBe(true);
    expect(pending.clearPending).not.toHaveBeenCalled();
  });
});

describe("routeFlow — failure and handoff", () => {
  it("clears state and defers to the built-in conversation when a node throws", async () => {
    (actions.showMenu as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    store.listActiveFlows.mockResolvedValue([
      flow({
        id: "f-bad", triggerKeywords: ["menu"],
        definition: coerceFlow({
          version: 1,
          nodes: [{ id: "t", type: "trigger", data: {} }, { id: "a", type: "action", data: { action: "show_menu" } }],
          edges: [{ id: "e", source: "t", target: "a" }],
        }),
      }),
    ]);

    const r = await routeFlow(params({ input: "menu" }));

    expect(r.handled).toBe(false); // built-in conversation still answers
    expect(pending.clearPending).toHaveBeenCalled();
  });

  it("reports a handoff so the caller can flag a human", async () => {
    store.listActiveFlows.mockResolvedValue([
      flow({
        id: "f-cs", triggerKeywords: ["admin"],
        definition: coerceFlow({
          version: 1,
          nodes: [{ id: "t", type: "trigger", data: {} }, { id: "h", type: "handoff", data: { text: "Kami sambungkan ke staf." } }],
          edges: [{ id: "e", source: "t", target: "h" }],
        }),
      }),
    ]);

    const r = await routeFlow(params({ input: "admin" }));

    expect(r).toEqual({ handled: true, handoff: true });
    expect(sent).toEqual(["Kami sambungkan ke staf."]);
  });
});
