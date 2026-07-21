import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to every change on a table and run `onChange`. Each call gets a
 * uniquely-named channel (see the chat service for why: a reused topic throws
 * "cannot add postgres_changes callbacks after subscribe()" on remount). Always
 * clean up with unsubscribe() — removeChannel, not channel.unsubscribe().
 */
export function subscribeToTable(table: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`rt:${table}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe();
}

export function unsubscribe(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
