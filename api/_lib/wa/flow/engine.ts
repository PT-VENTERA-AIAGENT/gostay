// The flow executor: walks a hotel's node graph one inbound message at a time.
//
// A run is a walk that HALTS. It starts at the trigger (or resumes at the node
// that was waiting), executes nodes until it reaches one that needs the guest to
// say something next, and stops there — the caller persists where it stopped so
// the following message picks up in the same place. Nothing here loops waiting
// for input; a WhatsApp turn is a single request.
//
// ─── No I/O of its own ───────────────────────────────────────────────────────
// The engine never imports converse.ts, the database, or the WhatsApp sender.
// Everything it needs arrives in FlowRunContext: a reply function, and an
// `actions` object holding the built-in hotel capabilities. That is partly for
// testability, but mostly because converse.ts is what SUPPLIES those actions —
// importing it back would be a cycle. It also means the whole engine is
// exercisable in tests with no network and no database.
//
// ─── Failure policy ──────────────────────────────────────────────────────────
// A node that throws ends the run as "failed" and is reported to the caller,
// which apologises and clears the pending state. It does NOT strand the guest
// mid-graph: a run that cannot continue must not leave a pending row pointing
// at a node that keeps failing on every retry.

import {
  findTrigger,
  findNode,
  nextNode,
  type FlowNode,
  type ChoiceNode,
} from "./types";
import type { StoredFlow } from "./store";
import { interpolate } from "./variables";

/**
 * Cap on nodes executed per inbound message. A graph a hotel draws can contain
 * a cycle (message → condition → message → …) with no waiting node in it, which
 * would otherwise spin until the function times out and the gateway retries.
 * Generous enough that no reasonable script hits it.
 */
const MAX_STEPS = 30;

/** The built-in capabilities an `action` node can invoke. */
export interface FlowActions {
  /** Enter the existing booking conversation (slot-filling, quoting). */
  startBooking(): Promise<void>;
  /**
   * Enter the existing room-service conversation. Returns false when the guest
   * turned out not to be in-house, so the graph can carry on instead of
   * dead-ending — the same fall-through the keyword gate provides at selection
   * time, repeated here because a stay can end between the two.
   */
  startRoomService(): Promise<boolean>;
  showRoomTypes(): Promise<void>;
  showMenu(): Promise<void>;
  sendPortalLink(): Promise<void>;
}

export interface FlowRunContext {
  reply(text: string): Promise<unknown>;
  actions: FlowActions;
}

export type FlowRunStatus =
  /** Halted at an ask/choice; `nodeId` is what the next message answers. */
  | "waiting"
  /** Reached a terminal node or an unwired outlet. The conversation is over. */
  | "done"
  /** A handoff node fired; a human should take it from here. */
  | "handoff"
  /** A node threw. The caller apologises and clears state. */
  | "failed";

export interface FlowRunResult {
  status: FlowRunStatus;
  /** Where to resume, when status is "waiting". */
  nodeId: string | null;
  /** Variables as they stand after the run, for persisting alongside nodeId. */
  vars: Record<string, string>;
  steps: number;
  error?: string;
  /**
   * True when the run ended because an action handed the guest to another
   * conversation (booking, room service) rather than because the graph
   * finished.
   *
   * The caller MUST NOT clear pending state in that case: the conversation that
   * took over has already parked its own, and clearing would delete the booking
   * slots or the order awaiting a "YA".
   */
  tookOver?: boolean;
}

export interface RunFlowParams {
  flow: StoredFlow;
  /**
   * The ask/choice node this message is answering, or null/undefined to start
   * the flow from its trigger.
   */
  resumeAt?: string | null;
  /** Facts seeded by the caller plus anything earlier `ask` nodes gathered. */
  vars: Record<string, string>;
  /** The guest's message this turn. */
  input: string;
  ctx: FlowRunContext;
}

/**
 * Execute one turn of a flow.
 *
 * Starting: `resumeAt` absent → begin at the trigger node.
 * Resuming: `resumeAt` names the node that was waiting → `input` is consumed as
 * its answer, then the walk continues from there.
 */
export async function runFlow(params: RunFlowParams): Promise<FlowRunResult> {
  const { flow, resumeAt, input, ctx } = params;
  const def = flow.definition;
  const vars: Record<string, string> = { ...params.vars };

  let steps = 0;
  const fail = (error: string): FlowRunResult => ({
    status: "failed", nodeId: null, vars, steps, error,
  });

  // ── Where does this turn begin? ─────────────────────────────────────────
  let current: FlowNode | null;

  if (resumeAt) {
    const waiting = findNode(def, resumeAt);
    if (!waiting) {
      // The node vanished — the hotel edited the graph mid-conversation. Better
      // to end cleanly than to resume somewhere arbitrary.
      return { status: "done", nodeId: null, vars, steps };
    }
    let resumed: Resume;
    try {
      resumed = await consumeAnswer(def, waiting, input, vars, ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    // Not understood: the guest has been re-prompted and stays on this node.
    // A null `node`, by contrast, means the outlet is unwired — that ends the
    // run normally through the loop below, and must NOT be read as "waiting"
    // or the guest would be parked on a node nothing will ever advance.
    if (resumed.kind === "reask") {
      return { status: "waiting", nodeId: waiting.id, vars, steps };
    }
    current = resumed.node;
  } else {
    const trigger = findTrigger(def);
    if (!trigger) return { status: "done", nodeId: null, vars, steps };
    current = nextNode(def, trigger.id);
  }

  // ── Walk until something makes us stop ──────────────────────────────────
  while (current) {
    if (++steps > MAX_STEPS) {
      console.error(`[wa/flow] ${flow.id} exceeded ${MAX_STEPS} steps — cycle?`);
      return fail("max_steps_exceeded");
    }

    const node: FlowNode = current;

    try {
      switch (node.type) {
        case "message": {
          await ctx.reply(interpolate(node.data.text, vars));
          current = nextNode(def, node.id);
          break;
        }

        case "ask": {
          await ctx.reply(interpolate(node.data.prompt, vars));
          return { status: "waiting", nodeId: node.id, vars, steps };
        }

        case "choice": {
          await ctx.reply(renderChoice(node, vars));
          return { status: "waiting", nodeId: node.id, vars, steps };
        }

        case "condition": {
          const branch = evaluate(node.data, vars) ? "true" : "false";
          current = nextNode(def, node.id, branch);
          break;
        }

        case "action": {
          const handled = await runAction(node.data.action, ctx.actions);
          if (!handled) {
            // The action declined (e.g. room service for a guest no longer
            // checked in). Continue the graph so the hotel's own wording gets
            // the last word instead of a dead end.
            current = nextNode(def, node.id);
            break;
          }
          // A handled action owns the conversation from here — it has parked
          // its own pending state (booking slots, an order awaiting "YA"), and
          // walking on would overwrite it with ours.
          return { status: "done", nodeId: null, vars, steps, tookOver: true };
        }

        case "handoff": {
          await ctx.reply(interpolate(node.data.text, vars));
          return { status: "handoff", nodeId: null, vars, steps };
        }

        case "end": {
          if (node.data.text) await ctx.reply(interpolate(node.data.text, vars));
          return { status: "done", nodeId: null, vars, steps };
        }

        case "trigger": {
          // Only reachable if a graph wires an edge back into its entry point.
          current = nextNode(def, node.id);
          break;
        }
      }
    } catch (e) {
      console.error(`[wa/flow] node ${node.id} (${node.type}) threw:`, (e as Error).message);
      return fail(`node_failed_${node.type}`);
    }
  }

  // Ran out of edges — a perfectly normal way for a script to finish.
  return { status: "done", nodeId: null, vars, steps };
}

// ─── Resuming ────────────────────────────────────────────────────────────────

/**
 * What resuming produced: either a node to continue from (null = unwired outlet,
 * which ends the run), or "re-ask" — the answer was not understood, the guest
 * has been re-prompted, and they stay parked on the same node.
 *
 * These are kept distinct on purpose. Collapsing "nothing to continue to" and
 * "ask again" into one null would either strand a guest on a dead node or drop
 * them out of the flow on a single typo, depending on which meaning won.
 */
type Resume = { kind: "continue"; node: FlowNode | null } | { kind: "reask" };

/**
 * Apply the guest's message to the node that was waiting.
 */
async function consumeAnswer(
  def: StoredFlow["definition"],
  waiting: FlowNode,
  input: string,
  vars: Record<string, string>,
  ctx: FlowRunContext,
): Promise<Resume> {
  if (waiting.type === "ask") {
    vars[waiting.data.variable] = input.trim();
    return { kind: "continue", node: nextNode(def, waiting.id) };
  }

  if (waiting.type === "choice") {
    const picked = matchOption(waiting, input);
    if (!picked) {
      await ctx.reply(renderChoice(waiting, vars, true));
      return { kind: "reask" };
    }
    vars[`${waiting.id}_choice`] = picked.id;
    return { kind: "continue", node: nextNode(def, waiting.id, picked.id) };
  }

  // Parked on a node that does not take an answer — the graph changed under us.
  // Continue from it rather than consuming the message.
  return { kind: "continue", node: nextNode(def, waiting.id) };
}

/**
 * Match a reply against a choice's options: the printed number first, then the
 * option's own words.
 *
 * The number is what most guests send, but "deluxe" for option 2 is common
 * enough that ignoring it would feel broken. Word matching is whole-message
 * containment in either direction, so both "deluxe" and "mau yang deluxe" hit.
 */
function matchOption(node: ChoiceNode, input: string) {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return null;

  // "2", "2.", "2)" — the shapes a guest actually types.
  const asNumber = raw.match(/^(\d{1,2})[.)]?$/);
  if (asNumber) {
    const idx = Number(asNumber[1]) - 1;
    if (idx >= 0 && idx < node.data.options.length) return node.data.options[idx];
    return null; // a number, but not one on offer
  }

  for (const opt of node.data.options) {
    const label = opt.label.toLowerCase().trim();
    if (!label) continue;
    if (raw === label || raw.includes(label) || label.includes(raw)) return opt;
  }
  return null;
}

/** The numbered list a choice node sends. */
function renderChoice(node: ChoiceNode, vars: Record<string, string>, retry = false): string {
  const header = retry
    ? "Mohon maaf, pilihannya belum kami kenali. Silakan balas dengan nomornya ya:"
    : interpolate(node.data.text, vars);
  const lines = node.data.options.map((o, i) => `${i + 1}. ${interpolate(o.label, vars)}`);
  return `${header}\n\n${lines.join("\n")}`;
}

// ─── Conditions ──────────────────────────────────────────────────────────────

/**
 * Evaluate a condition against the run's variables.
 *
 * Comparison is case-insensitive and trimmed: a hotel typing `is_inhouse == Ya`
 * in the console means the same thing as `ya`, and holding them to exact bytes
 * would produce silent, unexplainable false branches.
 */
function evaluate(
  data: { variable: string; operator: string; value?: string },
  vars: Record<string, string>,
): boolean {
  const actual = (vars[data.variable] ?? "").trim().toLowerCase();
  const expected = (data.value ?? "").trim().toLowerCase();

  switch (data.operator) {
    case "is_set":
      return actual !== "";
    case "is_empty":
      return actual === "";
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "contains":
      return expected !== "" && actual.includes(expected);
    default:
      return false;
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Invoke a built-in capability. Returns whether it TOOK OVER the conversation.
 *
 * Only the two "start …" actions can take over: they hand the guest to a
 * multi-turn conversation that parks its own state. The rest just send
 * something and let the graph continue, so the hotel's script keeps control.
 */
async function runAction(action: string, actions: FlowActions): Promise<boolean> {
  switch (action) {
    case "start_booking":
      await actions.startBooking();
      return true;
    case "start_room_service":
      return actions.startRoomService();
    case "show_room_types":
      await actions.showRoomTypes();
      return false;
    case "show_menu":
      await actions.showMenu();
      return false;
    case "send_portal_link":
      await actions.sendPortalLink();
      return false;
    default:
      return false;
  }
}
