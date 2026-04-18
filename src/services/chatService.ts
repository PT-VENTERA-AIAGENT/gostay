import { supabase } from "@/lib/supabase";
import type {
  ChatThread,
  ChatThreadInsert,
  ChatThreadWithRelations,
  ChatMessage,
  ChatMessageInsert,
  ChatThreadStatus,
} from "@/types/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Threads ──────────────────────────────────────────────────────────────────

export async function getChatThreads(
  status?: ChatThreadStatus
): Promise<ChatThreadWithRelations[]> {
  let query = supabase
    .from("chat_threads")
    .select(
      `
      *,
      customers ( id, full_name, email ),
      last_message:chat_messages ( content, created_at )
    `
    )
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data as ChatThreadWithRelations[];
}

export async function getOrCreateThread(
  customerId: string,
  bookingId?: string
): Promise<ChatThread> {
  const { data: existing } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) return existing;

  const payload: ChatThreadInsert = {
    customer_id: customerId,
    booking_id: bookingId ?? null,
    status: "active",
  };
  const { data, error } = await supabase
    .from("chat_threads")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateThreadStatus(
  id: string,
  status: ChatThreadStatus
): Promise<ChatThread> {
  const { data, error } = await supabase
    .from("chat_threads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(threadId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function sendMessage(
  payload: ChatMessageInsert
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  // Bump thread updated_at for sorting
  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", payload.thread_id);

  return data;
}

export async function markMessagesRead(threadId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_messages")
    .update({ is_read: true })
    .eq("thread_id", threadId)
    .neq("sender_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

export function subscribeToThread(
  threadId: string,
  onMessage: (message: ChatMessage) => void
): RealtimeChannel {
  return supabase
    .channel(`thread:${threadId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => onMessage(payload.new as ChatMessage)
    )
    .subscribe();
}

export function subscribeToThreadList(
  onUpdate: () => void
): RealtimeChannel {
  return supabase
    .channel("thread-list")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_threads" },
      onUpdate
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      onUpdate
    )
    .subscribe();
}
