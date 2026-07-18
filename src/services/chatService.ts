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
      customers ( id, full_name, email, phone, profile_id ),
      messages:chat_messages ( content, created_at, is_read, sender_id )
    `
    )
    .order("updated_at", { ascending: false })
    // Only the newest message per thread is needed for the preview line.
    .order("created_at", { foreignTable: "messages", ascending: false })
    .limit(1, { foreignTable: "messages" });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  // The embed comes back as an array (a thread has many messages); flatten it
  // to the single latest message the UI expects. Without this the preview shows
  // "No messages yet" and "Invalid Date" even on active conversations.
  const rows = (data ?? []) as unknown as Array<
    ChatThread & {
      customers: ChatThreadWithRelations["customers"];
      messages: Array<Pick<ChatMessage, "content" | "created_at" | "is_read" | "sender_id">>;
    }
  >;

  // Unread badge = messages from the guest that staff has not read yet.
  // markMessagesRead() flips is_read=true for everything not sent by the viewer
  // when a thread is opened, so the remaining is_read=false rows whose sender is
  // the customer's own profile are exactly the unread guest messages. One extra
  // query for all visible threads, not one per thread.
  const threadIds = rows.map((t) => t.id);
  const unreadBySender = new Map<string, string[]>();
  if (threadIds.length > 0) {
    const { data: unread } = await supabase
      .from("chat_messages")
      .select("thread_id, sender_id")
      .eq("is_read", false)
      .in("thread_id", threadIds);
    for (const m of (unread ?? []) as Array<{ thread_id: string; sender_id: string }>) {
      const list = unreadBySender.get(m.thread_id) ?? [];
      list.push(m.sender_id);
      unreadBySender.set(m.thread_id, list);
    }
  }

  return rows.map((t) => {
    const latest = t.messages?.[0] ?? null;
    const guestProfile = t.customers?.profile_id ?? null;
    const senders = unreadBySender.get(t.id) ?? [];
    const unread_count = guestProfile ? senders.filter((s) => s === guestProfile).length : 0;
    const { messages, ...rest } = t;
    void messages;
    return {
      ...rest,
      last_message: latest ? { content: latest.content, created_at: latest.created_at } : null,
      unread_count,
    };
  }) as ChatThreadWithRelations[];
}

export async function getOrCreateThread(
  customerId: string,
  bookingId?: string
): Promise<ChatThread> {
  // limit(1), not maybeSingle(): if a customer somehow has more than one active
  // thread (a race between two tabs, say), maybeSingle() throws and the caller
  // falls through to CREATE yet another — the runaway that fills the inbox with
  // duplicate "Andi" threads. Reuse the newest existing active thread instead.
  const { data: rows } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("customer_id", customerId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (rows && rows.length > 0) return rows[0];

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

/**
 * Uploads a chat attachment to the `chat-attachments` bucket and returns its
 * public URL, ready to store in chat_messages.attachment_url. The path carries a
 * random prefix so it is not enumerable.
 */
export async function uploadChatAttachment(threadId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rand = crypto.randomUUID();
  const path = `${threadId}/${rand}-${safe}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("chat-attachments").getPublicUrl(path).data.publicUrl;
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

/**
 * Removes a realtime channel from the client entirely. Callers MUST use this in
 * their effect cleanup rather than channel.unsubscribe() — unsubscribe leaves
 * the channel registered by topic, so the next subscribe() reuses it and then
 * throws "cannot add postgres_changes callbacks after subscribe()". Removing it
 * (and the unique names below) guarantees each mount gets a fresh channel.
 */
export function unsubscribeChannel(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}

export function subscribeToThread(
  threadId: string,
  onMessage: (message: ChatMessage) => void
): RealtimeChannel {
  return supabase
    .channel(`thread:${threadId}:${crypto.randomUUID()}`)
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
    .channel(`thread-list:${crypto.randomUUID()}`)
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
