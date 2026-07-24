import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getChatThreads,
  getOrCreateThread,
  updateThreadStatus,
  getMessages,
  sendMessage,
  markMessagesRead,
  resetWaChat,
  subscribeToThread,
  subscribeToThreadList,
  unsubscribeChannel,
} from "@/services/chatService";
import type {
  ChatThreadStatus,
  ChatMessageInsert,
} from "@/types/database.types";

export const chatKeys = {
  threads: (status?: ChatThreadStatus) =>
    ["chat", "threads", status] as const,
  messages: (threadId: string) => ["chat", "messages", threadId] as const,
};

export function useChatThreads(status?: ChatThreadStatus) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chatKeys.threads(status),
    queryFn: () => getChatThreads(status),
  });

  // Subscribe to realtime updates for thread list
  useEffect(() => {
    const channel = subscribeToThreadList(() => {
      qc.invalidateQueries({ queryKey: ["chat", "threads"] });
    });
    return () => { unsubscribeChannel(channel); };
  }, [qc]);

  return query;
}

export function useChatMessages(threadId: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: chatKeys.messages(threadId),
    queryFn: () => getMessages(threadId),
    enabled: Boolean(threadId),
  });

  // Subscribe to realtime new messages in this thread
  useEffect(() => {
    if (!threadId) return;
    const channel = subscribeToThread(threadId, (message) => {
      qc.setQueryData(chatKeys.messages(threadId), (old: typeof query.data) => {
        if (!old) return [message];
        // Dedup by id: the same message arrives both from the refetch that
        // useSendMessage triggers AND from this realtime event. Appending blind
        // produced two rows with the same key, which React refuses to reconcile
        // — the cause of the doubled bubbles and the "must refresh" freezes.
        if (old.some((m) => m.id === message.id)) return old;
        return [...old, message];
      });
    });
    return () => { unsubscribeChannel(channel); };
  }, [threadId, qc]);

  return query;
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChatMessageInsert) => sendMessage(payload),
    onSuccess: (_msg, payload) => {
      qc.invalidateQueries({
        queryKey: chatKeys.messages(payload.thread_id),
      });
    },
  });
}

export function useMarkMessagesRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, userId }: { threadId: string; userId: string }) =>
      markMessagesRead(threadId, userId),
    // Refresh the thread list so the unread badge drops immediately. Without
    // this the DB is updated but the badge stays stale — the "kok gak hilang".
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export function useUpdateThreadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: ChatThreadStatus;
    }) => updateThreadStatus(id, status),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["chat", "threads"] }),
  });
}

export function useResetWaChat() {
  return useMutation({
    mutationFn: (threadId: string) => resetWaChat(threadId),
  });
}

export function useGetOrCreateThread() {
  return useMutation({
    mutationFn: ({
      customerId,
      bookingId,
    }: {
      customerId: string;
      bookingId?: string;
    }) => getOrCreateThread(customerId, bookingId),
  });
}
