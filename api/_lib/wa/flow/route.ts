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
import { runFlow, nodeAcceptsInput, type FlowActions } from "./engine";
import { getFlow, listActiveFlows, type StoredFlow } from "./store";
import { selectFlow, type GuestState } from "./select";

/**
 * What a guest hears when they ask for something only in-house guests get.
 *
 * Previously this message did not exist: the gated flow was skipped and whatever
 * lower-priority flow also claimed the word answered instead, so "menu" from a
 * guest who had not checked in returned the greeting — no hint that room service
 * was a thing, nor what to do about it. Both routes out are offered, because
 * either may apply: they may have booked and not checked in yet, or not booked.
 */
const REQUIRES_INHOUSE_NOTICE =
  "Mohon maaf, layanan ini hanya untuk tamu yang sedang menginap (sudah check-in).\n\n" +
  "Bila Anda sudah memesan, silakan check-in dulu di resepsionis — setelah itu layanan ini otomatis terbuka.\n" +
  "Bila belum memesan, balas *pesan kamar* untuk mulai reservasi.";

/** How long a halted flow run stays resumable. Matches the booking TTL. */
const FLOW_TTL_MINUTES = 30;

/**
 * Words that let a guest walk out of a flow they did not mean to enter.
 *
 * Without this a guest parked on a choice node has no exit: the option matcher
 * does not recognise "batal", so it re-asks, and they stay stuck until the 30
 * minute TTL expires. That is tolerable with three flows and actively hostile
 * with twelve, where landing in the wrong one is routine.
 *
 * Matched against the WHOLE trimmed message, never as a substring — "batal" must
 * not fire on "batalkan saja yang kemarin", which is a sentence a guest might
 * legitimately answer a question with.
 */
const CANCEL_WORDS = new Set([
  "batal", "batalkan", "cancel", "stop", "keluar", "selesai", "udahan", "gak jadi", "ga jadi",
]);

function isCancel(input: string): boolean {
  return CANCEL_WORDS.has(input.trim().toLowerCase());
}

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

  // isInhouse() is documented as "called at most once per message", and several
  // steps below may each need the answer. Memoising here makes that contract
  // structurally true instead of something every new branch has to remember.
  const p: FlowRouteParams = { ...params, isInhouse: once(params.isInhouse) };

  try {
    if (p.pending?.kind === "flow") {
      return await resume(p, p.pending.payload);
    }
    // Another conversation is mid-flight — it keeps the message.
    if (p.pending) return NOT_HANDLED;
    return await start(p);
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
  const choice = selectFlow(flows, params.input, state);
  if (choice.kind === "none") return NOT_HANDLED;

  // The hotel offers exactly what they asked for — they just are not eligible
  // yet. Say so, rather than letting a lower-priority flow answer something
  // else. Handled, so the built-in conversation does not answer over the top.
  if (choice.kind === "blocked") {
    await params.reply(REQUIRES_INHOUSE_NOTICE);
    return { handled: true };
  }
  const flow = choice.flow;

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

  // An explicit exit, before anything else. A guest who lands in the wrong flow
  // must be able to leave it in one word rather than waiting out the TTL.
  if (isCancel(params.input)) {
    await clearPending(params.tenantId, params.phoneJid);
    await params.reply("Baik, dibatalkan. Ada lagi yang dapat kami bantu?");
    return { handled: true };
  }

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

  // ── A guest who changed their mind is not answering our question ─────────
  // Parked on a choice node, anything that is not one of the options used to be
  // met with the same list again, forever — so a guest sitting on the greeting's
  // "1/2/3" who typed "menu" was told their choice was not recognised, and the
  // room-service flow they were plainly asking for never ran. When the waiting
  // node cannot consume the message but another flow claims it outright, that
  // other flow wins. `ask` nodes are untouched: they accept any text, so a slot
  // answer can never be stolen this way.
  if (!nodeAcceptsInput(flow.definition, nodeId, params.input)) {
    const switched = await startElsewhere(params, flow.id);
    if (switched) return switched;

    // ── The guest typed THIS flow's own trigger word again ────────────────
    // startElsewhere excludes the running flow on purpose, so a guest parked on
    // the greeting's "1/2/3" who says "Halo" again matched nothing and was told
    // their choice was not recognised — being scolded for saying hello, which is
    // how this reads to the guest. Saying the trigger again plainly means "start
    // over", so that is what happens. Bounded by the same start budget as any
    // other start, so repetition cannot loop.
    const restarted = await restartSame(params, flow);
    if (restarted) return restarted;
  }

  return execute(params, flow, nodeId, { ...params.vars, ...saved });
}

/**
 * Hand the message to a different flow, when one claims it. Returns null when
 * none does, so the caller can carry on re-prompting the current node.
 */
async function startElsewhere(
  params: FlowRouteParams,
  currentFlowId: string,
): Promise<FlowRouteResult | null> {
  const flows = await listActiveFlows(params.tenantId);
  const others = flows.filter((f) => f.id !== currentFlowId);
  if (others.length === 0) return null;

  // Resolved once and reused: isInhouse() is a database round-trip, and its
  // contract is at most one call per message.
  const state = await resolveState(others, params);
  const choice = selectFlow(others, params.input, state);
  if (choice.kind === "none") return null;

  // Whichever way this goes the old run is over — the guest has moved on.
  await clearPending(params.tenantId, params.phoneJid);

  if (choice.kind === "blocked") {
    await params.reply(REQUIRES_INHOUSE_NOTICE);
    return { handled: true };
  }
  return execute(params, choice.flow, null, {
    ...params.vars,
    is_inhouse: state.isInhouse ? "ya" : "tidak",
  });
}

/**
 * Restart the flow the guest is already in, when they typed its trigger again.
 *
 * Returns null when the word is not this flow's, so the caller re-prompts the
 * waiting node as before. The start budget applies: a guest really can say the
 * trigger a few times, and a loop still cannot run away.
 */
async function restartSame(
  params: FlowRouteParams,
  flow: StoredFlow,
): Promise<FlowRouteResult | null> {
  const state = await resolveState([flow], params);
  const choice = selectFlow([flow], params.input, state);
  // "blocked" cannot sensibly happen — they are mid-run, so they qualified —
  // but if it does, re-prompting is kinder than a lecture about eligibility.
  if (choice.kind !== "run") return null;

  if (!(await checkFlowStartBudget(flow.id, params.phoneJid))) {
    console.warn(`[wa/flow] restart budget exhausted for ${flow.id} / ${params.phoneJid}`);
    return { handled: true };
  }

  await clearPending(params.tenantId, params.phoneJid);
  return execute(params, flow, null, {
    ...params.vars,
    is_inhouse: state.isInhouse ? "ya" : "tidak",
  });
}

/** Call `fn` at most once, reusing its answer for every later caller. */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => (cached ??= fn());
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
