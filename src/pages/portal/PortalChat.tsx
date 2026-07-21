import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Send, Paperclip, ArrowLeft, CheckCheck, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import PageTransition from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/hooks/useTenant";
import {
  getOrCreateThread,
  getMessages,
  sendMessage,
  subscribeToThread,
  unsubscribeChannel,
  uploadChatAttachment,
} from "@/services/chatService";
import { getOrCreateOwnCustomer } from "@/services/bookingService";
import type { ChatThread, ChatMessage } from "@/types/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function PortalChat() {
  const { user, signIn } = useAuth();
  const { name: hotelName, initial: hotelInitial } = useTenant();

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !thread || !user) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadChatAttachment(thread.id, file);
      const saved = await sendMessage({ thread_id: thread.id, sender_id: user.id, content: file.name, attachment_url: url, is_read: false });
      setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
    } catch {
      setError("Gagal mengunggah lampiran.");
    } finally {
      setUploading(false);
    }
  }

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const initThread = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // A thread belongs to a customer, and a customer is tied to this profile
      // (customers.profile_id = auth.uid()). Resolve — or create on first chat —
      // that record before opening the thread. Passing user.id straight in was
      // the bug: that is a profiles.id, not a customers.id, so the thread's
      // foreign key and RLS check both rejected it.
      const customer = await getOrCreateOwnCustomer(user.id, {
        full_name: user.name ?? user.email ?? "Guest",
        email: user.email ?? "",
        phone: user.phone_number ?? null,
        nationality: null,
      });
      const t = await getOrCreateThread(customer.id);
      setThread(t);
      const msgs = await getMessages(t.id);
      setMessages(msgs);

      // Subscribe to realtime messages
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
      }
      channelRef.current = subscribeToThread(t.id, (newMsg) => {
        setMessages((prev) => {
          // Deduplicate by id
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      });
    } catch (err) {
      setError("Gagal memuat chat. Coba lagi sebentar.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Open the thread once the user is known.
  useEffect(() => {
    if (user) initThread();
    return () => {
      if (channelRef.current) unsubscribeChannel(channelRef.current);
    };
  }, [user, initThread]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    if (!input.trim() || !thread || sending) return;
    const content = input.trim();
    setInput("");
    if (!user) return;
    setSending(true);
    try {
      const saved = await sendMessage({
        thread_id: thread.id,
        // Must equal auth.uid(): the "Participants can send messages" policy in
        // 005_tighten_rls.sql checks sender_id against it.
        sender_id: user.id,
        content,
        attachment_url: null,
        is_read: false,
      });
      // Show it immediately rather than waiting for the realtime echo — which
      // only fires if the table is in the realtime publication, and never for
      // the sender reliably. The subscription dedups by id, so if the echo does
      // arrive it will not double up.
      setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
    } catch (err) {
      setError("Failed to send message.");
      setInput(content); // restore input on failure
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Chat is tied to a customer record, which is tied to a signed-in identity —
  // so it needs a login. The old "enter your name" guest flow minted a fake id
  // that RLS and the foreign key both rejected; asking to sign in is the honest
  // door.
  if (!user) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-4">
          <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Pesan</h1>
            <p className="text-sm text-muted-foreground mt-1">Chat dengan tim hotel kami</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6 md:p-8 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Masuk dulu untuk mulai chat dengan front desk.</p>
            <button
              onClick={() => signIn("/portal/chat")}
              className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Masuk
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-4">
        <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Pesan</h1>
          <p className="text-sm text-muted-foreground mt-1">Chat dengan tim hotel kami</p>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ height: "60vh" }}>
          {/* Header */}
          <div className="px-4 md:px-5 py-3 border-b border-border flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">{hotelInitial}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{hotelName} Front Desk</p>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span className="text-xs text-muted-foreground">Online</span>
              </div>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4" style={{ height: "calc(60vh - 130px)" }}>
            {loading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            {!loading && !error && messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Kirim pesan untuk memulai percakapan.</p>
              </div>
            )}
            {!loading && !error && messages.map((msg, i) => {
              // My own messages (sent as this profile) sit on the right; anything
              // from another sender — the front desk — sits on the left.
              const isMine = msg.sender_id === user.id;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: isMine ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i < 20 ? i * 0.03 : 0 }}
                  className={cn("flex", isMine ? "justify-end" : "justify-start")}
                >
                  <div className={cn(
                    "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5",
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}>
                    {msg.attachment_url && (
                      /\.(png|jpe?g|gif|webp|avif)$/i.test(msg.attachment_url) ? (
                        <a href={msg.attachment_url} target="_blank" rel="noreferrer">
                          <img src={msg.attachment_url} alt={msg.content} className="rounded-lg max-h-48 mb-1.5 border border-black/5" />
                        </a>
                      ) : (
                        <a href={msg.attachment_url} target="_blank" rel="noreferrer" className={cn("flex items-center gap-1.5 text-sm underline mb-1", isMine ? "text-primary-foreground" : "text-primary")}>
                          <Paperclip className="w-3.5 h-3.5" /> {msg.content}
                        </a>
                      )
                    )}
                    {!msg.attachment_url && <p className="text-sm whitespace-pre-line">{msg.content}</p>}
                    <div className={cn("flex items-center gap-1 mt-1", isMine ? "justify-end" : "")}>
                      <span className={cn("text-xs", isMine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        {formatTime(msg.created_at)}
                      </span>
                      {isMine && (
                        <CheckCheck className={cn("w-3.5 h-3.5", msg.is_read ? "text-primary-foreground" : "text-primary-foreground/60")} />
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={handleAttach} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title="Lampirkan file" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors border border-border disabled:opacity-50">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ketik pesan..."
                disabled={!thread || sending}
                className="flex-1 px-3 md:px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || !thread || sending}
                className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
