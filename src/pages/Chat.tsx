import { useState } from "react";
import { cn } from "@/lib/utils";
import { Search, Send, Paperclip, CheckCheck, MoreVertical, Phone, User, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerItem } from "@/components/shared/PageTransition";

const threads = [
  { id: "1", guest: "David Chen", lastMessage: "Thank you! Can I also request a late check-out?", time: "2 min ago", unread: 2, status: "active", booking: "BK-20260401-A1B2" },
  { id: "2", guest: "Sarah Kim", lastMessage: "What time is breakfast served?", time: "15 min ago", unread: 1, status: "active", booking: "BK-20260402-C3D4" },
  { id: "3", guest: "Emily Davis", lastMessage: "Perfect, I'll be there at 3pm", time: "1 hr ago", unread: 0, status: "active", booking: "BK-20260403-G7H8" },
  { id: "4", guest: "Robert Wilson", lastMessage: "Thanks for the great stay!", time: "2 hrs ago", unread: 0, status: "resolved", booking: "BK-20260401-I9J0" },
  { id: "5", guest: "James Brown", lastMessage: "Can you confirm my airport transfer?", time: "3 hrs ago", unread: 1, status: "active", booking: "BK-20260405-M3N4" },
];

const messages = [
  { id: "1", sender: "guest", content: "Hi, I just booked room 203. Can I request extra towels?", time: "10:30 AM" },
  { id: "2", sender: "staff", content: "Hello David! Of course, we'll have extra towels ready in your room. Is there anything else you'd like?", time: "10:32 AM" },
  { id: "3", sender: "guest", content: "That's great, thank you! Also, is it possible to get a room with a better view?", time: "10:35 AM" },
  { id: "4", sender: "staff", content: "Let me check our availability. We have a higher floor room (305) with a sea view available at a small upgrade fee. Would you like me to arrange that?", time: "10:38 AM" },
  { id: "5", sender: "guest", content: "How much would that be?", time: "10:40 AM" },
  { id: "6", sender: "staff", content: "The upgrade would be IDR 500,000 per night. Your current booking is for 3 nights, so the total upgrade cost would be IDR 1,500,000.", time: "10:42 AM" },
  { id: "7", sender: "guest", content: "Thank you! Can I also request a late check-out?", time: "10:45 AM" },
];

export default function Chat() {
  const [selectedThread, setSelectedThread] = useState("1");
  const [showChat, setShowChat] = useState(false);
  const selected = threads.find((t) => t.id === selectedThread);

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-65px)]">
        {/* Thread list */}
        <div className={cn(
          "w-full md:w-80 border-r border-border bg-card flex flex-col shrink-0",
          showChat ? "hidden md:flex" : "flex"
        )}>
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-foreground mb-3">Messages</h2>
            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input placeholder="Search conversations..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.map((thread, i) => (
              <motion.button
                key={thread.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => { setSelectedThread(thread.id); setShowChat(true); }}
                className={cn("w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors", selectedThread === thread.id && "bg-muted")}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-semibold text-foreground">{thread.guest}</span>
                  <span className="text-xs text-muted-foreground">{thread.time}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground truncate pr-4">{thread.lastMessage}</p>
                  {thread.unread > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold shrink-0">{thread.unread}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{thread.booking}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className={cn("flex-1 flex flex-col min-w-0", !showChat ? "hidden md:flex" : "flex")}>
          <div className="px-4 md:px-6 py-3 border-b border-border bg-card flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <button className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted" onClick={() => setShowChat(false)}>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{selected?.guest}</p>
                <p className="text-xs text-muted-foreground">{selected?.booking} · {selected?.status === "resolved" ? "Resolved" : "Active"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><Phone className="w-4 h-4" /></button>
              <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><MoreVertical className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
            {messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: msg.sender === "staff" ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cn("flex", msg.sender === "staff" ? "justify-end" : "justify-start")}
              >
                <div className={cn("max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2.5", msg.sender === "staff" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border text-foreground rounded-bl-md")}>
                  <p className="text-sm">{msg.content}</p>
                  <div className={cn("flex items-center gap-1 mt-1", msg.sender === "staff" ? "justify-end" : "")}>
                    <span className={cn("text-xs", msg.sender === "staff" ? "text-primary-foreground/70" : "text-muted-foreground")}>{msg.time}</span>
                    {msg.sender === "staff" && <CheckCheck className="w-3.5 h-3.5 text-primary-foreground/70" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="px-4 md:px-6 py-3 md:py-4 border-t border-border bg-card shrink-0">
            <div className="flex items-center gap-2 md:gap-3">
              <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors border border-border"><Paperclip className="w-4 h-4" /></button>
              <input placeholder="Type a message..." className="flex-1 px-3 md:px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <button className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity"><Send className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Guest info sidebar */}
        <div className="w-64 border-l border-border bg-card p-4 shrink-0 hidden xl:block">
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2"><User className="w-7 h-7 text-primary" /></div>
            <p className="font-semibold text-foreground">{selected?.guest}</p>
            <p className="text-xs text-muted-foreground">{selected?.booking}</p>
          </div>
          <div className="space-y-3 text-sm">
            <div><span className="text-muted-foreground text-xs">Status</span><p className="font-medium text-foreground capitalize">{selected?.status}</p></div>
            <div><span className="text-muted-foreground text-xs">Room</span><p className="font-medium text-foreground">203 · Deluxe</p></div>
            <div><span className="text-muted-foreground text-xs">Check-in</span><p className="font-medium text-foreground">Apr 1, 2026</p></div>
            <div><span className="text-muted-foreground text-xs">Check-out</span><p className="font-medium text-foreground">Apr 4, 2026</p></div>
          </div>
          <button className="w-full mt-4 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            {selected?.status === "resolved" ? "Reopen Thread" : "Resolve Thread"}
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
