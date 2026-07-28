// The wire format for a hotel's WhatsApp script: the JSON stored whole in
// wa_flows.definition, plus the defensive coercion the engine puts in front of
// it.
//
// This file is the CANONICAL definition. src/types/waFlow.ts re-declares the
// same shapes for the canvas editor rather than importing them, because api/ is
// a separate serverless bundle that never reaches into src/ (see the note at the
// top of roomservice.ts). Change one, change the other — the JSON column is the
// contract between them, and coerceFlow below is what stops a drift from
// becoming a crash.
//
// ─── What belongs in a graph, and what does not ──────────────────────────────
// Nodes cover routing and SCRIPTED conversation: greet, offer choices, ask a
// question, branch, answer an FAQ. They deliberately do NOT re-implement the
// multi-turn machinery that already works — booking slot-filling (AI extraction,
// date parsing, availability, pricing) and room-service ordering stay in
// converse.ts and are entered through an `action` node. A hotel drawing a
// canvas gets to decide WHEN those start and what is said around them; it does
// not get to redraw their internals, which is the part that is hard to get
// right and is covered by tests.

export const FLOW_VERSION = 1 as const;

export type NodeType =
  | "trigger"
  | "message"
  | "ask"
  | "choice"
  | "condition"
  | "action"
  | "handoff"
  | "end";

/**
 * Built-in hotel capabilities a graph can invoke. Each one wraps logic that
 * already exists and is tested; the graph decides when it runs, not how.
 */
export type ActionType =
  /** Hand over to the existing booking conversation (converse.ts slot-filling). */
  | "start_booking"
  /** Hand over to the existing room-service ordering conversation. */
  | "start_room_service"
  /** Reply with the hotel's active room types and nightly rates. */
  | "show_room_types"
  /**
   * Answer "is anything free?" with real counts per room type. Reports how many
   * rooms are free, never which ones are taken or by whom.
   */
  | "check_availability"
  /** Reply with the hotel's active POS menu. Does not start an order. */
  | "show_menu"
  /** Reply with the guest-portal link for this hotel. */
  | "send_portal_link"
  /**
   * Answer a free-text question using the hotel's real data and its own written
   * knowledge base. Refuses rather than inventing when nothing covers it.
   */
  | "ask_concierge";

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /**
   * Which outlet of the source node this edge leaves from:
   *   condition → "true" | "false"
   *   choice    → the option id
   *   others    → undefined (single outlet)
   */
  sourceHandle?: string;
}

export interface BaseFlowNode {
  id: string;
  type: NodeType;
  /** Canvas position. Meaningless to the engine; carried so the editor round-trips. */
  position?: { x: number; y: number };
}

/**
 * Entry point. Exactly one per flow; the engine starts here.
 *
 * Trigger WORDS live on the wa_flows row, not in this node — selection happens
 * before any graph is loaded (one indexed query per inbound message, rather
 * than deserialising every flow to look inside it).
 */
export interface TriggerNode extends BaseFlowNode {
  type: "trigger";
  data: Record<string, never>;
}

/** Send a line and move on. */
export interface MessageNode extends BaseFlowNode {
  type: "message";
  data: {
    /** Supports {{variable}} interpolation — see variables.ts. */
    text: string;
  };
}

/**
 * Ask something, halt, and store the guest's next message in `variable`.
 *
 * The engine stops here and resumes on the following inbound message, so a
 * graph can gather a name or a room number without any code change.
 */
export interface AskNode extends BaseFlowNode {
  type: "ask";
  data: {
    prompt: string;
    /** Key the answer is saved under in the run's variables. */
    variable: string;
  };
}

export interface ChoiceOption {
  id: string;
  /** Shown to the guest, numbered by the engine. */
  label: string;
}

/**
 * Offer numbered options and halt until one is picked.
 *
 * Numbered text rather than WhatsApp interactive buttons: this deployment talks
 * to guests over a Baileys gateway that sends plain text, so "1", "2" is what a
 * guest can actually reply with. The engine accepts the number OR the option's
 * words.
 */
export interface ChoiceNode extends BaseFlowNode {
  type: "choice";
  data: {
    text: string;
    options: ChoiceOption[];
  };
}

export type ConditionOperator = "==" | "!=" | "contains" | "is_set" | "is_empty";

/**
 * Branch on a variable. Leaves through the "true" or "false" handle.
 *
 * `variable` may name anything the run has gathered, plus the engine-provided
 * facts (is_inhouse, room_number, guest_name, hotel_name) — which is how a
 * graph asks "are they actually staying?" without the hotel knowing SQL.
 */
export interface ConditionNode extends BaseFlowNode {
  type: "condition";
  data: {
    variable: string;
    operator: ConditionOperator;
    /** Ignored for is_set / is_empty. */
    value?: string;
  };
}

export interface ActionNode extends BaseFlowNode {
  type: "action";
  data: {
    action: ActionType;
  };
}

/** Stop the bot and put the conversation in front of a human. Terminal. */
export interface HandoffNode extends BaseFlowNode {
  type: "handoff";
  data: {
    text: string;
  };
}

/** Say a closing line and stop. Terminal. */
export interface EndNode extends BaseFlowNode {
  type: "end";
  data: {
    text?: string;
  };
}

export type FlowNode =
  | TriggerNode
  | MessageNode
  | AskNode
  | ChoiceNode
  | ConditionNode
  | ActionNode
  | HandoffNode
  | EndNode;

export interface FlowDefinition {
  version: typeof FLOW_VERSION;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function emptyFlow(): FlowDefinition {
  return { version: FLOW_VERSION, nodes: [], edges: [] };
}

// ─── Coercion ────────────────────────────────────────────────────────────────

const NODE_TYPES = new Set<NodeType>([
  "trigger", "message", "ask", "choice", "condition", "action", "handoff", "end",
]);

const ACTION_TYPES = new Set<ActionType>([
  "start_booking", "start_room_service", "show_room_types", "check_availability",
  "show_menu", "send_portal_link", "ask_concierge",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Turn whatever the column holds into a FlowDefinition the engine can walk.
 * Never throws.
 *
 * The engine runs inside a webhook that must always 200, and the column is
 * written by a canvas that will gain node types faster than every deployment
 * updates. So an unknown node type, a dangling edge, or a node missing its data
 * is DROPPED rather than allowed to throw mid-conversation: a hotel whose graph
 * half-loads answers a guest with part of its script, which beats an apology.
 * The same reasoning as coercePlan in src/types/floorPlan.ts.
 */
export function coerceFlow(raw: unknown): FlowDefinition {
  if (!isRecord(raw)) return emptyFlow();

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes: FlowNode[] = [];
  for (const n of rawNodes) {
    const node = coerceNode(n);
    if (node) nodes.push(node);
  }

  // Edges are only meaningful between nodes that survived.
  const ids = new Set(nodes.map((n) => n.id));
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const edges: FlowEdge[] = [];
  for (const e of rawEdges) {
    if (!isRecord(e)) continue;
    const { id, source, target, sourceHandle } = e;
    if (typeof id !== "string" || typeof source !== "string" || typeof target !== "string") continue;
    if (!ids.has(source) || !ids.has(target)) continue;
    edges.push({
      id,
      source,
      target,
      ...(typeof sourceHandle === "string" ? { sourceHandle } : {}),
    });
  }

  return { version: FLOW_VERSION, nodes, edges };
}

function coerceNode(raw: unknown): FlowNode | null {
  if (!isRecord(raw)) return null;
  const { id, type } = raw;
  if (typeof id !== "string" || typeof type !== "string") return null;
  if (!NODE_TYPES.has(type as NodeType)) return null;

  const data = isRecord(raw.data) ? raw.data : {};
  const position =
    isRecord(raw.position) && typeof raw.position.x === "number" && typeof raw.position.y === "number"
      ? { x: raw.position.x, y: raw.position.y }
      : undefined;
  const base = { id, ...(position ? { position } : {}) };

  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  switch (type as NodeType) {
    case "trigger":
      return { ...base, type: "trigger", data: {} as Record<string, never> };

    case "message": {
      const text = str(data.text);
      // A message with nothing to say would send an empty WhatsApp body.
      return text ? { ...base, type: "message", data: { text } } : null;
    }

    case "ask": {
      const prompt = str(data.prompt);
      const variable = str(data.variable).trim();
      // Without a variable the answer would be discarded and the flow would
      // halt forever waiting for something it never reads.
      return prompt && variable ? { ...base, type: "ask", data: { prompt, variable } } : null;
    }

    case "choice": {
      const text = str(data.text);
      const rawOpts = Array.isArray(data.options) ? data.options : [];
      const options: ChoiceOption[] = [];
      for (const o of rawOpts) {
        if (!isRecord(o)) continue;
        const oid = str(o.id);
        const label = str(o.label);
        if (oid && label) options.push({ id: oid, label });
      }
      // A choice with no options can never be answered.
      return text && options.length > 0
        ? { ...base, type: "choice", data: { text, options } }
        : null;
    }

    case "condition": {
      const variable = str(data.variable).trim();
      const op = str(data.operator) as ConditionOperator;
      const valid: ConditionOperator[] = ["==", "!=", "contains", "is_set", "is_empty"];
      if (!variable || !valid.includes(op)) return null;
      return {
        ...base,
        type: "condition",
        data: { variable, operator: op, ...(typeof data.value === "string" ? { value: data.value } : {}) },
      };
    }

    case "action": {
      const action = str(data.action) as ActionType;
      // An unknown action is a graph drawn by a newer console than this
      // deployment runs — drop it rather than invoke nothing and stall.
      return ACTION_TYPES.has(action) ? { ...base, type: "action", data: { action } } : null;
    }

    case "handoff": {
      const text = str(data.text);
      return text ? { ...base, type: "handoff", data: { text } } : null;
    }

    case "end": {
      const text = str(data.text);
      return { ...base, type: "end", data: text ? { text } : {} };
    }
  }
  return null;
}

/** The flow's entry node, or null when the graph has none (never started). */
export function findTrigger(def: FlowDefinition): TriggerNode | null {
  return (def.nodes.find((n) => n.type === "trigger") as TriggerNode | undefined) ?? null;
}

export function findNode(def: FlowDefinition, id: string): FlowNode | null {
  return def.nodes.find((n) => n.id === id) ?? null;
}

/**
 * The node reached by leaving `from` through `handle`, or null when that outlet
 * is unwired (which is how a graph ends without an explicit end node).
 */
export function nextNode(
  def: FlowDefinition,
  from: string,
  handle?: string,
): FlowNode | null {
  const edge = def.edges.find(
    (e) => e.source === from && (handle === undefined || e.sourceHandle === handle),
  );
  return edge ? findNode(def, edge.target) : null;
}
