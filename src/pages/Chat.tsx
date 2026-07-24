import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useT, tr } from "@/lib/i18n";
import { Search, Send, Paperclip, CheckCheck, MoreVertical, Phone, User, ArrowLeft, Loader2, CheckCircle, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerItem } from "@/components/shared/PageTransition";
import { ChatAttachment } from "@/components/shared/ChatAttachment";
import { useChatThreads, useChatMessages, useSendMessage, useMarkMessagesRead, useUpdateThreadStatus } from "@/hooks/useChat";
import { uploadChatAttachment } from "@/services/chatService";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Chat() {
  const t = useT();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const { toast } = useToast();

  const { data: threads = [], isLoading: threadsLoading } = useChatThreads();
  const { data: messages = [], isLoading: messagesLoading } = useChatMessages(selectedThreadId ?? "");
  const sendMessage = useSendMessage();
  const markRead = useMarkMessagesRead();
  const updateStatus = useUpdateThreadStatus();

  const selectedThread = threads.find((t) => t.id === selectedThreadId);

  const visibleThreads = threadSearch.trim()
    ? threads.filter((t) => (t.customers?.full_name ?? "").toLowerCase().includes(threadSearch.trim().toLowerCase()))
    : threads;

  async function handleAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedThreadId || !user?.id) return;
    setUploading(true);
    try {
      const url = await uploadChatAttachment(selectedThreadId, file);
      await new Promise<void>((resolve, reject) =>
        sendMessage.mutate(
          { thread_id: selectedThreadId, sender_id: user.id, content: file.name, attachment_url: url, is_read: false },
          { onSuccess: () => resolve(), onError: (err) => reject(err) },
        ));
    } catch {
      toast({ title: tr("Gagal mengunggah lampiran"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function callCustomer() {
    const phone = selectedThread?.customers?.phone;
    if (!phone) { toast({ title: tr("Nomor telepon tamu tidak tersedia") }); return; }
    window.location.href = `tel:${phone.replace(/\s+/g, "")}`;
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark the open thread's incoming messages as read — on open AND whenever a
  // new message arrives while it is open. Guarded by hasUnread so it only fires
  // when there is actually something unread (no mark-read loop).
  useEffect(() => {
    if (!selectedThreadId || !user?.id) return;
    const hasUnread = messages.some((m) => !m.is_read && m.sender_id !== user.id);
    if (hasUnread) markRead.mutate({ threadId: selectedThreadId, userId: user.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, user?.id, messages]);

  function selectThread(id: string) {
    setSelectedThreadId(id);
    setShowChat(true);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!messageText.trim() || !selectedThreadId || !user?.id) return;
    const content = messageText.trim();
    setMessageText("");
    sendMessage.mutate(
      { thread_id: selectedThreadId, sender_id: user.id, content, attachment_url: null, is_read: false },
      { onError: () => toast({ title: tr("Failed to send message"), variant: "destructive" }) }
    );
  }

  function toggleThreadStatus() {
    if (!selectedThread) return;
    updateStatus.mutate({
      id: selectedThread.id,
      status: selectedThread.status === "active" ? "resolved" : "active",
    });
  }

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-65px)]">
        {/* Thread list */}
        <div className={cn("w-full md:w-80 border-r border-border bg-card flex flex-col shrink-0", showChat ? "hidden md:flex" : "flex")}>
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground mb-3">{t("Messages")}</h2>
            <div className="search-focus flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input value={threadSearch} onChange={(e) => setThreadSearch(e.target.value)} placeholder={t("Search conversations...")} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threadsLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : visibleThreads.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">{threadSearch ? "Tidak ada yang cocok" : t("No conversations yet")}</p>
            ) : (
              visibleThreads.map((thread, i) => (
                <motion.button
                  key={thread.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => selectThread(thread.id)}
                  className={cn("w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors", selectedThreadId === thread.id && "bg-muted")}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground truncate min-w-0" title={thread.customers?.full_name ?? undefined}>{thread.customers?.full_name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {thread.last_message ? new Date(thread.last_message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate pr-4">{thread.last_message?.content ?? t("No messages yet")}</p>
                    {(thread.unread_count ?? 0) > 0 && (
                      <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold shrink-0">{thread.unread_count}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 capitalize">{thread.status}</p>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={cn("flex-1 flex flex-col min-w-0", !showChat ? "hidden md:flex" : "flex")}>
          {!selectedThread ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a conversation to start messaging
            </div>
          ) : (
            <>
              <div className="px-4 md:px-6 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <button className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0" onClick={() => setShowChat(false)}>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate" title={selectedThread.customers?.full_name ?? undefined}>{selectedThread.customers?.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{selectedThread.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={callCustomer} title="Telepon tamu" className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><Phone className="w-4 h-4" /></button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><MoreVertical className="w-4 h-4" /></button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={toggleThreadStatus}>
                        {selectedThread.status === "active"
                          ? <><CheckCircle className="w-4 h-4 mr-2" /> Tandai selesai</>
                          : <><RotateCcw className="w-4 h-4 mr-2" /> Buka lagi</>}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {messagesLoading ? (
                  <div className="flex items-center justify-center h-24">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    // A message is the guest's when its sender is the customer's
                    // own profile; everything else is staff. Comparing against
                    // customer_id (a customers.id) was the bug — sender_id is a
                    // profiles.id, so it never matched and every message, the
                    // guest's included, rendered on the staff side.
                    const isStaff = msg.sender_id !== selectedThread.customers?.profile_id;
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: isStaff ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={cn("flex", isStaff ? "justify-end" : "justify-start")}
                      >
                        <div className={cn("max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5", isStaff ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border text-foreground rounded-bl-md")}>
                          {msg.attachment_url && (
                            <ChatAttachment value={msg.attachment_url} name={msg.content} onLight={isStaff} />
                          )}
                          {!msg.attachment_url && <p className="text-sm">{msg.content}</p>}
                          <div className={cn("flex items-center gap-1 mt-1", isStaff ? "justify-end" : "")}>
                            <span className={cn("text-xs", isStaff ? "text-primary-foreground/70" : "text-muted-foreground")}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isStaff && <CheckCheck className="w-3.5 h-3.5 text-primary-foreground/70" />}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="px-4 md:px-6 py-3 md:py-4 border-t border-border bg-card shrink-0">
                <div className="flex items-center gap-2 md:gap-3">
                  <input ref={fileRef} type="file" className="hidden" onChange={handleAttach} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} title="Lampirkan file" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors border border-border disabled:opacity-50">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  </button>
                  <input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={t("Type a message...")}
                    className="flex-1 px-3 md:px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button type="submit" disabled={!messageText.trim() || sendMessage.isPending} className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Guest info sidebar */}
        {selectedThread && (
          <div className="w-64 border-l border-border bg-card p-4 shrink-0 hidden xl:block overflow-y-auto">
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2"><User className="w-7 h-7 text-primary" /></div>
              <p className="font-semibold text-foreground break-words" title={selectedThread.customers?.full_name ?? undefined}>{selectedThread.customers?.full_name}</p>
              {selectedThread.customers?.email && (
                <p className="text-xs text-muted-foreground break-all mt-0.5" title={selectedThread.customers.email}>{selectedThread.customers.email}</p>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground text-xs">{t("Status")}</span><p className="font-medium text-foreground capitalize">{selectedThread.status}</p></div>
            </div>
            <button onClick={toggleThreadStatus} className="w-full mt-4 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              {selectedThread.status === "resolved" ? t("Reopen Thread") : t("Resolve Thread")}
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
