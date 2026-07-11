import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Send, Paperclip, ArrowLeft, CheckCheck, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import PageTransition from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import {
  getOrCreateThread,
  getMessages,
  sendMessage,
  subscribeToThread,
} from "@/services/chatService";
import type { ChatThread, ChatMessage } from "@/types/database.types";
import type { RealtimeChannel } from "@supabase/supabase-js";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function PortalChat() {
  const { user } = useAuth();

  // Guest mode state (when not logged in)
  const [guestName, setGuestName] = useState("");
  const [guestReady, setGuestReady] = useState(false);

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const initThread = useCallback(async (customerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const t = await getOrCreateThread(customerId);
      setThread(t);
      const msgs = await getMessages(t.id);
      setMessages(msgs);

      // Subscribe to realtime messages
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
      channelRef.current = subscribeToThread(t.id, (newMsg) => {
        setMessages((prev) => {
          // Deduplicate by id
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      });
    } catch (err) {
      setError("Failed to load chat. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Init on mount if user is logged in
  useEffect(() => {
    if (user) {
      initThread(user.id);
    }
    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [user, initThread]);

  // Init when guest confirms name
  useEffect(() => {
    if (!user && guestReady && guestName.trim()) {
      const guestId = "guest-" + guestName.trim().toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
      initThread(guestId);
    }
  }, [user, guestReady, guestName, initThread]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    if (!input.trim() || !thread || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    try {
      const senderId = user?.id ?? ("guest-" + guestName.trim().toLowerCase().replace(/\s+/g, "-"));
      await sendMessage({
        thread_id: thread.id,
        sender_id: senderId,
        content,
        attachment_url: null,
        is_read: false,
      });
      // Realtime subscription will append the message
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

  // Guest name prompt (not logged in, not ready yet)
  if (!user && !guestReady) {
    return (
      <PageTransition>
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-4">
          <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Messages</h1>
            <p className="text-sm text-muted-foreground mt-1">Chat with our hotel team</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-6 md:p-8 space-y-4">
            <p className="text-sm text-foreground font-medium">Please enter your name to start chatting:</p>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && guestName.trim()) setGuestReady(true); }}
              placeholder="Your name"
              className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              disabled={!guestName.trim()}
              onClick={() => setGuestReady(true)}
              className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Chat
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
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">Chat with our hotel team</p>
        </div>
        <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ height: "60vh" }}>
          {/* Header */}
          <div className="px-4 md:px-5 py-3 border-b border-border flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">GS</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">GoStay Front Desk</p>
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
                <p className="text-sm text-muted-foreground">Send a message to start the conversation.</p>
              </div>
            )}
            {!loading && !error && messages.map((msg, i) => {
              const isGuest = msg.sender_id === (user?.id ?? ("guest-" + guestName.trim().toLowerCase().replace(/\s+/g, "-")));
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: isGuest ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i < 20 ? i * 0.03 : 0 }}
                  className={cn("flex", isGuest ? "justify-end" : "justify-start")}
                >
                  <div className={cn(
                    "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5",
                    isGuest
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}>
                    <p className="text-sm whitespace-pre-line">{msg.content}</p>
                    <div className={cn("flex items-center gap-1 mt-1", isGuest ? "justify-end" : "")}>
                      <span className={cn("text-xs", isGuest ? "text-primary-foreground/60" : "text-muted-foreground")}>
                        {formatTime(msg.created_at)}
                      </span>
                      {isGuest && (
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
              <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors border border-border">
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
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
