import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Filter, PhoneIncoming, PhoneOutgoing, Flag, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";

const callLogs = [
  { id: "1", callerPhone: "+62 812 3456 7890", direction: "inbound" as const, datetime: "2026-04-05 09:15", duration: "4:32", summary: "Asked about room availability for next weekend. Interested in Deluxe Room.", customer: "David Chen", followUp: false, agent: "James", followUpDue: "" },
  { id: "2", callerPhone: "+62 878 9012 3456", direction: "inbound" as const, datetime: "2026-04-05 10:30", duration: "2:15", summary: "Called to confirm booking BK-20260405-M3N4. Requested airport pickup.", customer: "James Brown", followUp: true, followUpDue: "2026-04-06", agent: "James" },
  { id: "3", callerPhone: "+62 856 1234 5678", direction: "outbound" as const, datetime: "2026-04-05 11:00", duration: "1:45", summary: "Called to inform about room upgrade availability.", customer: "Sarah Kim", followUp: false, agent: "Maria", followUpDue: "" },
  { id: "4", callerPhone: "+62 821 5678 9012", direction: "inbound" as const, datetime: "2026-04-04 16:20", duration: "6:10", summary: "New guest inquiry. Wants family room for 5 nights.", customer: null, followUp: true, followUpDue: "2026-04-05", agent: "James" },
  { id: "5", callerPhone: "+62 812 3456 7890", direction: "outbound" as const, datetime: "2026-04-04 14:00", duration: "3:00", summary: "Follow-up on check-out survey. Guest satisfied.", customer: "Robert Wilson", followUp: false, agent: "Maria", followUpDue: "" },
  { id: "6", callerPhone: "+62 899 7654 3210", direction: "inbound" as const, datetime: "2026-04-04 11:45", duration: "5:20", summary: "Corporate booking inquiry for 10 rooms in June.", customer: null, followUp: true, followUpDue: "2026-04-07", agent: "Maria" },
  { id: "7", callerPhone: "+62 813 1111 2222", direction: "inbound" as const, datetime: "2026-04-03 09:00", duration: "3:45", summary: "Asked about wedding venue. Transferred to events.", customer: null, followUp: false, agent: "James", followUpDue: "" },
  { id: "8", callerPhone: "+62 812 3456 7890", direction: "inbound" as const, datetime: "2026-04-03 15:30", duration: "2:00", summary: "David Chen: extra pillows and late check-out.", customer: "David Chen", followUp: false, agent: "Sarah", followUpDue: "" },
];

const tabs = [
  { key: "all", label: "All Calls" },
  { key: "inbound", label: "Inbound" },
  { key: "outbound", label: "Outbound" },
  { key: "followup", label: "Follow-ups" },
];

export default function CallLogs() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = callLogs.filter((c) => {
    if (activeTab === "inbound" && c.direction !== "inbound") return false;
    if (activeTab === "outbound" && c.direction !== "outbound") return false;
    if (activeTab === "followup" && !c.followUp) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.callerPhone.includes(q) || c.customer?.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q);
    }
    return true;
  });

  const followUpCount = callLogs.filter((c) => c.followUp).length;

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
            { label: "Total Today", value: "3" },
            { label: "Inbound", value: String(callLogs.filter((c) => c.direction === "inbound").length) },
            { label: "Outbound", value: String(callLogs.filter((c) => c.direction === "outbound").length) },
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
          {tabs.map((tab) => {
            const count = tab.key === "all" ? callLogs.length : tab.key === "followup" ? followUpCount : callLogs.filter((c) => c.direction === tab.key).length;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn("px-3 md:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap", activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {tab.label} <span className="text-xs ml-1 opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
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
                  <td className="px-4 py-3 text-sm font-mono text-foreground">{call.callerPhone}</td>
                  <td className="px-4 py-3 text-sm">{call.customer ? <span className="text-foreground font-medium">{call.customer}</span> : <span className="text-muted-foreground italic">Unknown</span>}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{call.datetime}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{call.duration}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">{call.summary}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{call.agent}</td>
                  <td className="px-4 py-3">{call.followUp && <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full"><Flag className="w-3 h-3" /> {call.followUpDue}</span>}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:hidden space-y-3">
          {filtered.map((call) => (
            <motion.div key={call.id} variants={staggerItem} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-foreground">{call.callerPhone}</span>
                {call.direction === "inbound" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full"><PhoneIncoming className="w-3 h-3" /> In</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-info bg-info/10 px-2 py-0.5 rounded-full"><PhoneOutgoing className="w-3 h-3" /> Out</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{call.summary}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{call.customer || "Unknown"} · {call.agent}</span>
                <span>{call.duration}</span>
              </div>
              {call.followUp && (
                <div className="mt-2 pt-2 border-t border-border">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><Flag className="w-3 h-3" /> Follow-up: {call.followUpDue}</span>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </PageTransition>
  );
}
