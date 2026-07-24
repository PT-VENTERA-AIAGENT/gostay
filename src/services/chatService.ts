import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/sso";
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
 * OBJECT PATH, to store in chat_messages.attachment_url.
 *
 * It used to return a public CDN URL. The bucket was public and its read policy
 * was `bucket_id = 'chat-attachments'` with no `to` clause, so anyone — signed
 * out included — could list every thread's folder and fetch the files (verified
 * against the live project). 034 makes the bucket private and scopes read to the
 * thread's participants; the path is resolved to a short-lived signed URL at
 * render time by signedAttachmentUrl().
 *
 * The leading `{threadId}/` segment is what the storage policy reads to decide
 * who may see the file, so it must stay the first path segment.
 */
export async function uploadChatAttachment(threadId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rand = crypto.randomUUID();
  const path = `${threadId}/${rand}-${safe}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A signed URL for an attachment, from either storage form:
 *   - the object path we store now ("{threadId}/{uuid}-name.png");
 *   - a full /storage/v1/object/public/chat-attachments/… URL, which is what
 *     rows written before 034 carry. Those stopped resolving the moment the
 *     bucket went private, so the path is recovered from the URL and re-signed.
 * Returns null when the caller may not read it (the policy denies) or the object
 * is gone — the UI then shows the file name without a link rather than a broken
 * image.
 */
export async function signedAttachmentUrl(pathOrUrl: string): Promise<string | null> {
  const marker = "/chat-attachments/";
  const idx = pathOrUrl.indexOf(marker);
  const path = idx >= 0 ? pathOrUrl.slice(idx + marker.length) : pathOrUrl;
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from("chat-attachments")
    .createSignedUrl(decodeURIComponent(path), SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
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

/**
 * Clears the WhatsApp automation state for a staff-selected conversation.
 * The server keeps the authorization and tenant checks; the browser only
 * supplies the thread id, so a staff member cannot reset another hotel's
 * number by editing a phone number in devtools.
 */
export async function resetWaChat(threadId: string): Promise<{ phoneJids: string[]; resetCount: number }> {
  const token = getSession()?.supabase_token;
  const response = await fetch("/api/wa/reset-chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ threadId }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    phoneJids?: string[];
    resetCount?: number;
  };
  if (!response.ok || body.ok !== true) {
    throw new Error(body.error ?? `Server membalas ${response.status}.`);
  }
  return { phoneJids: body.phoneJids ?? [], resetCount: body.resetCount ?? 0 };
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
