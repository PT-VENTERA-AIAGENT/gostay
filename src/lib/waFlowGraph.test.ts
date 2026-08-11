import { describe, it, expect } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { fromDefinition, toDefinition } from "./waFlowGraph";
import { coerceFlow, FLOW_VERSION, type FlowDefinition } from "@/types/waFlow";
// The shipped templates are the most complex graphs that exist, so they are the
// right thing to round-trip: every node type and both handle kinds appear.
import { FLOW_TEMPLATES } from "./waFlowTemplates";

const sample: FlowDefinition = {
  version: FLOW_VERSION,
  nodes: [
    { id: "t", type: "trigger", position: { x: 0, y: 0 }, data: {} },
    { id: "m", type: "message", position: { x: 10, y: 20 }, data: { text: "Halo {{guest_name}}" } },
    {
      id: "c", type: "choice", position: { x: 30, y: 40 },
      data: { text: "Pilih:", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    },
    { id: "q", type: "ask", position: { x: 50, y: 60 }, data: { prompt: "Nama?", variable: "nama" } },
    { id: "k", type: "condition", position: { x: 70, y: 80 }, data: { variable: "nama", operator: "is_set" } },
    { id: "z", type: "action", position: { x: 90, y: 100 }, data: { action: "start_booking" } },
  ],
  edges: [
    { id: "e1", source: "t", target: "m" },
    { id: "e2", source: "m", target: "c" },
    { id: "e3", source: "c", target: "q", sourceHandle: "a" },
    { id: "e4", source: "c", target: "k", sourceHandle: "b" },
    { id: "e5", source: "k", target: "z", sourceHandle: "true" },
  ],
};

describe("round-trip through the canvas", () => {
  it("loses nothing — every save goes through this path", () => {
    const { nodes, edges } = fromDefinition(sample);
    expect(toDefinition(nodes, edges)).toEqual(sample);
  });

  it("round-trips every shipped template unchanged", () => {
    for (const t of FLOW_TEMPLATES) {
      // Templates omit `position` on no node, but coerce first so the
      // comparison is against exactly what the editor would have loaded.
      const loaded = coerceFlow(t.definition);
      const { nodes, edges } = fromDefinition(loaded);
      expect(toDefinition(nodes, edges), t.name).toEqual(loaded);
    }
  });

  it("keeps the branch handles that decide which edge the engine follows", () => {
    const { nodes, edges } = fromDefinition(sample);
    const back = toDefinition(nodes, edges);

    expect(back.edges.find((e) => e.id === "e3")?.sourceHandle).toBe("a");
    expect(back.edges.find((e) => e.id === "e5")?.sourceHandle).toBe("true");
  });

  it("omits sourceHandle entirely on a single-outlet edge", () => {
    // Storing an explicit undefined would put a meaningless key in the JSON
    // column; the engine reads a missing handle as "the one outlet".
    const back = toDefinition(...Object.values(fromDefinition(sample)) as [Node[], Edge[]]);
    expect("sourceHandle" in (back.edges.find((e) => e.id === "e1") ?? {})).toBe(false);
  });

  it("marks only the trigger undeletable", () => {
    const { nodes } = fromDefinition(sample);
    expect(nodes.find((n) => n.id === "t")?.deletable).toBe(false);
    expect(nodes.find((n) => n.id === "m")?.deletable).toBe(true);
  });

  it("moves a node's saved position, not just its on-screen one", () => {
    const { nodes, edges } = fromDefinition(sample);
    const dragged = nodes.map((n) => (n.id === "m" ? { ...n, position: { x: 999, y: 888 } } : n));

    const back = toDefinition(dragged, edges);

    expect(back.nodes.find((n) => n.id === "m")?.position).toEqual({ x: 999, y: 888 });
  });

  it("does not leak the canvas's own 'kind' field into the saved format", () => {
    const back = toDefinition(...Object.values(fromDefinition(sample)) as [Node[], Edge[]]);
    for (const n of back.nodes) {
      expect(n.data).not.toHaveProperty("kind");
    }
  });
});

describe("coerceFlow on the client", () => {
  it("gives a graph with no nodes a usable trigger rather than a blank canvas", () => {
    const def = coerceFlow({ version: 1, nodes: [], edges: [] });
    expect(def.nodes).toHaveLength(1);
    expect(def.nodes[0].type).toBe("trigger");
  });

  it("survives junk instead of white-screening the editor", () => {
    for (const junk of [null, undefined, 42, "nope", [], { nodes: "no" }]) {
      expect(() => coerceFlow(junk)).not.toThrow();
      expect(coerceFlow(junk).nodes.length).toBeGreaterThan(0);
    }
  });

  it("drops edges pointing at nodes that are gone", () => {
    const def = coerceFlow({
      version: 1,
      nodes: [{ id: "a", type: "message", position: { x: 0, y: 0 }, data: { text: "x" } }],
      edges: [{ id: "e", source: "a", target: "deleted" }],
    });
    expect(def.edges).toHaveLength(0);
  });

  it("gives a node saved without coordinates a place to sit", () => {
    const def = coerceFlow({
      version: 1,
      nodes: [{ id: "a", type: "message", data: { text: "x" } }],
      edges: [],
    });
    expect(typeof def.nodes[0].position.x).toBe("number");
    expect(typeof def.nodes[0].position.y).toBe("number");
  });
});
