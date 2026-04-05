import { useState } from "react";
import { cn } from "@/lib/utils";
import { Send, Paperclip, ArrowLeft, CheckCheck } from "lucide-react";
import { Link } from "react-router-dom";

const messages = [
  { id: "1", sender: "staff", content: "Welcome to BookMe Hotel! How can we help you today?", time: "10:00 AM" },
  { id: "2", sender: "guest", content: "Hi, I have a booking BK-20260410-X7Y8. Can I request a late check-out?", time: "10:05 AM" },
  { id: "3", sender: "staff", content: "Hello John! Let me check that for you. Your booking is for a Deluxe Room checking out on April 13th. We can offer a late check-out until 2:00 PM at no extra charge, or until 4:00 PM for an additional IDR 500,000.", time: "10:08 AM" },
  { id: "4", sender: "guest", content: "The 2 PM option would be perfect, thank you!", time: "10:10 AM" },
  { id: "5", sender: "staff", content: "Noted! I've updated your booking with a complimentary late check-out until 2:00 PM. Is there anything else I can help you with?", time: "10:12 AM" },
  { id: "6", sender: "guest", content: "Could you also recommend a good restaurant nearby for dinner?", time: "10:15 AM" },
  { id: "7", sender: "staff", content: "Of course! Here are our top picks:\n\n🍽️ **Nusa Kitchen** — Indonesian fusion, 5 min walk\n🍣 **Sakura Sushi** — Japanese, 10 min walk\n🥩 **The Grill Room** — Steakhouse in our hotel lobby\n\nWould you like me to make a reservation at any of these?", time: "10:18 AM" },
];

export default function PortalChat() {
  const [input, setInput] = useState("");

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 space-y-4">
      <Link to="/portal/my-account" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to My Account
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">Chat with our hotel team</p>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ height: "60vh" }}>
        {/* Chat header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">BM</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">BookMe Hotel Front Desk</p>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ height: "calc(60vh - 130px)" }}>
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.sender === "guest" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] rounded-2xl px-4 py-2.5",
                msg.sender === "guest"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md"
              )}>
                <p className="text-sm whitespace-pre-line">{msg.content}</p>
                <div className={cn("flex items-center gap-1 mt-1", msg.sender === "guest" ? "justify-end" : "")}>
                  <span className={cn("text-xs", msg.sender === "guest" ? "text-primary-foreground/60" : "text-muted-foreground")}>{msg.time}</span>
                  {msg.sender === "guest" && <CheckCheck className="w-3.5 h-3.5 text-primary-foreground/60" />}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors border border-border">
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
