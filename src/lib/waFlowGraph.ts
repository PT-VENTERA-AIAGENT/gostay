import type { Edge, Node } from "@xyflow/react";
import { FLOW_VERSION, type FlowDefinition, type FlowNode, type NodeType } from "@/types/waFlow";
import type { FlowNodeData } from "@/components/waflow/FlowNodeCard";

// Converting between the saved format and ReactFlow's working shape.
//
// Kept out of the editor component and tested, because this is the one place a
// bug destroys a hotel's work silently: every save round-trips the whole graph
// through here, so anything these functions drop is gone from the database the
// next time someone presses Simpan.
//
// The two formats are deliberately separate. ReactFlow's Node carries UI state
// (measured size, selection, drag handles) that has no business in a column the
// engine reads, and the engine has never heard of ReactFlow.

/** Saved format → ReactFlow's working shape. */
export function fromDefinition(def: FlowDefinition): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: def.nodes.map((n) => ({
      id: n.id,
      type: "flowNode",
      position: n.position,
      data: { kind: n.type, ...n.data } as FlowNodeData,
      // The entry point is the one node a flow cannot do without; making it
      // undeletable on the canvas is cheaper than explaining the rule.
      deletable: n.type !== "trigger",
    })),
    edges: def.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      animated: true,
    })),
  };
}

/** ReactFlow's working shape → saved format. */
export function toDefinition(nodes: Node[], edges: Edge[]): FlowDefinition {
  return {
    version: FLOW_VERSION,
    nodes: nodes.map((n) => {
      // `kind` is how the canvas knows which card to draw; the saved format
      // carries it as `type`. Everything else in data is the node's content and
      // must survive untouched — a hotel's message text lives in there.
      const { kind, ...data } = n.data as FlowNodeData;
      return {
        id: n.id,
        type: kind as NodeType,
        position: n.position,
        data: data as FlowNode["data"],
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      // Omitted rather than stored as undefined: the engine treats a missing
      // handle as "the single outlet", and an explicit undefined would
      // serialise into the JSON column as a key that means nothing.
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    })),
  };
}
