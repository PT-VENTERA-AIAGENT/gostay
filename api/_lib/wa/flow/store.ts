// Reading a hotel's flows out of wa_flows.
//
// Service-role PostgREST, same raw-fetch path as the rest of api/_lib/wa (see
// client.ts on why not @supabase/supabase-js). The webhook bypasses RLS, so
// tenant_id is filtered by hand on every read — the console's policies protect
// the console, not this.

import { serviceGet } from "../client";
import { coerceFlow, type FlowDefinition } from "./types";

/** Mirrors the wa_flow_requirement enum in migration 037. */
export type FlowRequirement = "none" | "inhouse";

/** A flow as the engine uses it: selection fields plus the walked graph. */
export interface StoredFlow {
  id: string;
  name: string;
  triggerKeywords: string[];
  requires: FlowRequirement;
  priority: number;
  definition: FlowDefinition;
}

interface FlowRow {
  id: string;
  name: string;
  trigger_keywords: string[] | null;
  requires: FlowRequirement | null;
  priority: number | null;
  definition: unknown;
}

function toStored(row: FlowRow): StoredFlow {
  return {
    id: row.id,
    name: row.name,
    triggerKeywords: Array.isArray(row.trigger_keywords) ? row.trigger_keywords : [],
    requires: row.requires ?? "none",
    priority: typeof row.priority === "number" ? row.priority : 100,
    // Never trust the column: a graph saved by a newer console can carry node
    // types this deployment has never heard of. coerceFlow drops them.
    definition: coerceFlow(row.definition),
  };
}

const SELECT = "id,name,trigger_keywords,requires,priority,definition";

/**
 * A tenant's active flows, already in precedence order (priority then name) —
 * the order pickFlow depends on, and the order idx_wa_flows_active stores.
 *
 * Returns [] rather than throwing when the read fails: a hotel that has not
 * drawn any flows, and a hotel whose flows momentarily cannot be read, must
 * both fall back to the built-in conversation rather than leave a guest
 * unanswered.
 */
export async function listActiveFlows(tenantId: string): Promise<StoredFlow[]> {
  const res = await serviceGet(
    `wa_flows?tenant_id=eq.${encodeURIComponent(tenantId)}&is_active=eq.true` +
      `&select=${SELECT}&order=priority.asc,name.asc`,
  );
  if (!res.ok) {
    console.error(`[wa/flow] listActiveFlows failed: HTTP ${res.status}`);
    return [];
  }
  const rows = (await res.json()) as FlowRow[];
  return rows.map(toStored);
}

/**
 * One flow by id, regardless of is_active.
 *
 * Used to resume a run that is already mid-conversation: a hotel deactivating a
 * flow should stop it starting NEW conversations, not strand a guest halfway
 * through answering its questions.
 */
export async function getFlow(tenantId: string, flowId: string): Promise<StoredFlow | null> {
  const res = await serviceGet(
    `wa_flows?tenant_id=eq.${encodeURIComponent(tenantId)}&id=eq.${encodeURIComponent(flowId)}` +
      `&select=${SELECT}&limit=1`,
  );
  if (!res.ok) {
    console.error(`[wa/flow] getFlow failed: HTTP ${res.status}`);
    return null;
  }
  const rows = (await res.json()) as FlowRow[];
  return rows[0] ? toStored(rows[0]) : null;
}
