import { supabase } from "@/lib/supabase";
import type {
  CallLog,
  CallLogInsert,
  CallLogUpdate,
  CallLogWithRelations,
  Customer,
} from "@/types/database.types";

export interface CallLogFilters {
  search?: string;
  followUpOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export async function getCallLogs(
  filters: CallLogFilters = {}
): Promise<CallLogWithRelations[]> {
  const { search, followUpOnly, dateFrom, dateTo } = filters;

  let query = supabase
    .from("call_logs")
    .select(
      `
      *,
      customers ( id, full_name, phone ),
      profiles ( id, full_name )
    `
    )
    .order("created_at", { ascending: false });

  if (followUpOnly) query = query.eq("follow_up", true);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo);
  if (search) {
    query = query.or(
      `caller_phone.ilike.%${search}%,summary.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as CallLogWithRelations[];
}

export async function getCallLogById(id: string): Promise<CallLogWithRelations> {
  const { data, error } = await supabase
    .from("call_logs")
    .select(`*, customers ( id, full_name, phone ), profiles ( id, full_name )`)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CallLogWithRelations;
}

export async function createCallLog(payload: CallLogInsert): Promise<CallLog> {
  const { data, error } = await supabase
    .from("call_logs")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCallLog(
  id: string,
  payload: CallLogUpdate
): Promise<CallLog> {
  const { data, error } = await supabase
    .from("call_logs")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCallLog(id: string): Promise<void> {
  const { error } = await supabase.from("call_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function lookupCallerByPhone(
  phone: string
): Promise<Customer | null> {
  const normalized = phone.replace(/\D/g, "");
  const { data } = await supabase
    .from("customers")
    .select("*")
    .or(`phone.ilike.%${normalized}%,phone.ilike.%${phone}%`)
    .maybeSingle();
  return data ?? null;
}

export async function getPendingFollowUps(): Promise<CallLogWithRelations[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("call_logs")
    .select(`*, customers ( id, full_name, phone ), profiles ( id, full_name )`)
    .eq("follow_up", true)
    .lte("follow_up_due", today)
    .order("follow_up_due");
  if (error) throw error;
  return data as CallLogWithRelations[];
}
