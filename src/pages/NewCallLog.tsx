import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, Flag, User, CalendarPlus, Search, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import DatePicker from "@/components/shared/DatePicker";
import { useCreateCallLog, useCallerLookup } from "@/hooks/useCallLogs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { CallDirection } from "@/types/database.types";

function parseDuration(mmss: string): number {
  const parts = mmss.split(":").map(Number);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return 0;
}

export default function NewCallLog() {
  const [phone, setPhone] = useState("");
  const [direction, setDirection] = useState<CallDirection>("inbound");
  const [datetime, setDatetime] = useState(() => new Date().toISOString().slice(0, 16));
  const [duration, setDuration] = useState("");
  const [summary, setSummary] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpDue, setFollowUpDue] = useState("");

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: callerMatch } = useCallerLookup(phone);
  const createLog = useCreateCallLog();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    createLog.mutate(
      {
        caller_phone: phone,
        direction,
        duration_seconds: duration ? parseDuration(duration) : null,
        summary: summary || null,
        customer_id: callerMatch?.id ?? null,
        follow_up: followUp,
        follow_up_due: followUp && followUpDue ? followUpDue : null,
        agent_id: user.id,
      },
      {
        onSuccess: () => {
          toast({ title: "Call logged successfully" });
          navigate("/calls");
        },
        onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
      }
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/calls" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Log a Call</h1>
            <p className="text-sm text-muted-foreground">Record an inbound or outbound phone call</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-2 space-y-4 md:space-y-6">
              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Phone className="w-4 h-4" /> Call Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input type="tel" placeholder="+62 812 3456 7890" value={phone} onChange={(e) => setPhone(e.target.value)} required className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {callerMatch ? <span className="text-success font-medium">Matched: {callerMatch.full_name}</span> : "Auto-lookup will search for existing customer"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Direction</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDirection("inbound")} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium btn-press touch-target transition-colors ${direction === "inbound" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}><PhoneIncoming className="w-4 h-4" /> Inbound</button>
                      <button type="button" onClick={() => setDirection("outbound")} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium btn-press touch-target transition-colors ${direction === "outbound" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}><PhoneOutgoing className="w-4 h-4" /> Outbound</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Date & Time</label>
                    <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Duration (mm:ss)</label>
                    <input type="text" placeholder="05:30" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
              </motion.div>

              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="font-semibold text-foreground mb-4">Call Summary</h2>
                <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" placeholder="Summarize what was discussed..." />
              </motion.div>

              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-foreground flex items-center gap-2"><Flag className="w-4 h-4" /> Follow-up</h2>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} className="w-4 h-4 rounded border-border text-primary focus:ring-ring" />
                    <span className="text-sm text-foreground">Flag for follow-up</span>
                  </label>
                </div>
                {followUp && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Follow-up Date</label>
                    <DatePicker value={followUpDue} onChange={setFollowUpDue} placeholder="Pilih tanggal follow-up" />
                  </div>
                )}
              </motion.div>
            </motion.div>

            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Customer Match</h2>
                {callerMatch ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg">
                      <User className="w-4 h-4 text-success" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{callerMatch.full_name}</p>
                        <p className="text-xs text-muted-foreground">{callerMatch.email}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6"><Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Enter phone to search customers</p></div>
                )}
              </motion.div>
              <motion.div variants={staggerItem} className="bg-card rounded-xl border border-border p-4 md:p-5">
                <h2 className="font-semibold text-foreground mb-4">Quick Actions</h2>
                <Link to="/bookings/new" className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors btn-press"><CalendarPlus className="w-4 h-4" /> Create Booking from Call</Link>
              </motion.div>
              <motion.div variants={staggerItem}>
                <motion.button type="submit" disabled={createLog.isPending} whileTap={{ scale: 0.97 }} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity touch-target disabled:opacity-60 flex items-center justify-center gap-2">
                  {createLog.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Call Log
                </motion.button>
              </motion.div>
            </motion.div>
          </div>
        </form>
      </div>
    </PageTransition>
  );
}
