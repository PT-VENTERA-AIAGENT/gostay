// Deciding whether a hotel-authored flow answers this message, and running it.
//
// This sits between converse.ts and the engine. converse.ts asks it one
// question — "did you handle this?" — and carries on with its built-in
// conversation when the answer is no. That boundary is what makes the whole
// change safe to ship: a hotel with no flows drawn behaves exactly as it does
// today, and a hotel whose flows do not match a particular message still falls
// back to the tested booking/room-service paths.
//
// ─── Precedence against the built-in conversation ────────────────────────────
// A flow may only START a conversation when nothing else is mid-flight. If the
// guest is part-way through giving booking dates, or is sitting on a priced
// quote awaiting "YA", that conversation owns the message — a flow stealing it
// on a stray keyword would silently discard state the guest has already spent
// several turns building. The one pending kind this module does own is "flow"
// itself, which is how a halted graph resumes.

import { isConfigured } from "../client";
import { checkFlowStartBudget } from "../inbound";
import { clearPending, setPending, type PendingAction } from "../pending";
import { runFlow, type FlowActions } from "./engine";
import { getFlow, listActiveFlows, type StoredFlow } from "./store";
import { pickFlow, type GuestState } from "./select";

/** How long a halted flow run stays resumable. Matches the booking TTL. */
const FLOW_TTL_MINUTES = 30;

export interface FlowRouteParams {
  tenantId: string;
  phoneJid: string;
  /** The guest's message, trimmed. */
  input: string;
  /** Whatever is already pending for this (tenant, phone), or null. */
  pending: PendingAction | null;
  /** Facts every flow's text can interpolate. */
  vars: Record<string, string>;
  reply(text: string): Promise<unknown>;
  actions: FlowActions;
  /**
   * Whether the guest has a checked_in booking. Called AT MOST ONCE, and only
   * when a candidate flow actually gates on it — the common case (a hotel whose
   * flows are all `requires: none`) costs no extra query per message.
   */
  isInhouse(): Promise<boolean>;
}

export interface FlowRouteResult {
  /** False means converse.ts should run its built-in conversation instead. */
  handled: boolean;
  /** Set when a handoff node fired, so the caller can flag a human. */
  handoff?: boolean;
}

const NOT_HANDLED: FlowRouteResult = { handled: false };

/**
 * Run the hotel's flows against this message, if any of them claim it.
 *
 * Never throws: a failure anywhere here falls back to the built-in
 * conversation rather than costing the guest a reply.
 */
export async function routeFlow(params: FlowRouteParams): Promise<FlowRouteResult> {
  // A deployment without Supabase credentials has no flows to read. That is a
  // configuration state, not a per-message failure, so it declines quietly
  // rather than logging an error on every inbound message.
  if (!isConfigured()) return NOT_HANDLED;

  try {
    if (params.pending?.kind === "flow") {
      return await resume(params, params.pending.payload);
    }
    // Another conversation is mid-flight — it keeps the message.
    if (params.pending) return NOT_HANDLED;
    return await start(params);
  } catch (e) {
    console.error("[wa/flow] routing failed:", (e as Error).message);
    return NOT_HANDLED;
  }
}

// ─── Starting ────────────────────────────────────────────────────────────────

async function start(params: FlowRouteParams): Promise<FlowRouteResult> {
  const flows = await listActiveFlows(params.tenantId);
  if (flows.length === 0) return NOT_HANDLED;

  const state = await resolveState(flows, params);
  const flow = pickFlow(flows, params.input, state);
  if (!flow) return NOT_HANDLED;

  // Anti-spam, on STARTS only — see checkFlowStartBudget. A resume is never
  // throttled: a guest answering a question we asked must always get through,
  // or the flow strands them on a node they cannot leave.
  //
  // Report the message as HANDLED when throttled. Falling back would defeat the
  // point: the built-in conversation would answer the very message we just
  // decided not to answer, and the loop would continue at its own budget.
  if (!(await checkFlowStartBudget(flow.id, params.phoneJid))) {
    console.warn(`[wa/flow] start budget exhausted for ${flow.id} / ${params.phoneJid}`);
    return { handled: true };
  }

  return execute(params, flow, null, {
    ...params.vars,
    is_inhouse: state.isInhouse ? "ya" : "tidak",
  });
}

/**
 * The guest state, computed only if it can change the outcome.
 *
 * Looking up an active stay is a database round-trip on the hot path of every
 * inbound message. When no flow gates on it the answer cannot affect selection,
 * so we skip the query and report false — which `meetsRequirement` only ever
 * consults for `inhouse` flows anyway.
 */
async function resolveState(
  flows: readonly StoredFlow[],
  params: FlowRouteParams,
): Promise<GuestState> {
  const gated = flows.some((f) => f.requires !== "none");
  if (!gated) return { isInhouse: false };
  return { isInhouse: await params.isInhouse() };
}

// ─── Resuming ────────────────────────────────────────────────────────────────

async function resume(
  params: FlowRouteParams,
  payload: Record<string, unknown>,
): Promise<FlowRouteResult> {
  const flowId = typeof payload.flowId === "string" ? payload.flowId : null;
  const nodeId = typeof payload.nodeId === "string" ? payload.nodeId : null;
  const saved = isStringMap(payload.vars) ? payload.vars : {};

  if (!flowId || !nodeId) {
    // A malformed pending row can only strand the guest. Drop it and let the
    // built-in conversation take this message.
    await clearPending(params.tenantId, params.phoneJid);
    return NOT_HANDLED;
  }

  // Deliberately not filtered on is_active: deactivating a flow should stop it
  // starting NEW conversations, not abandon a guest halfway through one.
  const flow = await getFlow(params.tenantId, flowId);
  if (!flow) {
    await clearPending(params.tenantId, params.phoneJid);
    return NOT_HANDLED;
  }

  return execute(params, flow, nodeId, { ...params.vars, ...saved });
}

// ─── Running + persisting ────────────────────────────────────────────────────

async function execute(
  params: FlowRouteParams,
  flow: StoredFlow,
  resumeAt: string | null,
  vars: Record<string, string>,
): Promise<FlowRouteResult> {
  const result = await runFlow({
    flow,
    resumeAt,
    vars,
    input: params.input,
    ctx: { reply: params.reply, actions: params.actions },
  });

  switch (result.status) {
    case "waiting":
      await setPending(
        params.tenantId,
        params.phoneJid,
        "flow",
        { flowId: flow.id, nodeId: result.nodeId, vars: result.vars },
        FLOW_TTL_MINUTES,
      );
      return { handled: true };

    case "handoff":
      await clearPending(params.tenantId, params.phoneJid);
      return { handled: true, handoff: true };

    case "failed":
      // Clear rather than leave the guest parked on a node that just threw and
      // would throw again on their next message.
      await clearPending(params.tenantId, params.phoneJid);
      console.error(`[wa/flow] run of ${flow.id} failed: ${result.error}`);
      return { handled: false };

    case "done":
    default:
      // Clear the "flow" row we were resuming from — but NOT when an action
      // handed the guest to the booking or room-service conversation, because
      // that conversation has already written its own pending row over ours and
      // deleting it here would throw away the state it just built.
      if (resumeAt && !result.tookOver) {
        await clearPending(params.tenantId, params.phoneJid);
      }
      return { handled: true };
  }
}

function isStringMap(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === "string");
}
