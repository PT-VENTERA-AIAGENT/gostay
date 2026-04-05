import { Link } from "react-router-dom";
import { Plus, Search, Filter, Phone, PhoneIncoming, PhoneOutgoing, Flag, User, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

const callLogs = [
  { id: "1", callerPhone: "+62 812 3456 7890", direction: "inbound" as const, datetime: "2026-04-05 09:15", duration: "4:32", summary: "Asked about room availability for next weekend. Interested in Deluxe Room.", customer: "David Chen", followUp: false, agent: "James" },
  { id: "2", callerPhone: "+62 878 9012 3456", direction: "inbound" as const, datetime: "2026-04-05 10:30", duration: "2:15", summary: "Called to confirm booking BK-20260405-M3N4. Requested airport pickup.", customer: "James Brown", followUp: true, followUpDue: "2026-04-06", agent: "James" },
  { id: "3", callerPhone: "+62 856 1234 5678", direction: "outbound" as const, datetime: "2026-04-05 11:00", duration: "1:45", summary: "Called to inform about room upgrade availability.", customer: "Sarah Kim", followUp: false, agent: "Maria" },
  { id: "4", callerPhone: "+62 821 5678 9012", direction: "inbound" as const, datetime: "2026-04-04 16:20", duration: "6:10", summary: "New guest inquiry. Wants family room for 5 nights. Quoted price. Will call back to confirm.", customer: null, followUp: true, followUpDue: "2026-04-05", agent: "James" },
  { id: "5", callerPhone: "+62 812 3456 7890", direction: "outbound" as const, datetime: "2026-04-04 14:00", duration: "3:00", summary: "Follow-up on check-out survey. Guest satisfied with stay.", customer: "Robert Wilson", followUp: false, agent: "Maria" },
  { id: "6", callerPhone: "+62 899 7654 3210", direction: "inbound" as const, datetime: "2026-04-04 11:45", duration: "5:20", summary: "Corporate booking inquiry for 10 rooms in June. Sent proposal via email.", customer: null, followUp: true, followUpDue: "2026-04-07", agent: "Maria" },
];

export default function CallLogs() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Call Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">{callLogs.length} logged calls</p>
        </div>
        <Link to="/calls/new" className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
          <Plus className="w-4 h-4" /> Log Call
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2.5 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input placeholder="Search by phone, customer, or summary..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
          <Filter className="w-4 h-4" /> Filter
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Direction</th>
              <th className="text-left px-4 py-3 font-medium">Phone Number</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-left px-4 py-3 font-medium">Date/Time</th>
              <th className="text-left px-4 py-3 font-medium">Duration</th>
              <th className="text-left px-4 py-3 font-medium">Summary</th>
              <th className="text-left px-4 py-3 font-medium">Agent</th>
              <th className="text-left px-4 py-3 font-medium">Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {callLogs.map((call) => (
              <tr key={call.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3">
                  {call.direction === "inbound" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                      <PhoneIncoming className="w-3 h-3" /> In
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-info bg-info/10 px-2 py-0.5 rounded-full">
                      <PhoneOutgoing className="w-3 h-3" /> Out
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-foreground">{call.callerPhone}</td>
                <td className="px-4 py-3 text-sm">
                  {call.customer ? (
                    <span className="text-foreground font-medium">{call.customer}</span>
                  ) : (
                    <span className="text-muted-foreground italic">Unknown</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{call.datetime}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{call.duration}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">{call.summary}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{call.agent}</td>
                <td className="px-4 py-3">
                  {call.followUp && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                      <Flag className="w-3 h-3" /> {call.followUpDue}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
