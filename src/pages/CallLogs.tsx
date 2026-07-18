import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, PhoneIncoming, PhoneOutgoing, Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useCallLogs } from "@/hooks/useCallLogs";

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const tabs = [
  { key: "all",      label: "All Calls" },
  { key: "inbound",  label: "Inbound" },
  { key: "outbound", label: "Outbound" },
  { key: "followup", label: "Follow-ups" },
];

export default function CallLogs() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const { data: callLogs = [], isLoading, error } = useCallLogs({
    search: search || undefined,
    followUpOnly: activeTab === "followup" ? true : undefined,
  });

  const filtered = callLogs.filter((c) => {
    if (activeTab === "inbound"  && c.direction !== "inbound")  return false;
    if (activeTab === "outbound" && c.direction !== "outbound") return false;
    return true;
  });

  const inboundCount   = callLogs.filter((c) => c.direction === "inbound").length;
  const outboundCount  = callLogs.filter((c) => c.direction === "outbound").length;
  const followUpCount  = callLogs.filter((c) => c.follow_up).length;

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="p-6 text-center text-sm text-destructive">Failed to load call logs.</div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Call Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">{callLogs.length} logged · {followUpCount} follow-ups</p>
          </div>
          <Link to="/calls/new" className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start">
            <Plus className="w-4 h-4" /> Log Call
          </Link>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            { label: "Total",      value: String(callLogs.length) },
            { label: "Inbound",    value: String(inboundCount) },
            { label: "Outbound",   value: String(outboundCount) },
            { label: "Follow-ups", value: String(followUpCount), warn: true },
          ].map((s) => (
            <motion.div key={s.label} variants={staggerItem} className="bg-card rounded-xl border border-border p-3 md:p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={cn("text-xl md:text-2xl font-bold", s.warn ? "text-warning" : "text-foreground")}>{s.value}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 flex-1 w-full sm:max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search phone, customer..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn("px-3 md:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap", activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block bg-card rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Direction</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Date/Time</th>
                <th className="text-left px-4 py-3 font-medium">Duration</th>
                <th className="text-left px-4 py-3 font-medium">Summary</th>
                <th className="text-left px-4 py-3 font-medium">Agent</th>
                <th className="text-left px-4 py-3 font-medium">Follow-up</th>
              </tr>
            </thead>
            <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
              {filtered.map((call) => (
                <motion.tr key={call.id} variants={staggerItem} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    {call.direction === "inbound" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full"><PhoneIncoming className="w-3 h-3" /> In</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-info bg-info/10 px-2 py-0.5 rounded-full"><PhoneOutgoing className="w-3 h-3" /> Out</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-foreground">{call.caller_phone}</td>
                  <td className="px-4 py-3 text-sm">{call.customers ? <span className="text-foreground font-medium">{call.customers.full_name}</span> : <span className="text-muted-foreground italic">Unknown</span>}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(call.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDuration(call.duration_seconds)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">{call.summary ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{call.profiles?.full_name}</td>
                  <td className="px-4 py-3">{call.follow_up && <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full"><Flag className="w-3 h-3" /> {call.follow_up_due ?? ""}</span>}</td>
                </motion.tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No call logs found</td></tr>
              )}
            </motion.tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:hidden space-y-3">
          {filtered.map((call) => (
            <motion.div key={call.id} variants={staggerItem} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-foreground">{call.caller_phone}</span>
                {call.direction === "inbound" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full"><PhoneIncoming className="w-3 h-3" /> In</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-info bg-info/10 px-2 py-0.5 rounded-full"><PhoneOutgoing className="w-3 h-3" /> Out</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{call.summary ?? "—"}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{call.customers?.full_name ?? "Unknown"} · {call.profiles?.full_name}</span>
                <span>{formatDuration(call.duration_seconds)}</span>
              </div>
              {call.follow_up && (
                <div className="mt-2 pt-2 border-t border-border">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><Flag className="w-3 h-3" /> Follow-up: {call.follow_up_due ?? "—"}</span>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </PageTransition>
  );
}
