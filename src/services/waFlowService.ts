import { supabase } from "@/lib/supabase";
import { coerceFlow, emptyFlow, type FlowDefinition, type FlowRequirement, type WaFlow } from "@/types/waFlow";

// wa_flows holds one hotel's WhatsApp script per row. RLS scopes every read and
// write to the caller's own tenant and to staff/admin, and set_tenant_id()
// stamps the tenant on insert — so nothing here mentions tenant_id.
//
// There is no API route for any of this on purpose: api/ is already at Vercel
// Hobby's 12-function cap (see the note atop api/payment/[action].ts), and the
// console has no need for one — these are ordinary RLS-protected tables.

// wa_flows is not in database.types.ts yet, so the calls go through `any`, the
// same accommodation guestRequestService makes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const COLUMNS = "id,name,description,trigger_keywords,requires,priority,definition,is_active,updated_at";

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  trigger_keywords: string[] | null;
  requires: FlowRequirement | null;
  priority: number | null;
  definition: unknown;
  is_active: boolean;
  updated_at: string;
}

function toFlow(row: FlowRow): WaFlow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger_keywords: row.trigger_keywords ?? [],
    requires: row.requires ?? "none",
    priority: typeof row.priority === "number" ? row.priority : 100,
    definition: coerceFlow(row.definition),
    is_active: row.is_active,
    updated_at: row.updated_at,
  };
}

/**
 * Every flow, in the order the ENGINE evaluates them — priority then name. The
 * list reads as the precedence it actually has, so a hotel can see why one flow
 * beats another without opening either.
 */
export async function listFlows(): Promise<WaFlow[]> {
  const { data, error } = await db
    .from("wa_flows")
    .select(COLUMNS)
    .order("priority", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as FlowRow[]).map(toFlow);
}

export async function getFlow(id: string): Promise<WaFlow | null> {
  const { data, error } = await db.from("wa_flows").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toFlow(data as FlowRow) : null;
}

export interface FlowInput {
  name: string;
  description?: string | null;
  trigger_keywords: string[];
  requires: FlowRequirement;
  priority: number;
  definition: FlowDefinition;
  is_active: boolean;
}

export async function createFlow(input: FlowInput): Promise<WaFlow> {
  const { data, error } = await db.from("wa_flows").insert(input).select(COLUMNS).single();
  if (error) throw error;
  return toFlow(data as FlowRow);
}

export async function updateFlow(id: string, patch: Partial<FlowInput>): Promise<WaFlow> {
  const { data, error } = await db.from("wa_flows").update(patch).eq("id", id).select(COLUMNS).single();
  if (error) throw error;
  return toFlow(data as FlowRow);
}

export async function deleteFlow(id: string): Promise<void> {
  const { error } = await db.from("wa_flows").delete().eq("id", id);
  if (error) throw error;
}

/** New blank flow — inactive, so a half-drawn graph never answers a guest. */
export function blankFlow(name: string): FlowInput {
  return {
    name,
    description: null,
    trigger_keywords: [],
    requires: "none",
    priority: 100,
    definition: emptyFlow(),
    is_active: false,
  };
}
