import { useState } from "react";
import { MessageSquare, X, Send, Paperclip, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const mockMessages = [
  { id: "1", sender: "staff", content: "Welcome to BookMe Hotel! How can we help you today?", time: "10:00 AM" },
];

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(mockMessages);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: String(prev.length + 1), sender: "guest", content: input, time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) },
    ]);
    setInput("");
    // Mock staff reply
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: String(prev.length + 1), sender: "staff", content: "Thank you for your message! A team member will respond shortly.", time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) },
      ]);
    }, 1500);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center z-50"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[360px] h-[480px] bg-card rounded-2xl border border-border shadow-2xl flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="bg-primary px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-foreground">BookMe Hotel</p>
            <p className="text-xs text-primary-foreground/70">Typically replies in minutes</p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.sender === "guest" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[80%] rounded-2xl px-3.5 py-2",
              msg.sender === "guest"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
            )}>
              <p className="text-sm">{msg.content}</p>
              <p className={cn("text-xs mt-1", msg.sender === "guest" ? "text-primary-foreground/60" : "text-muted-foreground")}>{msg.time}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button onClick={sendMessage} className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:opacity-90 transition-opacity">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
